/**
 * temporal.test.ts — tests for the temporal engine: validity windows, supersession,
 * history, and temporal findEdges filters.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Edge, EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  checkActiveEdgeConflict,
  closeGraph,
  createGraph,
  findEdges,
  getEdge,
  getFactHistory,
  supersedeEdge,
} from "../../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

function makeEpisode() {
  return addEpisode(graph, {
    source_type: "manual",
    source_ref: `ref-${Math.random()}`,
    content: "test episode",
    timestamp: new Date().toISOString(),
  });
}

function makeEntity(name: string) {
  const ep = makeEpisode();
  return addEntity(graph, { canonical_name: name, entity_type: "module" }, [
    { episode_id: ep.id, extractor: "test" },
  ]);
}

function makeEdge(
  sourceId: string,
  targetId: string,
  opts: {
    valid_from?: string | null;
    valid_until?: string | null;
    relation_type?: string;
    edge_kind?: string;
  } = {},
): Edge {
  const ep = makeEpisode();
  return addEdge(
    graph,
    {
      source_id: sourceId,
      target_id: targetId,
      relation_type: opts.relation_type ?? "depends_on",
      edge_kind: opts.edge_kind ?? "observed",
      fact: "A depends on B",
      valid_from: opts.valid_from === null ? undefined : opts.valid_from,
      valid_until: opts.valid_until === null ? undefined : opts.valid_until,
    },
    [{ episode_id: ep.id, extractor: "test" }],
  );
}

// ---------------------------------------------------------------------------
// supersedeEdge
// ---------------------------------------------------------------------------

describe("supersedeEdge", () => {
  test("atomically invalidates old edge and creates new edge", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
    });
    const ep = makeEpisode();

    const result = supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A still depends on B (updated)",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    // Old edge should be invalidated
    expect(result.old.invalidated_at).not.toBeNull();
    expect(result.old.superseded_by).toBe(result.new.id);
    // Old valid_until should equal new valid_from (no gap)
    expect(result.old.valid_until).toBe("2024-06-01T00:00:00Z");

    // New edge should be active
    expect(result.new.invalidated_at).toBeNull();
    expect(result.new.valid_from).toBe("2024-06-01T00:00:00Z");
  });

  test("old valid_until = now when new edge has no valid_from", () => {
    const before = new Date().toISOString();
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id);
    const ep = makeEpisode();

    const result = supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "updated fact",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const after = new Date().toISOString();
    const validUntil = result.old.valid_until;
    expect(validUntil).not.toBeNull();
    // valid_until should be between before and after (i.e. "now")
    expect(validUntil != null && validUntil >= before).toBe(true);
    expect(validUntil != null && validUntil <= after).toBe(true);
  });

  test("throws EdgeNotFoundError for unknown edge", () => {
    const ep = makeEpisode();
    expect(() =>
      supersedeEdge(
        graph,
        "nonexistent-id",
        {
          source_id: "a",
          target_id: "b",
          relation_type: "r",
          edge_kind: "observed",
          fact: "f",
        },
        [{ episode_id: ep.id, extractor: "test" }],
      ),
    ).toThrow("edge not found");
  });

  test("throws when edge is already superseded", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
    });
    const ep1 = makeEpisode();

    const _first = supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "second version",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep1.id, extractor: "test" }],
    );

    const ep2 = makeEpisode();
    expect(() =>
      supersedeEdge(
        graph,
        old.id,
        {
          source_id: src.id,
          target_id: tgt.id,
          relation_type: "depends_on",
          edge_kind: "observed",
          fact: "third version",
          valid_from: "2024-09-01T00:00:00Z",
        },
        [{ episode_id: ep2.id, extractor: "test" }],
      ),
    ).toThrow("already superseded");
  });

  test("supersession chain: old → mid → new", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const v1 = makeEdge(src.id, tgt.id, { valid_from: "2024-01-01T00:00:00Z" });
    const ep2 = makeEpisode();

    const r1 = supersedeEdge(
      graph,
      v1.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "v2",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep2.id, extractor: "test" }],
    );

    const ep3 = makeEpisode();
    const r2 = supersedeEdge(
      graph,
      r1.new.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "v3",
        valid_from: "2025-01-01T00:00:00Z",
      },
      [{ episode_id: ep3.id, extractor: "test" }],
    );

    // v1 superseded by v2
    const fetchedV1 = getEdge(graph, v1.id);
    expect(fetchedV1?.superseded_by).toBe(r1.new.id);
    expect(fetchedV1?.valid_until).toBe("2024-06-01T00:00:00Z");

    // v2 superseded by v3
    const fetchedV2 = getEdge(graph, r1.new.id);
    expect(fetchedV2?.superseded_by).toBe(r2.new.id);
    expect(fetchedV2?.valid_until).toBe("2025-01-01T00:00:00Z");

    // v3 still active
    expect(r2.new.invalidated_at).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkActiveEdgeConflict
// ---------------------------------------------------------------------------

describe("checkActiveEdgeConflict", () => {
  test("detects conflict with open-ended active edge (NULL valid_until)", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, { valid_from: "2024-01-01T00:00:00Z" }); // valid_until = NULL

    const conflict = checkActiveEdgeConflict(
      graph,
      src.id,
      tgt.id,
      "depends_on",
      "observed",
      "2024-06-01T00:00:00Z",
      null,
    );

    expect(conflict).not.toBeNull();
  });

  test("no conflict when windows are adjacent (no overlap)", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    });

    const conflict = checkActiveEdgeConflict(
      graph,
      src.id,
      tgt.id,
      "depends_on",
      "observed",
      "2024-06-01T00:00:00Z", // starts exactly when old one ends — half-open so no overlap
      null,
    );

    expect(conflict).toBeNull();
  });

  test("no conflict when windows are fully disjoint", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-03-01T00:00:00Z",
    });

    const conflict = checkActiveEdgeConflict(
      graph,
      src.id,
      tgt.id,
      "depends_on",
      "observed",
      "2024-06-01T00:00:00Z",
      "2024-09-01T00:00:00Z",
    );

    expect(conflict).toBeNull();
  });

  test("no conflict with different relation_type", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
      relation_type: "imports",
    });

    const conflict = checkActiveEdgeConflict(
      graph,
      src.id,
      tgt.id,
      "depends_on",
      "observed",
      "2024-01-01T00:00:00Z",
      null,
    );

    expect(conflict).toBeNull();
  });

  test("does not detect conflict for invalidated edges", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
    });
    const ep = makeEpisode();

    supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "new version",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    // The old (now-invalidated) edge should not cause a conflict
    const conflict = checkActiveEdgeConflict(
      graph,
      src.id,
      tgt.id,
      "depends_on",
      "observed",
      "2024-01-01T00:00:00Z",
      "2024-05-01T00:00:00Z",
    );

    // The active edge (v2, valid from 2024-06-01) should not overlap with 2024-01 to 2024-05
    expect(conflict).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getFactHistory
// ---------------------------------------------------------------------------

describe("getFactHistory", () => {
  test("returns all edges (active + invalidated) in chronological order", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const v1 = makeEdge(src.id, tgt.id, { valid_from: "2024-01-01T00:00:00Z" });
    const ep2 = makeEpisode();

    const r1 = supersedeEdge(
      graph,
      v1.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "v2",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep2.id, extractor: "test" }],
    );

    const history = getFactHistory(graph, src.id, tgt.id);

    expect(history.length).toBe(2);
    // v1 comes first (earlier valid_from)
    expect(history[0].id).toBe(v1.id);
    expect(history[1].id).toBe(r1.new.id);
  });

  test("returns empty array when no edges exist", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const history = getFactHistory(graph, src.id, tgt.id);
    expect(history).toEqual([]);
  });

  test("history includes only edges between the requested pair", () => {
    const a = makeEntity("A");
    const b = makeEntity("B");
    const c = makeEntity("C");

    makeEdge(a.id, b.id, { valid_from: "2024-01-01T00:00:00Z" });
    makeEdge(a.id, c.id, { valid_from: "2024-03-01T00:00:00Z" });

    const history = getFactHistory(graph, a.id, b.id);
    expect(history.length).toBe(1);
    expect(history[0].target_id).toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// findEdges — valid_at and include_invalidated filters
// ---------------------------------------------------------------------------

describe("findEdges temporal filters", () => {
  test("valid_at returns only edges valid at that timestamp", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    });
    makeEdge(src.id, tgt.id, {
      valid_from: "2024-06-01T00:00:00Z",
      valid_until: "2025-01-01T00:00:00Z",
      relation_type: "imports",
    });

    const janEdges = findEdges(graph, {
      source_id: src.id,
      valid_at: "2024-03-01T00:00:00Z",
      include_invalidated: true,
    });
    expect(janEdges.length).toBe(1);
    expect(janEdges[0].relation_type).toBe("depends_on");

    const julyEdges = findEdges(graph, {
      source_id: src.id,
      valid_at: "2024-07-01T00:00:00Z",
      include_invalidated: true,
    });
    expect(julyEdges.length).toBe(1);
    expect(julyEdges[0].relation_type).toBe("imports");
  });

  test("valid_at with NULL valid_from (open start) includes the edge", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id); // NULL valid_from, NULL valid_until

    const edges = findEdges(graph, {
      source_id: src.id,
      valid_at: "2020-01-01T00:00:00Z",
      include_invalidated: true,
    });
    expect(edges.length).toBe(1);
  });

  test("valid_at with NULL valid_until (still current) includes the edge", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, { valid_from: "2024-01-01T00:00:00Z" }); // valid_until = NULL

    const edges = findEdges(graph, {
      source_id: src.id,
      valid_at: "2030-01-01T00:00:00Z",
      include_invalidated: true,
    });
    expect(edges.length).toBe(1);
  });

  test("valid_at excludes edge whose valid_until equals the timestamp (half-open)", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    });

    // Exactly at valid_until → NOT valid (half-open [valid_from, valid_until))
    const edges = findEdges(graph, {
      source_id: src.id,
      valid_at: "2024-06-01T00:00:00Z",
      include_invalidated: true,
    });
    expect(edges.length).toBe(0);
  });

  test("include_invalidated: false (default) excludes invalidated edges", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
    });
    const ep = makeEpisode();

    supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "new",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const activeEdges = findEdges(graph, { source_id: src.id });
    expect(activeEdges.length).toBe(1);
    expect(activeEdges[0].invalidated_at).toBeNull();
  });

  test("include_invalidated: true returns all edges including invalidated", () => {
    const src = makeEntity("A");
    const tgt = makeEntity("B");

    const old = makeEdge(src.id, tgt.id, {
      valid_from: "2024-01-01T00:00:00Z",
    });
    const ep = makeEpisode();

    supersedeEdge(
      graph,
      old.id,
      {
        source_id: src.id,
        target_id: tgt.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "new",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const allEdges = findEdges(graph, {
      source_id: src.id,
      include_invalidated: true,
    });
    expect(allEdges.length).toBe(2);
  });
});
