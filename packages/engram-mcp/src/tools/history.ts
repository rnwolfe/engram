/**
 * tools/history.ts — engram_get_history MCP tool implementation.
 */

import { type Edge, type EngramGraph, getFactHistory } from "engram-core";

export const GET_HISTORY_TOOL = {
  name: "engram_get_history",
  description:
    "Get the full temporal fact history between two entities: all edges (active and superseded) ordered chronologically.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_id: {
        type: "string",
        description: "ULID of the source entity",
      },
      target_id: {
        type: "string",
        description: "ULID of the target entity",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["source_id", "target_id"],
  },
};

export interface GetHistoryInput {
  source_id: string;
  target_id: string;
  scope?: string;
}

export interface HistoryResult {
  source_id: string;
  target_id: string;
  edges: Edge[];
}

export function handleGetHistory(
  graph: EngramGraph,
  input: GetHistoryInput,
): HistoryResult {
  const edges = getFactHistory(graph, input.source_id, input.target_id);
  return {
    source_id: input.source_id,
    target_id: input.target_id,
    edges,
  };
}
