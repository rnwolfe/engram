/**
 * stats.ts — `engram stats` command.
 *
 * Shows counts of entities, edges, and episodes in the graph.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph } from "engram-core";

interface StatsOpts {
  db: string;
}

interface CountRow {
  count: number;
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description(
      "Show graph counts (entities, edges, episodes). For a full health dashboard with provider reachability, see engram status.",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Show graph counts
  engram stats

When to use:
  Quick count of graph contents. Use engram status for a full health report
  including embedding model and provider reachability.

See also:
  engram status    health dashboard with provider reachability
  engram search    find entities by keyword`,
    )
    .action((opts: StatsOpts) => {
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
        const entities =
          graph.db
            .query<CountRow, []>(
              "SELECT COUNT(*) as count FROM entities WHERE status = 'active'",
            )
            .get()?.count ?? 0;

        const edges =
          graph.db
            .query<CountRow, []>(
              "SELECT COUNT(*) as count FROM edges WHERE invalidated_at IS NULL",
            )
            .get()?.count ?? 0;

        const episodes =
          graph.db
            .query<CountRow, []>(
              "SELECT COUNT(*) as count FROM episodes WHERE status = 'active'",
            )
            .get()?.count ?? 0;

        const aliases =
          graph.db
            .query<CountRow, []>("SELECT COUNT(*) as count FROM entity_aliases")
            .get()?.count ?? 0;

        const invalidatedEdges =
          graph.db
            .query<CountRow, []>(
              "SELECT COUNT(*) as count FROM edges WHERE invalidated_at IS NOT NULL",
            )
            .get()?.count ?? 0;

        console.log(`Graph: ${dbPath}`);
        console.log(`  Entities (active):   ${entities}`);
        console.log(`  Edges (active):      ${edges}`);
        console.log(`  Edges (invalidated): ${invalidatedEdges}`);
        console.log(`  Episodes (active):   ${episodes}`);
        console.log(`  Aliases:             ${aliases}`);
      } catch (err) {
        console.error(
          `Error reading stats: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
