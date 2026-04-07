/**
 * history.ts — getFactHistory: chronological edge history between two entities.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge } from "../graph/edges.js";

/**
 * Returns ALL edges between source_id and target_id (active and invalidated),
 * ordered by valid_from ASC NULLS FIRST, then created_at ASC.
 *
 * This gives a full temporal history of the relationship between two entities.
 */
export function getFactHistory(
  graph: EngramGraph,
  source_id: string,
  target_id: string,
): Edge[] {
  return graph.db
    .query<Edge, [string, string]>(
      `SELECT * FROM edges
       WHERE source_id = ? AND target_id = ?
       ORDER BY
         CASE WHEN valid_from IS NULL THEN 0 ELSE 1 END ASC,
         valid_from ASC,
         created_at ASC`,
    )
    .all(source_id, target_id);
}
