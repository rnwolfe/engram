/**
 * search.ts — Full-text and hybrid retrieval engine.
 *
 * Searches across entities, edges, and episodes using FTS5.
 * Scores results using a composite of FTS rank, evidence strength,
 * temporal recency, and graph connectivity.
 * When provider is set, also performs vector similarity search.
 */

import type { AIProvider } from "../ai/provider.js";
import type { EngramGraph } from "../format/index.js";
import { findSimilar } from "../graph/embeddings.js";
import type { ScoreComponents } from "./scoring.js";
import {
  computeCompositeScore,
  computeTemporalScore,
  normalizeEvidenceCount,
  normalizeFtsRanks,
  normalizeGraphScore,
} from "./scoring.js";

export type { ScoreComponents };

export interface SearchOpts {
  limit?: number; // default 20
  min_confidence?: number; // 0.0-1.0, default 0.0
  valid_at?: string; // ISO8601 UTC for temporal filtering (edges only)
  entity_types?: string[]; // filter by entity_type (entities only)
  edge_kinds?: string[]; // 'observed' | 'inferred' | 'asserted' (edges only)
  include_invalidated?: boolean; // default false
  mode?: "fulltext" | "hybrid"; // default 'fulltext'
  provider?: AIProvider; // when set, enables vector similarity search
}

export interface SearchResult {
  type: "entity" | "edge" | "episode";
  id: string;
  score: number; // composite 0-1
  score_components: ScoreComponents;
  content: string; // canonical_name / fact / content snippet
  provenance: string[]; // episode IDs backing this result
  edge_kind?: string; // only for edge results
}

// Internal row types for SQLite queries
interface EntityFtsRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  updated_at: string;
  status: string;
  rank: number;
}

interface EdgeFtsRow {
  id: string;
  fact: string;
  edge_kind: string;
  valid_from: string | null;
  valid_until: string | null;
  invalidated_at: string | null;
  created_at: string;
  rank: number;
}

interface EpisodeFtsRow {
  id: string;
  content: string;
  timestamp: string;
  status: string;
  rank: number;
}

interface EvidenceRow {
  episode_id: string;
}

interface CountRow {
  count: number;
}

/**
 * Escape a query string for FTS5 MATCH.
 * Wraps each token in double quotes to avoid syntax errors with special chars.
 */
function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}

/**
 * Search for entities matching the query.
 */
function searchEntities(
  graph: EngramGraph,
  ftsQuery: string,
  opts: SearchOpts,
): { rows: EntityFtsRow[] } {
  const conditions: string[] = ["entities.status = 'active'"];
  const params: unknown[] = [ftsQuery];

  if (opts.entity_types && opts.entity_types.length > 0) {
    const placeholders = opts.entity_types.map(() => "?").join(", ");
    conditions.push(`entities.entity_type IN (${placeholders})`);
    params.push(...opts.entity_types);
  }

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      entities.id,
      entities.canonical_name,
      entities.entity_type,
      entities.updated_at,
      entities.status,
      bm25(entities_fts) AS rank
    FROM entities_fts
    JOIN entities ON entities._rowid = entities_fts.rowid
    WHERE entities_fts MATCH ?
    ${where}
    ORDER BY rank
  `;

  const rows = graph.db.query<EntityFtsRow, unknown[]>(sql).all(...params);
  return { rows };
}

/**
 * Search for edges matching the query.
 */
function searchEdges(
  graph: EngramGraph,
  ftsQuery: string,
  opts: SearchOpts,
): { rows: EdgeFtsRow[] } {
  const conditions: string[] = [];
  const params: unknown[] = [ftsQuery];

  if (!opts.include_invalidated) {
    conditions.push("edges.invalidated_at IS NULL");
  }

  if (opts.edge_kinds && opts.edge_kinds.length > 0) {
    const placeholders = opts.edge_kinds.map(() => "?").join(", ");
    conditions.push(`edges.edge_kind IN (${placeholders})`);
    params.push(...opts.edge_kinds);
  }

  if (opts.valid_at) {
    // Half-open interval: valid_from <= valid_at < valid_until
    // NULL valid_from means unknown start (include it)
    // NULL valid_until means still current (include it)
    conditions.push("(edges.valid_from IS NULL OR edges.valid_from <= ?)");
    params.push(opts.valid_at);
    conditions.push("(edges.valid_until IS NULL OR edges.valid_until > ?)");
    params.push(opts.valid_at);
  }

  const where = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT
      edges.id,
      edges.fact,
      edges.edge_kind,
      edges.valid_from,
      edges.valid_until,
      edges.invalidated_at,
      edges.created_at,
      bm25(edges_fts) AS rank
    FROM edges_fts
    JOIN edges ON edges._rowid = edges_fts.rowid
    WHERE edges_fts MATCH ?
    ${where}
    ORDER BY rank
  `;

  const rows = graph.db.query<EdgeFtsRow, unknown[]>(sql).all(...params);
  return { rows };
}

