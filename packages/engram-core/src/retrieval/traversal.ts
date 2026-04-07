/**
 * traversal.ts — graph traversal (BFS neighbors and shortest path).
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, Entity } from "../graph/index.js";
import { EntityNotFoundError, findEdges, getEntity } from "../graph/index.js";

export interface SubGraph {
  entities: Entity[];
  edges: Edge[];
}

export interface TraversalOpts {
  /** Max hops. Default 1. */
  depth?: number;
  /** Filter by edge_kind values. */
  edge_kinds?: string[];
  /** Only follow edges valid at this ISO8601 timestamp. */
  valid_at?: string;
  /** Direction of traversal. Default 'both'. */
  direction?: "outbound" | "inbound" | "both";
}

export interface PathResult {
  found: boolean;
  entities: Entity[];
  edges: Edge[];
  length: number;
}

/**
 * Collect edges from an entity respecting direction and options.
 */
function collectEdges(
  graph: EngramGraph,
  entity_id: string,
  opts: TraversalOpts,
): Edge[] {
  const direction = opts.direction ?? "both";
  const results: Edge[] = [];

  const baseQuery = {
    active_only: true as const,
    valid_at: opts.valid_at,
  };

  if (direction === "outbound" || direction === "both") {
    results.push(...findEdges(graph, { ...baseQuery, source_id: entity_id }));
  }

  if (direction === "inbound" || direction === "both") {
    results.push(...findEdges(graph, { ...baseQuery, target_id: entity_id }));
  }

  if (opts.edge_kinds && opts.edge_kinds.length > 0) {
    return results.filter((e) => opts.edge_kinds?.includes(e.edge_kind));
  }

  return results;
}

/**
 * BFS from entity_id up to opts.depth hops (default 1).
 * Returns deduplicated SubGraph of entities and edges.
 */
export function getNeighbors(
  graph: EngramGraph,
  entity_id: string,
  opts: TraversalOpts = {},
): SubGraph {
  const start = getEntity(graph, entity_id);
  if (!start) {
    throw new EntityNotFoundError(entity_id);
  }

  const maxDepth = opts.depth ?? 1;
  const visitedEntities = new Map<string, Entity>();
  const visitedEdges = new Map<string, Edge>();

  visitedEntities.set(start.id, start);

  let frontier: string[] = [entity_id];

  for (let hop = 0; hop < maxDepth; hop++) {
    if (frontier.length === 0) break;

    const nextFrontier: string[] = [];

    for (const eid of frontier) {
      const edges = collectEdges(graph, eid, opts);

      for (const edge of edges) {
        if (!visitedEdges.has(edge.id)) {
          visitedEdges.set(edge.id, edge);
        }

        // Determine the neighbor entity ID
        const neighborId =
          edge.source_id === eid ? edge.target_id : edge.source_id;

        if (!visitedEntities.has(neighborId)) {
          const neighbor = getEntity(graph, neighborId);
          if (neighbor) {
            visitedEntities.set(neighborId, neighbor);
            nextFrontier.push(neighborId);
          }
        }
      }
    }

    frontier = nextFrontier;
  }

  return {
    entities: Array.from(visitedEntities.values()),
    edges: Array.from(visitedEdges.values()),
  };
}

/**
 * BFS shortest path between from_id and to_id.
 * Max depth 10 to prevent unbounded traversal.
 */
export function getPath(
  graph: EngramGraph,
  from_id: string,
  to_id: string,
  opts: TraversalOpts = {},
): PathResult {
  const startEntity = getEntity(graph, from_id);
  if (!startEntity) {
    throw new EntityNotFoundError(from_id);
  }

  const endEntity = getEntity(graph, to_id);
  if (!endEntity) {
    throw new EntityNotFoundError(to_id);
  }

  // Trivial case
  if (from_id === to_id) {
    return { found: true, entities: [startEntity], edges: [], length: 0 };
  }

  const MAX_DEPTH = 10;
  const maxHops = Math.min(opts.depth ?? MAX_DEPTH, MAX_DEPTH);

  // BFS state: track parent entity and edge used to reach each entity
  const visited = new Set<string>([from_id]);
  const parent = new Map<string, { entityId: string; edge: Edge }>();

  let frontier: string[] = [from_id];

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break;

    const nextFrontier: string[] = [];

    for (const eid of frontier) {
      const edges = collectEdges(graph, eid, opts);

      for (const edge of edges) {
        const neighborId =
          edge.source_id === eid ? edge.target_id : edge.source_id;

        if (visited.has(neighborId)) continue;

        visited.add(neighborId);
        parent.set(neighborId, { entityId: eid, edge });

        if (neighborId === to_id) {
          // Reconstruct path
          return reconstructPath(
            graph,
            from_id,
            to_id,
            parent,
            startEntity,
            endEntity,
          );
        }

        nextFrontier.push(neighborId);
      }
    }

    frontier = nextFrontier;
  }

  return { found: false, entities: [], edges: [], length: 0 };
}

function reconstructPath(
  graph: EngramGraph,
  from_id: string,
  to_id: string,
  parent: Map<string, { entityId: string; edge: Edge }>,
  startEntity: Entity,
  endEntity: Entity,
): PathResult {
  const pathEdges: Edge[] = [];
  const pathEntityIds: string[] = [to_id];

  let current = to_id;
  while (current !== from_id) {
    const p = parent.get(current);
    if (!p) {
      // Incomplete path — return not-found instead of partial result
      return { found: false, entities: [], edges: [], length: 0 };
    }
    pathEdges.unshift(p.edge);
    pathEntityIds.unshift(p.entityId);
    current = p.entityId;
  }

  const pathEntities: Entity[] = [];
  for (const id of pathEntityIds) {
    if (id === from_id) {
      pathEntities.push(startEntity);
    } else if (id === to_id) {
      pathEntities.push(endEntity);
    } else {
      const e = getEntity(graph, id);
      if (e) pathEntities.push(e);
    }
  }

  return {
    found: true,
    entities: pathEntities,
    edges: pathEdges,
    length: pathEdges.length,
  };
}
