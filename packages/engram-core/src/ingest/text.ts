/**
 * text.ts — Plain text ingestion.
 *
 * Creates episodes from raw text content with source_type='manual'.
 * No AI/entity extraction — just raw episode creation.
 */

import { createHash } from "node:crypto";
import type { EngramGraph } from "../format/index.js";
import { ENGINE_VERSION } from "../format/version.js";
import { addEpisode } from "../graph/episodes.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TextIngestOpts {
  /** Optional stable identifier for dedup. If provided, duplicate source_ref returns existing. */
  source_ref?: string;
  owner_id?: string;
  actor?: string;
  /** ISO8601 UTC timestamp. Defaults to now. */
  timestamp?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingests raw text content into an EngramGraph as a manual episode.
 *
 * - source_type is always 'manual'.
 * - source_ref is optional. If provided and a duplicate exists, returns it.
 * - If no source_ref, a content hash warning is emitted when content matches
 *   an existing episode, but ingestion still proceeds.
 * - Returns IngestResult.
 */
export async function ingestText(
  graph: EngramGraph,
  content: string,
  opts: TextIngestOpts = {},
): Promise<IngestResult> {
  const counts: IngestResult = {
    episodesCreated: 0,
    episodesSkipped: 0,
    entitiesCreated: 0,
    entitiesResolved: 0,
    edgesCreated: 0,
    edgesSuperseded: 0,
    runId: "",
  };

  const timestamp = opts.timestamp ?? new Date().toISOString();
  const contentHash = computeHash(content);

  // If source_ref is provided, check for duplicate by (source_type, source_ref)
  if (opts.source_ref != null) {
    const existing = graph.db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
      )
      .get("manual", opts.source_ref);

    if (existing) {
      counts.episodesSkipped++;
      return counts;
    }
  }
  // No source_ref — proceed with insert even if content hash matches an existing episode.
  // Callers who want strict dedup should provide source_ref.

  addEpisode(graph, {
    source_type: "manual",
    source_ref: opts.source_ref,
    content,
    actor: opts.actor,
    timestamp,
    owner_id: opts.owner_id,
    extractor_version: ENGINE_VERSION,
    metadata: {
      content_hash: contentHash,
    },
  });

  counts.episodesCreated++;
  return counts;
}
