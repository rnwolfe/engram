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

export interface TraversedEntity {
  entityId: string;
  canonicalName: string;
  entityType: string;
  updatedAt: string;
  /** Number of hops from the nearest seed entity. */
  hops: number;
  /** Maximum edge confidence along the best path from a seed. */
  maxEdgeConfidence: number;
  /** FTS score of the seed entity that led to this discovery. */
  seedFtsScore: number;
  /** ID of the seed entity that led to this discovery. */
  seedEntityId: string;
}

export interface GraphSearchOpts {
  /** Maximum traversal depth. Default 2. */
  maxHops?: number;
  /** Only follow edges valid at this ISO8601 timestamp. */
  validAt?: string;
}

interface FrontierEntry {
  entityId: string;
  hops: number;
  maxEdgeConfidence: number;
  seedFtsScore: number;
  seedEntityId: string;
}

/**
 * Collect active edges from an entity in both directions.
 */
function collectEdges(
  graph: EngramGraph,
  entityId: string,
  validAt?: string,
): Edge[] {
  const base = { active_only: true as const, valid_at: validAt };
  const outbound = findEdges(graph, { ...base, source_id: entityId });
  const inbound = findEdges(graph, { ...base, target_id: entityId });
  return [...outbound, ...inbound];
}

/**
 * BFS traversal from seed entities, tracking hop distance and edge confidence.
 *
 * For each seed entity (found via FTS), follows edges up to maxHops deep.
 * Returns all discovered entities that are NOT in the seed set, scored by
 * the best path (highest seed FTS score, shortest distance, highest confidence).
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

  if (seeds.length === 0 || maxHops === 0) return [];

  const seedIds = new Set(seeds.map(([id]) => id));
  // Best result per entity: prefer shorter hops, then higher confidence, then higher seed score
  const best = new Map<string, TraversedEntity>();

  // Initialize frontier with all seeds
  let frontier: FrontierEntry[] = seeds.map(([id, ftsScore]) => ({
    entityId: id,
    hops: 0,
    maxEdgeConfidence: 1.0,
    seedFtsScore: ftsScore,
    seedEntityId: id,
  }));

  const visited = new Set<string>(seedIds);

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break;

    const nextFrontier: FrontierEntry[] = [];

    for (const entry of frontier) {
      const edges = collectEdges(graph, entry.entityId, opts.validAt);

      for (const edge of edges) {
        const neighborId =
          edge.source_id === entry.entityId ? edge.target_id : edge.source_id;

        const neighborHops = entry.hops + 1;
        const pathConfidence = Math.min(
          entry.maxEdgeConfidence,
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
            maxEdgeConfidence: pathConfidence,
            seedFtsScore: entry.seedFtsScore,
            seedEntityId: entry.seedEntityId,
          };

          best.set(neighborId, result);

          nextFrontier.push({
            entityId: neighborId,
            hops: neighborHops,
            maxEdgeConfidence: pathConfidence,
            seedFtsScore: entry.seedFtsScore,
            seedEntityId: entry.seedEntityId,
          });
        } else if (!seedIds.has(neighborId)) {
          // Already visited non-seed: update if this path is better
          const existing = best.get(neighborId);
          if (existing) {
            const isBetter =
              neighborHops < existing.hops ||
              (neighborHops === existing.hops &&
                pathConfidence > existing.maxEdgeConfidence) ||
              (neighborHops === existing.hops &&
                pathConfidence === existing.maxEdgeConfidence &&
                entry.seedFtsScore > existing.seedFtsScore);

            if (isBetter) {
              best.set(neighborId, {
                entityId: neighborId,
                canonicalName: existing.canonicalName,
                entityType: existing.entityType,
                updatedAt: existing.updatedAt,
                hops: neighborHops,
                maxEdgeConfidence: pathConfidence,
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
