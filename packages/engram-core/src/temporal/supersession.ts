/**
 * supersession.ts — supersedeEdge and active-edge conflict detection.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, EdgeInput } from "../graph/edges.js";
import { addEdge } from "../graph/edges.js";
import type { EvidenceInput } from "../graph/entities.js";
import { EdgeNotFoundError } from "../graph/errors.js";

/**
 * Checks whether a new edge would overlap with any existing active edge that
 * shares the same (source_id, target_id, relation_type, edge_kind).
 *
 * Two validity windows overlap when they are not disjoint:
 *   NOT (e.valid_until <= new.valid_from  OR  new.valid_until <= e.valid_from)
 * NULLs are treated as ±∞:
 *   - NULL valid_from  = -∞ (edge has no known start — it could overlap anything)
 *   - NULL valid_until = +∞ (edge is still current — it overlaps everything after valid_from)
 *
 * Returns the first conflicting edge, or null if none found.
 */
export function checkActiveEdgeConflict(
  graph: EngramGraph,
  source_id: string,
  target_id: string,
  relation_type: string,
  edge_kind: string,
  valid_from: string | null,
  valid_until: string | null,
): Edge | null {
  // We look for active edges where the windows overlap.
  // Overlap = NOT (e ends before new starts  OR  new ends before e starts)
  //
  // "e ends before new starts" means:
  //   e.valid_until IS NOT NULL AND e.valid_until <= new.valid_from
  //   (if e.valid_until IS NULL it extends to +∞ so it never ends before anything)
  //
  // "new ends before e starts" means:
  //   new.valid_until IS NOT NULL AND new.valid_until <= e.valid_from
  //   (if new.valid_until IS NULL it extends to +∞ so it never ends before anything)
  //
  // Because SQLite only supports positional params we build the SQL dynamically.
  const conditions: string[] = [
    "source_id = ?",
    "target_id = ?",
    "relation_type = ?",
    "edge_kind = ?",
    "invalidated_at IS NULL",
  ];
  const params: unknown[] = [source_id, target_id, relation_type, edge_kind];

  // Build "e ends before new starts" clause
  let eEndsBeforeNew: string;
  if (valid_from === null) {
    // new starts at -∞ → nothing can end before -∞
    eEndsBeforeNew = "0";
  } else {
    eEndsBeforeNew = `(e.valid_until IS NOT NULL AND e.valid_until <= ?)`;
    params.push(valid_from);
  }

  // Build "new ends before e starts" clause
  let newEndsBeforeE: string;
  if (valid_until === null) {
    // new extends to +∞ → it never ends before anything
    newEndsBeforeE = "0";
  } else {
    newEndsBeforeE = `(e.valid_from IS NOT NULL AND ? <= e.valid_from)`;
    params.push(valid_until);
  }

  const noOverlap = `(${eEndsBeforeNew} OR ${newEndsBeforeE})`;
  conditions.push(`NOT ${noOverlap}`);

  const sql = `SELECT * FROM edges e WHERE ${conditions.join(" AND ")} LIMIT 1`;
  return graph.db.query<Edge, unknown[]>(sql).get(...params) ?? null;
}

/**
 * Atomically supersedes an existing edge with a new one.
 *
 * Steps (all inside one SQLite transaction):
 * 1. Fetch old edge — throws EdgeNotFoundError if not found.
 * 2. Verify old edge is active (invalidated_at IS NULL) — throws if already superseded.
 * 3. Insert new edge (with evidence).
 * 4. Set old edge: invalidated_at = now, superseded_by = new_id, valid_until = new.valid_from ?? now.
 *
 * Returns { old: updatedOldEdge, new: newEdge }.
 */
export function supersedeEdge(
  graph: EngramGraph,
  old_edge_id: string,
  new_edge: EdgeInput,
  evidence: EvidenceInput[],
): { old: Edge; new: Edge } {
  const now = new Date().toISOString();
  // Use a container so the transaction closure can assign and we can read it after.
  const result: { newEdge: Edge | null; oldEdge: Edge | null } = {
    newEdge: null,
    oldEdge: null,
  };

  graph.db.transaction(() => {
    // Fetch old edge inside transaction to prevent TOCTOU race
    const oldEdge = graph.db
      .query<Edge, [string]>("SELECT * FROM edges WHERE id = ?")
      .get(old_edge_id);

    if (!oldEdge) {
      throw new EdgeNotFoundError(old_edge_id);
    }

    if (oldEdge.invalidated_at !== null) {
      throw new Error(
        `supersedeEdge: edge ${old_edge_id} is already superseded (invalidated_at = ${oldEdge.invalidated_at})`,
      );
    }

    result.oldEdge = oldEdge;

    // Insert the new edge within the transaction
    result.newEdge = addEdge(graph, new_edge, evidence);

    // The old edge's valid_until becomes the new edge's valid_from (or now if unset)
    const closingValidUntil = new_edge.valid_from ?? now;

    graph.db
      .prepare<void, [string, string, string, string]>(
        `UPDATE edges
         SET invalidated_at = ?,
             superseded_by  = ?,
             valid_until    = ?
         WHERE id = ? AND invalidated_at IS NULL`,
      )
      .run(now, result.newEdge.id, closingValidUntil, old_edge_id);

    // Verify the update actually succeeded by checking the row
    const verifyRow = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM edges WHERE id = ?",
      )
      .get(old_edge_id);

    if (!verifyRow || verifyRow.invalidated_at === null) {
      throw new Error(
        `supersedeEdge: failed to invalidate edge ${old_edge_id} — it may have been concurrently superseded`,
      );
    }
  })();

  if (!result.newEdge) {
    throw new Error("supersedeEdge: new edge was not created");
  }

  const updatedOldEdge = graph.db
    .query<Edge, [string]>("SELECT * FROM edges WHERE id = ?")
    .get(old_edge_id);

  if (!updatedOldEdge) {
    throw new Error(
      `supersedeEdge: failed to retrieve old edge ${old_edge_id} after update`,
    );
  }

  return { old: updatedOldEdge, new: result.newEdge };
}
