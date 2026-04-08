/**
 * graph-search.ts — Graph-aware retrieval via edge traversal.
 *
 * Seeds from FTS entity hits, then follows edges (authored_by, likely_owner_of,
 * co_changes_with) to discover related entities that FTS alone would miss.
 * Returns traversed entities with scoring metadata (hop distance, edge confidence).
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge } from "../graph/edges.js";
import { findEdges } from "../graph/edges.js";
import { getEntity } from "../graph/entities.js";

/**
 * Default relation types followed during graph traversal.
 * authored_by is excluded: it connects persons to every committed file,
 * producing too many low-signal results. likely_owner_of is the refined
 * ownership signal; co_changes_with captures structural coupling.
 */
const DEFAULT_RELATION_TYPES = ["likely_owner_of", "co_changes_with"];

export interface TraversedEntity {
  entityId: string;
  canonicalName: string;
  entityType: string;
  updatedAt: string;
  /** Number of hops from the nearest seed entity. */
  hops: number;
  /** Minimum (bottleneck) edge confidence along the path from seed. */
  minPathConfidence: number;
  /** FTS score of the seed entity that led to this discovery. */
  seedFtsScore: number;
  /** ID of the seed entity that led to this discovery. */
  seedEntityId: string;
}

export interface GraphSearchOpts {
  /** Maximum traversal depth. Default 2. */
  maxHops?: number;
  /** Only follow edges valid at this ISO8601 timestamp. */
  valid_at?: string;
  /** Relation types to traverse. Default: authored_by, likely_owner_of, co_changes_with. */
  relation_types?: string[];
}

interface FrontierEntry {
  entityId: string;
  hops: number;
  minPathConfidence: number;
  seedFtsScore: number;
  seedEntityId: string;
}

/**
 * Collect active edges from an entity in both directions,
 * filtered to the allowed relation types.
 */
function collectEdges(
  graph: EngramGraph,
  entityId: string,
  relationTypes: string[],
  validAt?: string,
): Edge[] {
  const base = { active_only: true, valid_at: validAt };
  const outbound = findEdges(graph, { ...base, source_id: entityId });
  const inbound = findEdges(graph, { ...base, target_id: entityId });
  const all = [...outbound, ...inbound];
  return all.filter((e) => relationTypes.includes(e.relation_type));
}

/**
 * BFS traversal from seed entities, tracking hop distance and edge confidence.
 *
 * For each seed entity (found via FTS), follows edges of the allowed relation
 * types up to maxHops deep. Returns all discovered entities that are NOT in
 * the seed set, scored by the best path (shortest distance, highest confidence,
 * highest seed FTS score).
 *
 * @param graph - The engram graph to traverse.
 * @param seeds - Array of [entityId, normalizedFtsScore] from the FTS phase.
 * @param opts - Traversal options.
 * @returns Array of traversed entities with scoring metadata.
 */
export function graphSearch(
  graph: EngramGraph,
  seeds: Array<[string, number]>,
  opts: GraphSearchOpts = {},
): TraversedEntity[] {
  const maxHops = opts.maxHops ?? 2;
  const relationTypes = opts.relation_types ?? DEFAULT_RELATION_TYPES;

  if (seeds.length === 0 || maxHops === 0) return [];

  const seedIds = new Set(seeds.map(([id]) => id));
  // Best result per entity: prefer shorter hops, then higher confidence, then higher seed score
  const best = new Map<string, TraversedEntity>();

  // Initialize frontier with all seeds
  let frontier: FrontierEntry[] = seeds.map(([id, ftsScore]) => ({
    entityId: id,
    hops: 0,
    minPathConfidence: 1.0,
    seedFtsScore: ftsScore,
    seedEntityId: id,
  }));

  const visited = new Set<string>(seedIds);

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break;

    const nextFrontier: FrontierEntry[] = [];

    for (const entry of frontier) {
      const edges = collectEdges(
        graph,
        entry.entityId,
        relationTypes,
        opts.valid_at,
      );

      for (const edge of edges) {
        const neighborId =
          edge.source_id === entry.entityId ? edge.target_id : edge.source_id;

        const neighborHops = entry.hops + 1;
        const pathConfidence = Math.min(
          entry.minPathConfidence,
          edge.confidence,
        );

        if (!visited.has(neighborId)) {
          visited.add(neighborId);

          const neighbor = getEntity(graph, neighborId);
          if (!neighbor || neighbor.status !== "active") continue;

          const result: TraversedEntity = {
            entityId: neighborId,
            canonicalName: neighbor.canonical_name,
            entityType: neighbor.entity_type,
            updatedAt: neighbor.updated_at,
            hops: neighborHops,
            minPathConfidence: pathConfidence,
            seedFtsScore: entry.seedFtsScore,
            seedEntityId: entry.seedEntityId,
          };

          best.set(neighborId, result);

          nextFrontier.push({
            entityId: neighborId,
            hops: neighborHops,
            minPathConfidence: pathConfidence,
            seedFtsScore: entry.seedFtsScore,
            seedEntityId: entry.seedEntityId,
          });
        } else if (!seedIds.has(neighborId)) {
          // Already visited non-seed: update metadata if this path is better.
          // Note: the improved entry is NOT re-enqueued, so downstream nodes
          // from this entity retain the original path's attribution. This is a
          // known BFS tradeoff acceptable for v0.1 — only affects scoring
          // precision in multi-seed edge cases.
          const existing = best.get(neighborId);
          if (existing) {
            const isBetter =
              neighborHops < existing.hops ||
              (neighborHops === existing.hops &&
                pathConfidence > existing.minPathConfidence) ||
              (neighborHops === existing.hops &&
                pathConfidence === existing.minPathConfidence &&
                entry.seedFtsScore > existing.seedFtsScore);

            if (isBetter) {
              best.set(neighborId, {
                entityId: neighborId,
                canonicalName: existing.canonicalName,
                entityType: existing.entityType,
                updatedAt: existing.updatedAt,
                hops: neighborHops,
                minPathConfidence: pathConfidence,
                seedFtsScore: entry.seedFtsScore,
                seedEntityId: entry.seedEntityId,
              });
            }
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return Array.from(best.values());
}
