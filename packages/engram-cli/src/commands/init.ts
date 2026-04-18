/**
 * init.ts — Command registration for `engram init`.
 *
 * This file is the thin orchestrator: it registers the CLI command, declares
 * options, and delegates to:
 *   init-interactive.ts  — runInteractive()  (prompt-driven flow)
 *   init-runners.ts      — runNonInteractive() (--yes pipeline)
 *
 * Heavy shared logic lives in:
 *   init-runners.ts   — shared helpers, step runners, runNonInteractive()
 *   init-pipeline.ts  — remote detection, harness detection, companion append,
 *                       GitHub enrichment runner
 */

import type { Command } from "commander";
import { runInteractive } from "./init-interactive.js";
import { type InitOpts, runNonInteractive } from "./init-runners.js";

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create a new .engram knowledge graph database")
    .addHelpText(
      "after",
      `
Examples:
  # Interactive full setup (recommended)
  engram init

  # Non-interactive, BM25 only, useful in CI
  engram init --yes --embedding-model none --db .engram

  # Non-interactive with full ingestion and embeddings
  engram init --yes --from-git . --ingest-md docs/ --embed \\
    --embedding-model gemini-embedding-2-preview

  # Non-interactive with JSON output (for CI/scripting)
  engram init --yes --from-git . --format json

See also:
  engram ingest git     re-ingest or update git history
  engram ingest md      ingest additional markdown files
  engram ingest source  ingest source code symbols
  engram embed          manage and rebuild vector embeddings
  engram companion      write agent harness companion prompt`,
    )
    .option("--db <path>", "path for the .engram file", ".engram")
    .option("--from-git <path>", "ingest a git repository after creating")
    .option(
      "--ingest-md <path>",
      "ingest markdown docs from this directory/glob",
    )
    .option(
      "--ingest-source",
      "ingest source code symbols (deprecated: now always runs in --yes)",
      false,
    )
    .option("--embed", "generate vector embeddings after ingestion", false)
    .option("--embedding-model <id|none>", "embedding model to use")
    .option(
      "--embedding-provider <ollama|openai|google>",
      "override embedding provider",
    )
    .option(
      "--ollama-endpoint <url>",
      "Ollama endpoint URL",
      "http://localhost:11434",
    )
    .option(
      "--github-repo <owner/repo>",
      "GitHub repo for enrichment (auto-detected from git remote when GITHUB_TOKEN is set)",
    )
    .option("--yes", "skip all prompts (non-interactive)", false)
    .option("--no-verify", "skip reachability check")
    .option("-j, --format <format>", "output format (json)")
    .action(async (opts: InitOpts) => {
      if (opts.yes) {
        await runNonInteractive(opts);
      } else {
        await runInteractive(opts);
      }
    });
}
