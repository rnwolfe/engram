/**
 * decay.test.ts — tests for getDecayReport().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  getDecayReport,
  supersedeEdge,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvidence(episodeId: string) {
  return [{ episode_id: episodeId, extractor: "test", confidence: 1.0 }];
}

function seedEpisode(opts: {
  timestamp?: string;
  actor?: string;
  owner_id?: string;
  source_ref?: string;
}) {
  return addEpisode(graph, {
    source_type: "manual",
    source_ref: opts.source_ref ?? `ref-${Date.now()}-${Math.random()}`,
    content: "test episode",
    timestamp: opts.timestamp ?? "2024-01-01T00:00:00Z",
    actor: opts.actor,
    owner_id: opts.owner_id,
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
  opts: { relation_type?: string; edge_kind?: string } = {},
) {
  return addEdge(
    graph,
    {
      source_id: sourceId,
      target_id: targetId,
      relation_type: opts.relation_type ?? "depends_on",
      edge_kind: opts.edge_kind ?? "observed",
      fact: `${sourceId} depends on ${targetId}`,
    },
    makeEvidence(episodeId),
  );
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe("getDecayReport basic structure", () => {
  test("returns a valid report with no items on an empty graph", () => {
    const report = getDecayReport(graph);
    expect(report.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(report.total_entities).toBe(0);
    expect(report.total_edges).toBe(0);
    expect(report.decay_items).toEqual([]);
    expect(report.summary).toEqual({
      stale_evidence: 0,
      contradicted: 0,
      concentrated_risk: 0,
      dormant_owner: 0,
      orphaned: 0,
    });
  });

  test("total_entities and total_edges reflect active graph state", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    seedEdge(a.id, b.id, ep.id);

    const report = getDecayReport(graph);
    expect(report.total_entities).toBe(2);
    expect(report.total_edges).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// stale_evidence
// ---------------------------------------------------------------------------

describe("stale_evidence", () => {
  test("detects entity with old evidence", () => {
    // Episode timestamped 2 years ago (730 days) — well past 180-day default
    const ep = seedEpisode({ timestamp: "2022-01-01T00:00:00Z" });
    seedEntity("OldEntity", ep.id);

    const report = getDecayReport(graph, { stale_days: 180 });
    const staleItems = report.decay_items.filter(
      (i) => i.decay_category === "stale_evidence" && i.name === "OldEntity",
    );
    expect(staleItems.length).toBe(1);
    expect(staleItems[0].type).toBe("entity");
  });

  test("does not flag entity with recent evidence", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    seedEntity("FreshEntity", ep.id);

    const report = getDecayReport(graph, { stale_days: 180 });
    const staleItems = report.decay_items.filter(
      (i) => i.decay_category === "stale_evidence" && i.name === "FreshEntity",
    );
    expect(staleItems.length).toBe(0);
  });

  test("severity escalates with age", () => {
    // > 8x stale_days → critical
    const staleDays = 10;
    const ep = seedEpisode({ timestamp: "2020-01-01T00:00:00Z" }); // ~6 years ago
    seedEntity("VeryOld", ep.id);

    const report = getDecayReport(graph, { stale_days: staleDays });
    const item = report.decay_items.find(
      (i) => i.decay_category === "stale_evidence" && i.name === "VeryOld",
    );
    expect(item?.severity).toBe("critical");
  });

  test("detects stale edge", () => {
    const ep = seedEpisode({ timestamp: "2022-01-01T00:00:00Z" });
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    seedEdge(a.id, b.id, ep.id);

    const report = getDecayReport(graph, { stale_days: 180 });
    const staleEdges = report.decay_items.filter(
      (i) => i.decay_category === "stale_evidence" && i.type === "edge",
    );
    expect(staleEdges.length).toBeGreaterThanOrEqual(1);
  });

  test("summary.stale_evidence reflects count", () => {
    const ep = seedEpisode({ timestamp: "2022-01-01T00:00:00Z" });
    seedEntity("S1", ep.id);
    seedEntity("S2", ep.id);

    const report = getDecayReport(graph, { stale_days: 180 });
    expect(report.summary.stale_evidence).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// contradicted
// ---------------------------------------------------------------------------

describe("contradicted", () => {
  test("detects superseded edge", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const edge = seedEdge(a.id, b.id, ep.id);

    supersedeEdge(
      graph,
      edge.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A depends on B (updated)",
      },
      makeEvidence(ep.id),
    );

    const report = getDecayReport(graph);
    const contradicted = report.decay_items.filter(
      (i) => i.decay_category === "contradicted",
    );
    expect(contradicted.length).toBe(1);
    expect(contradicted[0].type).toBe("edge");
  });

  test("recently superseded is medium severity", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const edge = seedEdge(a.id, b.id, ep.id);

    supersedeEdge(
      graph,
      edge.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A depends on B v2",
      },
      makeEvidence(ep.id),
    );

    const report = getDecayReport(graph, { stale_days: 180 });
    const item = report.decay_items.find(
      (i) => i.decay_category === "contradicted",
    );
    expect(item?.severity).toBe("medium");
  });

  test("summary.contradicted reflects count", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    const a = seedEntity("A", ep.id);
    const b = seedEntity("B", ep.id);
    const edge = seedEdge(a.id, b.id, ep.id);

    supersedeEdge(
      graph,
      edge.id,
      {
        source_id: a.id,
        target_id: b.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "A depends on B v2",
      },
      makeEvidence(ep.id),
    );

    const report = getDecayReport(graph);
    expect(report.summary.contradicted).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// concentrated_risk
// ---------------------------------------------------------------------------

describe("concentrated_risk", () => {
  test("flags entity with many edges but single owner", () => {
    const ep = seedEpisode({
      timestamp: new Date().toISOString(),
      owner_id: "owner-alice",
    });
    const hub = seedEntity("Hub", ep.id);
    const b = seedEntity("B", ep.id);
    const c = seedEntity("C", ep.id);
    const d = seedEntity("D", ep.id);

    seedEdge(hub.id, b.id, ep.id);
    seedEdge(hub.id, c.id, ep.id);
    seedEdge(hub.id, d.id, ep.id);

    const report = getDecayReport(graph, { min_edges_for_risk: 3 });
    const risk = report.decay_items.filter(
      (i) => i.decay_category === "concentrated_risk" && i.name === "Hub",
    );
    expect(risk.length).toBe(1);
    expect(risk[0].severity).toBe("high");
  });

  test("does not flag entity below edge threshold", () => {
    const ep = seedEpisode({
      timestamp: new Date().toISOString(),
      owner_id: "owner-alice",
    });
    const hub = seedEntity("SmallHub", ep.id);
    const b = seedEntity("B2", ep.id);
    seedEdge(hub.id, b.id, ep.id);

    const report = getDecayReport(graph, { min_edges_for_risk: 3 });
    const risk = report.decay_items.filter(
      (i) => i.decay_category === "concentrated_risk" && i.name === "SmallHub",
    );
    expect(risk.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// orphaned
// ---------------------------------------------------------------------------

describe("orphaned", () => {
  test("flags active entity with no active edges", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    seedEntity("Loner", ep.id);

    const report = getDecayReport(graph);
    const orphaned = report.decay_items.filter(
      (i) => i.decay_category === "orphaned" && i.name === "Loner",
    );
    expect(orphaned.length).toBe(1);
    expect(orphaned[0].severity).toBe("low");
    expect(orphaned[0].type).toBe("entity");
  });

  test("does not flag entity that has active edges", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    const a = seedEntity("Connected", ep.id);
    const b = seedEntity("B", ep.id);
    seedEdge(a.id, b.id, ep.id);

    const report = getDecayReport(graph);
    const orphaned = report.decay_items.filter(
      (i) => i.decay_category === "orphaned" && i.name === "Connected",
    );
    expect(orphaned.length).toBe(0);
  });

  test("summary.orphaned reflects count", () => {
    const ep = seedEpisode({ timestamp: new Date().toISOString() });
    seedEntity("Orphan1", ep.id);
    seedEntity("Orphan2", ep.id);

    const report = getDecayReport(graph);
    expect(report.summary.orphaned).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// dormant_owner
// ---------------------------------------------------------------------------

describe("dormant_owner", () => {
  test("flags entity whose top actor has been inactive", () => {
    // Episode 200 days old — past 90-day dormant threshold
    const oldDate = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({ timestamp: oldDate, actor: "alice" });
    seedEntity("AliceModule", ep.id);

    const report = getDecayReport(graph, { dormant_days: 90 });
    const dormant = report.decay_items.filter(
      (i) => i.decay_category === "dormant_owner" && i.name === "AliceModule",
    );
    expect(dormant.length).toBe(1);
    expect(dormant[0].details).toContain("alice");
  });

  test("does not flag entity whose top actor is active", () => {
    const ep = seedEpisode({
      timestamp: new Date().toISOString(),
      actor: "bob",
    });
    seedEntity("BobModule", ep.id);

    const report = getDecayReport(graph, { dormant_days: 90 });
    const dormant = report.decay_items.filter(
      (i) => i.decay_category === "dormant_owner" && i.name === "BobModule",
    );
    expect(dormant.length).toBe(0);
  });

  test("severity is high when inactive > 2x dormant_days", () => {
    const veryOld = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({ timestamp: veryOld, actor: "carol" });
    seedEntity("CarolModule", ep.id);

    const report = getDecayReport(graph, { dormant_days: 90 });
    const item = report.decay_items.find(
      (i) => i.decay_category === "dormant_owner" && i.name === "CarolModule",
    );
    expect(item?.severity).toBe("high");
  });

  test("summary.dormant_owner reflects count", () => {
    const oldDate = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({ timestamp: oldDate, actor: "dave" });
    seedEntity("DaveModule", ep.id);

    const report = getDecayReport(graph, { dormant_days: 90 });
    expect(report.summary.dormant_owner).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Sort order
// ---------------------------------------------------------------------------

describe("sort order", () => {
  test("decay_items sorted critical before low", () => {
    const report = getDecayReport(graph);
    const items = report.decay_items;
    const order: Record<string, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
    };
    for (let i = 0; i < items.length - 1; i++) {
      expect(order[items[i].severity]).toBeLessThanOrEqual(
        order[items[i + 1].severity],
      );
    }
  });
});
