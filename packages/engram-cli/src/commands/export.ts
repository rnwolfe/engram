/**
 * export.ts — `engram export` command.
 *
 * Exports the graph as deterministic JSONL (one object per line, sorted by ID)
 * or as markdown summaries.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, findEdges, findEntities, openGraph } from "engram-core";

interface ExportOpts {
  format: string;
  db: string;
}

interface EpisodeRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  content: string;
  actor: string | null;
  status: string;
  timestamp: string;
  ingested_at: string;
}

export function registerExport(program: Command): void {
  program
    .command("export")
    .description("Export the knowledge graph to JSONL or markdown")
    .option("--format <fmt>", "output format: jsonl or md", "jsonl")
    .option("--db <path>", "path to .engram file", ".engram")
    .action((opts: ExportOpts) => {
      const dbPath = path.resolve(opts.db);

      if (opts.format !== "jsonl" && opts.format !== "md") {
        console.error("Error: --format must be 'jsonl' or 'md'");
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
        const entities = findEntities(graph).sort((a, b) =>
          a.id.localeCompare(b.id),
        );
        const edges = findEdges(graph, { include_invalidated: true }).sort(
          (a, b) => a.id.localeCompare(b.id),
        );
        const episodes = graph.db
          .query<EpisodeRow, []>("SELECT * FROM episodes ORDER BY id ASC")
          .all();

        if (opts.format === "jsonl") {
          for (const entity of entities) {
            console.log(JSON.stringify({ _type: "entity", ...entity }));
          }
          for (const edge of edges) {
            console.log(JSON.stringify({ _type: "edge", ...edge }));
          }
          for (const episode of episodes) {
            console.log(JSON.stringify({ _type: "episode", ...episode }));
          }
        } else {
          // Markdown format
          console.log("# Engram Export\n");

          console.log(`## Entities (${entities.length})\n`);
          for (const entity of entities) {
            console.log(`### ${entity.canonical_name}`);
            console.log(`- **id**: ${entity.id}`);
            console.log(`- **type**: ${entity.entity_type}`);
            console.log(`- **status**: ${entity.status}`);
            if (entity.summary) {
              console.log(`- **summary**: ${entity.summary}`);
            }
            console.log("");
          }

          console.log(`## Edges (${edges.length})\n`);
          for (const edge of edges) {
            const status = edge.invalidated_at ? " *(superseded)*" : "";
            console.log(`- [${edge.edge_kind}] ${edge.fact}${status}`);
            console.log(`  - id: ${edge.id}`);
            console.log(`  - relation: ${edge.relation_type}`);
          }

          console.log(`\n## Episodes (${episodes.length})\n`);
          for (const ep of episodes) {
            console.log(`### ${ep.id}`);
            console.log(
              `- **source**: ${ep.source_type}${ep.source_ref ? ` (${ep.source_ref})` : ""}`,
            );
            console.log(`- **timestamp**: ${ep.timestamp}`);
            if (ep.actor) {
              console.log(`- **actor**: ${ep.actor}`);
            }
            const snippet =
              ep.content.length > 200
                ? `${ep.content.slice(0, 200)}…`
                : ep.content;
            console.log(`\n${snippet}\n`);
          }
        }
      } catch (err) {
        console.error(
          `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
