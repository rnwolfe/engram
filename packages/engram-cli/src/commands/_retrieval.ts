/**
 * _retrieval.ts — shared retrieval helpers for CLI commands that need to query
 * the knowledge graph substrate.
 *
 * Provides target resolution (path, symbol, path:line) and structural edge
 * fetching. Extracted for reuse across `context` and `why` commands.
 */

import type { EngramGraph, Entity, Episode } from "engram-core";
import { EPISODE_SOURCE_TYPES, getEpisode, RELATION_TYPES } from "engram-core";

// ---------------------------------------------------------------------------
// Token budget helpers
// ---------------------------------------------------------------------------

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Entity FTS row type
// ---------------------------------------------------------------------------

export interface EntityFtsRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  updated_at: string;
  rank: number;
}

export interface StructuralEdgeRow {
  id: string;
  fact: string;
  edge_kind: string;
  relation_type: string;
  valid_from: string | null;
  valid_until: string | null;
}

export interface EvidenceRow {
  episode_id: string;
}

// ---------------------------------------------------------------------------
// Low-signal filters
// ---------------------------------------------------------------------------

function isLowSignalEntity(row: EntityFtsRow): boolean {
  const sep = row.canonical_name.lastIndexOf("::");
  if (sep === -1) return false;
  const symbol = row.canonical_name.slice(sep + 2);
  return /^[A-Z][A-Z0-9_]{2,}$/.test(symbol);
}

// ---------------------------------------------------------------------------
// FTS helpers
// ---------------------------------------------------------------------------

/**
 * FTS search against entities by canonical name.
 * Returns matching active entities ordered by rank.
 */
export function searchEntitiesFts(
  graph: EngramGraph,
  ftsQuery: string,
  limit: number,
): EntityFtsRow[] {
  try {
    const rows = graph.db
      .query<EntityFtsRow, [string]>(
        `SELECT entities.id, entities.canonical_name, entities.entity_type,
                entities.updated_at, bm25(entities_fts) AS rank
         FROM entities_fts
         JOIN entities ON entities._rowid = entities_fts.rowid
         WHERE entities_fts MATCH ?
           AND entities.status = 'active'
         ORDER BY rank
         LIMIT ${limit * 3}`,
      )
      .all(ftsQuery);
    return rows.filter((r) => !isLowSignalEntity(r)).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Fetch active edges connected to a set of entity IDs, ordered by relation type.
 * Excludes authored_by (too noisy) and edges in the exclude set.
 */
export function fetchStructuralEdges(
  graph: EngramGraph,
  entityIds: string[],
  excludeEdgeIds: Set<string>,
  limit: number,
): StructuralEdgeRow[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  try {
    const rows = graph.db
      .query<StructuralEdgeRow, string[]>(
        `SELECT id, fact, edge_kind, relation_type, valid_from, valid_until
         FROM edges
         WHERE (source_id IN (${placeholders}) OR target_id IN (${placeholders}))
           AND invalidated_at IS NULL
           AND relation_type != 'authored_by'
         ORDER BY
           CASE relation_type
             WHEN 'co_changes_with'  THEN 0
             WHEN 'likely_owner_of'  THEN 1
             WHEN 'supersedes'       THEN 2
             ELSE 3
           END ASC,
           valid_from DESC NULLS LAST
         LIMIT ${limit * 2}`,
      )
      .all(...entityIds, ...entityIds);
    return rows.filter((r) => !excludeEdgeIds.has(r.id)).slice(0, limit);
  } catch {
    return [];
  }
}

export function getEntityProvenance(
  graph: EngramGraph,
  entityId: string,
): string[] {
  return graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM entity_evidence WHERE entity_id = ?",
    )
    .all(entityId)
    .map((r) => r.episode_id);
}

export function getEdgeProvenance(
  graph: EngramGraph,
  edgeId: string,
): string[] {
  return graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM edge_evidence WHERE edge_id = ?",
    )
    .all(edgeId)
    .map((r) => r.episode_id);
}

// ---------------------------------------------------------------------------
// Target resolution
// ---------------------------------------------------------------------------

export type TargetKind = "path" | "symbol" | "path_line";

export type ParsedTarget =
  | { kind: "path"; path: string; raw: string }
  | { kind: "path_line"; path: string; line: number; raw: string }
  | { kind: "symbol"; symbol: string; raw: string };

/**
 * Parse a target argument into its kind:
 *   - `path:N`   → path_line (N is a positive integer)
 *   - Looks like a file path (contains `/` or has an extension) → path
 *   - Otherwise → symbol
 */
