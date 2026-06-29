/**
 * ingest.ts — `engram ingest` command group.
 *
 * Subcommands:
 *   - ingest git [<path>] [--since] [--branch]
 *   - ingest md <glob>
 *   - ingest source [<path>] [--exclude] [--no-gitignore] [--dry-run] [--verbose]
 *   - ingest enrich <adapter> [--scope] [auth flags] [--verbose]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import { GoogleWorkspaceAdapter } from "@engram/plugin-google-workspace";
// git and markdown ingest use execFileSync / synchronous SQLite — the event
// loop is blocked for the duration, so spinner intervals cannot fire.
// For those commands we log a "starting" line and print results when done.
// spinner() is only used for async operations (GitHub fetch, LLM calls).
import type { Command } from "commander";
import type { EngramGraph, EnrichmentAdapter } from "engram-core";
import {
  closeGraph,
  EnrichmentAdapterError,
  GitHubAdapter,
  ingestGitRepo,
  ingestK8s,
  ingestMarkdown,
  openGraph,
  resolveDbPath,
} from "engram-core";
import {
  discoverPlugins,
  loadExecutablePlugin,
  loadJsModulePlugin,
  loadManifest,
  ManifestValidationError,
} from "engram-core/plugins";
import { buildAuthCredential } from "../ingest/auth.js";

interface IngestGitOpts {
  since?: string;
  branch?: string;
  db: string;
}

interface IngestMdOpts {
  db: string;
}

/** Flags shared across all `ingest enrich <adapter>` subcommands. */
interface IngestEnrichOpts {
  scope?: string;
  /** @deprecated Use --scope */
  repo?: string;
  since?: string;
  dryRun?: boolean;
  verbose?: boolean;
  db: string;
  // Auth flags
  token?: string;
  username?: string;
  password?: string;
  serviceAccount?: string;
  oauthToken?: string;
  oauthScopes?: string;
}

