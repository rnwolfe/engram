/**
 * server.test.ts — unit tests for the engram-web API handlers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "engram-core";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
} from "engram-core";
import { handleGraph } from "../src/api/graph.js";
import { handleStats } from "../src/api/stats.js";
import { handleTemporalBounds } from "../src/api/temporal.js";

let graph: EngramGraph;

function addTestData(g: EngramGraph) {
  const ep = addEpisode(g, {
    source_type: "manual",
    source_ref: "test-001",
    content: "Test episode",
    timestamp: "2024-01-01T00:00:00Z",
  });

  const evidence = [{ episode_id: ep.id, extractor: "test" }];

  const entityA = addEntity(
    g,
    { canonical_name: "EntityA", entity_type: "module" },
    evidence,
  );
  const entityB = addEntity(
    g,
    { canonical_name: "EntityB", entity_type: "module" },
    evidence,
  );

  addEdge(
    g,
    {
      source_id: entityA.id,
      target_id: entityB.id,
      relation_type: "depends_on",
      edge_kind: "observed",
      fact: "EntityA depends on EntityB",
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    },
    evidence,
  );

  addEdge(
    g,
    {
      source_id: entityB.id,
      target_id: entityA.id,
      relation_type: "owned_by",
      edge_kind: "inferred",
      fact: "EntityB owned by EntityA",
      valid_from: "2024-03-01T00:00:00Z",
    },
    evidence,
  );

  return { ep, entityA, entityB };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// handleStats
// ---------------------------------------------------------------------------

describe("handleStats", () => {
  test("returns zero counts on empty graph", () => {
    const stats = handleStats(graph);
    expect(stats.entity_count).toBe(0);
    expect(stats.edge_count).toBe(0);
    expect(stats.episode_count).toBe(0);
  });

  test("returns correct counts after adding data", () => {
    addTestData(graph);
    const stats = handleStats(graph);
    expect(stats.entity_count).toBe(2);
    expect(stats.edge_count).toBe(2);
    expect(stats.episode_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// handleGraph
// ---------------------------------------------------------------------------

describe("handleGraph", () => {
  test("returns empty nodes and edges on empty graph", () => {
    const result = handleGraph(graph);
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.stats.entity_count).toBe(0);
    expect(result.stats.edge_count).toBe(0);
  });

  test("returns all active nodes and edges", () => {
    addTestData(graph);
    const result = handleGraph(graph);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(2);
    expect(result.stats.entity_count).toBe(2);
    expect(result.stats.edge_count).toBe(2);
  });

  test("node shape includes required fields", () => {
    addTestData(graph);
    const result = handleGraph(graph);
    const node = result.nodes[0];
    expect(node).toHaveProperty("id");
    expect(node).toHaveProperty("canonical_name");
    expect(node).toHaveProperty("entity_type");
    expect(node).toHaveProperty("status");
    expect(node).toHaveProperty("updated_at");
  });

  test("edge shape includes required fields", () => {
    addTestData(graph);
    const result = handleGraph(graph);
    const edge = result.edges[0];
    expect(edge).toHaveProperty("id");
    expect(edge).toHaveProperty("source_id");
    expect(edge).toHaveProperty("target_id");
    expect(edge).toHaveProperty("relation_type");
    expect(edge).toHaveProperty("edge_kind");
    expect(edge).toHaveProperty("confidence");
    expect(edge).toHaveProperty("valid_from");
    expect(edge).toHaveProperty("valid_until");
  });

  test("filters edges by valid_at", () => {
    addTestData(graph);
    // First edge is valid 2024-01-01 to 2024-06-01
    // Second edge is valid from 2024-03-01 (no end)
    // At 2024-02-01: only first edge is valid
    const result = handleGraph(graph, "2024-02-01T00:00:00Z");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].relation_type).toBe("depends_on");
  });

  test("valid_at=after all edges returns only open-ended edges", () => {
    addTestData(graph);
    // After 2024-06-01: first edge expired, second is still open
    const result = handleGraph(graph, "2024-07-01T00:00:00Z");
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].relation_type).toBe("owned_by");
  });
});

// ---------------------------------------------------------------------------
// handleTemporalBounds
// ---------------------------------------------------------------------------

describe("handleTemporalBounds", () => {
  test("returns nulls on empty graph", () => {
    const bounds = handleTemporalBounds(graph);
    expect(bounds.min_valid_from).toBeNull();
    expect(bounds.max_valid_until).toBeNull();
  });

  test("returns correct bounds after adding edges", () => {
    addTestData(graph);
    const bounds = handleTemporalBounds(graph);
    // min_valid_from should be 2024-01-01
    expect(bounds.min_valid_from).toBe("2024-01-01T00:00:00Z");
    // max_valid_until: one edge has null (open-ended), one has 2024-06-01
    // MAX(null, '2024-06-01') in SQLite returns '2024-06-01' because NULL < any value
    expect(bounds.max_valid_until).toBe("2024-06-01T00:00:00Z");
  });
});
