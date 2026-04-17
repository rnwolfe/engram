/**
 * maintenance.ts — `engram rebuild-index` command.
 *
 * rebuild-index: rebuilds FTS5 indexes for entities, edges, episodes.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph } from "engram-core";

interface MaintenanceOpts {
  db: string;
}

export function registerMaintenance(program: Command): void {
  // rebuild-index
  program
    .command("rebuild-index")
    .description(
      "Rebuild the FTS index. To rebuild the vector index, use engram embed --reindex.",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Rebuild FTS indexes for the default database
  engram rebuild-index

  # Rebuild FTS indexes for a specific database
  engram rebuild-index --db path/to/project.engram

When to use:
  If full-text search returns stale or missing results after a large ingestion,
  or after a database restore.

See also:
  engram embed --reindex   rebuild the vector (semantic) index`,
    )
    .action((opts: MaintenanceOpts) => {
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

      try {
        graph.db.run(
          "INSERT INTO entities_fts(entities_fts) VALUES('rebuild')",
        );
        graph.db.run("INSERT INTO edges_fts(edges_fts) VALUES('rebuild')");
        graph.db.run(
          "INSERT INTO episodes_fts(episodes_fts) VALUES('rebuild')",
        );
        console.log("FTS indexes rebuilt successfully.");
      } catch (err) {
        console.error(
          `Rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });

}
