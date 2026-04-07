/**
 * search.ts — `engram search` command.
 *
 * Full-text search across entities, edges, and episodes.
 * Outputs text or JSON format.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph, SearchResult } from "engram-core";
import { closeGraph, openGraph, search } from "engram-core";

interface SearchOpts {
  limit: string;
  validAt?: string;
  format: string;
  db: string;
}

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search the knowledge graph")
    .option("--limit <n>", "maximum results to return", "20")
    .option("--valid-at <iso>", "filter edges valid at this ISO8601 timestamp")
    .option("--format <fmt>", "output format: text or json", "text")
    .option("--db <path>", "path to .engram file", ".engram")
    .action((query: string, opts: SearchOpts) => {
      const dbPath = path.resolve(opts.db);
      const limit = parseInt(opts.limit, 10);

      if (Number.isNaN(limit) || limit < 1) {
        console.error("Error: --limit must be a positive integer");
        process.exit(1);
      }

      if (opts.format !== "text" && opts.format !== "json") {
        console.error("Error: --format must be 'text' or 'json'");
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

      let results: SearchResult[];
      try {
        results = search(graph, query, {
          limit,
          valid_at: opts.validAt,
        });
        closeGraph(graph);
      } catch (err) {
        console.error(
          `Search failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
        return;
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log("No results found.");
        return;
      }

      for (const r of results) {
        const score = r.score.toFixed(3);
        const kind = r.edge_kind ? ` [${r.edge_kind}]` : "";
        console.log(`[${r.type}${kind}] (${score}) ${r.content}`);
        console.log(`  id: ${r.id}`);
        if (r.provenance.length > 0) {
          console.log(`  evidence: ${r.provenance.length} episode(s)`);
        }
      }
    });
}
