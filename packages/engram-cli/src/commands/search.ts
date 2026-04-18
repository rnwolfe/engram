/**
 * search.ts — `engram search` command.
 *
 * Full-text search across entities, edges, and episodes.
 * Outputs text or JSON format.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph, SearchResult } from "engram-core";
import {
  closeGraph,
  createProvider,
  EmbeddingModelMismatchError,
  openGraph,
  resolveDbPath,
  search,
} from "engram-core";
import { c } from "../colors.js";

interface SearchOpts {
  limit: string;
  validAt?: string;
  format: string;
  db: string;
  j?: boolean;
}

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search the knowledge graph")
    .option("--limit <n>", "maximum results to return", "20")
    .option("--valid-at <iso>", "filter edges valid at this ISO8601 timestamp")
    .option("--format <fmt>", "output format: text or json", "text")
    .option("-j", "shorthand for --format json")
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Text search across the knowledge graph
  engram search "auth middleware"

  # Limit results and output as JSON
  engram search "database" --limit 5 --format json

  # Filter edges valid at a point in time
  engram search "api gateway" --valid-at 2024-06-01T00:00:00Z

When to use:
  Use search when you know a term to look for but not the entity ID.
  Prefer engram context for open-ended questions that need ranked signals.

See also:
  engram context   retrieve a token-budgeted context pack by query
  engram show      display full entity details by ID`,
    )
    .action(async (query: string, opts: SearchOpts) => {
      if (opts.j) opts.format = "json";
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const limit = parseInt(opts.limit, 10);

      if (Number.isNaN(limit) || limit < 1) {
        console.error(`${c.red("Error:")} --limit must be a positive integer`);
        process.exit(1);
      }

      if (opts.format !== "text" && opts.format !== "json") {
        console.error(`${c.red("Error:")} --format must be 'text' or 'json'`);
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `${c.red("Error:")} opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      const provider = createProvider();

      let results: SearchResult[];
      try {
        results = await search(graph, query, {
          limit,
          valid_at: opts.validAt,
          provider,
        });
        closeGraph(graph);
      } catch (err) {
        if (err instanceof EmbeddingModelMismatchError) {
          console.error(
            [
              "",
              "Embedding model mismatch.",
              `  Database was indexed with:  ${err.storedModel}  (${err.storedDimensions} dims)`,
              `  Currently configured:       ${err.activeModel}${err.activeDimensions ? `  (${err.activeDimensions} dims)` : ""}`,
              "",
              "To re-index with the configured model:",
              "  engram embed reindex",
              "",
              "To keep the existing index, revert your embedding config to",
              `  ${err.storedModel}.`,
            ].join("\n"),
          );
        } else {
          console.error(
            `${c.red("Error:")} search failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        closeGraph(graph);
        process.exit(1);
        return;
      }

      if (opts.format === "json") {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log(c.dim("No results found."));
        return;
      }

      for (const r of results) {
        const score = r.score.toFixed(3);
        const kind = r.edge_kind ? ` [${r.edge_kind}]` : "";
        console.log(
          `${c.cyan(`[${r.type}${kind}]`)} ${c.dim(`(${score})`)} ${r.content}`,
        );
        console.log(`${c.dim("  id: ")}${r.id}`);
        if (r.provenance.length > 0) {
          console.log(`  evidence: ${r.provenance.length} episode(s)`);
        }
      }
    });
}
