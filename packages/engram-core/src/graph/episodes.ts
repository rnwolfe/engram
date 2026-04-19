/**
 * episodes.ts — episode (immutable raw evidence) CRUD operations.
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import { ENGINE_VERSION } from "../format/version.js";

export interface EpisodeInput {
  source_type: string;
  source_ref?: string;
  content: string;
  actor?: string;
  timestamp: string;
  owner_id?: string;
  extractor_version?: string;
  metadata?: Record<string, unknown>;
}

export interface Episode {
  id: string;
  source_type: string;
  source_ref: string | null;
  content: string;
  content_hash: string;
  actor: string | null;
  status: string;
  timestamp: string;
  ingested_at: string;
  owner_id: string | null;
  extractor_version: string;
  metadata: string | null;
  superseded_by: string | null;
}

/**
 * Creates a new episode (immutable raw evidence record).
 *
 * If `source_ref` is provided and a duplicate `(source_type, source_ref)` exists,
 * returns the existing episode instead of throwing.
 */
export function addEpisode(graph: EngramGraph, input: EpisodeInput): Episode {
  // If source_ref provided, check for existing episode first (idempotent dedup)
  if (input.source_ref != null) {
    const existing = graph.db
      .query<Episode, [string, string]>(
        "SELECT * FROM episodes WHERE source_type = ? AND source_ref = ?",
      )
      .get(input.source_type, input.source_ref);
    if (existing) return existing;
  }

  const id = ulid();
  const now = new Date().toISOString();
  const content_hash = createHash("sha256").update(input.content).digest("hex");
  const extractor_version = input.extractor_version ?? ENGINE_VERSION;
  const metadata =
    input.metadata != null ? JSON.stringify(input.metadata) : null;

  const insert = graph.db.prepare<
    void,
    [
      string, // id
      string, // source_type
      string | null, // source_ref
      string, // content
      string, // content_hash
      string | null, // actor
      string, // timestamp
      string, // ingested_at
      string | null, // owner_id
      string, // extractor_version
      string | null, // metadata
    ]
  >(
    `INSERT INTO episodes
       (id, source_type, source_ref, content, content_hash, actor, status, timestamp, ingested_at, owner_id, extractor_version, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  );

  graph.db.transaction(() => {
    insert.run(
      id,
      input.source_type,
      input.source_ref ?? null,
      input.content,
      content_hash,
      input.actor ?? null,
      input.timestamp,
      now,
      input.owner_id ?? null,
      extractor_version,
      metadata,
    );
  })();

  const row = graph.db
    .query<Episode, [string]>("SELECT * FROM episodes WHERE id = ?")
    .get(id);

  if (!row) {
    throw new Error(`addEpisode: failed to retrieve inserted episode ${id}`);
  }

  return row;
}

/**
 * Returns an episode by ID, or null if not found.
 */
export function getEpisode(graph: EngramGraph, id: string): Episode | null {
  return (
    graph.db
      .query<Episode, [string]>("SELECT * FROM episodes WHERE id = ?")
      .get(id) ?? null
  );
}

/**
 * Returns the current (non-superseded) episode for a given (source_type, source_ref),
 * or null if none exists or only superseded episodes exist for that source.
 *
 * Uses the idx_episodes_current partial index for efficient lookup.
 */
export function getCurrentEpisode(
  graph: EngramGraph,
  sourceType: string,
  sourceRef: string,
): Episode | null {
  return (
    graph.db
      .query<Episode, [string, string]>(
        `SELECT * FROM episodes
         WHERE source_type = ? AND source_ref = ? AND superseded_by IS NULL`,
      )
      .get(sourceType, sourceRef) ?? null
  );
}

/**
 * Supersedes an existing episode with a new one.
 *
 * Atomically:
 *  1. Inserts the new episode.
 *  2. Sets prior episode's superseded_by to the new episode's id.
 *
 * Returns the new Episode.
 *
 * Throws if:
 *  - The prior episode id does not exist.
 *  - The prior episode is already superseded.
 *  - A non-superseded episode already exists for the same (source_type, source_ref).
 */
export function supersedeEpisode(
  graph: EngramGraph,
  priorEpisodeId: string,
  newEpisodeInput: EpisodeInput,
): Episode {
  // Pre-flight checks before opening a transaction.
  const prior = graph.db
    .query<Episode, [string]>("SELECT * FROM episodes WHERE id = ?")
    .get(priorEpisodeId);

  if (!prior) {
    throw new Error(
      `supersedeEpisode: prior episode '${priorEpisodeId}' does not exist`,
    );
  }

  if (prior.superseded_by != null) {
    throw new Error(
      `supersedeEpisode: prior episode '${priorEpisodeId}' is already superseded by '${prior.superseded_by}'`,
    );
  }

  // Check for collision: a non-superseded episode with the same (source_type, source_ref)
  // other than the prior itself.
  if (newEpisodeInput.source_ref != null) {
    const collision = graph.db
      .query<{ id: string }, [string, string, string]>(
        `SELECT id FROM episodes
         WHERE source_type = ? AND source_ref = ? AND superseded_by IS NULL AND id != ?`,
      )
      .get(
        newEpisodeInput.source_type,
        newEpisodeInput.source_ref,
        priorEpisodeId,
      );

    if (collision) {
      throw new Error(
        `supersedeEpisode: a non-superseded episode '${collision.id}' already exists for (${newEpisodeInput.source_type}, ${newEpisodeInput.source_ref})`,
      );
    }
  }

  const newId = ulid();
  const now = new Date().toISOString();
  const content_hash = createHash("sha256")
    .update(newEpisodeInput.content)
    .digest("hex");
  const extractor_version = newEpisodeInput.extractor_version ?? ENGINE_VERSION;
  const metadata =
    newEpisodeInput.metadata != null
      ? JSON.stringify(newEpisodeInput.metadata)
      : null;

  const insertStmt = graph.db.prepare<
    void,
    [
      string, // id
      string, // source_type
      string | null, // source_ref
      string, // content
      string, // content_hash
      string | null, // actor
      string, // timestamp
      string, // ingested_at
      string | null, // owner_id
      string, // extractor_version
      string | null, // metadata
    ]
  >(
    `INSERT INTO episodes
       (id, source_type, source_ref, content, content_hash, actor, status, timestamp, ingested_at, owner_id, extractor_version, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
  );

  const updateStmt = graph.db.prepare<void, [string, string]>(
    `UPDATE episodes SET superseded_by = ? WHERE id = ?`,
  );

  // Order matters: UPDATE prior first (marks it superseded, freeing the unique
  // index slot), then INSERT the new episode. This avoids a UNIQUE constraint
  // violation when the new episode shares the same source_ref as the prior.
  // The FK constraint on superseded_by cannot be satisfied until newId exists,
  // so we use PRAGMA defer_foreign_keys=ON to defer FK checks to end-of-txn.
  graph.db.transaction(() => {
    graph.db.run("PRAGMA defer_foreign_keys = ON");
    updateStmt.run(newId, priorEpisodeId);
    insertStmt.run(
      newId,
      newEpisodeInput.source_type,
      newEpisodeInput.source_ref ?? null,
      newEpisodeInput.content,
      content_hash,
      newEpisodeInput.actor ?? null,
      newEpisodeInput.timestamp,
      now,
      newEpisodeInput.owner_id ?? null,
      extractor_version,
      metadata,
    );
  })();

  const row = graph.db
    .query<Episode, [string]>("SELECT * FROM episodes WHERE id = ?")
    .get(newId);

  if (!row) {
    throw new Error(
      `supersedeEpisode: failed to retrieve inserted episode ${newId}`,
    );
  }

  return row;
}
