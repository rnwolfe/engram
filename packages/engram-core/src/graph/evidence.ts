/**
 * evidence.ts — evidence chain retrieval operations.
 */

import type { EngramGraph } from "../format/index.js";
import type { Episode } from "./episodes.js";

export interface EvidenceLink {
  episode_id: string;
  extractor: string;
  confidence: number;
  created_at: string;
  episode: Episode;
}

interface EvidenceLinkRow {
  episode_id: string;
  extractor: string;
  confidence: number;
  created_at: string;
  ep_id: string;
  ep_source_type: string;
  ep_source_ref: string | null;
  ep_content: string;
  ep_content_hash: string;
  ep_actor: string | null;
  ep_status: string;
  ep_timestamp: string;
  ep_ingested_at: string;
  ep_owner_id: string | null;
  ep_extractor_version: string;
  ep_metadata: string | null;
}

function rowToEvidenceLink(row: EvidenceLinkRow): EvidenceLink {
  return {
    episode_id: row.episode_id,
    extractor: row.extractor,
    confidence: row.confidence,
    created_at: row.created_at,
    episode: {
      id: row.ep_id,
      source_type: row.ep_source_type,
      source_ref: row.ep_source_ref,
      content: row.ep_content,
      content_hash: row.ep_content_hash,
      actor: row.ep_actor,
      status: row.ep_status,
      timestamp: row.ep_timestamp,
      ingested_at: row.ep_ingested_at,
      owner_id: row.ep_owner_id,
      extractor_version: row.ep_extractor_version,
      metadata: row.ep_metadata,
    },
  };
}

/**
 * Returns the evidence chain for an entity, including full episode details.
 */
export function getEvidenceForEntity(
  graph: EngramGraph,
  entity_id: string,
): EvidenceLink[] {
  const rows = graph.db
    .query<EvidenceLinkRow, [string]>(
      `SELECT
         ee.episode_id,
         ee.extractor,
         ee.confidence,
         ee.created_at,
         ep.id        AS ep_id,
         ep.source_type AS ep_source_type,
         ep.source_ref  AS ep_source_ref,
         ep.content     AS ep_content,
         ep.content_hash AS ep_content_hash,
         ep.actor       AS ep_actor,
         ep.status      AS ep_status,
         ep.timestamp   AS ep_timestamp,
         ep.ingested_at AS ep_ingested_at,
         ep.owner_id    AS ep_owner_id,
         ep.extractor_version AS ep_extractor_version,
         ep.metadata    AS ep_metadata
       FROM entity_evidence ee
       JOIN episodes ep ON ep.id = ee.episode_id
       WHERE ee.entity_id = ?
       ORDER BY ee.created_at ASC`,
    )
    .all(entity_id);

  return rows.map(rowToEvidenceLink);
}

/**
 * Returns the evidence chain for an edge, including full episode details.
 */
export function getEvidenceForEdge(
  graph: EngramGraph,
  edge_id: string,
): EvidenceLink[] {
  const rows = graph.db
    .query<EvidenceLinkRow, [string]>(
      `SELECT
         eedge.episode_id,
         eedge.extractor,
         eedge.confidence,
         eedge.created_at,
         ep.id        AS ep_id,
         ep.source_type AS ep_source_type,
         ep.source_ref  AS ep_source_ref,
         ep.content     AS ep_content,
         ep.content_hash AS ep_content_hash,
         ep.actor       AS ep_actor,
         ep.status      AS ep_status,
         ep.timestamp   AS ep_timestamp,
         ep.ingested_at AS ep_ingested_at,
         ep.owner_id    AS ep_owner_id,
         ep.extractor_version AS ep_extractor_version,
         ep.metadata    AS ep_metadata
       FROM edge_evidence eedge
       JOIN episodes ep ON ep.id = eedge.episode_id
       WHERE eedge.edge_id = ?
       ORDER BY eedge.created_at ASC`,
    )
    .all(edge_id);

  return rows.map(rowToEvidenceLink);
}
