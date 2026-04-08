/**
 * stats.ts — GET /api/stats handler.
 *
 * Returns entity_count, edge_count, episode_count from the graph.
 */

import type { EngramGraph } from "engram-core";

export interface StatsResponse {
  entity_count: number;
  edge_count: number;
  episode_count: number;
}

export function handleStats(graph: EngramGraph): StatsResponse {
  const entity_count = (
    graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM entities")
      .get() ?? { count: 0 }
  ).count;

  const edge_count = (
    graph.db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM edges WHERE invalidated_at IS NULL",
      )
      .get() ?? { count: 0 }
  ).count;

  const episode_count = (
    graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM episodes")
      .get() ?? { count: 0 }
  ).count;

  return { entity_count, edge_count, episode_count };
}
