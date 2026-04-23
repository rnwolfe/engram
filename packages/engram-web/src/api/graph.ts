/**
 * graph.ts — GET /api/graph handler.
 *
 * Returns nodes (entities + active projections) and edges for the active graph,
 * optionally filtered to those valid at a given ISO8601 timestamp.
 */

import type { EngramGraph } from "engram-core";
import {
  ENTITY_TYPES,
  findEdges,
  findEntities,
  listActiveProjections,
} from "engram-core";

export interface GraphNode {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  updated_at: string;
  source_type?: string;
  // Projection-specific fields (only present when entity_type === "projection")
  anchor_id?: string | null;
  kind?: string;
  stale?: boolean;
}

export interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    entity_count: number;
    edge_count: number;
  };
}

/**
 * Query the dominant source_type for each entity via evidence → episodes join.
 * Returns a Map<entity_id, source_type>. Uses simple GROUP BY (arbitrary tie-break).
 */
function buildSourceTypeMap(graph: EngramGraph): Map<string, string> {
  try {
    const rows = graph.db
      .query<{ entity_id: string; source_type: string }, []>(
        `SELECT entity_id, source_type
         FROM (
           SELECT ee.entity_id, ep.source_type, count(*) AS cnt
           FROM entity_evidence ee
           JOIN episodes ep ON ep.id = ee.episode_id
           WHERE ep.status = 'active'
           GROUP BY ee.entity_id, ep.source_type
           ORDER BY ee.entity_id, cnt DESC
         )
         GROUP BY entity_id`,
      )
      .all();

    const map = new Map<string, string>();
    for (const row of rows) {
      if (!map.has(row.entity_id)) {
        map.set(row.entity_id, row.source_type);
      }
    }
    return map;
  } catch {
    return new Map();
  }
}

export function handleGraph(
  graph: EngramGraph,
  validAt?: string,
): GraphResponse {
  const entities = findEntities(graph);
  const edgeQuery = validAt ? { valid_at: validAt } : {};
  const edges = findEdges(graph, edgeQuery);

  const sourceTypeMap = buildSourceTypeMap(graph);

  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.id,
    canonical_name: e.canonical_name,
    entity_type: e.entity_type,
    status: e.status,
    updated_at: e.updated_at,
    source_type: sourceTypeMap.get(e.id),
  }));

  // Add active projections as graph nodes with entity_type "projection"
  try {
    const projResults = listActiveProjections(graph);
    for (const pr of projResults) {
      const p = pr.projection;
      nodes.push({
        id: p.id,
        canonical_name: p.title || `${p.kind} projection`,
        entity_type: ENTITY_TYPES.PROJECTION,
        status: p.invalidated_at ? "invalidated" : "active",
        updated_at: p.created_at,
        anchor_id: p.anchor_id,
        kind: p.kind,
        stale: pr.stale,
      });
    }
  } catch {
    // listActiveProjections may fail if projections table doesn't exist yet — skip
  }

  const graphEdges: GraphEdge[] = edges.map((e) => ({
    id: e.id,
    source_id: e.source_id,
    target_id: e.target_id,
    relation_type: e.relation_type,
    edge_kind: e.edge_kind,
    confidence: e.confidence,
    valid_from: e.valid_from,
    valid_until: e.valid_until,
  }));

  return {
    nodes,
    edges: graphEdges,
    stats: {
      entity_count: nodes.length,
      edge_count: graphEdges.length,
    },
  };
}
