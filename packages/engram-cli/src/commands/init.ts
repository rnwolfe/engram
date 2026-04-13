/**
 * init.ts — `engram init` command.
 *
 * Creates a new .engram database at the given path.
 * Optionally runs git ingestion immediately after creation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
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
        const s = spinner();
        s.start(`Ingesting git repository at ${repoPath}`);
        try {
          const result = await ingestGitRepo(graph, repoPath);
          s.stop("Git ingestion complete");
          log.info(
            [
              `Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
              `Entities: ${result.entitiesCreated} created`,
              `Edges:    ${result.edgesCreated} created`,
            ].join("\n"),
          );
        } catch (err) {
          s.stop("Git ingestion failed");
          log.error(err instanceof Error ? err.message : String(err));
          closeGraph(graph);
          process.exit(1);
        }
      }

      closeGraph(graph);
      outro("Done");
    });
}
