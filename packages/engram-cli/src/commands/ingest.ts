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

// git and markdown ingest use execFileSync / synchronous SQLite — the event
// loop is blocked for the duration, so spinner intervals cannot fire.
// For those commands we log a "starting" line and print results when done.
// spinner() is only used for async operations (GitHub fetch, LLM calls).
import type { Command } from "commander";
import type { EngramGraph, SourceProgressEvent } from "engram-core";
import {
  closeGraph,
  EnrichmentAdapterError,
  GerritAdapter,
  GitHubAdapter,
  ingestGitRepo,
  ingestMarkdown,
  ingestSource,
  openGraph,
  resolveDbPath,
} from "engram-core";
import { buildAuthCredential } from "../ingest/auth.js";

interface IngestGitOpts {
  since?: string;
  branch?: string;
  db: string;
}

interface IngestMdOpts {
  db: string;
}

interface IngestSourceOpts {
  exclude?: string[];
  gitignore: boolean;
  dryRun?: boolean;
  verbose?: boolean;
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
        process.exit(1);
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
        if (isTTY) {
          log.success(
            [
              "Git ingestion complete",
              `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
              `  Entities: ${result.entitiesCreated} created`,
              `  Edges:    ${result.edgesCreated} created, ${result.edgesSuperseded} superseded`,
            ].join("\n"),
          );
        }
      } catch (err) {
        process.stderr.write(
          `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        closeGraph(graph);
        process.exit(1);
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
        process.exit(1);
      }

      const isTTY = process.stdout.isTTY;
      if (isTTY) log.info(`Ingesting markdown: ${glob}`);
      try {
        const result = await ingestMarkdown(graph, glob);
        if (isTTY) {
          log.success(
            [
              "Markdown ingestion complete",
              `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
            ].join("\n"),
          );
        }
      } catch (err) {
        process.stderr.write(
          `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });

  // ingest source
  ingest
    .command("source [sourcePath]")
    .description("Ingest source files into the knowledge graph")
    .addHelpText(
      "after",
      `
Examples:
  # Ingest source from current directory
  engram ingest source

  # Dry-run to preview what would be indexed
  engram ingest source --dry-run

  # Exclude test and generated files
  engram ingest source --exclude "**/*.test.ts" --exclude "dist/**"

  # Verbose per-file output
  engram ingest source --verbose

When to use:
  Run after engram ingest git to add symbol-level entities (functions,
  classes, modules) for code navigation queries.

See also:
  engram ingest git   Ingest commit history`,
    )
    .option(
      "--exclude <glob>",
      "additional exclude glob (repeatable)",
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option(
      "--no-gitignore",
      "skip .gitignore application (denylist still applies)",
    )
    .option("--dry-run", "walk and report counts without writing")
    .option("-v, --verbose", "emit per-file progress output")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (sourcePath: string | undefined, opts: IngestSourceOpts) => {
      if (process.stdout.isTTY) intro("engram ingest source");

      const dbPath = resolveDbPath(path.resolve(opts.db));
      const resolvedSource = path.resolve(sourcePath ?? ".");
      const startMs = Date.now();

      if (opts.dryRun) {
        log.info("Dry-run mode — no writes will be made");
      }

      try {
        const stat = fs.statSync(resolvedSource);
        if (!stat.isDirectory()) {
          log.error(`Source path is not a directory: ${resolvedSource}`);
          process.exit(1);
        }
      } catch {
        log.error(`Source path does not exist: ${resolvedSource}`);
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      let fileIdx = 0;

      const onProgress = opts.verbose
        ? (event: SourceProgressEvent) => {
            const label = {
              file_parsed: "parsed  ",
              file_skipped: "cached  ",
              file_error: "error   ",
              file_scanned: null, // suppress raw scan events
            }[event.type];
            if (!label) return;
            fileIdx++;
            const suffix = event.message ? `  ${event.message}` : "";
            log.info(`[${fileIdx}] ${label} ${event.relPath}${suffix}`);
          }
        : undefined;

      const s = opts.verbose ? undefined : spinner();
      if (s) s.start(`Scanning ${resolvedSource}`);

      let dryRunHadErrors = false;

      try {
        const result = await ingestSource(graph, {
          root: resolvedSource,
          exclude: opts.exclude?.length ? opts.exclude : undefined,
          respectGitignore: opts.gitignore,
          dryRun: opts.dryRun,
          onProgress,
        });

        if (s) s.stop("Scan complete");

        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
        const uncached = result.filesScanned - result.filesSkipped;
        const summaryLines = [
          opts.dryRun
            ? "Source ingestion dry-run complete."
            : "Source ingestion complete.",
          `  Scanned:  ${result.filesScanned} files`,
          `  Parsed:   ${result.filesParsed} files (${result.filesSkipped} unchanged, ${uncached - result.filesParsed} unsupported/errored)`,
          `  Skipped:  ${result.filesSkipped} files`,
          `  Archived: ${result.deletedArchived} files`,
          `  Entities: ${result.entitiesCreated} created`,
          `  Edges:    ${result.edgesCreated} created`,
          `  Errors:   ${result.errors.length}`,
          `  Elapsed:  ${elapsedSec}s`,
        ];
        log.success(summaryLines.join("\n"));

        if (result.errors.length > 0) {
          const errLines = result.errors
            .slice(0, 10)
            .map((e) => `  ${e.relPath}: ${e.message}`);
          if (result.errors.length > 10) {
            errLines.push(`  … and ${result.errors.length - 10} more`);
          }
          log.warn(`Per-file errors (not fatal):\n${errLines.join("\n")}`);
          if (opts.dryRun) {
            dryRunHadErrors = true;
          }
        }
      } catch (err) {
        if (s) s.stop("Source ingestion failed");
        log.error(
          `Source ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
      if (process.stdout.isTTY) outro("Done");

      if (dryRunHadErrors) {
        process.exit(1);
      }
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
      console.warn("Warning: --repo is deprecated, use --scope instead.");
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
    const scopeErr = adapter.scopeSchema.validate(opts.scope);
    if (scopeErr) {
      log.error(
        `Invalid scope for github: ${scopeErr}\n${adapter.scopeSchema.description}`,
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
      process.exit(1);
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
      process.exit(1);
    }

    closeGraph(graph);
    if (process.stdout.isTTY) outro("Done");
  });

  // ---------------------------------------------------------------------------
  // ingest enrich gerrit
  // ---------------------------------------------------------------------------

  addEnrichFlags(
    enrich
      .command("gerrit")
      .description("Enrich with Gerrit code review changes")
      .addHelpText(
        "after",
        `
Auth flags (select based on your setup):
  --token <token>                  Bearer token (or set GERRIT_TOKEN)
  --username <u> --password <p>    HTTP Basic auth (or set GERRIT_USERNAME / GERRIT_PASSWORD)

Scope:
  --scope <project>      Gerrit project name (e.g. 'chromium/src')

Examples:
  # Enrich using HTTP Basic auth
  engram ingest enrich gerrit --scope chromium/src --username alice --password s3cr3t

  # Enrich a public Gerrit instance (no auth)
  engram ingest enrich gerrit --scope myproject

  # Specify a custom Gerrit endpoint
  engram ingest enrich gerrit --scope myproject --endpoint https://gerrit.example.com

When to use:
  Run after engram ingest git to add Gerrit code-review discussions.

See also:
  engram ingest git    Ingest git history first`,
      )
      .option(
        "--endpoint <url>",
        "Gerrit base URL (default: https://gerrit-review.googlesource.com)",
      ),
  ).action(async (opts: IngestEnrichOpts & { endpoint?: string }) => {
    if (process.stdout.isTTY) intro("engram ingest enrich gerrit");

    // Handle deprecated --repo alias
    if (opts.repo && !opts.scope) {
      console.warn("Warning: --repo is deprecated, use --scope instead.");
      opts.scope = opts.repo;
    }

    const adapter = new GerritAdapter();

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
        `--scope is required for gerrit adapter.\n${adapter.scopeSchema.description}`,
      );
      process.exit(1);
    }
    const scopeErr = adapter.scopeSchema.validate(opts.scope);
    if (scopeErr) {
      log.error(
        `Invalid scope for gerrit: ${scopeErr}\n${adapter.scopeSchema.description}`,
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
      process.exit(1);
    }

    const s = spinner();
    s.start(`Fetching from Gerrit (${opts.scope})`);

    try {
      const result = await adapter.enrich(graph, {
        auth,
        scope: opts.scope,
        since: opts.since,
        dryRun: opts.dryRun,
        endpoint: opts.endpoint,
      });
      s.stop("Gerrit enrichment complete");
      log.info(
        [
          `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          `Entities: ${result.entitiesCreated} created`,
          `Edges:    ${result.edgesCreated} created`,
        ].join("\n"),
      );
    } catch (err) {
      s.stop("Gerrit enrichment failed");
      handleEnrichError(err, adapter.name, adapter.supportedAuth);
      closeGraph(graph);
      process.exit(1);
    }

    closeGraph(graph);
    if (process.stdout.isTTY) outro("Done");
  });
}