/**
 * Search for episodes matching the query.
 */
function searchEpisodes(
  graph: EngramGraph,
  ftsQuery: string,
): { rows: EpisodeFtsRow[] } {
  const sql = `
    SELECT
      episodes.id,
      episodes.content,
      episodes.timestamp,
      episodes.status,
      bm25(episodes_fts) AS rank
    FROM episodes_fts
    JOIN episodes ON episodes._rowid = episodes_fts.rowid
    WHERE episodes_fts MATCH ?
    AND episodes.status = 'active'
    ORDER BY rank
  `;

  const rows = graph.db.query<EpisodeFtsRow, [string]>(sql).all(ftsQuery);
  return { rows };
}

/**
 * Get episode IDs backing an entity (provenance).
 */
function getEntityProvenance(graph: EngramGraph, entityId: string): string[] {
  const rows = graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM entity_evidence WHERE entity_id = ?",
    )
    .all(entityId);
  return rows.map((r) => r.episode_id);
}

/**
 * Get episode IDs backing an edge (provenance).
 */
function getEdgeProvenance(graph: EngramGraph, edgeId: string): string[] {
  const rows = graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM edge_evidence WHERE edge_id = ?",
    )
    .all(edgeId);
  return rows.map((r) => r.episode_id);
}

/**
 * Get active edge count for an entity (graph connectivity).
 */
function getEntityEdgeCount(graph: EngramGraph, entityId: string): number {
  const row = graph.db
    .query<CountRow, [string, string]>(
      `SELECT COUNT(*) as count FROM edges
       WHERE (source_id = ? OR target_id = ?)
       AND invalidated_at IS NULL`,
    )
    .get(entityId, entityId);
  return row?.count ?? 0;
}

/**
 * Search the graph using full-text search across entities, edges, and episodes.
 * Returns results sorted by composite score descending.
 * When opts.provider is set, also performs vector similarity search and merges results.
 */
