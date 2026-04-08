/**
 * tools/ownership.ts — engram_ownership_report MCP tool implementation.
 */

import {
  type EngramGraph,
  getOwnershipReport,
  type OwnershipReport,
} from "engram-core";

const RESPONSE_BUDGET = 500;

export const OWNERSHIP_TOOL = {
  name: "engram_ownership_report",
  description:
    "Get an ownership risk report combining decay signals (concentrated-risk, dormant-owner) " +
    "with likely_owner_of edge analysis. Identifies entities that are one-person-deep or whose " +
    "owner has gone quiet. Returns ranked entries sorted by risk level (critical first).",
  inputSchema: {
    type: "object" as const,
    properties: {
      module: {
        type: "string",
        description:
          "Path prefix filter — scope report to entities under this module path",
      },
      limit: {
        type: "number",
        description:
          "Maximum number of entries to return (default 20, max 500)",
      },
      min_confidence: {
        type: "number",
        description:
          "Minimum likely_owner_of edge confidence to include (0.0-1.0, default 0.1)",
      },
      valid_at: {
        type: "string",
        description:
          "ISO8601 UTC timestamp for temporal snapshot. Defaults to now.",
      },
    },
    required: [],
  },
};

export interface OwnershipInput {
  module?: string;
  limit?: number;
  min_confidence?: number;
  valid_at?: string;
}

export interface OwnershipMcpResult extends OwnershipReport {
  truncated?: boolean;
}

export function handleOwnershipReport(
  graph: EngramGraph,
  input: OwnershipInput,
): OwnershipMcpResult {
  const requestedLimit = input.limit ?? 20;
  const effectiveLimit = Math.min(requestedLimit, RESPONSE_BUDGET);

  const report = getOwnershipReport(graph, {
    module: input.module,
    limit: effectiveLimit,
    min_confidence: input.min_confidence,
    valid_at: input.valid_at,
  });

  // Bug 3 fix: truncated should be true when the limit was actually hit (entries
  // were cut off), not when total_entities_analyzed > effectiveLimit (which uses
  // a count of candidates, not returned entries).
  const truncated = report.entries.length === effectiveLimit ? true : undefined;

  return {
    ...report,
    ...(truncated !== undefined ? { truncated } : {}),
  };
}
