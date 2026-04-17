/**
 * embed.ts — `engram embed` command.
 *
 * Subcommands:
 *   engram embed reindex  — Clear and rebuild all embeddings with the current model.
 */

import * as path from "node:path";
import { confirm, intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import {
  closeGraph,
  countEmbeddings,
  createProvider,
  getEmbeddingModel,
  openGraph,
  reindexEmbeddings,
} from "engram-core";

interface EmbedReindexOpts {
  yes?: boolean;
  db: string;
}

export function registerEmbed(program: Command): void {
  const embed = program
    .command("embed")
    .description("Manage embeddings for semantic search");

  embed
    .command("reindex")
    .description("Clear and rebuild all embeddings with the current model")
    .option("--yes", "skip the confirmation prompt")
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: EmbedReindexOpts) => {
      intro("engram embed reindex");

      const dbPath = path.resolve(opts.db);
      const graph = openGraph(dbPath);

      try {
        const counts = countEmbeddings(graph);
        const stored = getEmbeddingModel(graph);
        const provider = createProvider();
        const activeModel = provider.modelName();

        log.info(
          [
            "About to reindex embeddings:",
            `  Entities: ${counts.entities}  Episodes: ${counts.episodes}  (total: ${counts.total})`,
            `  New model: ${activeModel}`,
            stored
              ? `  Previous model: ${stored.model} (${stored.dimensions} dims)`
              : "  Previous model: (none recorded)",
          ].join("\n"),
        );

        if (!opts.yes) {
          const ok = await confirm({
            message: "Continue?",
            initialValue: false,
          });
          if (!ok || typeof ok !== "boolean") {
            log.info("Aborted.");
            closeGraph(graph);
            process.exit(0);
          }
        }

        const s = spinner();
        s.start("Reindexing…");

        const result = await reindexEmbeddings(graph, provider, (p) => {
          s.message(`Reindexing… ${p.done}/${p.total}`);
        });

        s.stop(`Reindexed ${result.done} embeddings.`);

        if (result.errors > 0) {
          log.warn(`${result.errors} items failed — run again to retry.`);
        }

        const newModel = getEmbeddingModel(graph);
        if (newModel) {
          log.success(
            `Embedding model recorded: ${newModel.model} (${newModel.dimensions} dims)`,
          );
        }
      } finally {
        closeGraph(graph);
      }

      outro("Done");
    });
}
