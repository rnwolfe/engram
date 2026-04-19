/**
 * cursor.ts — Shared cursor helpers for enrichment adapters.
 *
 * Removes per-adapter cursor parsing boilerplate. Read and write cursors
 * from the `ingestion_runs` table using `(source_type, source_scope)` matching.
 *
 * ## Cursor semantics
 *
 * A cursor is an opaque string stored in `ingestion_runs.cursor` after a
 * successful run. On the next call, the adapter reads the cursor and resumes
 * from where it left off.
 *
 * Two flavors are provided:
 * - `readIsoCursor`     — returns an ISO8601 string (e.g. 'since' timestamps)
 *                          or null if no cursor exists.
 * - `readNumericCursor` — returns an integer (e.g. PR/issue numbers, offsets)
 *                          or 0 if no cursor exists or cursor is non-numeric.
 *
 * `writeCursor` updates an existing `ingestion_runs` row (identified by runId)
 * with the latest cursor value at run completion.
 */

import type { EngramGraph } from "../format/index.js";

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

/**
 * Reads the cursor from the most recently completed ingestion run matching
 * `(sourceType, scope)` and returns it as-is (ISO8601 or other string).
 *
 * Returns `null` if no completed run exists or the cursor is null.
 *
 * @param graph      - The EngramGraph handle.
 * @param sourceType - The `ingestion_runs.source_type` value (e.g. INGESTION_SOURCE_TYPES.GITHUB).
 * @param scope      - The `ingestion_runs.source_scope` value (e.g. 'owner/repo').
 */
export function readIsoCursor(
  graph: EngramGraph,
  sourceType: string,
  scope: string,
): string | null {
  const row = graph.db
    .query<{ cursor: string | null }, [string, string]>(
      `SELECT cursor FROM ingestion_runs
       WHERE source_type = ? AND source_scope = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get(sourceType, scope);

  return row?.cursor ?? null;
}

/**
 * Reads the cursor from the most recently completed ingestion run matching
 * `(sourceType, scope)` and parses it as an integer.
 *
 * Returns `0` if no completed run exists, the cursor is null, or the cursor
 * cannot be parsed as an integer.
 *
 * Useful for adapters that use numeric item numbers (e.g. GitHub PR numbers,
 * Gerrit change offsets) as their cursor.
 *
 * @param graph      - The EngramGraph handle.
 * @param sourceType - The `ingestion_runs.source_type` value.
 * @param scope      - The `ingestion_runs.source_scope` value.
 */
export function readNumericCursor(
  graph: EngramGraph,
  sourceType: string,
  scope: string,
): number {
  const raw = readIsoCursor(graph, sourceType, scope);
  if (raw === null) return 0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Write helper
// ---------------------------------------------------------------------------

/**
 * Writes `value` into `ingestion_runs.cursor` for the run identified by
 * `runId`. Typically called at the end of a successful enrichment run before
 * marking the run as completed.
 *
 * Pass `null` to clear the cursor (i.e. a fresh full-scan is needed next time).
 *
 * @param graph - The EngramGraph handle.
 * @param runId - The `ingestion_runs.id` of the current run.
 * @param value - The cursor value to store, or `null` to clear.
 */
export function writeCursor(
  graph: EngramGraph,
  runId: string,
  value: string | null,
): void {
  graph.db
    .prepare<void, [string | null, string]>(
      "UPDATE ingestion_runs SET cursor = ? WHERE id = ?",
    )
    .run(value, runId);
}
