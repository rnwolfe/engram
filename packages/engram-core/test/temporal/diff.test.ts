/**
 * diff.test.ts — unit tests for diffGraph() algebra.
 *
 * Uses in-memory SQLite graphs with fixture data and controlled timestamps.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  diffGraph,
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

let episodeSeq = 0;

function makeEpisode(timestamp: string) {
  return addEpisode(graph, {
    source_type: "manual",
    source_ref: `ref-${++episodeSeq}`,
    content: "test episode",
    timestamp,
  });
}

function makeEntity(name: string, timestamp: string) {
  const ep = makeEpisode(timestamp);
  return addEntity(graph, { canonical_name: name, entity_type: "module" }, [
    { episode_id: ep.id, extractor: "test" },
  ]);
}

function makeEdge(
  sourceId: string,
  targetId: string,
  opts: {
    relation_type?: string;
    valid_from?: string;
    valid_until?: string;
    weight?: number;
    episodeTs?: string;
  } = {},
) {
  const ep = makeEpisode(opts.episodeTs ?? "2024-01-01T00:00:00Z");
  return addEdge(
    graph,
    {
      source_id: sourceId,
      target_id: targetId,
      relation_type: opts.relation_type ?? "depends_on",
      edge_kind: "observed",
      fact: `${sourceId} ${opts.relation_type ?? "depends_on"} ${targetId}`,
      valid_from: opts.valid_from,
      valid_until: opts.valid_until,
      weight: opts.weight ?? 1.0,
    },
    [{ episode_id: ep.id, extractor: "test" }],
  );
}

// ---------------------------------------------------------------------------
// Empty diff (same timestamps)
// ---------------------------------------------------------------------------

describe("diffGraph — same timestamps", () => {
  test("returns empty buckets when refA equals refB", () => {
    const ts = "2025-01-01T00:00:00Z";
    const result = diffGraph(graph, ts, ts);

    expect(result.edges.added).toHaveLength(0);
    expect(result.edges.invalidated).toHaveLength(0);
    expect(result.edges.superseded).toHaveLength(0);
    expect(result.edges.unchanged).toHaveLength(0);
    expect(result.projections.created).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Added edges
// ---------------------------------------------------------------------------

describe("diffGraph — added edges", () => {
  test("edge created between A and B appears in added", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    const tsA = "2024-01-15T00:00:00Z";
    const tsB = "2024-06-15T00:00:00Z";

    makeEdge(a.id, b.id, {
      valid_from: "2024-03-01T00:00:00Z",
      episodeTs: "2024-03-01T00:00:00Z",
    });

    const diff = diffGraph(graph, tsA, tsB);

    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.invalidated).toHaveLength(0);
    expect(diff.edges.unchanged).toHaveLength(0);
  });

  test("edge active before A remains in unchanged", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    makeEdge(a.id, b.id, {
      valid_from: "2023-01-01T00:00:00Z",
      episodeTs: "2023-01-01T00:00:00Z",
    });

    const tsA = "2024-01-15T00:00:00Z";
    const tsB = "2024-06-15T00:00:00Z";

    const diff = diffGraph(graph, tsA, tsB);

    expect(diff.edges.added).toHaveLength(0);
    expect(diff.edges.unchanged).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Invalidated edges
// ---------------------------------------------------------------------------

describe("diffGraph — invalidated edges", () => {
  test("edge invalidated between A and B appears in invalidated", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    const edge = makeEdge(a.id, b.id, {
      valid_from: "2023-01-01T00:00:00Z",
      episodeTs: "2023-01-01T00:00:00Z",
    });

    const tsA = "2024-01-15T00:00:00Z";
    const tsB = "2025-01-15T00:00:00Z";

    // Supersede the edge (creates new edge and invalidates old)
    const ep = makeEpisode("2024-06-01T00:00:00Z");
    supersedeEdge(
      graph,
      edge.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A still depends on B (v2)",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const diff = diffGraph(graph, tsA, tsB);

    // The old edge is superseded (has superseded_by set)
    expect(diff.edges.superseded).toHaveLength(1);
    expect(diff.edges.superseded[0].edge.id).toBe(edge.id);
    // The new edge is in added
    expect(diff.edges.added).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Superseded edges
// ---------------------------------------------------------------------------

describe("diffGraph — superseded edges", () => {
  test("superseded edge carries superseded_by reference", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    const v1 = makeEdge(a.id, b.id, {
      valid_from: "2023-01-01T00:00:00Z",
      episodeTs: "2023-01-01T00:00:00Z",
    });

    const ep = makeEpisode("2024-06-01T00:00:00Z");
    const result = supersedeEdge(
      graph,
      v1.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "v2",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const diff = diffGraph(
      graph,
      "2024-01-01T00:00:00Z",
      "2025-01-01T00:00:00Z",
    );

    expect(diff.edges.superseded).toHaveLength(1);
    expect(diff.edges.superseded[0].superseded_by).toBe(result.new.id);
  });
});

// ---------------------------------------------------------------------------
// Transient edges
// ---------------------------------------------------------------------------

describe("diffGraph — transient edges", () => {
  test("edge added and removed between A and B is placed in transient", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    const tsA = "2024-01-01T00:00:00Z";
    const tsB = "2025-01-01T00:00:00Z";

    // Edge created between A and B, then superseded before B
    const ep1 = makeEpisode("2024-03-01T00:00:00Z");
    const transientEdge = addEdge(
      graph,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "transient fact",
        valid_from: "2024-03-01T00:00:00Z",
      },
      [{ episode_id: ep1.id, extractor: "test" }],
    );

    const ep2 = makeEpisode("2024-06-01T00:00:00Z");
    supersedeEdge(
      graph,
      transientEdge.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "replacement fact",
        valid_from: "2024-06-01T00:00:00Z",
      },
      [{ episode_id: ep2.id, extractor: "test" }],
    );

    const diff = diffGraph(graph, tsA, tsB);

    // The transient edge (added and superseded between A and B) should be in transient
    expect(diff.edges.transient).toHaveLength(1);
    expect(diff.edges.transient[0].edge.id).toBe(transientEdge.id);
  });
});

// ---------------------------------------------------------------------------
// Filter: --kinds
// ---------------------------------------------------------------------------

describe("diffGraph — kinds filter", () => {
  test("kinds filter includes only matching relation types", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");

    const tsA = "2024-01-01T00:00:00Z";
    const tsB = "2025-01-01T00:00:00Z";

    makeEdge(a.id, b.id, {
      relation_type: "depends_on",
      valid_from: "2024-03-01T00:00:00Z",
      episodeTs: "2024-03-01T00:00:00Z",
    });
    makeEdge(a.id, b.id, {
      relation_type: "imports",
      valid_from: "2024-04-01T00:00:00Z",
      episodeTs: "2024-04-01T00:00:00Z",
    });

    const diff = diffGraph(graph, tsA, tsB, { kinds: ["imports"] });

    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.added[0].edge.relation_type).toBe("imports");
  });
});

// ---------------------------------------------------------------------------
// Filter: --entity
// ---------------------------------------------------------------------------

describe("diffGraph — entity filter", () => {
  test("entity filter scopes to edges involving the entity", () => {
    const a = makeEntity("A", "2024-01-01T00:00:00Z");
    const b = makeEntity("B", "2024-01-01T00:00:00Z");
    const c = makeEntity("C", "2024-01-01T00:00:00Z");

    const tsA = "2024-01-01T00:00:00Z";
    const tsB = "2025-01-01T00:00:00Z";

    makeEdge(a.id, b.id, {
      valid_from: "2024-03-01T00:00:00Z",
      episodeTs: "2024-03-01T00:00:00Z",
    });
    makeEdge(a.id, c.id, {
      valid_from: "2024-04-01T00:00:00Z",
      episodeTs: "2024-04-01T00:00:00Z",
    });

    // Scope to entity B only
    const diff = diffGraph(graph, tsA, tsB, { entityId: b.id });

    expect(diff.edges.added).toHaveLength(1);
    expect(
      diff.edges.added.every(
        (e) => e.edge.source_id === b.id || e.edge.target_id === b.id,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ownership shifts
// ---------------------------------------------------------------------------

describe("diffGraph — ownership shifts", () => {
  test("detects shift when likely_owner_of edge changes owner", () => {
    const owner1 = makeEntity("Owner1", "2024-01-01T00:00:00Z");
    const owner2 = makeEntity("Owner2", "2024-01-01T00:00:00Z");
    const module = makeEntity("moduleX", "2024-01-01T00:00:00Z");

    const tsA = "2024-01-01T00:00:00Z";
    const tsB = "2025-01-01T00:00:00Z";

    // Owner1 owns moduleX before tsA
    const ownerEdge = makeEdge(owner1.id, module.id, {
      relation_type: "likely_owner_of",
      valid_from: "2023-06-01T00:00:00Z",
      episodeTs: "2023-06-01T00:00:00Z",
      weight: 1.0,
    });

    // Supersede with Owner2 between A and B
    const ep = makeEpisode("2024-06-01T00:00:00Z");
    supersedeEdge(
      graph,
      ownerEdge.id,
      {
        source_id: owner2.id,
        target_id: module.id,
        relation_type: "likely_owner_of",
        edge_kind: "observed",
        fact: "Owner2 likely_owner_of moduleX",
        valid_from: "2024-06-01T00:00:00Z",
        weight: 1.0,
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const diff = diffGraph(graph, tsA, tsB);

    expect(diff.ownership_shifts).toHaveLength(1);
    expect(diff.ownership_shifts[0].entity_id).toBe(module.id);
    expect(diff.ownership_shifts[0].from_owner_id).toBe(owner1.id);
    expect(diff.ownership_shifts[0].to_owner_id).toBe(owner2.id);
  });

  test("no ownership shift when owner is unchanged", () => {
    const owner = makeEntity("Owner", "2024-01-01T00:00:00Z");
    const module = makeEntity("moduleY", "2024-01-01T00:00:00Z");

    makeEdge(owner.id, module.id, {
      relation_type: "likely_owner_of",
      valid_from: "2023-01-01T00:00:00Z",
      episodeTs: "2023-01-01T00:00:00Z",
    });

    const diff = diffGraph(
      graph,
      "2024-01-01T00:00:00Z",
      "2025-01-01T00:00:00Z",
    );

    expect(diff.ownership_shifts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Decision reversals
// ---------------------------------------------------------------------------

describe("diffGraph — decision reversals", () => {
  test("superseded decision_page projection appears in decision_reversals", () => {
    // Directly insert a projection since project() requires AI generator
    const now = "2024-01-01T00:00:00Z";
    const later = "2024-06-01T00:00:00Z";

    graph.db.run(
      `INSERT INTO projections
        (id, kind, anchor_type, anchor_id, title, body, body_format, model,
         input_fingerprint, confidence, valid_from, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "proj_1",
      "decision_page",
      "none",
      null,
      "some decision title",
      "body text",
      "markdown",
      "null",
      "fp1",
      1.0,
      now,
      now,
    );

    // Supersede it
    graph.db.run(
      `INSERT INTO projections
        (id, kind, anchor_type, anchor_id, title, body, body_format, model,
         input_fingerprint, confidence, valid_from, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "proj_2",
      "decision_page",
      "none",
      null,
      "some decision title v2",
      "body text v2",
      "markdown",
      "null",
      "fp2",
      1.0,
      later,
      later,
    );

    graph.db.run(
      `UPDATE projections SET invalidated_at = ?, superseded_by = ? WHERE id = ?`,
      later,
      "proj_2",
      "proj_1",
    );

    const diff = diffGraph(
      graph,
      "2024-01-15T00:00:00Z",
      "2024-12-01T00:00:00Z",
    );

    expect(diff.decision_reversals).toHaveLength(1);
    expect(diff.decision_reversals[0].projection_id).toBe("proj_1");
    expect(diff.decision_reversals[0].title).toBe("some decision title");
  });
});

// ---------------------------------------------------------------------------
// JSON schema shape
// ---------------------------------------------------------------------------

describe("diffGraph — JSON schema", () => {
  test("result has expected top-level keys", () => {
    const diff = diffGraph(
      graph,
      "2024-01-01T00:00:00Z",
      "2025-01-01T00:00:00Z",
    );

    expect(diff).toHaveProperty("refA");
    expect(diff).toHaveProperty("refB");
    expect(diff).toHaveProperty("edges");
    expect(diff.edges).toHaveProperty("added");
    expect(diff.edges).toHaveProperty("invalidated");
    expect(diff.edges).toHaveProperty("superseded");
    expect(diff.edges).toHaveProperty("unchanged");
    expect(diff.edges).toHaveProperty("transient");
    expect(diff).toHaveProperty("projections");
    expect(diff.projections).toHaveProperty("created");
    expect(diff.projections).toHaveProperty("superseded");
    expect(diff.projections).toHaveProperty("invalidated");
    expect(diff).toHaveProperty("ownership_shifts");
    expect(diff).toHaveProperty("decision_reversals");
  });
});
