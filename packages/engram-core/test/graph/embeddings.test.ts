/**
 * embeddings.test.ts — Tests for embedding storage and cosine similarity.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  closeGraph,
  cosineSimilarity,
  createGraph,
  findSimilar,
  storeEmbedding,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

describe("cosineSimilarity", () => {
  test("identical vectors return 1.0", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  test("orthogonal vectors return 0.0", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0.0);
  });

  test("opposite vectors return 0.0 (clamped)", () => {
    const result = cosineSimilarity([1, 0], [-1, 0]);
    expect(result).toBe(0);
  });

  test("empty vectors return 0.0", () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });

  test("mismatched lengths return 0.0", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  test("computes similarity for non-trivial vectors", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6]; // same direction as a
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
  });

  test("partial similarity", () => {
    const a = [1, 0];
    const b = [Math.SQRT1_2, Math.SQRT1_2];
    const sim = cosineSimilarity(a, b);
    expect(sim).toBeGreaterThan(0.5);
    expect(sim).toBeLessThan(1.0);
  });
});

describe("storeEmbedding", () => {
  test("stores an embedding in the embeddings table", () => {
    storeEmbedding(
      graph,
      "entity-1",
      "entity",
      "nomic-embed-text",
      [0.1, 0.2, 0.3],
      "test text",
    );

    const row = graph.db
      .query<
        { target_id: string; target_type: string; dimensions: number },
        []
      >("SELECT target_id, target_type, dimensions FROM embeddings LIMIT 1")
      .get();

    expect(row).not.toBeNull();
    expect(row?.target_id).toBe("entity-1");
    expect(row?.target_type).toBe("entity");
    expect(row?.dimensions).toBe(3);
  });

  test("upserts on conflict — updates existing embedding", () => {
    storeEmbedding(
      graph,
      "entity-1",
      "entity",
      "nomic-embed-text",
      [0.1, 0.2, 0.3],
      "text v1",
    );
    storeEmbedding(
      graph,
      "entity-1",
      "entity",
      "nomic-embed-text",
      [0.4, 0.5, 0.6],
      "text v2",
    );

    const count = graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM embeddings")
      .get();

    expect(count?.count).toBe(1);
  });

  test("stores embeddings for both entity and episode types", () => {
    storeEmbedding(
      graph,
      "entity-1",
      "entity",
      "test-model",
      [1, 0],
      "entity text",
    );
    storeEmbedding(
      graph,
      "episode-1",
      "episode",
      "test-model",
      [0, 1],
      "episode text",
    );

    const count = graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM embeddings")
      .get();

    expect(count?.count).toBe(2);
  });
});

describe("findSimilar", () => {
  beforeEach(() => {
    // Store several embeddings with known vectors
    storeEmbedding(
      graph,
      "entity-a",
      "entity",
      "test-model",
      [1, 0, 0],
      "entity a",
    );
    storeEmbedding(
      graph,
      "entity-b",
      "entity",
      "test-model",
      [0, 1, 0],
      "entity b",
    );
    storeEmbedding(
      graph,
      "entity-c",
      "entity",
      "test-model",
      [0, 0, 1],
      "entity c",
    );
    storeEmbedding(
      graph,
      "episode-x",
      "episode",
      "test-model",
      [1, 0, 0],
      "episode x",
    );
    storeEmbedding(
      graph,
      "episode-y",
      "episode",
      "test-model",
      [Math.SQRT1_2, Math.SQRT1_2, 0],
      "episode y",
    );
  });

  test("returns results sorted by cosine similarity descending", () => {
    const results = findSimilar(graph, [1, 0, 0]);

    expect(results.length).toBeGreaterThan(0);
    // Most similar to [1,0,0] should be entity-a and episode-x
    expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
  });

  test("top result for [1,0,0] is entity-a or episode-x (perfect match)", () => {
    const results = findSimilar(graph, [1, 0, 0]);
    const topIds = results.slice(0, 2).map((r) => r.target_id);
    expect(topIds).toContain("entity-a");
    expect(topIds).toContain("episode-x");
  });

  test("respects limit option", () => {
    const results = findSimilar(graph, [1, 0, 0], { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  test("filters by target_type", () => {
    const entityResults = findSimilar(graph, [1, 0, 0], {
      target_type: "entity",
    });
    expect(entityResults.every((r) => r.target_type === "entity")).toBe(true);

    const episodeResults = findSimilar(graph, [1, 0, 0], {
      target_type: "episode",
    });
    expect(episodeResults.every((r) => r.target_type === "episode")).toBe(true);
  });

  test("filters by min_score", () => {
    const results = findSimilar(graph, [1, 0, 0], { min_score: 0.9 });
    expect(results.every((r) => r.score >= 0.9)).toBe(true);
  });

  test("returns empty array for empty query vector", () => {
    const results = findSimilar(graph, []);
    expect(results).toEqual([]);
  });

  test("filters by model", () => {
    storeEmbedding(
      graph,
      "entity-d",
      "entity",
      "other-model",
      [1, 0, 0],
      "text d",
    );
    const results = findSimilar(graph, [1, 0, 0], { model: "test-model" });
    expect(results.every((r) => r.model === "test-model")).toBe(true);
  });

  test("all scores are between 0 and 1", () => {
    const results = findSimilar(graph, [1, 0, 0]);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });
});
