/**
 * traversal.test.ts — tests for graph traversal and temporal snapshots.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  EntityNotFoundError,
  getNeighbors,
  getPath,
  getSnapshot,
} from "../../src/index.js";

let graph: EngramGraph;

// Shared evidence for tests.
const makeEvidence = (episodeId: string) => [
  { episode_id: episodeId, extractor: "test", confidence: 1.0 },
];

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function seedEpisode() {
  return addEpisode(graph, {
    source_type: "manual",
    source_ref: `ref-${Date.now()}-${Math.random()}`,
    content: "test episode",
    timestamp: "2024-01-01T00:00:00Z",
  });
}

function seedEntity(name: string, episodeId: string) {
  return addEntity(
    graph,
    { canonical_name: name, entity_type: "module" },
    makeEvidence(episodeId),
  );
}

function seedEdge(
  sourceId: string,
  targetId: string,
  episodeId: string,
  opts: {
    relation_type?: string;
    edge_kind?: string;
    valid_from?: string;
    valid_until?: string;
  } = {},
) {
  return addEdge(
    graph,
    {
      source_id: sourceId,
      target_id: targetId,
      relation_type: opts.relation_type ?? "depends_on",
      edge_kind: opts.edge_kind ?? "observed",
      fact: `${sourceId} depends on ${targetId}`,
      valid_from: opts.valid_from,
      valid_until: opts.valid_until,
    },
    makeEvidence(episodeId),
  );
}

// ---------------------------------------------------------------------------
// getNeighbors
// ---------------------------------------------------------------------------

describe("getNeighbors", () => {
  test("throws EntityNotFoundError for unknown entity", () => {
    expect(() => getNeighbors(graph, "nonexistent")).toThrow(
      EntityNotFoundError,
    );
  });

  test("returns only start entity when no edges", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);

    const result = getNeighbors(graph, a.id);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].id).toBe(a.id);
    expect(result.edges).toHaveLength(0);
  });

  test("returns direct neighbors at depth 1 (default)", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    const e1 = seedEdge(a.id, b.id, ep.id);
    const e2 = seedEdge(a.id, c.id, ep.id);

    const result = getNeighbors(graph, a.id);

    const entityIds = result.entities.map((e) => e.id).sort();
    expect(entityIds).toEqual([a.id, b.id, c.id].sort());

    const edgeIds = result.edges.map((e) => e.id).sort();
    expect(edgeIds).toEqual([e1.id, e2.id].sort());
  });

  test("depth 2 includes transitive neighbors", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    seedEdge(a.id, b.id, ep.id);
    seedEdge(b.id, c.id, ep.id);

    const result = getNeighbors(graph, a.id, { depth: 2 });

    const entityIds = result.entities.map((e) => e.id).sort();
    expect(entityIds).toEqual([a.id, b.id, c.id].sort());
    expect(result.edges).toHaveLength(2);
  });

  test("depth 1 does not include transitive neighbors", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    seedEdge(a.id, b.id, ep.id);
    seedEdge(b.id, c.id, ep.id);

    const result = getNeighbors(graph, a.id, { depth: 1 });

    const entityIds = result.entities.map((e) => e.id);
    expect(entityIds).not.toContain(c.id);
    expect(result.edges).toHaveLength(1);
  });

  test("direction outbound filters inbound edges", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    const outEdge = seedEdge(a.id, b.id, ep.id); // outbound from a
    seedEdge(c.id, a.id, ep.id); // inbound to a

    const result = getNeighbors(graph, a.id, { direction: "outbound" });

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain(outEdge.id);
    expect(edgeIds).toHaveLength(1);

    const entityIds = result.entities.map((e) => e.id);
    expect(entityIds).toContain(b.id);
    expect(entityIds).not.toContain(c.id);
  });

  test("direction inbound filters outbound edges", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    seedEdge(a.id, b.id, ep.id); // outbound from a
    const inEdge = seedEdge(c.id, a.id, ep.id); // inbound to a

    const result = getNeighbors(graph, a.id, { direction: "inbound" });

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toContain(inEdge.id);
    expect(edgeIds).toHaveLength(1);
  });

  test("edge_kinds filter excludes non-matching edges", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    const obsEdge = seedEdge(a.id, b.id, ep.id, { edge_kind: "observed" });
    seedEdge(a.id, c.id, ep.id, { edge_kind: "inferred" });

    const result = getNeighbors(graph, a.id, { edge_kinds: ["observed"] });

    const edgeIds = result.edges.map((e) => e.id);
    expect(edgeIds).toEqual([obsEdge.id]);

    const entityIds = result.entities.map((e) => e.id);
    expect(entityIds).toContain(b.id);
    expect(entityIds).not.toContain(c.id);
  });

  test("valid_at filters out edges outside validity window", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    // Edge valid 2024-01 only
    seedEdge(a.id, b.id, ep.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-02-01T00:00:00Z",
    });

    // Query at 2025 — edge should not be included
    const result = getNeighbors(graph, a.id, {
      valid_at: "2025-01-01T00:00:00Z",
    });

    expect(result.edges).toHaveLength(0);
    expect(result.entities).toHaveLength(1); // only start
  });

  test("deduplicates entities and edges when multiple paths exist", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    // A -> B and A -> C -> B (at depth 2, B appears via two paths)
    seedEdge(a.id, b.id, ep.id);
    seedEdge(a.id, c.id, ep.id);
    seedEdge(c.id, b.id, ep.id);

    const result = getNeighbors(graph, a.id, { depth: 2 });

    const entityIds = result.entities.map((e) => e.id);
    const uniqueEntityIds = [...new Set(entityIds)];
    expect(entityIds).toHaveLength(uniqueEntityIds.length);
  });
});

// ---------------------------------------------------------------------------
// getPath
// ---------------------------------------------------------------------------

describe("getPath", () => {
  test("throws EntityNotFoundError for unknown from_id", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    expect(() => getPath(graph, "nonexistent", a.id)).toThrow(
      EntityNotFoundError,
    );
  });

  test("throws EntityNotFoundError for unknown to_id", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    expect(() => getPath(graph, a.id, "nonexistent")).toThrow(
      EntityNotFoundError,
    );
  });

  test("trivial path: from and to are the same entity", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);

    const result = getPath(graph, a.id, a.id);

    expect(result.found).toBe(true);
    expect(result.entities).toHaveLength(1);
    expect(result.edges).toHaveLength(0);
    expect(result.length).toBe(0);
  });

  test("returns not found when no path exists", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    // No edges between a and b
    const result = getPath(graph, a.id, b.id);

    expect(result.found).toBe(false);
    expect(result.entities).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.length).toBe(0);
  });

  test("finds direct path (1 hop)", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    const edge = seedEdge(a.id, b.id, ep.id);

    const result = getPath(graph, a.id, b.id);

    expect(result.found).toBe(true);
    expect(result.length).toBe(1);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe(edge.id);
    expect(result.entities.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  test("finds multi-hop path", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);

    seedEdge(a.id, b.id, ep.id);
    seedEdge(b.id, c.id, ep.id);

    const result = getPath(graph, a.id, c.id);

    expect(result.found).toBe(true);
    expect(result.length).toBe(2);
    expect(result.entities).toHaveLength(3);
    expect(result.entities[0].id).toBe(a.id);
    expect(result.entities[result.entities.length - 1].id).toBe(c.id);
  });

  test("returns shortest path when multiple routes exist", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);
    const d = seedEntity("D", ep.id);

    // Short path: A -> D (1 hop)
    seedEdge(a.id, d.id, ep.id);
    // Long path: A -> B -> C -> D (3 hops)
    seedEdge(a.id, b.id, ep.id);
    seedEdge(b.id, c.id, ep.id);
    seedEdge(c.id, d.id, ep.id);

    const result = getPath(graph, a.id, d.id);

    expect(result.found).toBe(true);
    expect(result.length).toBe(1);
  });

  test("traverses inbound edges when direction is both", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    // Edge goes B -> A (inbound to A)
    const edge = seedEdge(b.id, a.id, ep.id);

    // BFS from A should still reach B via the inbound edge
    const result = getPath(graph, a.id, b.id);

    expect(result.found).toBe(true);
    expect(result.edges[0].id).toBe(edge.id);
  });
});

// ---------------------------------------------------------------------------
// getSnapshot
// ---------------------------------------------------------------------------

describe("getSnapshot", () => {
  test("returns all active entities", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    const snap = getSnapshot(graph, "2025-01-01T00:00:00Z");

    const ids = snap.entities.map((e) => e.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  test("includes edges valid at the given timestamp", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    const edge = seedEdge(a.id, b.id, ep.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2026-01-01T00:00:00Z",
    });

    const snap = getSnapshot(graph, "2025-01-01T00:00:00Z");

    expect(snap.at).toBe("2025-01-01T00:00:00Z");
    const edgeIds = snap.edges.map((e) => e.id);
    expect(edgeIds).toContain(edge.id);
  });

  test("excludes edges not valid at the given timestamp", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    seedEdge(a.id, b.id, ep.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    });

    const snap = getSnapshot(graph, "2025-01-01T00:00:00Z");

    expect(snap.edges).toHaveLength(0);
  });

  test("includes edges with null validity bounds (always current)", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    const edge = seedEdge(a.id, b.id, ep.id); // no valid_from or valid_until

    const snap = getSnapshot(graph, "2025-01-01T00:00:00Z");

    const edgeIds = snap.edges.map((e) => e.id);
    expect(edgeIds).toContain(edge.id);
  });

  test("excludes invalidated edges", () => {
    const ep = seedEpisode();
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);

    const edge = addEdge(
      graph,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A depends on B",
      },
      makeEvidence(ep.id),
    );

    // Manually invalidate the edge
    graph.db
      .query("UPDATE edges SET invalidated_at = ? WHERE id = ?")
      .run("2024-06-01T00:00:00Z", edge.id);

    const snap = getSnapshot(graph, "2025-01-01T00:00:00Z");

    const edgeIds = snap.edges.map((e) => e.id);
    expect(edgeIds).not.toContain(edge.id);
  });

  test("returns snapshot at queried timestamp", () => {
    const ep = seedEpisode();
    seedEntity("A", ep.id);

    const snap = getSnapshot(graph, "2023-06-15T12:00:00Z");
    expect(snap.at).toBe("2023-06-15T12:00:00Z");
  });
});
