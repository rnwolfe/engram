/**
 * add.ts — `engram add` command.
 *
 * Adds a manual note or file as an episode (source_type='manual').
 * No entity extraction — raw episode creation only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { addEpisode, closeGraph, openGraph, resolveDbPath } from "engram-core";

interface AddOpts {
  file?: string;
  db: string;
}

export function registerAdd(program: Command): void {
  program
    .command("add [content]")
    .description("Add a manual note or file as evidence")
    .option("--file <path>", "read content from a file instead of the argument")
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Add a short note inline
  engram add "Decided to use ULIDs for all entity IDs"

  # Add the contents of a file as an episode
  engram add --file notes/decision.md

When to use:
  After a design decision, meeting, or observation that should be preserved
  in the knowledge graph before it is lost to memory.

See also:
  engram ingest git   ingest git history as episodes
  engram verify       check graph integrity after manual additions`,
    )
    .action((content: string | undefined, opts: AddOpts) => {
      const dbPath = resolveDbPath(path.resolve(opts.db));

      let episodeContent: string;

      if (opts.file) {
        const filePath = path.resolve(opts.file);
        if (!fs.existsSync(filePath)) {
          console.error(`Error: file not found: ${filePath}`);
          process.exit(1);
        }
        try {
          episodeContent = fs.readFileSync(filePath, "utf-8");
        } catch (err) {
          console.error(
            `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      } else if (content) {
        episodeContent = content;
      } else {
        console.error("Error: provide <content> or --file <path>");
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

      try {
        const episode = addEpisode(graph, {
          source_type: "manual",
          content: episodeContent,
          timestamp: new Date().toISOString(),
        });
        console.log(`Added episode ${episode.id}`);
      } catch (err) {
        console.error(
          `Error adding episode: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
