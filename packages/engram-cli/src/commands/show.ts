import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  findEdges,
  getEntity,
  getEvidenceForEntity,
  openGraph,
  resolveDbPath,
  resolveEntity,
} from "engram-core";

interface ShowOpts {
  db: string;
  format: string;
}

export function registerShow(program: Command): void {
  program
    .command("show <entity>")
    .description("Show entity details, edges, and evidence")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--format <fmt>", "output format: text or json", "text")
    .addHelpText(
      "after",
      `
Examples:
  # Show entity details by ID
  engram show <entity-id>

  # Show by canonical name or alias
  engram show "auth middleware"

  # Machine-readable JSON output
  engram show <entity-id> --format json

When to use:
  Use when you already have an entity ID from search results or want to
  inspect a specific entity's edges and evidence chain.

See also:
  engram search    find entities by keyword
  engram history   trace how facts about an entity changed over time`,
    )
    .action((entityArg: string, opts: ShowOpts) => {
      if (opts.format !== "text" && opts.format !== "json") {
        console.error("--format must be 'text' or 'json'");
        process.exit(1);
      }

      const dbPath = resolveDbPath(path.resolve(opts.db));

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
        let entity = getEntity(graph, entityArg);
        if (!entity) {
          entity = resolveEntity(graph, entityArg);
        }

        if (!entity) {
          console.error(`Entity not found: ${entityArg}`);
          closeGraph(graph);
          process.exit(1);
        }

        const evidence = getEvidenceForEntity(graph, entity.id);

        const outEdges = findEdges(graph, { source_id: entity.id });
        const inEdges = findEdges(graph, { target_id: entity.id });

        const edgeMap = new Map<string, (typeof outEdges)[0]>();
        for (const edge of [...outEdges, ...inEdges]) {
          if (!edgeMap.has(edge.id)) edgeMap.set(edge.id, edge);
        }
        const allEdges = Array.from(edgeMap.values());

        if (opts.format === "json") {
          const output = {
            entity: {
              id: entity.id,
              canonical_name: entity.canonical_name,
              entity_type: entity.entity_type,
              status: entity.status,
              summary: entity.summary ?? null,
              created_at: entity.created_at,
            },
            edges: allEdges.map((edge) => ({
              fact: edge.fact,
              edge_kind: edge.edge_kind,
              relation_type: edge.relation_type,
              direction: edge.source_id === entity?.id ? "out" : "in",
              invalidated_at: edge.invalidated_at ?? null,
            })),
            evidenceCount: evidence.length,
          };
          console.log(JSON.stringify(output, null, 2));
          closeGraph(graph);
          return;
        }

        console.log(`${entity.canonical_name}`);
        console.log(`  id:     ${entity.id}`);
        console.log(`  type:   ${entity.entity_type}`);
        console.log(`  status: ${entity.status}`);
        if (entity.summary) {
          console.log(`  summary: ${entity.summary}`);
        }
        console.log(`  created: ${entity.created_at}`);
        console.log(`  evidence: ${evidence.length} episode(s)`);

        if (allEdges.length > 0) {
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
