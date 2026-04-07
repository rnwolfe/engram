/**
 * tools/decay.ts — engram_get_decay MCP tool implementation.
 */

import {
  type DecayReport,
  type EngramGraph,
  getDecayReport,
} from "engram-core";

export const GET_DECAY_TOOL = {
  name: "engram_get_decay",
  description:
    "Get a knowledge decay report identifying stale, contradicted, orphaned, or at-risk entities and edges in the graph.",
  inputSchema: {
    type: "object" as const,
    properties: {
      stale_days: {
        type: "number",
        description:
          "Days without evidence updates before entity/edge is considered stale (default 180)",
      },
      dormant_days: {
        type: "number",
        description:
          "Days without activity before primary contributor is considered dormant (default 90)",
      },
      min_edges_for_risk: {
        type: "number",
        description:
          "Minimum active edges for concentrated risk detection (default 3)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: [],
  },
};

export interface GetDecayInput {
  stale_days?: number;
  dormant_days?: number;
  min_edges_for_risk?: number;
  scope?: string;
}

export function handleGetDecay(
  graph: EngramGraph,
  input: GetDecayInput,
): DecayReport {
  return getDecayReport(graph, {
    stale_days: input.stale_days,
    dormant_days: input.dormant_days,
    min_edges_for_risk: input.min_edges_for_risk,
  });
}
