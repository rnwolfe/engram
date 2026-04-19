/**
 * resolver.ts — Cross-source reference edge resolution.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../../format/index.js";
import { addEdge } from "../../graph/edges.js";
import { RELATION_TYPES } from "../../vocab/relation-types.js";
import { BUILT_IN_PATTERNS, type ReferencePattern } from "./patterns.js";
import { ensureUnresolvedRefsTable } from "./schema.js";

export interface ResolveResult {
  edgesCreated: number;
  unresolved: number;
}

/**
 * Find the primary entity for an episode (highest-confidence evidence link).
 * Returns null if no entity evidence exists.
 */
function getPrimaryEntity(
  graph: EngramGraph,
  episodeId: string,
): { id: string } | null {
  const row = graph.db
    .query<{ entity_id: string }, [string]>(
      `SELECT entity_id FROM entity_evidence
       WHERE episode_id = ?
       ORDER BY confidence DESC
       LIMIT 1`,
    )
    .get(episodeId);
  return row ? { id: row.entity_id } : null;
}

/**
 * Find the entity representing a given (source_type, source_ref) target.
 * Looks up through the episode → entity_evidence chain.
 * Skips episodes with status 'redacted'.
 */
function findTargetEntityBySourceRef(
  graph: EngramGraph,
  sourceType: string,
  sourceRef: string,
): { id: string } | null {
  const row = graph.db
    .query<{ entity_id: string }, [string, string]>(
      `SELECT ee.entity_id
       FROM entity_evidence ee
       JOIN episodes ep ON ee.episode_id = ep.id
       WHERE ep.source_type = ? AND ep.source_ref = ? AND ep.status != 'redacted'
       LIMIT 1`,
    )
    .get(sourceType, sourceRef);
  return row ? { id: row.entity_id } : null;
}

/**
 * Emit or update a 'references' edge between two entities.
 * Dedup: if an active edge already exists, add evidence link; otherwise create.
 */
