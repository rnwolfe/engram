/**
 * search.test.ts — unit tests for the /api/search handler.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "engram-core";
import { addEntity, addEpisode, closeGraph, createGraph } from "engram-core";
import { handleSearch } from "../src/api/search.js";

let graph: EngramGraph;

function addTestEntities(g: EngramGraph) {
  const ep = addEpisode(g, {
    source_type: "manual",
    source_ref: "search-test-001",
    content: "Test episode for search",
    timestamp: "2024-01-01T00:00:00Z",
  });

  const evidence = [{ episode_id: ep.id, extractor: "test" }];

  const alpha = addEntity(
    g,
    { canonical_name: "AlphaService", entity_type: "module" },
    evidence,
  );

  const beta = addEntity(
    g,
    { canonical_name: "BetaService", entity_type: "module" },
    evidence,
  );

  const charlie = addEntity(
    g,
    { canonical_name: "Charlie Developer", entity_type: "person" },
    evidence,
  );

  return { ep, alpha, beta, charlie };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

describe("handleSearch", () => {
  test("returns empty results for empty query", async () => {
    addTestEntities(graph);
    const result = await handleSearch(graph, "");
    expect(result.results).toHaveLength(0);
  });

  test("returns empty results for whitespace-only query", async () => {
    addTestEntities(graph);
    const result = await handleSearch(graph, "   ");
    expect(result.results).toHaveLength(0);
  });

  test("returns ranked matches for a valid query", async () => {
    addTestEntities(graph);
    const result = await handleSearch(graph, "AlphaService");
    expect(result.results.length).toBeGreaterThan(0);

    // Top result should be AlphaService
    const top = result.results[0];
    expect(top.canonical_name).toBe("AlphaService");
    expect(top.entity_type).toBe("module");
    expect(top.id).toBeDefined();
    expect(typeof top.score).toBe("number");
    expect(top.score).toBeGreaterThan(0);
  });

  test("returns at most 10 results", async () => {
    // Add more than 10 entities
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: "search-test-bulk",
      content: "Bulk test episode",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const evidence = [{ episode_id: ep.id, extractor: "test" }];

    for (let i = 0; i < 15; i++) {
      addEntity(
        graph,
        { canonical_name: `Service${i}`, entity_type: "module" },
        evidence,
      );
    }

    const result = await handleSearch(graph, "Service");
    expect(result.results.length).toBeLessThanOrEqual(10);
  });

  test("result items have required fields", async () => {
    addTestEntities(graph);
    const result = await handleSearch(graph, "AlphaService");
    expect(result.results.length).toBeGreaterThan(0);

    const item = result.results[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("canonical_name");
    expect(item).toHaveProperty("entity_type");
    expect(item).toHaveProperty("score");
  });

  test("returns results property as array", async () => {
    const result = await handleSearch(graph, "nonexistent_xyz_12345");
    expect(Array.isArray(result.results)).toBe(true);
  });
});
