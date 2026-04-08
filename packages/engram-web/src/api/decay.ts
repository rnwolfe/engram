/**
 * decay.ts — GET /api/decay handler.
 *
 * Wraps getDecayReport() from engram-core and returns a per-entity
 * status map plus a summary of decay category counts.
 */

import type { EngramGraph } from "engram-core";
import { getDecayReport } from "engram-core";

export type DecayStatus =
  | "concentrated-risk"
  | "dormant"
  | "stale"
  | "orphaned";

export interface DecayEntry {
  status: DecayStatus;
  score?: number;
  last_activity_days?: number;
}

export interface DecayResponse {
  entries: Record<string, DecayEntry>;
  summary: {
    "concentrated-risk": number;
    dormant: number;
    stale: number;
    orphaned: number;
  };
}

/** Map a decay_category from engram-core to the overlay status label. */
function categoryToStatus(category: string): DecayStatus | null {
  switch (category) {
    case "concentrated_risk":
      return "concentrated-risk";
    case "dormant_owner":
      return "dormant";
    case "stale_evidence":
      return "stale";
    case "orphaned":
      return "orphaned";
    default:
      return null;
  }
}

export function handleDecay(graph: EngramGraph): DecayResponse {
  const report = getDecayReport(graph, {});

  const entries: Record<string, DecayEntry> = {};
  const summary: DecayResponse["summary"] = {
    "concentrated-risk": 0,
    dormant: 0,
    stale: 0,
    orphaned: 0,
  };

  for (const item of report.decay_items) {
    if (item.type !== "entity") continue;

    const status = categoryToStatus(item.decay_category);
    if (!status) continue;

    // If we already have an entry for this entity, keep the first (highest
    // severity — decay items are sorted by severity in getDecayReport).
    if (entries[item.id]) continue;

    let last_activity_days: number | undefined;
    if (item.last_evidence_at) {
      const lastEvidence = new Date(item.last_evidence_at).getTime();
      const now = Date.now();
      last_activity_days = Math.floor(
        (now - lastEvidence) / (1000 * 60 * 60 * 24),
      );
    }

    entries[item.id] = { status, last_activity_days };
    summary[status]++;
  }

  return { entries, summary };
}
