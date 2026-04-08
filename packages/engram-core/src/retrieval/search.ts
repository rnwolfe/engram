/**
 * search.ts — Full-text and hybrid retrieval engine.
 *
 * Searches across entities, edges, and episodes using FTS5.
 * Scores results using a composite of FTS rank, evidence strength,
 * temporal recency, and graph connectivity.
 * When provider is set, also performs vector similarity search.
 *
 * Entity-anchored retrieval: when the query resolves to a known entity,
 * graph traversal is the primary path — connected entities are returned
 * first, with FTS results appended as a secondary source.
 */

import type { AIProvider } from "../ai/provider.js";
import type { EngramGraph } from "../format/index.js";
import { resolveEntity } from "../graph/aliases.js";
import { findSimilar } from "../graph/embeddings.js";
import type { Entity } from "../graph/entities.js";
import type { TraversedEntity } from "./graph-search.js";
import { graphSearch } from "./graph-search.js";
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
  /** Max graph traversal hops from FTS seed entities. Default 2. 0 disables. */
  maxHops?: number;
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
 * Entity-anchored search: the query resolved to a known entity, so use
 * graph traversal as the primary retrieval path. Traversed entities are
 * ranked by edge confidence (normalized within the result set) rather than
 * generic evidence/temporal scores, which would favor well-connected nodes
 * regardless of their relationship to the anchor.
 *
 * The anchor entity itself is excluded from results — it's the query, not
 * an answer. FTS results are appended as a secondary source (deduped).
 */
