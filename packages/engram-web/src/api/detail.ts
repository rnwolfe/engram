/**
 * detail.ts — GET /api/entities/:id, /api/edges/:id, /api/episodes/:id handlers.
 *
 * Each returns the full record plus a flat evidence summary list.
 * Redacted episodes expose { ...fields, content: null, status: "redacted" }.
 * Unknown IDs return null (caller maps to 404).
 */

import type { EngramGraph } from "engram-core";
import {
  getEdge,
  getEntity,
  getEpisode,
  getEvidenceForEdge,
  getEvidenceForEntity,
} from "engram-core";

export interface EvidenceSummary {
  episode_id: string;
  source_type: string;
  source_ref: string | null;
  created_at: string;
  summary: string | null;
}

export interface EntityDetailResponse {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
  evidence: EvidenceSummary[];
}

export interface EdgeDetailResponse {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  confidence: number;
  weight: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  invalidated_at: string | null;
  superseded_by: string | null;
  owner_id: string | null;
  evidence: EvidenceSummary[];
}

export interface EpisodeDetailResponse {
  id: string;
  source_type: string;
  source_ref: string | null;
  content: string | null;
  content_hash: string;
  actor: string | null;
  status: string;
  timestamp: string;
  ingested_at: string;
  owner_id: string | null;
  extractor_version: string;
  metadata: string | null;
}

function extractSummary(content: string | null, status: string): string | null {
  if (status === "redacted" || content === null) return null;
  // Return first 120 chars as summary
  return content.length > 120 ? `${content.slice(0, 120)}…` : content;
}

export function handleEntityDetail(
  graph: EngramGraph,
  entityId: string,
): EntityDetailResponse | null {
  const entity = getEntity(graph, entityId);
  if (!entity) return null;

  const evidenceLinks = getEvidenceForEntity(graph, entityId);
  const evidence: EvidenceSummary[] = evidenceLinks.map((link) => ({
    episode_id: link.episode_id,
    source_type: link.episode.source_type,
    source_ref: link.episode.source_ref,
    created_at: link.created_at,
    summary: extractSummary(link.episode.content, link.episode.status),
  }));

  return {
    id: entity.id,
    canonical_name: entity.canonical_name,
    entity_type: entity.entity_type,
    status: entity.status,
    summary: entity.summary,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
    owner_id: entity.owner_id,
    evidence,
  };
}

export function handleEdgeDetail(
  graph: EngramGraph,
  edgeId: string,
): EdgeDetailResponse | null {
  const edge = getEdge(graph, edgeId);
  if (!edge) return null;

  const evidenceLinks = getEvidenceForEdge(graph, edgeId);
  const evidence: EvidenceSummary[] = evidenceLinks.map((link) => ({
    episode_id: link.episode_id,
    source_type: link.episode.source_type,
    source_ref: link.episode.source_ref,
    created_at: link.created_at,
    summary: extractSummary(link.episode.content, link.episode.status),
  }));

  return {
    id: edge.id,
    source_id: edge.source_id,
    target_id: edge.target_id,
    relation_type: edge.relation_type,
    edge_kind: edge.edge_kind,
    fact: edge.fact,
    confidence: edge.confidence,
    weight: edge.weight,
    valid_from: edge.valid_from,
    valid_until: edge.valid_until,
    created_at: edge.created_at,
    invalidated_at: edge.invalidated_at,
    superseded_by: edge.superseded_by,
    owner_id: edge.owner_id,
    evidence,
  };
}

export function handleEpisodeDetail(
  graph: EngramGraph,
  episodeId: string,
): EpisodeDetailResponse | null {
  const episode = getEpisode(graph, episodeId);
  if (!episode) return null;

  const isRedacted = episode.status === "redacted";
  return {
    id: episode.id,
    source_type: episode.source_type,
    source_ref: episode.source_ref,
    content: isRedacted ? null : episode.content,
    content_hash: episode.content_hash,
    actor: episode.actor,
    status: episode.status,
    timestamp: episode.timestamp,
    ingested_at: episode.ingested_at,
    owner_id: episode.owner_id,
    extractor_version: episode.extractor_version,
    metadata: episode.metadata,
  };
}