export function registerIngest(program: Command): void {
  const ingest = program
    .command("ingest")
    .description("Ingest data into the knowledge graph");

  // ingest git
  ingest
    .command("git [repoPath]")
    .description("Ingest a git repository (VCS layer)")
    .addHelpText(
      "after",
      `
Examples:
  # Ingest the current repository
  engram ingest git

  # Ingest a specific repository
  engram ingest git /path/to/repo

  # Ingest only commits since a date
  engram ingest git --since 2024-01-01

When to use:
  Run after engram init to populate git history, and periodically to
  pick up new commits (--since keeps it incremental).

See also:
  engram ingest source   Ingest source symbols
  engram ingest enrich github  Enrich with PR and issue data`,
    )
    .option(
      "--since <date>",
      "only ingest commits since this date (ISO8601 or relative)",
    )
    .option("--branch <branch>", "branch or ref to walk (default: HEAD)")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (repoPath: string | undefined, opts: IngestGitOpts) => {
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const resolvedRepo = path.resolve(repoPath ?? ".");

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        process.stderr.write(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(2);
      }

      const isTTY = process.stdout.isTTY;
      if (isTTY) {
        log.info(
          `Ingesting git repo at ${resolvedRepo} — this may take a while...`,
        );
      }
      try {
        const result = await ingestGitRepo(graph, resolvedRepo, {
          since: opts.since,
          branch: opts.branch,
        });
        const summary = [
          "Git ingestion complete",
          `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          `  Entities: ${result.entitiesCreated} created`,
          `  Edges:    ${result.edgesCreated} created, ${result.edgesSuperseded} superseded`,
        ].join("\n");
        if (isTTY) {
          log.success(summary);
        } else {
          process.stdout.write(`${summary}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        closeGraph(graph);
        process.exit(2);
      }

      closeGraph(graph);
    });

  // ingest md
  ingest
    .command("md <glob>")
    .description("Ingest markdown files matching a glob pattern")
    .addHelpText(
      "after",
      `
Examples:
  # Ingest all markdown in docs/
  engram ingest md "docs/**/*.md"

  # Ingest a single file
  engram ingest md README.md

When to use:
  Use to index design docs, ADRs, or changelogs that aren't committed
  as code but contain important context.

See also:
  engram ingest git   Ingest commit history`,
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (glob: string, opts: IngestMdOpts) => {
      const dbPath = resolveDbPath(path.resolve(opts.db));

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        process.stderr.write(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(2);
      }

      const isTTY = process.stdout.isTTY;
      if (isTTY) log.info(`Ingesting markdown: ${glob}`);
      try {
        const result = await ingestMarkdown(graph, glob);
        const summary = [
          "Markdown ingestion complete",
          `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
        ].join("\n");
        if (isTTY) {
          log.success(summary);
        } else {
          process.stdout.write(`${summary}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        closeGraph(graph);
        process.exit(2);
      }

      closeGraph(graph);
    });

  // ingest k8s — Kubernetes-operator semantics (RBAC + watch graphs) from Go.
  // Replaces the removed tree-sitter source ingestion (ADR-010): general
  // symbol/AST entities were redundant with agentic file search; only the
  // cross-file operator semantics a single-file read cannot reveal are kept.
  ingest
    .command("k8s [sourcePath]")
    .description(
      "Ingest Kubernetes-operator semantics (kubebuilder RBAC + controller-runtime watches) from Go files",
    )
    .addHelpText(
      "after",
      `
Examples:
  # Scan Go files under the current directory
  engram ingest k8s

  # Scan a specific operator tree
  engram ingest k8s ./controllers

Extracts the RBAC permission graph (from // +kubebuilder:rbac markers) and the
watch/owns graph (from SetupWithManager .For/.Owns/.Watches calls) — cross-file
operator semantics not visible in a single-file read.

See also:
  engram ingest git   Ingest commit history`,
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (sourcePath: string | undefined, opts: { db: string }) => {
      if (process.stdout.isTTY) intro("engram ingest k8s");
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const resolvedSource = path.resolve(sourcePath ?? ".");

      try {
        fs.statSync(resolvedSource);
      } catch {
        log.error(`Path does not exist: ${resolvedSource}`);
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(2);
      }

      try {
        const result = ingestK8s(graph, resolvedSource);
        const summary = [
          "Kubernetes-operator ingestion complete.",
          `  Episodes: ${result.episodesCreated} created`,
          `  Entities: ${result.entitiesCreated} created, ${result.entitiesResolved} resolved`,
          `  Edges:    ${result.edgesCreated} created`,
        ].join("\n");
        log.success(summary);
      } catch (err) {
        log.error(
          `Kubernetes ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(2);
      }

      closeGraph(graph);
      if (process.stdout.isTTY) outro("Done");
    });

  // ---------------------------------------------------------------------------
  // ingest enrich — shared auth flag adder and error handler
  // ---------------------------------------------------------------------------

  const enrich = ingest
    .command("enrich")
    .description("Enrich the graph with data from external sources");

  /**
   * Add shared auth and scope flags to an enrich subcommand.
   * Each adapter subcommand calls this to get a consistent flag set.
   */
  function addEnrichFlags(cmd: Command): Command {
    return cmd
      .option(
        "--scope <value>",
        "adapter-specific scope (e.g. 'owner/repo' for GitHub, project name for Gerrit)",
      )
      .option("--repo <value>", "(deprecated) alias for --scope")
      .option("--since <date>", "only fetch items updated after this date")
      .option("--dry-run", "preview what would be created without writing")
      .option(
        "--token <token>",
        "API token (bearer auth). Env: <ADAPTER>_TOKEN",
      )
      .option(
        "--username <username>",
        "username for basic auth. Env: <ADAPTER>_USERNAME",
      )
      .option(
        "--password <password>",
        "password/secret for basic auth. Env: <ADAPTER>_PASSWORD",
      )
      .option(
        "--service-account <path>",
        "path to service account JSON file. Env: <ADAPTER>_SERVICE_ACCOUNT_JSON",
      )
      .option(
        "--oauth-token <token>",
        "OAuth2 bearer token. Env: <ADAPTER>_OAUTH_TOKEN",
      )
      .option(
        "--oauth-scopes <csv>",
        "comma-separated OAuth2 scopes. Env: <ADAPTER>_OAUTH_SCOPES",
      )
      .option(
        "-v, --verbose",
        "print extra details (auth mode, rate limit info)",
        false,
      )
      .option("--db <path>", "path to .engram file", ".engram");
  }

  /**
   * Handle EnrichmentAdapterError with targeted messages per error code.
   */
  function handleEnrichError(
    err: unknown,
    adapterName: string,
    supportedAuth: string[],
  ): void {
    if (err instanceof EnrichmentAdapterError) {
      const adapterErr = err;
      const prefix = adapterName.toUpperCase();
      switch (adapterErr.code) {
        case "auth_failure":
          log.error(
            `Auth failed for ${adapterName}. Check your credentials.\n` +
              `Supported auth: ${supportedAuth.join(", ")}\n` +
              `Env var: ${prefix}_TOKEN (or equivalent)`,
          );
          break;
        case "rate_limited":
          log.error(adapterErr.message);
          log.warn(
            "Tip: wait a moment and retry, or provide a token to raise rate limits.",
          );
          break;
        case "data_error":
          log.error(adapterErr.message);
          break;
        case "server_error":
          log.error(adapterErr.message);
          break;
        default:
          log.error(adapterErr.message);
      }
    } else {
      log.error(err instanceof Error ? err.message : String(err));
    }
  }

  // ---------------------------------------------------------------------------
  // ingest enrich github
  // ---------------------------------------------------------------------------

  addEnrichFlags(
    enrich
      .command("github")
      .description("Enrich with GitHub PRs and issues")
      .addHelpText(
        "after",
        `
Auth flags (select based on your setup):
  --token <token>            Bearer token (or set GITHUB_TOKEN)

Scope:
  --scope owner/repo         Repository in 'owner/repo' format

Examples:
  # Enrich with GitHub PRs and issues (reads GITHUB_TOKEN from env)
  engram ingest enrich github --scope owner/repo

  # Pass token directly (for CI)
  engram ingest enrich github --scope owner/repo --token ghp_…

When to use:
  Run after engram ingest git to add PR discussion and issue context.
  Requires GITHUB_TOKEN or --token for private repos and higher rate limits.

See also:
  engram ingest git    Ingest git history first`,
      ),
  ).action(async (opts: IngestEnrichOpts) => {
    if (process.stdout.isTTY) intro("engram ingest enrich github");

    // Handle deprecated --repo alias
    if (opts.repo && !opts.scope) {
      process.stderr.write(
        "Warning: --repo is deprecated, use --scope instead.\n",
      );
      opts.scope = opts.repo;
    }

    const adapter = new GitHubAdapter();

    // Build auth credential from flags/env
    let auth: ReturnType<typeof buildAuthCredential>;
    try {
      auth = buildAuthCredential(opts, adapter.name, adapter.supportedAuth);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // Validate scope before opening graph
    if (!opts.scope) {
      log.error(
        `--scope is required for github adapter.\n${adapter.scopeSchema.description}`,
      );
      process.exit(1);
    }
    try {
      adapter.scopeSchema.validate(opts.scope);
    } catch (err) {
      log.error(
        `Invalid scope for github: ${err instanceof Error ? err.message : String(err)}\n${adapter.scopeSchema.description}`,
      );
      process.exit(1);
    }

    if (opts.verbose) {
      log.info(`Auth: ${auth.kind}`);
    }

    const dbPath = resolveDbPath(path.resolve(opts.db));
    let graph: EngramGraph | undefined;
    try {
      graph = openGraph(dbPath);
    } catch (err) {
      log.error(
        `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(2);
    }

    const s = spinner();
    s.start(`Fetching from GitHub (${opts.scope})`);

    try {
      const result = await adapter.enrich(graph, {
        auth,
        scope: opts.scope,
        since: opts.since,
        dryRun: opts.dryRun,
      });
      s.stop("GitHub enrichment complete");
      log.info(
        [
          `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          `Entities: ${result.entitiesCreated} created`,
          `Edges:    ${result.edgesCreated} created`,
        ].join("\n"),
      );
    } catch (err) {
      s.stop("GitHub enrichment failed");
      handleEnrichError(err, adapter.name, adapter.supportedAuth);
      closeGraph(graph);
      if (
        err instanceof EnrichmentAdapterError &&
        err.code === "rate_limited"
      ) {
        process.exit(3);
      }
      if (
        err instanceof EnrichmentAdapterError &&
        err.code === "auth_failure"
      ) {
        process.exit(1);
      }
      process.exit(2);
    }

    closeGraph(graph);
    if (process.stdout.isTTY) outro("Done");
  });

  // ---------------------------------------------------------------------------
  // ingest enrich google-workspace
  // ---------------------------------------------------------------------------

  interface IngestGoogleWorkspaceOpts extends IngestEnrichOpts {
    auth?: "adc" | "bearer";
  }

  enrich
    .command("google-workspace")
    .description("Ingest Google Docs as revision-aware episodes")
    .addHelpText(
      "after",
      `
Auth modes (--auth):
  adc     Application Default Credentials (default). Run:
          gcloud auth application-default login
  bearer  Pass a raw OAuth2/bearer token via --token or GOOGLE_WORKSPACE_TOKEN

Scope:
  --scope doc:<docId>                 Single Google Doc
  --scope docs:<id>,<id>,...          Multiple Google Docs (explicit list)
  --scope folder:<folderId>           All Docs in a Drive folder (flat)
  --scope folder:<folderId>?recursive=true  All Docs in folder tree (BFS)
  --scope query:<drive-q>             Docs matching a Drive search query

Examples:
  # Ingest a doc using ADC
  engram ingest enrich google-workspace --scope doc:1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms

  # Ingest multiple docs with a bearer token
  engram ingest enrich google-workspace \\
    --scope docs:1Bxi…,2Cyi… \\
    --auth bearer --token ya29.…

  # Ingest all Docs in a Drive folder (flat)
  engram ingest enrich google-workspace --scope folder:1A2B3C4D5E6F7G8H

  # Ingest all Docs in a folder tree (recursively)
  engram ingest enrich google-workspace --scope "folder:1A2B3C4D5E6F7G8H?recursive=true"

  # Ingest Docs matching a Drive search query
  engram ingest enrich google-workspace --scope "query:name contains 'spec'"

  # Dry-run preview (runs enumeration but skips content fetch)
  engram ingest enrich google-workspace --scope folder:<id> --dry-run

When to use:
  Index Google Docs for temporal context, ownership, and change tracking.
  Use folder: or query: scopes for bulk ingest without listing every doc ID.
  Subsequent runs use a modifiedTime cursor to fetch only changed docs.
  Combine with engram ingest git for full project history.

See also:
  engram ingest enrich github   Enrich with GitHub PRs and issues`,
    )
    .option(
      "--scope <value>",
      "Google Workspace scope: doc:<id>, docs:<id>,..., folder:<id>, or query:<q>",
    )
    .option(
      "--auth <mode>",
      "auth mode: adc (Application Default Credentials) or bearer",
      "adc",
    )
    .option(
      "--token <token>",
      "bearer token (required when --auth bearer). Env: GOOGLE_WORKSPACE_TOKEN",
    )
    .option("--dry-run", "preview what would be created without writing")
    .option(
      "-v, --verbose",
      "print extra details (auth mode, doc titles)",
      false,
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: IngestGoogleWorkspaceOpts) => {
      if (process.stdout.isTTY) intro("engram ingest enrich google-workspace");

      const adapter = new GoogleWorkspaceAdapter();

      // Validate scope
      if (!opts.scope) {
        log.error(`--scope is required.\n${adapter.scopeSchema.description}`);
        process.exit(1);
      }
      try {
        adapter.scopeSchema.validate(opts.scope);
      } catch (err) {
        log.error(
          `Invalid scope: ${err instanceof Error ? err.message : String(err)}\n${adapter.scopeSchema.description}`,
        );
        process.exit(1);
      }

      // Build auth credential
      const authMode = opts.auth ?? "adc";
      let authCred: import("engram-core").AuthCredential;

      if (authMode === "bearer") {
        const token = opts.token ?? process.env.GOOGLE_WORKSPACE_TOKEN;
        if (!token) {
          log.error(
            "Bearer auth requires --token or GOOGLE_WORKSPACE_TOKEN env var.",
          );
          process.exit(1);
        }
        authCred = { kind: "bearer", token };
      } else {
        // ADC — dynamically import google-auth-library (CLI-layer only)
        let adcToken: string;
        let refreshFn: (() => Promise<string>) | undefined;
        try {
          const { GoogleAuth } = await import("google-auth-library");
          const gauth = new GoogleAuth({
            scopes: [
              "https://www.googleapis.com/auth/documents.readonly",
              "https://www.googleapis.com/auth/drive.readonly",
            ],
          });
          const client = await gauth.getClient();
          const tokenResp = await client.getAccessToken();
          if (!tokenResp.token) {
            throw new Error("ADC returned an empty token");
          }
          adcToken = tokenResp.token;
          // Provide a refresh callback so the adapter can retry on 401
          refreshFn = async () => {
            const t = await client.getAccessToken();
            if (!t.token)
              throw new Error("ADC token refresh returned empty token");
            return t.token;
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error(
            `Failed to obtain Application Default Credentials: ${msg}\n` +
              "Run: gcloud auth application-default login",
          );
          process.exit(1);
        }
        // adcToken is assigned inside the try block above; if we reach here it is defined
        authCred = {
          kind: "oauth2",
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          token: adcToken as string,
          scopes: [
            "https://www.googleapis.com/auth/documents.readonly",
            "https://www.googleapis.com/auth/drive.readonly",
          ],
          refresh: refreshFn,
        };
      }

      if (opts.verbose) {
        log.info(`Auth: ${authMode}`);
      }

      const dbPath = resolveDbPath(path.resolve(opts.db));
      let graph: import("engram-core").EngramGraph;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(2);
        return; // unreachable, satisfies definite assignment
      }

      const s = spinner();
      s.start(`Ingesting Google Workspace docs (${opts.scope})`);

      try {
        const result = await adapter.enrich(graph, {
          auth: authCred,
          scope: opts.scope,
          dryRun: opts.dryRun,
        });
        s.stop("Google Workspace ingestion complete");
        log.info(
          [
            `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
            `Entities: ${result.entitiesCreated} created`,
            `Edges:    ${result.edgesCreated} created`,
          ].join("\n"),
        );
      } catch (err) {
        s.stop("Google Workspace ingestion failed");
        if (err instanceof EnrichmentAdapterError) {
          switch (err.code) {
            case "auth_failure":
              log.error(
                "Auth failed. Check your credentials.\n" +
                  "For ADC: run gcloud auth application-default login\n" +
                  "For bearer: verify your token is valid",
              );
              closeGraph(graph);
              process.exit(1);
              break;
            case "rate_limited":
              log.error(err.message);
              log.warn("Wait a moment and retry.");
              closeGraph(graph);
              process.exit(3);
              break;
            default:
              log.error(err.message);
          }
        } else {
          log.error(err instanceof Error ? err.message : String(err));
        }
        closeGraph(graph);
        process.exit(2);
      }

      closeGraph(graph);
      if (process.stdout.isTTY) outro("Done");
    });

  registerPluginEnrichSubcommands(enrich);
}

interface IngestEnrichPluginOpts {
  db: string;
  token?: string;
  scope?: string;
  /** @deprecated Use --scope */
  repo?: string;
  since?: string;
}

/**
 * Discovers installed plugins and registers each as an `engram ingest enrich <plugin-name>`
 * subcommand so plugins are first-class citizens alongside built-in adapters.
 */
function registerPluginEnrichSubcommands(
  enrich: import("commander").Command,
): void {
  const projectRoot = process.cwd();
  const discovered = discoverPlugins(projectRoot);

  for (const pd of discovered) {
    let manifest: ReturnType<typeof loadManifest>;
    try {
      manifest = loadManifest(pd.dir);
    } catch (err) {
      // Skip plugins with invalid manifests at registration time; they'll surface in `plugin list`
      if (!(err instanceof ManifestValidationError)) throw err;
      continue;
    }

    const pluginManifest = manifest;
    const pluginDir = pd.dir;

    enrich
      .command(pluginManifest.name)
      .description(
        `Enrich with plugin '${pluginManifest.name}' v${pluginManifest.version}`,
      )
      .option("--db <path>", "path to .engram file", ".engram")
      .option("--token <token>", "auth token for the plugin (if required)")
      .option("--scope <value>", "adapter-specific scope (e.g. 'owner/repo')")
      .option("--repo <value>", "(deprecated) alias for --scope")
      .option(
        "--since <date>",
        "only fetch items updated after this date (ISO8601)",
      )
      .action(async (opts: IngestEnrichPluginOpts) => {
        if (opts.repo && !opts.scope) {
          process.stderr.write(
            "Warning: --repo is deprecated for plugin adapters, use --scope instead.\n",
          );
          opts.scope = opts.repo;
        }
        const dbPath = resolveDbPath(path.resolve(opts.db));

        let graph: EngramGraph | undefined;
        try {
          graph = openGraph(dbPath);
        } catch (err) {
          log.error(
            `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(2);
        }

        let adapter: EnrichmentAdapter;
        try {
          if (pluginManifest.transport === "js-module") {
            adapter = await loadJsModulePlugin(pluginDir, pluginManifest);
          } else {
            adapter = loadExecutablePlugin(pluginDir, pluginManifest);
          }
        } catch (err) {
          log.error(
            `Failed to load plugin '${pluginManifest.name}': ${err instanceof Error ? err.message : String(err)}`,
          );
          closeGraph(graph);
          process.exit(2);
        }

        const s = spinner();
        s.start(`Running plugin '${pluginManifest.name}'`);

        try {
          const result = await adapter.enrich(graph, {
            token: opts.token,
            scope: opts.scope,
            repo: opts.scope, // compat alias for plugins using old adapter contract
            since: opts.since,
          });
          s.stop(`Plugin '${pluginManifest.name}' complete`);
          log.info(
            [
              `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
              `Entities: ${result.entitiesCreated} created`,
              `Edges:    ${result.edgesCreated} created`,
            ].join("\n"),
          );
        } catch (err) {
          s.stop(`Plugin '${pluginManifest.name}' failed`);
          log.error(err instanceof Error ? err.message : String(err));
          closeGraph(graph);
          process.exit(2);
        }

        closeGraph(graph);
      });
  }
}