async function entityAnchoredSearch(
  graph: EngramGraph,
  anchor: Entity,
  query: string,
  opts: SearchOpts,
  now: Date,
): Promise<SearchResult[]> {
  const limit = opts.limit ?? 20;
  const minConfidence = opts.min_confidence ?? 0.0;
  const maxHops = opts.maxHops ?? 2;

  const anchorResults: SearchResult[] = [];
  const anchorEntityIds = new Set<string>();
  anchorEntityIds.add(anchor.id);

  // 1. Include the anchor entity itself. Scored at 1.0 so it appears first
  // when the query is also an expected answer (e.g. searching for a person
  // name and expecting that person in results).
  const anchorProvenance = getEntityProvenance(graph, anchor.id);
  const anchorEdgeCount = getEntityEdgeCount(graph, anchor.id);
  const anchorComponents: ScoreComponents = {
    fts_score: 1.0,
    graph_score: normalizeGraphScore(anchorEdgeCount),
    temporal_score: computeTemporalScore(anchor.updated_at, now),
    evidence_score: normalizeEvidenceCount(anchorProvenance.length),
    vector_score: 0.0,
  };
  anchorResults.push({
    type: "entity",
    id: anchor.id,
    score: 1.0,
    score_components: anchorComponents,
    content: anchor.canonical_name,
    provenance: anchorProvenance,
  });

  // 2. Traverse edges from anchor to discover connected entities
  const seeds: Array<[string, number]> = [[anchor.id, 1.0]];
  const traversed = graphSearch(graph, seeds, {
    maxHops,
    valid_at: opts.valid_at,
  });

  // In entity-anchored mode, rank traversed entities in strict hop tiers:
  // all 1-hop results rank above all 2-hop results. Within each tier,
  // sort by edge confidence relative to the strongest edge at that depth.
  // This prevents high-confidence 2-hop results (e.g. co_changes_with from
  // a popular file) from outranking direct 1-hop neighbors.
  const hop1 = traversed.filter((t) => t.hops === 1);
  const hop2 = traversed.filter((t) => t.hops > 1);
  const maxConf1 = Math.max(...hop1.map((t) => t.minPathConfidence), 0);
  const maxConf2 = Math.max(...hop2.map((t) => t.minPathConfidence), 0);

  for (const t of traversed) {
    if (anchorEntityIds.has(t.entityId)) continue;
    if (
      opts.entity_types &&
      opts.entity_types.length > 0 &&
      !opts.entity_types.includes(t.entityType)
    )
      continue;

    anchorEntityIds.add(t.entityId);

    const provenance = getEntityProvenance(graph, t.entityId);

    // Tier scoring: 1-hop results score in [0.5, 1.0], 2-hop in [0.0, 0.5).
    // Within each tier, normalize by that tier's max confidence.
    let anchorScore: number;
    if (t.hops === 1) {
      const normalized = maxConf1 > 0 ? t.minPathConfidence / maxConf1 : 1.0;
      anchorScore = 0.5 + 0.5 * normalized;
    } else {
      const normalized = maxConf2 > 0 ? t.minPathConfidence / maxConf2 : 1.0;
      anchorScore = 0.5 * normalized;
    }

    const components: ScoreComponents = {
      fts_score: anchorScore,
      graph_score: 0.0,
      temporal_score: 0.0,
      evidence_score: 0.0,
      vector_score: 0.0,
    };

    anchorResults.push({
      type: "entity",
      id: t.entityId,
      score: anchorScore,
      score_components: components,
      content: t.canonicalName,
      provenance,
    });
  }

  // 2. Run FTS as secondary source, deduping against anchor-discovered entities.
  // FTS results are scored below the weakest anchor result so graph-traversed
  // entities always rank first.
  const ftsQuery = escapeFtsQuery(query);
  let entityRows: EntityFtsRow[] = [];
  try {
    entityRows = searchEntities(graph, ftsQuery, opts).rows;
  } catch {
    entityRows = [];
  }

  const entityNormalizedRanks = normalizeFtsRanks(
    entityRows.map((r) => r.rank),
  );
  const ftsBaseline =
    anchorResults.length > 0
      ? Math.min(...anchorResults.map((r) => r.score)) * 0.5
      : 0.5;

  for (let i = 0; i < entityRows.length; i++) {
    const row = entityRows[i];
    if (anchorEntityIds.has(row.id)) continue;
    anchorEntityIds.add(row.id);

    const ftsScore = entityNormalizedRanks[i] * ftsBaseline;
    const provenance = getEntityProvenance(graph, row.id);

    const components: ScoreComponents = {
      fts_score: ftsScore,
      graph_score: 0.0,
      temporal_score: 0.0,
      evidence_score: 0.0,
      vector_score: 0.0,
    };

    anchorResults.push({
      type: "entity",
      id: row.id,
      score: ftsScore,
      score_components: components,
      content: row.canonical_name,
      provenance,
    });
  }

  return anchorResults
    .filter((r) => r.score >= minConfidence)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

  const now = new Date();

  // --- Entity-anchor phase ---
  // If the query resolves to a known entity, use graph traversal as the
  // primary retrieval path. This dramatically improves recall for relational
  // and multi-hop queries where the user provides an entity reference
  // (email, file path) and expects connected entities as answers.
  const anchorEntity = resolveEntity(graph, query.trim());
  if (anchorEntity) {
    return entityAnchoredSearch(graph, anchorEntity, query, opts, now);
  }

  const ftsQuery = escapeFtsQuery(query);

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

  // Build vector similarity map when provider is set and produces a valid embedding.
  // episodeVectorScores maps episode IDs to cosine similarity scores.
  // findSimilar returns episode IDs (embeddings are generated for episodes, not entities).
  // Entity vector scores are derived via the evidence chain:
  //   an entity's vector score = max cosine score of any linked episode in the similarity set.
  // The same map is used directly for edge and episode lookups (they are also keyed by episode ID).
  const episodeVectorScores = new Map<string, number>();
  let effectiveMode = mode;
  if (opts.provider) {
    try {
      const queryEmbeddings = await opts.provider.embed([query]);
      if (queryEmbeddings.length > 0 && queryEmbeddings[0].length > 0) {
        // Only enable hybrid mode when a real embedding was produced
        effectiveMode = "hybrid";
        // v0.1 limitation: brute-force scan is capped at 100 embeddings.
        // Acceptable for small graphs (<50k embeddings); revisit if performance degrades.
        const similar = findSimilar(graph, queryEmbeddings[0], { limit: 100 });
        for (const result of similar) {
          episodeVectorScores.set(result.target_id, result.score);
        }
      }
      // If embed() returned [] or [[]] (empty vector), effectiveMode stays as-is (FTS-only)
    } catch {
      // Provider failure is non-fatal — fall back to FTS-only
    }
  }

  // --- Graph traversal phase ---
  // Use FTS entity hits as seeds; traverse edges to discover related entities.
  const maxHops = opts.maxHops ?? 2;
  const ftsEntityIds = new Set(entityRows.map((r) => r.id));
  const seeds: Array<[string, number]> = entityRows.map((r, i) => [
    r.id,
    entityNormalizedRanks[i],
  ]);
  const traversed: TraversedEntity[] = graphSearch(graph, seeds, {
    maxHops,
    valid_at: opts.valid_at,
  });

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

    // Compute indirect vector score via evidence chain:
    // max cosine score of any similar episode this entity is backed by.
    let vectorScore = 0.0;
    for (const epId of provenance) {
      const s = episodeVectorScores.get(epId) ?? 0;
      if (s > vectorScore) vectorScore = s;
    }

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

  // Build graph-traversed entity results (entities found via edge traversal, not FTS)
  for (const t of traversed) {
    // Skip entities already in FTS results or filtered by entity_types
    if (ftsEntityIds.has(t.entityId)) continue;
    if (
      opts.entity_types &&
      opts.entity_types.length > 0 &&
      !opts.entity_types.includes(t.entityType)
    )
      continue;

    const provenance = getEntityProvenance(graph, t.entityId);
    const evidenceScore = normalizeEvidenceCount(provenance.length);
    const temporalScore = computeTemporalScore(t.updatedAt, now);
    const edgeCount = getEntityEdgeCount(graph, t.entityId);
    const graphScore = normalizeGraphScore(edgeCount);

    // Proxy FTS score: seed's FTS score with a fixed traversal discount.
    // The discount ensures graph-traversed entities rank below direct FTS
    // hits but above noise. Edge confidence from the ingester (often 0.001-0.01)
    // is too low to use as a multiplier — intrinsic entity properties
    // (evidence, temporal, connectivity) differentiate within traversal results.
    const traversalDiscount = t.hops === 1 ? 0.85 : 0.55;
    const proxyFtsScore = t.seedFtsScore * traversalDiscount;

    // Indirect vector score via evidence chain (same logic as direct FTS entities)
    let vectorScore = 0.0;
    for (const epId of provenance) {
      const s = episodeVectorScores.get(epId) ?? 0;
      if (s > vectorScore) vectorScore = s;
    }

    const components: ScoreComponents = {
      fts_score: proxyFtsScore,
      graph_score: graphScore,
      temporal_score: temporalScore,
      evidence_score: evidenceScore,
      vector_score: vectorScore,
    };

    const score = computeCompositeScore(components, effectiveMode);

    results.push({
      type: "entity",
      id: t.entityId,
      score,
      score_components: components,
      content: t.canonicalName,
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
    const vectorScore = episodeVectorScores.get(row.id) ?? 0.0;

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
    const vectorScore = episodeVectorScores.get(row.id) ?? 0.0;

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