export async function search(
  graph: EngramGraph,
  query: string,
  opts: SearchOpts = {},
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 20;
  const minConfidence = opts.min_confidence ?? 0.0;
  const mode = opts.mode ?? "fulltext";

  if (!query || query.trim().length === 0) {
    return [];
  }

  const ftsQuery = escapeFtsQuery(query);
  const now = new Date();

  // Run FTS searches
  let entityRows: EntityFtsRow[] = [];
  let edgeRows: EdgeFtsRow[] = [];
  let episodeRows: EpisodeFtsRow[] = [];

  try {
    entityRows = searchEntities(graph, ftsQuery, opts).rows;
  } catch {
    // FTS may throw if no rows or invalid query
    entityRows = [];
  }

  try {
    edgeRows = searchEdges(graph, ftsQuery, opts).rows;
  } catch {
    edgeRows = [];
  }

  try {
    episodeRows = searchEpisodes(graph, ftsQuery).rows;
  } catch {
    episodeRows = [];
  }

  // Normalize FTS ranks within each result type
  const entityNormalizedRanks = normalizeFtsRanks(
    entityRows.map((r) => r.rank),
  );
  const edgeNormalizedRanks = normalizeFtsRanks(edgeRows.map((r) => r.rank));
  const episodeNormalizedRanks = normalizeFtsRanks(
    episodeRows.map((r) => r.rank),
  );

  // Build vector similarity map when provider is set
  const vectorScoreMap = new Map<string, number>();
  if (opts.provider) {
    try {
      const queryEmbeddings = await opts.provider.embed([query]);
      if (queryEmbeddings.length > 0 && queryEmbeddings[0].length > 0) {
        // v0.1 limitation: brute-force scan is capped at 100 embeddings.
        // Acceptable for small graphs (<50k embeddings); revisit if performance degrades.
        const similar = findSimilar(graph, queryEmbeddings[0], { limit: 100 });
        for (const result of similar) {
          vectorScoreMap.set(result.target_id, result.score);
        }
      }
    } catch {
      // Provider failure is non-fatal — fall back to FTS-only
    }
  }

  const effectiveMode = opts.provider ? "hybrid" : mode;

  const results: SearchResult[] = [];

  // Build entity results
  for (let i = 0; i < entityRows.length; i++) {
    const row = entityRows[i];
    const ftsScore = entityNormalizedRanks[i];
    const temporalScore = computeTemporalScore(row.updated_at, now);
    const provenance = getEntityProvenance(graph, row.id);
    const evidenceScore = normalizeEvidenceCount(provenance.length);
    const edgeCount = getEntityEdgeCount(graph, row.id);
    const graphScore = normalizeGraphScore(edgeCount);
    const vectorScore = vectorScoreMap.get(row.id) ?? 0.0;

    const components: ScoreComponents = {
      fts_score: ftsScore,
      graph_score: graphScore,
      temporal_score: temporalScore,
      evidence_score: evidenceScore,
      vector_score: vectorScore,
    };

    const score = computeCompositeScore(components, effectiveMode);

    results.push({
      type: "entity",
      id: row.id,
      score,
      score_components: components,
      content: row.canonical_name,
      provenance,
    });
  }

  // Build edge results
  for (let i = 0; i < edgeRows.length; i++) {
    const row = edgeRows[i];
    const ftsScore = edgeNormalizedRanks[i];
    const temporalScore = computeTemporalScore(row.created_at, now);
    const provenance = getEdgeProvenance(graph, row.id);
    const evidenceScore = normalizeEvidenceCount(provenance.length);
    const vectorScore = vectorScoreMap.get(row.id) ?? 0.0;

    const components: ScoreComponents = {
      fts_score: ftsScore,
      graph_score: 0.0,
      temporal_score: temporalScore,
      evidence_score: evidenceScore,
      vector_score: vectorScore,
    };

    const score = computeCompositeScore(components, effectiveMode);

    results.push({
      type: "edge",
      id: row.id,
      score,
      score_components: components,
      content: row.fact,
      provenance,
      edge_kind: row.edge_kind,
    });
  }

  // Build episode results
  for (let i = 0; i < episodeRows.length; i++) {
    const row = episodeRows[i];
    const ftsScore = episodeNormalizedRanks[i];
    const temporalScore = computeTemporalScore(row.timestamp, now);
    const vectorScore = vectorScoreMap.get(row.id) ?? 0.0;

    const components: ScoreComponents = {
      fts_score: ftsScore,
      graph_score: 0.0,
      temporal_score: temporalScore,
      evidence_score: 1.0,
      vector_score: vectorScore,
    };

    const score = computeCompositeScore(components, effectiveMode);

    // Truncate content to a reasonable snippet
    const snippet =
      row.content.length > 200 ? `${row.content.slice(0, 200)}…` : row.content;

    results.push({
      type: "episode",
      id: row.id,
      score,
      score_components: components,
      content: snippet,
      provenance: [row.id],
    });
  }

  // Apply min_confidence filter, sort by score desc, limit
  return results
    .filter((r) => r.score >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
