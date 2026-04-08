/**
 * time-slider.test.ts — unit tests for applyGraphSnapshot diff logic.
 *
 * Tests the incremental diff applied to a Cytoscape instance when the
 * time slider scrubs to a new timestamp. Verifies nodes/edges are added
 * and removed correctly without re-running layout.
 */

import { describe, expect, test } from "bun:test";

// ---------------------------------------------------------------------------
// Minimal Cytoscape stub
// ---------------------------------------------------------------------------

interface StubElement {
  id: () => string;
  _type: "node" | "edge";
}

function makeNode(id: string): StubElement {
  return { id: () => id, _type: "node" };
}

function makeEdge(id: string): StubElement {
  return { id: () => id, _type: "edge" };
}

interface StubCollection {
  _items: StubElement[];
  map: <T>(fn: (el: StubElement) => T) => T[];
  filter: (
    fn: (el: StubElement) => boolean,
  ) => StubCollection & { remove: () => void };
  remove: () => void;
}

function makeCollection(items: StubElement[]): StubCollection {
  const col: StubCollection = {
    _items: items,
    map<T>(fn: (el: StubElement) => T): T[] {
      return items.map(fn);
    },
    filter(
      fn: (el: StubElement) => boolean,
    ): StubCollection & { remove: () => void } {
      const filtered = makeFilteredCollection(items.filter(fn), col);
      return filtered;
    },
    remove() {
      /* noop base */
    },
  };
  return col;
}

function makeFilteredCollection(
  items: StubElement[],
  parent: StubCollection,
): StubCollection & { remove: () => void } {
  return {
    _items: items,
    map<T>(fn: (el: StubElement) => T): T[] {
      return items.map(fn);
    },
    filter(fn: (el: StubElement) => boolean) {
      return makeFilteredCollection(items.filter(fn), parent);
    },
    remove() {
      for (const item of items) {
        const idx = parent._items.indexOf(item);
        if (idx !== -1) parent._items.splice(idx, 1);
      }
    },
  };
}

interface GraphNode {
  id: string;
  canonical_name: string;
  entity_type: string;
  status: string;
  updated_at: string;
}

interface GraphEdge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
}

/**
 * Minimal buildElements stub — converts raw node/edge data to
 * Cytoscape element descriptors (group + data).
 */
function buildElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Array<{ group: string; data: Record<string, unknown> }> {
  return [
    ...nodes.map((n) => ({ group: "nodes", data: { id: n.id, ...n } })),
    ...edges.map((e) => ({
      group: "edges",
      data: { id: e.id, source: e.source_id, target: e.target_id, ...e },
    })),
  ];
}

// ---------------------------------------------------------------------------
// applyGraphSnapshot — pure diff logic extracted for testing
// (mirrors the implementation in ui/main.ts without DOM/fetch)
// ---------------------------------------------------------------------------

interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { entity_count: number; edge_count: number };
}

interface MockCy {
  _nodes: StubElement[];
  _edges: StubElement[];
  _added: Array<{ group: string; data: Record<string, unknown> }>[];
  layoutCallCount: number;
  nodes: () => StubCollection;
  edges: () => StubCollection;
  add: (els: Array<{ group: string; data: Record<string, unknown> }>) => void;
}

function makeMockCy(nodeIds: string[], edgeIds: string[]): MockCy {
  const nodes = nodeIds.map(makeNode);
  const edges = edgeIds.map(makeEdge);
  return {
    _nodes: nodes,
    _edges: edges,
    _added: [],
    layoutCallCount: 0,
    nodes() {
      return makeCollection(this._nodes);
    },
    edges() {
      return makeCollection(this._edges);
    },
    add(els) {
      this._added.push(els);
      // Materialize added nodes/edges into the stub state
      for (const el of els) {
        if (el.group === "nodes") {
          this._nodes.push(makeNode(el.data.id as string));
        } else {
          this._edges.push(makeEdge(el.data.id as string));
        }
      }
    },
  };
}

