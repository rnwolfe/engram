/**
 * ingest.ts — `engram ingest` command group.
 *
 * Subcommands:
 *   - ingest git [<path>] [--since] [--branch]
 *   - ingest md <glob>
 *   - ingest enrich github [--token] [--repo]
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  GitHubAdapter,
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
      const dbPath = path.resolve(opts.db);
      const resolvedRepo = path.resolve(repoPath ?? ".");

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      console.log(`Ingesting git repo: ${resolvedRepo}`);
      try {
        const result = await ingestGitRepo(graph, resolvedRepo, {
          since: opts.since,
          branch: opts.branch,
        });
        console.log("Git ingestion complete:");
        console.log(`  Episodes created:  ${result.episodesCreated}`);
        console.log(`  Episodes skipped:  ${result.episodesSkipped}`);
        console.log(`  Entities created:  ${result.entitiesCreated}`);
        console.log(`  Edges created:     ${result.edgesCreated}`);
        console.log(`  Edges superseded:  ${result.edgesSuperseded}`);
      } catch (err) {
        console.error(
          `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
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
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (glob: string, opts: IngestMdOpts) => {
      const dbPath = path.resolve(opts.db);

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      console.log(`Ingesting markdown: ${glob}`);
      try {
        const result = await ingestMarkdown(graph, glob);
        console.log("Markdown ingestion complete:");
        console.log(`  Episodes created: ${result.episodesCreated}`);
        console.log(`  Episodes skipped: ${result.episodesSkipped}`);
      } catch (err) {
        console.error(
          `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });

  // ingest enrich github
  const enrich = ingest
    .command("enrich")
    .description("Enrich the graph with data from external sources");

  enrich
    .command("github")
    .description("Enrich with GitHub PRs and issues")
    .option("--token <token>", "GitHub API token (or set GITHUB_TOKEN env var)")
    .option("--repo <owner/repo>", "repository in owner/repo format")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: IngestEnrichGithubOpts) => {
      const dbPath = path.resolve(opts.db);
      const token = opts.token ?? process.env.GITHUB_TOKEN;

      if (!token) {
        console.error(
          "Error: GitHub token required. Use --token or set GITHUB_TOKEN env var.",
        );
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      const adapter = new GitHubAdapter();
      console.log(`Enriching from GitHub${opts.repo ? ` (${opts.repo})` : ""}`);

      try {
        const result = await adapter.enrich(graph, { token, repo: opts.repo });
        console.log("GitHub enrichment complete:");
        console.log(`  Episodes created: ${result.episodesCreated}`);
        console.log(`  Episodes skipped: ${result.episodesSkipped}`);
        console.log(`  Entities created: ${result.entitiesCreated}`);
        console.log(`  Edges created:    ${result.edgesCreated}`);
      } catch (err) {
        console.error(
          `GitHub enrichment failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
