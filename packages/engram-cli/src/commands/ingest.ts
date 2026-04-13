/**
 * ingest.ts — `engram ingest` command group.
 *
 * Subcommands:
 *   - ingest git [<path>] [--since] [--branch]
 *   - ingest md <glob>
 *   - ingest enrich github [--token] [--repo] [--verbose]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  GitHubAdapter,
  GitHubAuthError,
  ingestGitRepo,
  ingestMarkdown,
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

      const s = spinner();
      s.start(`Ingesting git repo at ${resolvedRepo}`);
      try {
        const result = await ingestGitRepo(graph, resolvedRepo, {
          since: opts.since,
          branch: opts.branch,
        });
        s.stop("Git ingestion complete");
        log.info(
          [
            `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
            `Entities: ${result.entitiesCreated} created`,
            `Edges:    ${result.edgesCreated} created, ${result.edgesSuperseded} superseded`,
          ].join("\n"),
        );
      } catch (err) {
        s.stop("Git ingestion failed");
        log.error(err instanceof Error ? err.message : String(err));
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

      const s = spinner();
      s.start(`Ingesting markdown: ${glob}`);
      try {
        const result = await ingestMarkdown(graph, glob);
        s.stop("Markdown ingestion complete");
        log.info(
          `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
        );
      } catch (err) {
        s.stop("Markdown ingestion failed");
        log.error(err instanceof Error ? err.message : String(err));
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
