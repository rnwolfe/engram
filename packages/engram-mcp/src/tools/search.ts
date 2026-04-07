/**
 * tools/search.ts — engram_search MCP tool implementation.
 */

import { type EngramGraph, type SearchResult, search } from "engram-core";

export const SEARCH_TOOL = {
  name: "engram_search",
  description:
    "Search the engram knowledge graph using full-text or hybrid search across entities, edges, and episodes. Returns scored results sorted by relevance.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search query string",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (default 20)",
      },
      mode: {
        type: "string",
        enum: ["fulltext", "hybrid"],
        description: "Search mode: fulltext or hybrid (default fulltext)",
      },
      entity_types: {
        type: "array",
        items: { type: "string" },
        description: "Filter entity results by entity_type values",
      },
      edge_kinds: {
        type: "array",
        items: { type: "string" },
        description:
          "Filter edge results by edge_kind values (observed, inferred, asserted)",
      },
      valid_at: {
        type: "string",
        description: "ISO8601 UTC timestamp for temporal filtering of edges",
      },
      min_confidence: {
        type: "number",
        description: "Minimum confidence score 0.0–1.0 (default 0.0)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["query"],
  },
};

export interface SearchInput {
  query: string;
  limit?: number;
  mode?: "fulltext" | "hybrid";
  entity_types?: string[];
  edge_kinds?: string[];
  valid_at?: string;
  min_confidence?: number;
  scope?: string;
}

export function handleSearch(
  graph: EngramGraph,
  input: SearchInput,
): SearchResult[] {
  return search(graph, input.query, {
    limit: input.limit,
    mode: input.mode,
    entity_types: input.entity_types,
    edge_kinds: input.edge_kinds,
    valid_at: input.valid_at,
    min_confidence: input.min_confidence,
  });
}
