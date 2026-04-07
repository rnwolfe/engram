/**
 * show.ts — `engram show` command.
 *
 * Displays entity details with edges grouped by relation_type and evidence count.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  findEdges,
  getEntity,
  getEvidenceForEntity,
  openGraph,
  resolveEntity,
} from "engram-core";

interface ShowOpts {
  db: string;
}

export function registerShow(program: Command): void {
  program
    .command("show <entity>")
    .description("Show entity details, edges, and evidence")
    .option("--db <path>", "path to .engram file", ".engram")
    .action((entityArg: string, opts: ShowOpts) => {
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
        // Try by ID first, then by name/alias
        let entity = getEntity(graph, entityArg);
        if (!entity) {
          entity = resolveEntity(graph, entityArg);
        }

        if (!entity) {
          console.error(`Entity not found: ${entityArg}`);
          closeGraph(graph);
          process.exit(1);
        }

        console.log(`${entity.canonical_name}`);
        console.log(`  id:     ${entity.id}`);
        console.log(`  type:   ${entity.entity_type}`);
        console.log(`  status: ${entity.status}`);
        if (entity.summary) {
          console.log(`  summary: ${entity.summary}`);
        }
        console.log(`  created: ${entity.created_at}`);

        const evidence = getEvidenceForEntity(graph, entity.id);
        console.log(`  evidence: ${evidence.length} episode(s)`);

        // Edges — source
        const outEdges = findEdges(graph, { source_id: entity.id });
        // Edges — target
        const inEdges = findEdges(graph, { target_id: entity.id });

        const allEdges = [...outEdges, ...inEdges];

        if (allEdges.length > 0) {
          // Group by relation_type
          const grouped = new Map<string, typeof allEdges>();
          for (const edge of allEdges) {
            const group = grouped.get(edge.relation_type) ?? [];
            group.push(edge);
            grouped.set(edge.relation_type, group);
          }

          console.log("\nEdges:");
          for (const [relType, edges] of grouped) {
            console.log(`  [${relType}] (${edges.length})`);
            for (const edge of edges.slice(0, 5)) {
              const direction = edge.source_id === entity.id ? "->" : "<-";
              const status = edge.invalidated_at ? " [invalidated]" : "";
              console.log(`    ${direction} ${edge.fact}${status}`);
            }
            if (edges.length > 5) {
              console.log(`    ... and ${edges.length - 5} more`);
            }
          }
        } else {
          console.log("\nNo edges.");
        }
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
