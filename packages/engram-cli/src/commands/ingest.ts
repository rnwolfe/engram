/**
 * ingest.ts — `engram ingest` command group.
 *
 * Subcommands:
 *   - ingest git [<path>] [--since] [--branch]
 *   - ingest md <glob>
 *   - ingest source [<path>] [--exclude] [--no-gitignore] [--dry-run] [--verbose]
 *   - ingest enrich github [--token] [--repo] [--verbose]
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
  GitHubAdapter,
  GitHubAuthError,
  ingestGitRepo,
  ingestMarkdown,
  ingestSource,
  openGraph,
} from "engram-core";

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

interface IngestEnrichGithubOpts {
  token?: string;
  repo?: string;
  verbose?: boolean;
  db: string;
}

export function registerIngest(program: Command): void {
  const ingest = program
    .command("ingest")
    .description("Ingest data into the knowledge graph");

  // ingest git
  ingest
    .command("git [repoPath]")
    .description("Ingest a git repository (VCS layer)")
    .option(
      "--since <date>",
      "only ingest commits since this date (ISO8601 or relative)",
    )
    .option("--branch <branch>", "branch or ref to walk (default: HEAD)")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (repoPath: string | undefined, opts: IngestGitOpts) => {
      intro("engram ingest git");

      const dbPath = path.resolve(opts.db);
      const resolvedRepo = path.resolve(repoPath ?? ".");

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      log.info(
        `Ingesting git repo at ${resolvedRepo} — this may take a while...`,
      );
      try {
        const result = await ingestGitRepo(graph, resolvedRepo, {
          since: opts.since,
          branch: opts.branch,
        });
        log.success(
          [
            "Git ingestion complete",
            `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
            `  Entities: ${result.entitiesCreated} created`,
            `  Edges:    ${result.edgesCreated} created, ${result.edgesSuperseded} superseded`,
          ].join("\n"),
        );
      } catch (err) {
        log.error(
          `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
      outro("Done");
    });

  // ingest md
  ingest
    .command("md <glob>")
    .description("Ingest markdown files matching a glob pattern")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (glob: string, opts: IngestMdOpts) => {
      intro("engram ingest md");

      const dbPath = path.resolve(opts.db);

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      log.info(`Ingesting markdown: ${glob}`);
      try {
        const result = await ingestMarkdown(graph, glob);
        log.success(
          [
            "Markdown ingestion complete",
            `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          ].join("\n"),
        );
      } catch (err) {
        log.error(
          `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
      outro("Done");
    });

  // ingest source
  ingest
    .command("source [sourcePath]")
    .description("Ingest source files into the knowledge graph")
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
    .option("--verbose", "emit per-file progress output")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (sourcePath: string | undefined, opts: IngestSourceOpts) => {
      intro("engram ingest source");

      const dbPath = path.resolve(opts.db);
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
      outro("Done");
    });

  // ingest enrich github
  const enrich = ingest
    .command("enrich")
    .description("Enrich the graph with data from external sources");

  enrich
    .command("github")
    .description("Enrich with GitHub PRs and issues")
    .option(
      "--token <token>",
      "GitHub API token (or set GITHUB_TOKEN env var). Optional for public repos.",
    )
    .option("--repo <owner/repo>", "repository in owner/repo format")
    .option(
      "--verbose",
      "print extra details (auth mode, rate limit info)",
      false,
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: IngestEnrichGithubOpts) => {
      intro("engram ingest enrich github");

      const dbPath = path.resolve(opts.db);
      const token = opts.token ?? process.env.GITHUB_TOKEN;

      if (!token) {
        log.warn(
          "No token provided — proceeding unauthenticated.\n" +
            "Public repos work without a token (rate limit: 60 req/hr).\n" +
            "For private repos or higher rate limits, set GITHUB_TOKEN or use --token.",
        );
      } else if (opts.verbose) {
        log.info("Authenticated (rate limit: 5,000 req/hr)");
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

      const adapter = new GitHubAdapter();
      const repoLabel = opts.repo ? ` (${opts.repo})` : "";
      const s = spinner();
      s.start(`Fetching from GitHub${repoLabel}`);

      try {
        const result = await adapter.enrich(graph, { token, repo: opts.repo });
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
        if (err instanceof GitHubAuthError) {
          log.error(err.message);
          if (!token) {
            log.warn(
              "Tip: provide a token with --token <token> or by setting the GITHUB_TOKEN env var.",
            );
          }
        } else if (err instanceof EnrichmentAdapterError) {
          log.error(err.message);
          if (err.code === "rate_limited") {
            log.warn(
              "Tip: provide a token with --token <token> or GITHUB_TOKEN to raise the rate limit.",
            );
          }
        } else {
          log.error(err instanceof Error ? err.message : String(err));
        }
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
      outro("Done");
    });
}
