/**
 * as-of-edges.test.ts — integration tests for the learn-time edge predicate.
 *
 * Builds a small in-memory graph, invalidates edges at specific times, and
 * verifies that asOf queries return the correct snapshot.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  findEdges,
} from "../../src/index.js";

let graph: EngramGraph;

// Helper to insert an edge with a backdated created_at for testing.
function addEdgeAt(
  g: EngramGraph,
  params: {
    source_id: string;
    target_id: string;
    fact: string;
    createdAt: string;
    invalidatedAt?: string;
  },
): string {
  const ep = addEpisode(g, {
    source_type: "git_commit",
    source_ref: `ref-${Math.random().toString(36).slice(2)}`,
    content: params.fact,
    timestamp: params.createdAt,
  });

  const edge = addEdge(
    g,
    {
      source_id: params.source_id,
      target_id: params.target_id,
      relation_type: "co_changes_with",
      edge_kind: "observed",
      fact: params.fact,
    },
    [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
  );

  // Backdate the created_at and optionally set invalidated_at directly in SQL
  // (the API always uses NOW, so we patch it for testing).
  g.db
    .prepare("UPDATE edges SET created_at = ? WHERE id = ?")
    .run(params.createdAt, edge.id);

  if (params.invalidatedAt) {
    g.db
      .prepare(
        "UPDATE edges SET invalidated_at = ?, valid_until = ? WHERE id = ?",
      )
      .run(params.invalidatedAt, params.invalidatedAt, edge.id);
  }

  return edge.id;
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// Build shared entity pair
function makeEntities(g: EngramGraph): { src: string; tgt: string } {
  const ep = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "init",
    content: "init",
    timestamp: "2025-01-01T00:00:00Z",
  });
  const src = addEntity(
    g,
    {
      canonical_name: "src-module",
      entity_type: "module",
      summary: "source",
    },
    [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
  );
  const tgt = addEntity(
    g,
    {
      canonical_name: "tgt-module",
      entity_type: "module",
      summary: "target",
    },
    [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
  );
  return { src: src.id, tgt: tgt.id };
}

// ---------------------------------------------------------------------------
// Learn-time filter: asOf
// ---------------------------------------------------------------------------
describe("findEdges asOf — learn-time filter", () => {
  test("edge created before T is visible at T", () => {
    const { src, tgt } = makeEntities(graph);
    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "edge before T",
      createdAt: "2025-06-01T00:00:00Z",
    });

    const results = findEdges(graph, { asOf: "2025-12-01T00:00:00Z" });
    expect(results.some((e) => e.fact === "edge before T")).toBe(true);
  });

  test("edge created after T is NOT visible at T", () => {
    const { src, tgt } = makeEntities(graph);
    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "edge after T",
      createdAt: "2026-02-01T00:00:00Z",
    });

    const results = findEdges(graph, { asOf: "2025-12-01T00:00:00Z" });
    expect(results.some((e) => e.fact === "edge after T")).toBe(false);
  });

  test("edge invalidated after T is still visible at T", () => {
    const { src, tgt } = makeEntities(graph);
    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "edge invalidated after T",
      createdAt: "2025-01-01T00:00:00Z",
      invalidatedAt: "2026-06-01T00:00:00Z",
    });

    const results = findEdges(graph, { asOf: "2025-12-01T00:00:00Z" });
    expect(results.some((e) => e.fact === "edge invalidated after T")).toBe(
      true,
    );
  });

  test("edge invalidated before T is NOT visible at T", () => {
    const { src, tgt } = makeEntities(graph);
    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "edge invalidated before T",
      createdAt: "2025-01-01T00:00:00Z",
      invalidatedAt: "2025-06-01T00:00:00Z",
    });

    const results = findEdges(graph, { asOf: "2025-12-01T00:00:00Z" });
    expect(results.some((e) => e.fact === "edge invalidated before T")).toBe(
      false,
    );
  });

  test("without asOf, invalidated edges are excluded (default behaviour)", () => {
    const { src, tgt } = makeEntities(graph);
    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "edge invalidated",
      createdAt: "2025-01-01T00:00:00Z",
      invalidatedAt: "2025-06-01T00:00:00Z",
    });

    const results = findEdges(graph, {});
    expect(results.some((e) => e.fact === "edge invalidated")).toBe(false);
  });

  test("valid_until does not affect visibility in asOf filter", () => {
    // An edge with valid_until < T should still appear if learn-time predicate passes.
    const { src, tgt } = makeEntities(graph);
    const ep = addEpisode(graph, {
      source_type: "git_commit",
      source_ref: "ref-valid-until",
      content: "edge with past valid_until",
      timestamp: "2025-01-01T00:00:00Z",
    });
    const edge = addEdge(
      graph,
      {
        source_id: src,
        target_id: tgt,
        relation_type: "co_changes_with",
        edge_kind: "observed",
        fact: "edge with past valid_until",
        valid_from: "2024-01-01T00:00:00Z",
        valid_until: "2025-06-01T00:00:00Z", // expires before T
      },
      [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
    );
    graph.db
      .prepare("UPDATE edges SET created_at = ? WHERE id = ?")
      .run("2025-01-01T00:00:00Z", edge.id);

    // At T = 2025-12-01, the edge is still learned (created_at <= T, not invalidated).
    const results = findEdges(graph, { asOf: "2025-12-01T00:00:00Z" });
    expect(results.some((e) => e.fact === "edge with past valid_until")).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Integration scenario: supersession
// ---------------------------------------------------------------------------
describe("asOf with superseded edges", () => {
  test("before supersession: old edge visible, new edge absent", () => {
    const { src, tgt } = makeEntities(graph);

    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "original fact",
      createdAt: "2025-01-01T00:00:00Z",
      invalidatedAt: "2025-10-01T00:00:00Z", // superseded at T2
    });

    addEdgeAt(graph, {
      source_id: src,
      target_id: tgt,
      fact: "replacement fact",
      createdAt: "2025-10-01T00:00:00Z", // created at T2
    });

    // Query before T2
    const before = findEdges(graph, { asOf: "2025-09-01T00:00:00Z" });
    expect(before.some((e) => e.fact === "original fact")).toBe(true);
    expect(before.some((e) => e.fact === "replacement fact")).toBe(false);

    // Query after T2 (current)
    const after = findEdges(graph, {});
    expect(after.some((e) => e.fact === "original fact")).toBe(false);
    expect(after.some((e) => e.fact === "replacement fact")).toBe(true);
  });
});
