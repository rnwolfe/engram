import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  findEdges,
  getEntity,
  getFactHistory,
  openGraph,
  resolveEntity,
} from "engram-core";

interface HistoryOpts {
  db: string;
  format: string;
}

function resolveEntityByNameOrId(
  graph: ReturnType<typeof openGraph>,
  nameOrId: string,
) {
  return getEntity(graph, nameOrId) ?? resolveEntity(graph, nameOrId);
}

export function registerHistory(program: Command): void {
  program
    .command("history <entity1> [entity2]")
    .description(
      "Show temporal fact evolution for an entity or between two entities",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--format <fmt>", "output format: text or json", "text")
    .addHelpText(
      "after",
      `
Examples:
  # Show temporal fact history for a single entity
  engram history <entity-id>

  # Show history between two entities
  engram history <entity-id-1> <entity-id-2>

  # Machine-readable JSON output
  engram history <entity-id> --format json

When to use:
  Trace how a fact about an entity changed over time — superseded edges,
  ownership changes, or structural shifts in the graph.

See also:
  engram show      display current entity details and active edges
  engram search    find entities by keyword`,
    )
    .action(
      (
        entity1Arg: string,
        entity2Arg: string | undefined,
        opts: HistoryOpts,
      ) => {
        if (opts.format !== "text" && opts.format !== "json") {
          console.error("Error: --format must be 'text' or 'json'");
          process.exit(1);
        }

        const dbPath = path.resolve(opts.db);

        let graph: EngramGraph | undefined;
        try {
          graph = openGraph(dbPath);
        } catch (err) {
          console.error(
            `Error opening graph: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          process.exit(1);
        }

        try {
          const entity1 = resolveEntityByNameOrId(graph, entity1Arg);
          if (!entity1) {
            console.error(`Entity not found: ${entity1Arg}`);
            closeGraph(graph);
            process.exit(1);
          }

          if (entity2Arg) {
            const entity2 = resolveEntityByNameOrId(graph, entity2Arg);
            if (!entity2) {
              console.error(`Entity not found: ${entity2Arg}`);
              closeGraph(graph);
              process.exit(1);
            }

            const edges = getFactHistory(graph, entity1.id, entity2.id);

            if (opts.format === "json") {
              console.log(
                JSON.stringify(
                  {
                    entity1: entity1.canonical_name,
                    entity2: entity2.canonical_name,
                    edges: edges.map((edge) => ({
                      id: edge.id,
                      fact: edge.fact,
                      edge_kind: edge.edge_kind,
                      relation_type: edge.relation_type,
                      valid_from: edge.valid_from ?? null,
                      valid_until: edge.valid_until ?? null,
                      invalidated_at: edge.invalidated_at ?? null,
                      superseded_by: edge.superseded_by ?? null,
                    })),
                  },
                  null,
                  2,
                ),
              );
              closeGraph(graph);
              return;
            }

            console.log(
              `History: ${entity1.canonical_name} → ${entity2.canonical_name}`,
            );
            console.log(`${edges.length} fact(s)\n`);

            for (const edge of edges) {
              const status = edge.invalidated_at ? "superseded" : "active";
              const from = edge.valid_from ?? "unknown";
              const until = edge.valid_until ?? "present";
              console.log(`[${status}] ${edge.fact}`);
              console.log(`  kind:  ${edge.edge_kind}`);
              console.log(`  valid: ${from} — ${until}`);
              console.log(`  id:    ${edge.id}`);
              if (edge.superseded_by) {
                console.log(`  superseded_by: ${edge.superseded_by}`);
              }
            }
          } else {
            const outEdges = findEdges(graph, {
              source_id: entity1.id,
              include_invalidated: true,
            });
            const inEdges = findEdges(graph, {
              target_id: entity1.id,
              include_invalidated: true,
            });
            const allEdges = [...outEdges, ...inEdges].sort((a, b) =>
              a.created_at.localeCompare(b.created_at),
            );

            if (opts.format === "json") {
              console.log(
                JSON.stringify(
                  {
                    entity1: entity1.canonical_name,
                    entity2: null,
                    edges: allEdges.map((edge) => ({
                      id: edge.id,
                      fact: edge.fact,
                      edge_kind: edge.edge_kind,
                      relation_type: edge.relation_type,
                      valid_from: edge.valid_from ?? null,
                      valid_until: edge.valid_until ?? null,
                      invalidated_at: edge.invalidated_at ?? null,
                      superseded_by: edge.superseded_by ?? null,
                    })),
                  },
                  null,
                  2,
                ),
              );
              closeGraph(graph);
              return;
            }

            console.log(`History: ${entity1.canonical_name}`);
            console.log(`${allEdges.length} fact(s)\n`);

            for (const edge of allEdges) {
              const status = edge.invalidated_at ? "superseded" : "active";
              const from = edge.valid_from ?? "unknown";
              const until = edge.valid_until ?? "present";
              console.log(`[${status}] ${edge.fact}`);
              console.log(
                `  kind:  ${edge.edge_kind}  relation: ${edge.relation_type}`,
              );
              console.log(`  valid: ${from} — ${until}`);
            }
          }
        } catch (err) {
          console.error(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
          closeGraph(graph);
          process.exit(1);
        }

        closeGraph(graph);
      },
    );
}
