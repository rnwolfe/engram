/**
 * maintenance.ts — `engram rebuild-index` and `engram serve` commands.
 *
 * rebuild-index: rebuilds FTS5 indexes for entities, edges, episodes.
 * serve:         placeholder — MCP server not yet implemented.
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
    .description("Rebuild FTS5 indexes for entities, edges, and episodes")
    .option("--db <path>", "path to .engram file", ".engram")
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

  // serve
  program
    .command("serve")
    .description("Start the MCP server (stdio transport)")
    .option("--db <path>", "path to .engram file", ".engram")
    .action((_opts: MaintenanceOpts) => {
      console.log("MCP server not yet implemented.");
      console.log("Use the engram-mcp package when available.");
    });
}
