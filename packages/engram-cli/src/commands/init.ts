/**
 * init.ts — `engram init` command.
 *
 * Creates a new .engram database at the given path.
 * Optionally runs git ingestion immediately after creation.
 *
 * Note: git ingestion uses execFileSync internally (blocking), so a spinner
 * cannot animate during the operation. We print a clear "starting" line
 * before the call and results after.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { intro, log, outro } from "@clack/prompts";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, createGraph, ingestGitRepo } from "engram-core";

interface InitOpts {
  fromGit?: string;
  db: string;
}

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create a new .engram knowledge graph database")
    .option("--from-git <path>", "also ingest a git repository after creating")
    .option("--db <path>", "path for the .engram file", ".engram")
    .action(async (opts: InitOpts) => {
      intro("engram init");

      const dbPath = path.resolve(opts.db);

      if (fs.existsSync(dbPath)) {
        log.error(`File already exists: ${dbPath}`);
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = createGraph(dbPath);
        log.success(`Created ${dbPath}`);
      } catch (err) {
        log.error(
          `Failed to create graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      if (opts.fromGit) {
        const repoPath = path.resolve(opts.fromGit);
        // Git ingestion is synchronous (execFileSync + SQLite writes).
        // A spinner cannot animate while the event loop is blocked, so we
        // print a plain message before starting and results when done.
        log.info(`Ingesting git repository at ${repoPath} — this may take a while...`);
        try {
          const result = await ingestGitRepo(graph, repoPath);
          log.success(
            [
              "Git ingestion complete",
              `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
              `  Entities: ${result.entitiesCreated} created`,
              `  Edges:    ${result.edgesCreated} created`,
            ].join("\n"),
          );
        } catch (err) {
          log.error(
            `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          closeGraph(graph);
          process.exit(1);
        }
      }

      closeGraph(graph);
      outro("Done");
    });
}