function emitReferenceEdge(
  graph: EngramGraph,
  sourceEntityId: string,
  targetEntityId: string,
  episodeId: string,
  confidence: number,
  fact: string,
  validFrom?: string,
): boolean {
  const existing = graph.db
    .query<{ id: string }, [string, string, string, string]>(
      `SELECT id FROM edges
       WHERE source_id = ? AND target_id = ? AND relation_type = ?
         AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
    )
    .get(sourceEntityId, targetEntityId, RELATION_TYPES.REFERENCES, "observed");

  if (existing) {
    // Add evidence link to existing edge (INSERT OR IGNORE to handle PK collision)
    const now = new Date().toISOString();
    graph.db
      .prepare(
        `INSERT OR IGNORE INTO edge_evidence (edge_id, episode_id, extractor, confidence, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(existing.id, episodeId, "cross-ref-resolver", confidence, now);
    return false; // edge already existed
  }

  addEdge(
    graph,
    {
      source_id: sourceEntityId,
      target_id: targetEntityId,
      relation_type: RELATION_TYPES.REFERENCES,
      edge_kind: "observed",
      fact,
      confidence,
      valid_from: validFrom,
    },
    [{ episode_id: episodeId, extractor: "cross-ref-resolver", confidence }],
  );
  return true;
}

/**
 * Record a reference that couldn't be resolved yet.
 * Dedup: if an unresolved row already exists for this (episode, type, ref), skip.
 */
function recordUnresolved(
  graph: EngramGraph,
  sourceEpisodeId: string,
  targetSourceType: string,
  targetRef: string,
): void {
  const exists = graph.db
    .query<{ id: string }, [string, string, string]>(
      `SELECT id FROM unresolved_refs
       WHERE source_episode_id = ? AND target_source_type = ? AND target_ref = ?
         AND resolved_at IS NULL LIMIT 1`,
    )
    .get(sourceEpisodeId, targetSourceType, targetRef);

  if (exists) return;

  graph.db
    .prepare(
      `INSERT INTO unresolved_refs (id, source_episode_id, target_source_type, target_ref, detected_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      ulid(),
      sourceEpisodeId,
      targetSourceType,
      targetRef,
      new Date().toISOString(),
    );
}

/**
 * Scan episodes for cross-source references and emit edges.
 *
 * For each episode, scans content against all patterns. Emits a 'references'
 * edge (edge_kind: 'observed') for each resolved match. Unresolved matches
 * land in `unresolved_refs` for later resolution via `drainUnresolved`.
 */
export function resolveReferences(
  graph: EngramGraph,
  episodeIds: string[],
  patterns: ReferencePattern[] = BUILT_IN_PATTERNS,
): ResolveResult {
  ensureUnresolvedRefsTable(graph);

  let edgesCreated = 0;
  let unresolved = 0;

  for (const episodeId of episodeIds) {
    const episode = graph.db
      .query<
        {
          id: string;
          content: string;
          source_type: string;
          source_ref: string | null;
          timestamp: string;
          status: string;
        },
        [string]
      >(
        "SELECT id, content, source_type, source_ref, timestamp, status FROM episodes WHERE id = ?",
      )
      .get(episodeId);

    if (!episode || episode.status === "redacted") continue;

    const sourceEntity = getPrimaryEntity(graph, episodeId);

    // Deduplicate matches within this episode: (sourceType, normalizedRef) → seen
    const seenRefs = new Set<string>();

    for (const pat of patterns) {
      // Reset lastIndex for stateful regexes (global flag)
      pat.pattern.lastIndex = 0;

      const allMatches: RegExpExecArray[] = [];
      {
        let m = pat.pattern.exec(episode.content);
        while (m !== null) {
          allMatches.push(m);
          m = pat.pattern.exec(episode.content);
        }
      }

      for (const match of allMatches) {
        const captured = match[1];
        if (!captured) continue;

        const normalizedRef = pat.normalizeRef(captured);
        const dedupeKey = `${pat.sourceType}:${normalizedRef}`;

        if (seenRefs.has(dedupeKey)) continue;
        seenRefs.add(dedupeKey);

        // Find target entity
        let targetEntity: { id: string } | null = null;

        if (pat._lookupOverride) {
          targetEntity = pat._lookupOverride(graph, normalizedRef);
        } else {
          targetEntity = findTargetEntityBySourceRef(
            graph,
            pat.sourceType,
            normalizedRef,
          );
        }

        if (!targetEntity) {
          // Also try with the full match (for URL patterns where capture group = path segment)
          if (!pat._lookupOverride) {
            const fullMatch = match[0];
            if (fullMatch !== normalizedRef) {
              targetEntity = findTargetEntityBySourceRef(
                graph,
                pat.sourceType,
                fullMatch,
              );
            }
          }
        }

        if (!targetEntity) {
          // Record using the full match when available (matches episode source_ref for drain)
          const fullMatch = match[0];
          const unresolvedRef =
            !pat._lookupOverride && fullMatch !== normalizedRef
              ? fullMatch
              : normalizedRef;
          recordUnresolved(graph, episodeId, pat.sourceType, unresolvedRef);
          unresolved++;
          continue;
        }

        // Self-reference guard
        if (sourceEntity && targetEntity.id === sourceEntity.id) continue;

        const fact = `Episode ${episodeId} (${episode.source_type}) references ${pat.sourceType} ${normalizedRef}`;
        const created = emitReferenceEdge(
          graph,
          sourceEntity?.id ?? targetEntity.id, // fall back to target if no source entity
          targetEntity.id,
          episodeId,
          pat.confidence,
          fact,
          episode.timestamp,
        );
        if (created) edgesCreated++;
      }

      // Reset lastIndex after use
      pat.pattern.lastIndex = 0;
    }

    // Check if any existing unresolved_refs can be resolved by this new episode
    drainUnresolvedForEpisode(graph, episode, patterns);
  }

  return { edgesCreated, unresolved };
}

/**
 * Drain unresolved_refs entries that match the given episode's (source_type, source_ref).
 * Called when a new episode lands that may satisfy pending references.
 */
function drainUnresolvedForEpisode(
  graph: EngramGraph,
  episode: {
    id: string;
    source_type: string;
    source_ref: string | null;
    timestamp: string;
  },
  _patterns: ReferencePattern[],
): void {
  if (!episode.source_ref) return;

  const pending = graph.db
    .query<
      { id: string; source_episode_id: string; target_ref: string },
      [string, string]
    >(
      `SELECT id, source_episode_id, target_ref FROM unresolved_refs
       WHERE target_source_type = ? AND target_ref = ? AND resolved_at IS NULL`,
    )
    .all(episode.source_type, episode.source_ref);

  if (pending.length === 0) return;

  const targetEntity = findTargetEntityBySourceRef(
    graph,
    episode.source_type,
    episode.source_ref,
  );
  if (!targetEntity) return;

  const now = new Date().toISOString();

  for (const row of pending) {
    const sourceEntity = getPrimaryEntity(graph, row.source_episode_id);
    if (!sourceEntity) continue;
    if (sourceEntity.id === targetEntity.id) continue;

    const fact = `Resolved reference: episode ${row.source_episode_id} references ${episode.source_type} ${row.target_ref}`;
    emitReferenceEdge(
      graph,
      sourceEntity.id,
      targetEntity.id,
      row.source_episode_id,
      0.9,
      fact,
      episode.timestamp,
    );

    graph.db
      .prepare(`UPDATE unresolved_refs SET resolved_at = ? WHERE id = ?`)
      .run(now, row.id);
  }
}

/**
 * Re-scan all episodes for unresolved references and attempt resolution.
 * Used by `engram reconcile --cross-refs`.
 *
 * Returns count of edges created and remaining unresolved rows.
 */
export function drainUnresolved(
  graph: EngramGraph,
  patterns: ReferencePattern[] = BUILT_IN_PATTERNS,
): ResolveResult {
  ensureUnresolvedRefsTable(graph);

  // Phase 1: try to resolve existing unresolved_refs rows
  const pending = graph.db
    .query<
      {
        id: string;
        source_episode_id: string;
        target_source_type: string;
        target_ref: string;
      },
      []
    >(
      `SELECT id, source_episode_id, target_source_type, target_ref
       FROM unresolved_refs WHERE resolved_at IS NULL`,
    )
    .all();

  let edgesCreated = 0;
  const now = new Date().toISOString();

  for (const row of pending) {
    // Find target entity using default lookup
    const targetEntity = findTargetEntityBySourceRef(
      graph,
      row.target_source_type,
      row.target_ref,
    );
    if (!targetEntity) continue;

    const sourceEntity = getPrimaryEntity(graph, row.source_episode_id);
    if (!sourceEntity) continue;
    if (sourceEntity.id === targetEntity.id) continue;

    const sourceEpisode = graph.db
      .query<{ timestamp: string; source_type: string }, [string]>(
        "SELECT timestamp, source_type FROM episodes WHERE id = ?",
      )
      .get(row.source_episode_id);

    const fact = `Resolved reference: episode ${row.source_episode_id} references ${row.target_source_type} ${row.target_ref}`;
    const created = emitReferenceEdge(
      graph,
      sourceEntity.id,
      targetEntity.id,
      row.source_episode_id,
      0.9,
      fact,
      sourceEpisode?.timestamp,
    );
    if (created) edgesCreated++;

    graph.db
      .prepare(`UPDATE unresolved_refs SET resolved_at = ? WHERE id = ?`)
      .run(now, row.id);
  }

  // Phase 2: full re-scan of all active episodes
  const allEpisodes = graph.db
    .query<{ id: string }, []>(
      "SELECT id FROM episodes WHERE status != 'redacted' ORDER BY timestamp ASC",
    )
    .all();

  const allEpisodeIds = allEpisodes.map((e) => e.id);
  const scanResult = resolveReferences(graph, allEpisodeIds, patterns);
  edgesCreated += scanResult.edgesCreated;

  const remainingUnresolved =
    graph.db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM unresolved_refs WHERE resolved_at IS NULL",
      )
      .get()?.count ?? 0;

  return { edgesCreated, unresolved: remainingUnresolved };
}
