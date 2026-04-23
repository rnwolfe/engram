/**
 * diff.integration.test.ts — integration tests for diffGraph() with realistic graph state.
 *
 * Simulates a sequence of ownership-change commits:
 *   1. Entity X owned by Owner A (time T1)
 *   2. Ownership reattributed to Owner B (time T2)
 * Verifies that diffGraph(T0, T3) yields an ownership_shift for entity X.
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
import { RELATION_TYPES } from "../../src/vocab/index.js";

let graph: EngramGraph;
let seq = 0;

beforeEach(() => {
  graph = createGraph(":memory:");
  seq = 0;
});

afterEach(() => {
  closeGraph(graph);
});

function makeEpisode(ts: string) {
  return addEpisode(graph, {
    source_type: "git",
    source_ref: `commit-${++seq}`,
    content: `commit at ${ts}`,
    timestamp: ts,
  });
}

function makeEntity(name: string, ts: string) {
  const ep = makeEpisode(ts);
  return addEntity(graph, { canonical_name: name, entity_type: "person" }, [
    { episode_id: ep.id, extractor: "git_blame" },
  ]);
}

function makeModuleEntity(name: string, ts: string) {
  const ep = makeEpisode(ts);
  return addEntity(graph, { canonical_name: name, entity_type: "module" }, [
    { episode_id: ep.id, extractor: "git_blame" },
  ]);
}

// ---------------------------------------------------------------------------
// Integration: ownership shift via conflicting owns edges
// ---------------------------------------------------------------------------

describe("diffGraph integration — ownership shift", () => {
  test("reports ownership_shift when likely_owner_of edge changes between A and B", () => {
    const T1 = "2024-03-01T00:00:00Z";
    const T2 = "2024-09-01T00:00:00Z";

    // Snapshot A is after T1 (Alice already owns the module)
    const snapshotA = "2024-05-01T00:00:00Z";
    // Snapshot B is after T2 (Bob now owns the module)
    const snapshotB = "2024-12-01T00:00:00Z";

    const ownerA = makeEntity("Alice", T1);
    const ownerB = makeEntity("Bob", T1);
    const module = makeModuleEntity("packages/core", T1);

    // T1: Alice owns packages/core
    const ep1 = makeEpisode(T1);
    const ownershipEdge = addEdge(
      graph,
      {
        source_id: ownerA.id,
        target_id: module.id,
        relation_type: RELATION_TYPES.LIKELY_OWNER_OF,
        edge_kind: "inferred",
        fact: "Alice likely_owner_of packages/core",
        valid_from: T1,
        weight: 1.5,
      },
      [{ episode_id: ep1.id, extractor: "git_blame" }],
    );

    // T2: Bob takes over — supersede Alice's ownership edge
    const ep2 = makeEpisode(T2);
    const supersessionResult = supersedeEdge(
      graph,
      ownershipEdge.id,
      {
        source_id: ownerB.id,
        target_id: module.id,
        relation_type: RELATION_TYPES.LIKELY_OWNER_OF,
        edge_kind: "inferred",
        fact: "Bob likely_owner_of packages/core",
        valid_from: T2,
        weight: 1.5,
      },
      [{ episode_id: ep2.id, extractor: "git_blame" }],
    );

    // Diff from snapshotA (Alice owns) to snapshotB (Bob owns)
    const diff = diffGraph(graph, snapshotA, snapshotB);

    expect(diff.ownership_shifts).toHaveLength(1);

    const shift = diff.ownership_shifts[0];
    expect(shift.entity_id).toBe(module.id);
    expect(shift.entity_name).toBe("packages/core");
    expect(shift.from_owner_id).toBe(ownerA.id);
    expect(shift.from_owner_name).toBe("Alice");
    expect(shift.to_owner_id).toBe(ownerB.id);
    expect(shift.to_owner_name).toBe("Bob");

    // The superseded ownership edge appears in diff.edges.superseded
    expect(
      diff.edges.superseded.some((e) => e.edge.id === ownershipEdge.id),
    ).toBe(true);

    // The new ownership edge appears in diff.edges.added
    expect(
      diff.edges.added.some((e) => e.edge.id === supersessionResult.new.id),
    ).toBe(true);
  });

  test("no ownership shift when ownership is stable across the diff window", () => {
    const T0 = "2024-01-01T00:00:00Z";
    const T1 = "2023-06-01T00:00:00Z"; // before T0
    const T3 = "2025-01-01T00:00:00Z";

    const ownerA = makeEntity("Alice", T1);
    const module = makeModuleEntity("packages/stable", T1);

    const ep = makeEpisode(T1);
    addEdge(
      graph,
      {
        source_id: ownerA.id,
        target_id: module.id,
        relation_type: RELATION_TYPES.LIKELY_OWNER_OF,
        edge_kind: "inferred",
        fact: "Alice likely_owner_of packages/stable",
        valid_from: T1,
        weight: 1.0,
      },
      [{ episode_id: ep.id, extractor: "git_blame" }],
    );

    const diff = diffGraph(graph, T0, T3);

    expect(diff.ownership_shifts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: new entity appears mid-window
// ---------------------------------------------------------------------------

describe("diffGraph integration — entity/edge creation", () => {
  test("edges created in the diff window are in added bucket", () => {
    const T0 = "2024-01-01T00:00:00Z";
    const T1 = "2024-06-01T00:00:00Z";
    const T2 = "2025-01-01T00:00:00Z";

    const modA = makeModuleEntity("packages/a", T1);
    const modB = makeModuleEntity("packages/b", T1);

    const ep = makeEpisode(T1);
    addEdge(
      graph,
      {
        source_id: modA.id,
        target_id: modB.id,
        relation_type: "co_changes_with",
        edge_kind: "inferred",
        fact: "packages/a co_changes_with packages/b",
        valid_from: T1,
        weight: 0.8,
      },
      [{ episode_id: ep.id, extractor: "co_change" }],
    );

    const diff = diffGraph(graph, T0, T2);

    expect(diff.edges.added).toHaveLength(1);
    expect(diff.edges.added[0].edge.relation_type).toBe("co_changes_with");
    expect(diff.edges.unchanged).toHaveLength(0);
    expect(diff.edges.invalidated).toHaveLength(0);
  });

  test("kinds filter restricts ownership shifts to matching relation type", () => {
    const T0 = "2024-01-01T00:00:00Z";
    const T2 = "2025-01-01T00:00:00Z";

    const owner = makeEntity("Carol", T0);
    const module = makeModuleEntity("packages/x", T0);

    const ep = makeEpisode(T0);
    addEdge(
      graph,
      {
        source_id: owner.id,
        target_id: module.id,
        relation_type: RELATION_TYPES.LIKELY_OWNER_OF,
        edge_kind: "observed",
        fact: "Carol likely_owner_of packages/x",
        valid_from: T0,
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    // Diff with kinds filter that does not include likely_owner_of
    const diff = diffGraph(graph, T0, T2, {
      kinds: ["reviewed_by"],
    });

    // No edges in added/invalidated because the only edge is likely_owner_of
    expect(diff.edges.added).toHaveLength(0);
    expect(diff.edges.unchanged).toHaveLength(0);
  });
});
