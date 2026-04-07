/**
 * search.test.ts — tests for the full-text and hybrid retrieval engine.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  search,
} from "../../src/index.js";
import {
  computeCompositeScore,
  computeTemporalScore,
  normalizeEvidenceCount,
  normalizeFtsRanks,
  normalizeGraphScore,
} from "../../src/retrieval/scoring.js";

let graph: EngramGraph;

// ---------------------------------------------------------------------------
// Helper to quickly seed test data
// ---------------------------------------------------------------------------

function seedGraph(g: EngramGraph) {
  const ep1 = addEpisode(g, {
    source_type: "git",
    source_ref: "commit-abc",
    content: "feat: implement authentication service with JWT tokens",
    timestamp: "2024-01-01T00:00:00Z",
  });

  const ep2 = addEpisode(g, {
    source_type: "git",
    source_ref: "commit-def",
    content: "fix: resolve database connection pooling issue",
    timestamp: "2024-02-01T00:00:00Z",
  });

  const ep3 = addEpisode(g, {
    source_type: "manual",
    source_ref: null,
    content: "User decided to use PostgreSQL for the main database",
    timestamp: "2024-03-01T00:00:00Z",
  });

  const authService = addEntity(
    g,
    {
      canonical_name: "AuthService",
      entity_type: "service",
      summary: "JWT-based authentication service",
    },
    [{ episode_id: ep1.id, extractor: "git-extractor" }],
  );

  const dbModule = addEntity(
    g,
    {
      canonical_name: "DatabaseModule",
      entity_type: "module",
      summary: "Database connection pooling and query layer",
    },
    [
      { episode_id: ep2.id, extractor: "git-extractor" },
      { episode_id: ep3.id, extractor: "manual" },
    ],
  );

  const edge = addEdge(
    g,
    {
      source_id: authService.id,
      target_id: dbModule.id,
      relation_type: "depends_on",
      edge_kind: "observed",
      fact: "AuthService depends on DatabaseModule for user credential storage",
    },
    [{ episode_id: ep1.id, extractor: "git-extractor" }],
  );

  return { ep1, ep2, ep3, authService, dbModule, edge };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Scoring helper unit tests
// ---------------------------------------------------------------------------

describe("normalizeFtsRanks", () => {
  test("returns empty array for empty input", () => {
    expect(normalizeFtsRanks([])).toEqual([]);
  });

  test("normalizes negative FTS5 ranks to 0-1", () => {
    // FTS5 rank is negative; more negative = better match (higher BM25 score)
    // So -5.0 is a better match than -0.5
    const ranks = [-0.5, -1.0, -5.0];
    const normalized = normalizeFtsRanks(ranks);
    expect(normalized).toHaveLength(3);
    // Best match (most negative) should have highest normalized score
    expect(normalized[2]).toBeGreaterThan(normalized[1]);
    expect(normalized[1]).toBeGreaterThan(normalized[0]);
    // All values in [0, 1]
    for (const v of normalized) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  test("returns 1.0 for all equal ranks", () => {
    const ranks = [-2.0, -2.0, -2.0];
    const normalized = normalizeFtsRanks(ranks);
    expect(normalized).toEqual([1.0, 1.0, 1.0]);
  });
});

describe("computeTemporalScore", () => {
  test("returns 1.0 for current timestamp", () => {
    const now = new Date();
    const score = computeTemporalScore(now.toISOString(), now);
    expect(score).toBeCloseTo(1.0, 5);
  });

  test("returns ~0.5 for item 30 days old (half-life)", () => {
    const now = new Date("2024-04-01T00:00:00Z");
    const thirtyDaysAgo = new Date("2024-03-02T00:00:00Z");
    const score = computeTemporalScore(thirtyDaysAgo.toISOString(), now);
    // ln(2)/30 * 30 days = ln(2), exp(-ln(2)) = 0.5
    expect(score).toBeCloseTo(0.5, 2);
  });

  test("returns 1.0 for future timestamp", () => {
    const now = new Date("2024-01-01T00:00:00Z");
    const future = new Date("2025-01-01T00:00:00Z");
    const score = computeTemporalScore(future.toISOString(), now);
    expect(score).toBe(1.0);
  });

  test("decays over time", () => {
    const now = new Date("2024-12-01T00:00:00Z");
    const recent = new Date("2024-11-01T00:00:00Z");
    const old = new Date("2024-01-01T00:00:00Z");

    const recentScore = computeTemporalScore(recent.toISOString(), now);
    const oldScore = computeTemporalScore(old.toISOString(), now);
    expect(recentScore).toBeGreaterThan(oldScore);
  });
});

describe("normalizeEvidenceCount", () => {
  test("returns 0 for count 0", () => {
    expect(normalizeEvidenceCount(0)).toBe(0);
  });

  test("returns positive for count 1", () => {
    expect(normalizeEvidenceCount(1)).toBeGreaterThan(0);
    expect(normalizeEvidenceCount(1)).toBeLessThan(1);
  });

  test("returns 1.0 for very large count", () => {
    expect(normalizeEvidenceCount(1000)).toBe(1.0);
  });

  test("increases monotonically", () => {
    const scores = [1, 2, 5, 10, 50].map(normalizeEvidenceCount);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });
});

describe("normalizeGraphScore", () => {
  test("returns 0 for 0 edges", () => {
    expect(normalizeGraphScore(0)).toBe(0);
  });

  test("returns values in [0, 1]", () => {
    for (const n of [1, 5, 10, 50, 100]) {
      const s = normalizeGraphScore(n);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeCompositeScore", () => {
  test("weights sum produces score in [0, 1]", () => {
    const components = {
      fts_score: 0.8,
      graph_score: 0.5,
      temporal_score: 0.9,
      evidence_score: 0.7,
      vector_score: 0.0,
    };
    const score = computeCompositeScore(components, "fulltext");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("zero components produce zero score", () => {
    const components = {
      fts_score: 0,
      graph_score: 0,
      temporal_score: 0,
      evidence_score: 0,
      vector_score: 0,
    };
    expect(computeCompositeScore(components, "fulltext")).toBe(0);
  });

  test("hybrid mode produces different scores than fulltext when vector_score differs", () => {
    // With vector_score > 0, hybrid mode should produce higher scores
    // because hybrid allocates 0.25 weight to vector vs fulltext's 0.0
    const components = {
      fts_score: 0.5,
      graph_score: 0.5,
      temporal_score: 0.5,
      evidence_score: 0.5,
      vector_score: 1.0, // high vector score
    };
    const ftScore = computeCompositeScore(components, "fulltext");
    const hybridScore = computeCompositeScore(components, "hybrid");
    // Hybrid gives weight to vector_score, so hybrid > fulltext when vector_score=1.0
    expect(hybridScore).toBeGreaterThan(ftScore);
  });
});

// ---------------------------------------------------------------------------
// search() integration tests
// ---------------------------------------------------------------------------

describe("search", () => {
  test("returns empty array for empty query", async () => {
    seedGraph(graph);
    expect(await search(graph, "")).toEqual([]);
    expect(await search(graph, "   ")).toEqual([]);
  });

  test("finds entities by canonical name", async () => {
    seedGraph(graph);
    const results = await search(graph, "AuthService");
    expect(results.length).toBeGreaterThan(0);
    const entityResult = results.find(
      (r) => r.type === "entity" && r.content === "AuthService",
    );
    expect(entityResult).toBeDefined();
  });

  test("finds entities by summary text", async () => {
    seedGraph(graph);
    const results = await search(graph, "JWT authentication");
    expect(results.length).toBeGreaterThan(0);
    const entityResult = results.find(
      (r) => r.type === "entity" && r.content === "AuthService",
    );
    expect(entityResult).toBeDefined();
  });

  test("finds edges by fact text", async () => {
    seedGraph(graph);
    const results = await search(graph, "depends credential storage");
    expect(results.length).toBeGreaterThan(0);
    const edgeResult = results.find((r) => r.type === "edge");
    expect(edgeResult).toBeDefined();
    expect(edgeResult?.edge_kind).toBe("observed");
  });

  test("finds episodes by content", async () => {
    seedGraph(graph);
    const results = await search(graph, "PostgreSQL database");
    expect(results.length).toBeGreaterThan(0);
    const epResult = results.find((r) => r.type === "episode");
    expect(epResult).toBeDefined();
  });

  test("results are sorted by score descending", async () => {
    seedGraph(graph);
    const results = await search(graph, "database");
    expect(results.length).toBeGreaterThan(1);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  test("results include score_components", async () => {
    seedGraph(graph);
    const results = await search(graph, "AuthService");
    expect(results.length).toBeGreaterThan(0);
    const r = results[0];
    expect(r.score_components).toBeDefined();
    expect(r.score_components.fts_score).toBeGreaterThanOrEqual(0);
    expect(r.score_components.vector_score).toBe(0.0);
  });

  test("results include provenance", async () => {
    seedGraph(graph);
    const results = await search(graph, "AuthService");
    const entityResult = results.find(
      (r) => r.type === "entity" && r.content === "AuthService",
    );
    expect(entityResult).toBeDefined();
    expect(entityResult?.provenance).toHaveLength(1);
  });

  test("entity with multiple evidence has non-zero evidence_score", async () => {
    seedGraph(graph);
    const results = await search(graph, "database");
    const dbResult = results.find(
      (r) => r.type === "entity" && r.content === "DatabaseModule",
    );
    expect(dbResult).toBeDefined();
    expect(dbResult?.score_components.evidence_score).toBeGreaterThan(0);
  });

  test("entity with edges has non-zero graph_score", async () => {
    seedGraph(graph);
    const results = await search(graph, "AuthService");
    const entityResult = results.find(
      (r) => r.type === "entity" && r.content === "AuthService",
    );
    expect(entityResult).toBeDefined();
    expect(entityResult?.score_components.graph_score).toBeGreaterThan(0);
  });

  test("respects limit option", async () => {
    seedGraph(graph);
    const results = await search(graph, "database", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  test("respects min_confidence filter", async () => {
    seedGraph(graph);
    const allResults = await search(graph, "database");
    const filteredResults = await search(graph, "database", { min_confidence: 0.99 });
    expect(filteredResults.length).toBeLessThanOrEqual(allResults.length);
    for (const r of filteredResults) {
      expect(r.score).toBeGreaterThanOrEqual(0.99);
    }
  });

  test("respects entity_types filter", async () => {
    seedGraph(graph);
    const results = await search(graph, "service module database authentication", {
      entity_types: ["service"],
    });
    const entityResults = results.filter((r) => r.type === "entity");
    // All entity results should be of type 'service'
    for (const r of entityResults) {
      expect(r.content).toBe("AuthService");
    }
  });

  test("respects edge_kinds filter", async () => {
    const { ep1, authService, dbModule } = seedGraph(graph);

    // Add an inferred edge
    addEdge(
      graph,
      {
        source_id: dbModule.id,
        target_id: authService.id,
        relation_type: "co_changes_with",
        edge_kind: "inferred",
        fact: "DatabaseModule frequently co-changes with AuthService in commits",
      },
      [{ episode_id: ep1.id, extractor: "cochange-analyzer" }],
    );

    const observedResults = await search(graph, "changes commits", {
      edge_kinds: ["observed"],
    });
    const inferredResults = await search(graph, "changes commits", {
      edge_kinds: ["inferred"],
    });

    // observed edges should not appear in inferred-only results
    for (const r of observedResults.filter((r) => r.type === "edge")) {
      expect(r.edge_kind).toBe("observed");
    }
    for (const r of inferredResults.filter((r) => r.type === "edge")) {
      expect(r.edge_kind).toBe("inferred");
    }
  });

  test("respects valid_at temporal filter for edges", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: null,
      content: "Temporal test episode",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entityA = addEntity(
      graph,
      { canonical_name: "ServiceA", entity_type: "service" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );
    const entityB = addEntity(
      graph,
      { canonical_name: "ServiceB", entity_type: "service" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    // Edge valid only in Q1 2024
    addEdge(
      graph,
      {
        source_id: entityA.id,
        target_id: entityB.id,
        relation_type: "calls",
        edge_kind: "observed",
        fact: "ServiceA calls ServiceB for legacy authentication",
        valid_from: "2024-01-01T00:00:00Z",
        valid_until: "2024-04-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    // Should find edge when querying within validity window
    const inWindow = await search(graph, "legacy authentication", {
      valid_at: "2024-02-15T00:00:00Z",
    });
    const edgeResult = inWindow.find((r) => r.type === "edge");
    expect(edgeResult).toBeDefined();

    // Should NOT find edge when querying outside validity window
    const outsideWindow = await search(graph, "legacy authentication", {
      valid_at: "2024-06-01T00:00:00Z",
    });
    const edgeResult2 = outsideWindow.find((r) => r.type === "edge");
    expect(edgeResult2).toBeUndefined();
  });

  test("excludes invalidated edges by default", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: null,
      content: "Invalidation test episode",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entityA = addEntity(
      graph,
      { canonical_name: "ComponentX", entity_type: "component" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );
    const entityB = addEntity(
      graph,
      { canonical_name: "ComponentY", entity_type: "component" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    const edge = addEdge(
      graph,
      {
        source_id: entityA.id,
        target_id: entityB.id,
        relation_type: "uses",
        edge_kind: "observed",
        fact: "ComponentX uses ComponentY for cryptographic operations",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    // Manually invalidate the edge
    graph.db.run("UPDATE edges SET invalidated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      edge.id,
    ]);

    const defaultResults = await search(graph, "cryptographic operations");
    const edgeDefault = defaultResults.find((r) => r.type === "edge");
    expect(edgeDefault).toBeUndefined();

    const includeInvalidated = await search(graph, "cryptographic operations", {
      include_invalidated: true,
    });
    const edgeIncluded = includeInvalidated.find((r) => r.type === "edge");
    expect(edgeIncluded).toBeDefined();
  });

  test("hybrid mode with null provider returns same results as fulltext", async () => {
    seedGraph(graph);
    const ftResults = await search(graph, "database", { mode: "fulltext" });
    const hybridResults = await search(graph, "database", { mode: "hybrid" });
    // Both should return results with same IDs (order may differ slightly due to weights)
    const ftIds = new Set(ftResults.map((r) => r.id));
    const hybridIds = new Set(hybridResults.map((r) => r.id));
    expect(ftIds).toEqual(hybridIds);
  });

  test("search with NullProvider returns same results as FTS-only", async () => {
    seedGraph(graph);
    const { NullProvider } = await import("../../src/ai/index.js");
    const provider = new NullProvider();
    const ftsResults = await search(graph, "database");
    const withProviderResults = await search(graph, "database", { provider });
    // Same IDs (NullProvider provides no embeddings, so vector_score=0 for all)
    const ftsIds = new Set(ftsResults.map((r) => r.id));
    const providerIds = new Set(withProviderResults.map((r) => r.id));
    expect(ftsIds).toEqual(providerIds);
  });

  test("returns empty array for no matches", async () => {
    seedGraph(graph);
    const results = await search(graph, "xyznonexistentterm12345");
    expect(results).toEqual([]);
  });

  test("episode content is truncated to snippet", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: null,
      content: "A".repeat(500),
      timestamp: "2024-01-01T00:00:00Z",
    });

    const _entity = addEntity(
      graph,
      { canonical_name: "TruncationTest", entity_type: "test" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    // Search for content that exists in the long episode
    const results = await search(graph, "AAAAAAAAAA");
    const epResult = results.find((r) => r.type === "episode");
    if (epResult) {
      expect(epResult.content.length).toBeLessThanOrEqual(201); // 200 chars + ellipsis
    }
  });

  test("episode provenance is its own ID", async () => {
    seedGraph(graph);
    const results = await search(graph, "PostgreSQL");
    const epResult = results.find((r) => r.type === "episode");
    expect(epResult).toBeDefined();
    expect(epResult?.provenance).toEqual([epResult?.id]);
  });
});
