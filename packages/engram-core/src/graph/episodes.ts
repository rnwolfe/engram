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
