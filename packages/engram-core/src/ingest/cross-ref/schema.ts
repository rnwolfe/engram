/**
 * schema.ts — DDL for the unresolved_refs table.
 * Uses CREATE TABLE IF NOT EXISTS for idempotent setup on open.
 */

import type { EngramGraph } from "../../format/index.js";

export const CREATE_UNRESOLVED_REFS = `
CREATE TABLE IF NOT EXISTS unresolved_refs (
  id                 TEXT PRIMARY KEY,
  source_episode_id  TEXT NOT NULL REFERENCES episodes(id),
  target_source_type TEXT NOT NULL,
  target_ref         TEXT NOT NULL,
  detected_at        TEXT NOT NULL,
  resolved_at        TEXT
);
`;

export const CREATE_UNRESOLVED_REFS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_unresolved_refs_target
  ON unresolved_refs(target_source_type, target_ref)
  WHERE resolved_at IS NULL;
`;

/** Idempotent: create unresolved_refs table if it does not exist. */
export function ensureUnresolvedRefsTable(graph: EngramGraph): void {
  graph.db.exec(CREATE_UNRESOLVED_REFS);
  graph.db.exec(CREATE_UNRESOLVED_REFS_INDEX);
}