export function parseTarget(target: string): ParsedTarget {
  // path:line — split on last colon, check if suffix is integer
  const colonIdx = target.lastIndexOf(":");
  if (colonIdx > 0) {
    const suffix = target.slice(colonIdx + 1);
    const lineNum = parseInt(suffix, 10);
    if (!Number.isNaN(lineNum) && lineNum > 0 && String(lineNum) === suffix) {
      return {
        kind: "path_line",
        path: target.slice(0, colonIdx),
        line: lineNum,
        raw: target,
      };
    }
  }

  // For path-like detection, use the part before any trailing `:non-integer`
  const candidatePath = colonIdx > 0 ? target.slice(0, colonIdx) : target;

  // Heuristic: treat as path if it has a `/`, `.`, or common file extension
  const looksLikePath =
    candidatePath.includes("/") ||
    /\.[a-zA-Z]{1,6}$/.test(candidatePath) ||
    candidatePath.startsWith("./") ||
    candidatePath.startsWith("../");
  if (looksLikePath) {
    return { kind: "path", path: target, raw: target };
  }

  return { kind: "symbol", symbol: target, raw: target };
}

// ---------------------------------------------------------------------------
// Entity lookup by path / symbol
// ---------------------------------------------------------------------------

export interface ResolvedTarget {
  /** Primary entity anchoring this target (file or module entity). */
  entity: Entity;
  /** Supplementary entities (e.g. enclosing symbol). */
  extras: Entity[];
  /** How the target was resolved. */
  how: "exact_path" | "exact_symbol" | "path_like" | "blame_commit";
}

/** Rows returned by entity queries */
interface EntityRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
}

/**
 * Resolve a path target to an entity.
 * Tries exact match first, then LIKE-based fallback.
 * Returns null if not found, or `{ ambiguous: true, candidates }` for LIKE matches.
 */