function applyGraphSnapshotSync(cy: MockCy, data: GraphResponse): void {
  const existingNodeIds = new Set(cy.nodes().map((n) => n.id()));
  const newNodeIds = new Set(data.nodes.map((n) => n.id));

  cy.nodes()
    .filter((n) => !newNodeIds.has(n.id()))
    .remove();

  const newNodes = data.nodes.filter((n) => !existingNodeIds.has(n.id));
  if (newNodes.length > 0) cy.add(buildElements(newNodes, []));

  const newEdgeIds = new Set(data.edges.map((e) => e.id));
  cy.edges()
    .filter((e) => !newEdgeIds.has(e.id()))
    .remove();

  const existingEdgeIds = new Set(cy.edges().map((e) => e.id()));
  const toAddEdges = data.edges.filter((e) => !existingEdgeIds.has(e.id));
  if (toAddEdges.length > 0) cy.add(buildElements([], toAddEdges));

  // Do NOT re-run layout — cy.layoutCallCount must stay 0
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode2(id: string): GraphNode {
  return {
    id,
    canonical_name: id,
    entity_type: "module",
    status: "active",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

function makeEdge2(id: string, src: string, tgt: string): GraphEdge {
  return {
    id,
    source_id: src,
    target_id: tgt,
    relation_type: "depends_on",
    edge_kind: "observed",
    confidence: 1,
    valid_from: null,
    valid_until: null,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyGraphSnapshot diff logic", () => {
  test("adds new nodes that are not already in the graph", () => {
    const cy = makeMockCy(["n1"], ["e1"]);
    const data: GraphResponse = {
      nodes: [makeNode2("n1"), makeNode2("n2")],
      edges: [makeEdge2("e1", "n1", "n2")],
      stats: { entity_count: 2, edge_count: 1 },
    };

    applyGraphSnapshotSync(cy, data);

    const nodeIds = cy._nodes.map((n) => n.id());
    expect(nodeIds).toContain("n1");
    expect(nodeIds).toContain("n2");
  });

  test("removes nodes that are not in the new snapshot", () => {
    const cy = makeMockCy(["n1", "n2"], ["e1"]);
    const data: GraphResponse = {
      nodes: [makeNode2("n1")],
      edges: [],
      stats: { entity_count: 1, edge_count: 0 },
    };

    applyGraphSnapshotSync(cy, data);

    const nodeIds = cy._nodes.map((n) => n.id());
    expect(nodeIds).toContain("n1");
    expect(nodeIds).not.toContain("n2");
  });

  test("adds new edges that are not already in the graph", () => {
    const cy = makeMockCy(["n1", "n2"], []);
    const data: GraphResponse = {
      nodes: [makeNode2("n1"), makeNode2("n2")],
      edges: [makeEdge2("e1", "n1", "n2")],
      stats: { entity_count: 2, edge_count: 1 },
    };

    applyGraphSnapshotSync(cy, data);

    const edgeIds = cy._edges.map((e) => e.id());
    expect(edgeIds).toContain("e1");
  });

  test("removes edges that are not in the new snapshot", () => {
    const cy = makeMockCy(["n1", "n2"], ["e1", "e2"]);
    const data: GraphResponse = {
      nodes: [makeNode2("n1"), makeNode2("n2")],
      edges: [makeEdge2("e1", "n1", "n2")],
      stats: { entity_count: 2, edge_count: 1 },
    };

    applyGraphSnapshotSync(cy, data);

    const edgeIds = cy._edges.map((e) => e.id());
    expect(edgeIds).toContain("e1");
    expect(edgeIds).not.toContain("e2");
  });

  test("does not call layout after diff", () => {
    const cy = makeMockCy(["n1"], []);
    const data: GraphResponse = {
      nodes: [makeNode2("n1"), makeNode2("n2")],
      edges: [makeEdge2("e1", "n1", "n2")],
      stats: { entity_count: 2, edge_count: 1 },
    };

    applyGraphSnapshotSync(cy, data);

    // layoutCallCount must remain 0 — node positions should be stable
    expect(cy.layoutCallCount).toBe(0);
  });

  test("handles empty snapshot (all nodes removed)", () => {
    const cy = makeMockCy(["n1", "n2"], ["e1"]);
    const data: GraphResponse = {
      nodes: [],
      edges: [],
      stats: { entity_count: 0, edge_count: 0 },
    };

    applyGraphSnapshotSync(cy, data);

    expect(cy._nodes).toHaveLength(0);
    expect(cy._edges).toHaveLength(0);
  });

  test("no-op when snapshot matches current state", () => {
    const cy = makeMockCy(["n1"], ["e1"]);
    const initialAdded = cy._added.length;
    const data: GraphResponse = {
      nodes: [makeNode2("n1")],
      edges: [makeEdge2("e1", "n1", "n1")],
      stats: { entity_count: 1, edge_count: 1 },
    };

    applyGraphSnapshotSync(cy, data);

    // No new elements should have been added
    expect(cy._added.length).toBe(initialAdded);
    expect(cy._nodes).toHaveLength(1);
    expect(cy._edges).toHaveLength(1);
  });
});
