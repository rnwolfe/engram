/**
 * ownership-api.ts — GET /api/ownership handler.
 *
 * Wraps getOwnershipReport() from engram-core and returns the full
 * OwnershipReport structure.
 */

import type { EngramGraph, OwnershipReport } from "engram-core";
import { getOwnershipReport } from "engram-core";

export function handleOwnership(graph: EngramGraph): OwnershipReport {
  return getOwnershipReport(graph, {});
}
