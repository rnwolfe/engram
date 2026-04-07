/**
 * snapshot.ts — temporal graph snapshots.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, Entity } from "../graph/index.js";
import { findEdges, findEntities } from "../graph/index.js";

export interface TemporalSnapshot {
  /** The queried timestamp. */
  at: string;
  entities: Entity[];
  /** Only edges valid at `at`. */
  edges: Edge[];
}

/**
 * Returns the graph state at the given ISO8601 UTC timestamp.
 * Entities: all active entities (entities have no validity windows in v0.1).
 * Edges: only edges valid at the given point in time.
 */
export function getSnapshot(graph: EngramGraph, at: string): TemporalSnapshot {
  const entities = findEntities(graph, { status: "active" });
  const edges = findEdges(graph, { valid_at: at, include_invalidated: false });

  return { at, entities, edges };
}
