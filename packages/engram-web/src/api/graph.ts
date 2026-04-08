/**
 * graph.ts — GET /api/graph handler.
 *
 * Returns nodes (entities) and edges for the active graph,
 * optionally filtered to those valid at a given ISO8601 timestamp.
 */

import type { EngramGraph } from "engram-core";
import { findEdges, findEntities } from "engram-core";

export interface GraphNode {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  updated_at: string;
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

export function handleGraph(
  graph: EngramGraph,
  validAt?: string,
): GraphResponse {
  const entities = findEntities(graph);
  const edgeQuery = validAt ? { valid_at: validAt } : {};
  const edges = findEdges(graph, edgeQuery);

  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.id,
    canonical_name: e.canonical_name,
    entity_type: e.entity_type,
    status: e.status,
    updated_at: e.updated_at,
  }));

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
