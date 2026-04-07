/**
 * init.ts — `engram init` command.
 *
 * Creates a new .engram database at the given path.
 * Optionally runs git ingestion immediately after creation.
 */

import * as fs from "node:fs";
import * as path from "node:path";
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
      const dbPath = path.resolve(opts.db);

      if (fs.existsSync(dbPath)) {
        console.error(`Error: .engram file already exists at ${dbPath}`);
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = createGraph(dbPath);
        console.log(`Created ${dbPath}`);
      } catch (err) {
        console.error(
          `Error creating graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      if (opts.fromGit) {
        const repoPath = path.resolve(opts.fromGit);
        console.log(`Ingesting git repository: ${repoPath}`);
        try {
          const result = await ingestGitRepo(graph, repoPath);
          console.log(`Git ingestion complete:`);
          console.log(`  Episodes created:  ${result.episodesCreated}`);
          console.log(`  Episodes skipped:  ${result.episodesSkipped}`);
          console.log(`  Entities created:  ${result.entitiesCreated}`);
          console.log(`  Edges created:     ${result.edgesCreated}`);
        } catch (err) {
          console.error(
            `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          closeGraph(graph);
          process.exit(1);
        }
      }

      closeGraph(graph);
    });
}
