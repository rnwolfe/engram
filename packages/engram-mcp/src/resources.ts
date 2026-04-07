/**
 * resources.ts — MCP resource handlers for engram graph metadata.
 *
 * Resources:
 *   engram://stats  — entity/edge/episode counts
 *   engram://recent — last 10 episodes by ingested_at
 */

import type { EngramGraph } from "engram-core";

export const ENGRAM_RESOURCES = [
  {
    uri: "engram://stats",
    name: "engram stats",
    description: "Entity, edge, and episode counts for the current graph",
    mimeType: "application/json",
  },
  {
    uri: "engram://recent",
    name: "engram recent episodes",
    description: "The 10 most recently ingested episodes",
    mimeType: "application/json",
  },
];

interface StatsRow {
  entities: number;
  edges: number;
  episodes: number;
}

export function readStats(graph: EngramGraph): StatsRow {
  const row = graph.db
    .query<StatsRow, []>(
      `SELECT
        (SELECT COUNT(*) FROM entities WHERE status = 'active') AS entities,
        (SELECT COUNT(*) FROM edges WHERE invalidated_at IS NULL) AS edges,
        (SELECT COUNT(*) FROM episodes WHERE status = 'active') AS episodes`,
    )
    .get();

  return row ?? { entities: 0, edges: 0, episodes: 0 };
}

interface RecentEpisodeRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  ingested_at: string;
  content: string;
}

export function readRecentEpisodes(graph: EngramGraph): RecentEpisodeRow[] {
  return graph.db
    .query<RecentEpisodeRow, []>(
      `SELECT id, source_type, source_ref, actor, timestamp, ingested_at,
              SUBSTR(content, 1, 200) AS content
       FROM episodes
       WHERE status = 'active'
       ORDER BY ingested_at DESC
       LIMIT 10`,
    )
    .all();
}
