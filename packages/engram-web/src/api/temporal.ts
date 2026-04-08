/**
 * temporal.ts — GET /api/temporal-bounds handler.
 *
 * Returns the min valid_from and max valid_until across all active edges,
 * used to calibrate the time slider in the UI.
 */

import type { EngramGraph } from "engram-core";

export interface TemporalBoundsResponse {
  min_valid_from: string | null;
  max_valid_until: string | null;
}

export function handleTemporalBounds(
  graph: EngramGraph,
): TemporalBoundsResponse {
  const row = graph.db
    .query<
      { min_valid_from: string | null; max_valid_until: string | null },
      []
    >(
      `SELECT
         MIN(valid_from) as min_valid_from,
         MAX(valid_until) as max_valid_until
       FROM edges
       WHERE invalidated_at IS NULL`,
    )
    .get();

  return {
    min_valid_from: row?.min_valid_from ?? null,
    max_valid_until: row?.max_valid_until ?? null,
  };
}