export function resolvePathTarget(
  graph: EngramGraph,
  filePath: string,
): ResolvedTarget | { ambiguous: true; candidates: Entity[] } | null {
  // Normalize: strip leading `./`
  const normalized = filePath.replace(/^\.\//, "");

  // 1. Exact match (try normalized and original path)
  let exact = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities WHERE canonical_name = ? AND status = 'active' LIMIT 1`,
    )
    .get(normalized);
  if (!exact && normalized !== filePath) {
    exact = graph.db
      .query<EntityRow, [string]>(
        `SELECT * FROM entities WHERE canonical_name = ? AND status = 'active' LIMIT 1`,
      )
      .get(filePath);
  }
  if (exact) {
    return {
      entity: exact as unknown as Entity,
      extras: [],
      how: "exact_path",
    };
  }

  // 2. LIKE scan — look for entities whose canonical_name ends with the path
  const likePattern = `%${normalized}`;
  const likeRows = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities
       WHERE canonical_name LIKE ?
         AND status = 'active'
         AND entity_type IN ('file', 'module', 'source_file')
       ORDER BY length(canonical_name) ASC
       LIMIT 10`,
    )
    .all(likePattern);

  if (likeRows.length === 1) {
    return {
      entity: likeRows[0] as unknown as Entity,
      extras: [],
      how: "path_like",
    };
  }
  if (likeRows.length > 1) {
    return { ambiguous: true, candidates: likeRows as unknown as Entity[] };
  }

  // 3. Fallback: any entity type with this path suffix
  const fallbackRows = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities
       WHERE canonical_name LIKE ?
         AND status = 'active'
       ORDER BY length(canonical_name) ASC
       LIMIT 10`,
    )
    .all(likePattern);

  if (fallbackRows.length === 1) {
    return {
      entity: fallbackRows[0] as unknown as Entity,
      extras: [],
      how: "path_like",
    };
  }
  if (fallbackRows.length > 1) {
    return {
      ambiguous: true,
      candidates: fallbackRows as unknown as Entity[],
    };
  }

  return null;
}

/**
 * Resolve a symbol target to an entity.
 * Returns null, a single ResolvedTarget, or ambiguous candidates.
 */
export function resolveSymbolTarget(
  graph: EngramGraph,
  symbol: string,
): ResolvedTarget | { ambiguous: true; candidates: Entity[] } | null {
  // 1. Exact canonical name match
  const exact = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities WHERE canonical_name = ? AND status = 'active' LIMIT 1`,
    )
    .get(symbol);
  if (exact) {
    return {
      entity: exact as unknown as Entity,
      extras: [],
      how: "exact_symbol",
    };
  }

  // 2. Suffix match: canonical_name ends with "::<symbol>" or "::<symbol>"
  const suffixPattern = `%::${symbol}`;
  const suffixRows = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities
       WHERE canonical_name LIKE ?
         AND status = 'active'
       ORDER BY length(canonical_name) ASC
       LIMIT 20`,
    )
    .all(suffixPattern);

  if (suffixRows.length === 1) {
    return {
      entity: suffixRows[0] as unknown as Entity,
      extras: [],
      how: "exact_symbol",
    };
  }
  if (suffixRows.length > 1) {
    return { ambiguous: true, candidates: suffixRows as unknown as Entity[] };
  }

  // 3. LIKE scan for partial match
  const likeRows = graph.db
    .query<EntityRow, [string]>(
      `SELECT * FROM entities
       WHERE canonical_name LIKE ?
         AND status = 'active'
       ORDER BY length(canonical_name) ASC
       LIMIT 20`,
    )
    .all(`%${symbol}%`);

  if (likeRows.length === 1) {
    return {
      entity: likeRows[0] as unknown as Entity,
      extras: [],
      how: "exact_symbol",
    };
  }
  if (likeRows.length > 1) {
    return { ambiguous: true, candidates: likeRows as unknown as Entity[] };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Episode helpers
// ---------------------------------------------------------------------------

export interface EpisodeSearchRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  content: string;
}

/**
 * Fetch episodes linked to an entity, sorted by timestamp ascending
 * (oldest first = introducing episode first).
 */
export function getEntityEpisodes(
  graph: EngramGraph,
  entityId: string,
): EpisodeSearchRow[] {
  try {
    return graph.db
      .query<EpisodeSearchRow, [string]>(
        `SELECT ep.id, ep.source_type, ep.source_ref, ep.actor, ep.timestamp, ep.content
         FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ?
           AND ep.status = 'active'
         ORDER BY ep.timestamp ASC`,
      )
      .all(entityId);
  } catch {
    return [];
  }
}

/**
 * Fetch episodes linked to an entity, filtered to only PR/issue/commit types,
 * sorted by timestamp descending (most recent first).
 */
export function getEntityPrIssueEpisodes(
  graph: EngramGraph,
  entityId: string,
  limit: number,
): EpisodeSearchRow[] {
  try {
    return graph.db
      .query<EpisodeSearchRow, [string, string, string, string]>(
        `SELECT ep.id, ep.source_type, ep.source_ref, ep.actor, ep.timestamp, ep.content
         FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ?
           AND ep.source_type IN (?, ?, ?)
           AND ep.status = 'active'
         ORDER BY ep.timestamp DESC
         LIMIT ${limit}`,
      )
      .all(
        entityId,
        EPISODE_SOURCE_TYPES.GITHUB_PR,
        EPISODE_SOURCE_TYPES.GITHUB_ISSUE,
        EPISODE_SOURCE_TYPES.GIT_COMMIT,
      );
  } catch {
    return [];
  }
}

/**
 * Fetch the first (earliest) episode for an entity — the introducing commit.
 */
export function getIntroducingEpisode(
  graph: EngramGraph,
  entityId: string,
): Episode | null {
  const rows = graph.db
    .query<{ id: string }, [string]>(
      `SELECT ep.id
       FROM entity_evidence ee
       JOIN episodes ep ON ep.id = ee.episode_id
       WHERE ee.entity_id = ?
         AND ep.source_type = 'git_commit'
         AND ep.status = 'active'
       ORDER BY ep.timestamp ASC
       LIMIT 1`,
    )
    .all(entityId);
  if (rows.length === 0) return null;
  return getEpisode(graph, rows[0].id);
}

/**
 * Fetch co-change neighbor edges for an entity, ordered by weight descending.
 */
export interface CoChangeRow {
  id: string;
  fact: string;
  edge_kind: string;
  weight: number;
  source_id: string;
  target_id: string;
  valid_from: string | null;
}

export function getCoChangeNeighbors(
  graph: EngramGraph,
  entityId: string,
  limit: number,
): CoChangeRow[] {
  try {
    return graph.db
      .query<CoChangeRow, [string, string, string]>(
        `SELECT id, fact, edge_kind, weight, source_id, target_id, valid_from
         FROM edges
         WHERE (source_id = ? OR target_id = ?)
           AND relation_type = ?
           AND invalidated_at IS NULL
         ORDER BY weight DESC
         LIMIT ${limit}`,
      )
      .all(entityId, entityId, RELATION_TYPES.CO_CHANGES_WITH);
  } catch {
    return [];
  }
}

/**
 * Fetch ownership edges for an entity.
 */
export interface OwnerEdgeRow {
  id: string;
  fact: string;
  edge_kind: string;
  valid_from: string | null;
  source_id: string;
  target_id: string;
}

export function getOwnershipEdges(
  graph: EngramGraph,
  entityId: string,
): OwnerEdgeRow[] {
  try {
    return graph.db
      .query<OwnerEdgeRow, [string, string, string]>(
        `SELECT id, fact, edge_kind, valid_from, source_id, target_id
         FROM edges
         WHERE (source_id = ? OR target_id = ?)
           AND relation_type = ?
           AND invalidated_at IS NULL
         ORDER BY valid_from DESC NULLS LAST`,
      )
      .all(entityId, entityId, RELATION_TYPES.LIKELY_OWNER_OF);
  } catch {
    return [];
  }
}
