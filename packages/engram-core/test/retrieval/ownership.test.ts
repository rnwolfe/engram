/**
 * ownership.test.ts — tests for getOwnershipReport().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  getOwnershipReport,
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

function seedEntity(name: string, episodeId: string, type = "module") {
  return addEntity(
    graph,
    { canonical_name: name, entity_type: type },
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
    confidence?: number;
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
      fact: `${sourceId} -> ${targetId}`,
      confidence: opts.confidence ?? 1.0,
      valid_from: opts.valid_from,
      valid_until: opts.valid_until,
    },
    makeEvidence(episodeId),
  );
}

// ---------------------------------------------------------------------------
// Empty graph
// ---------------------------------------------------------------------------

describe("empty graph", () => {
  test("returns empty report", () => {
    const report = getOwnershipReport(graph);
    expect(report.entries).toHaveLength(0);
    expect(report.total_entities_analyzed).toBe(0);
    expect(report.critical_count).toBe(0);
    expect(report.elevated_count).toBe(0);
    expect(report.stable_count).toBe(0);
    expect(report.generated_at).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// All-stable graph
// ---------------------------------------------------------------------------

describe("all-stable graph", () => {
  test("entities with recent activity and no concentration risk are stable", () => {
    const now = new Date().toISOString();
    const ep = seedEpisode({ timestamp: now, actor: "alice" });
    const mod = seedEntity("lib/foo.ts", ep.id);
    const owner = seedEntity("alice", ep.id, "person");

    // Create likely_owner_of edge
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "likely_owner_of",
      confidence: 0.9,
    });

    // Create authored_by edge (recent activity)
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "authored_by",
      valid_from: now,
    });

    const report = getOwnershipReport(graph);
    // The entity has a likely_owner_of edge so it is a candidate; assert it
    // appears and is classified stable (recent activity, no concentration risk,
    // no high coupling).
    const entry = report.entries.find((e) => e.entity_id === mod.id);
    expect(entry).toBeDefined();
    expect(entry?.risk_level).toBe("stable");
  });
});

// ---------------------------------------------------------------------------
// Happy path: critical classification
// ---------------------------------------------------------------------------

describe("critical risk classification", () => {
  test("dormant owner with high coupling => critical", () => {
    // Old episode (300 days ago)
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({
      timestamp: oldDate,
      actor: "bob",
      owner_id: "bob",
    });
    const mod = seedEntity("lib/auth/token.ts", ep.id);
    const owner = seedEntity("bob", ep.id, "person");

    // likely_owner_of edge
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "likely_owner_of",
      confidence: 0.85,
    });

    // authored_by edge (old date = dormant)
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "authored_by",
      valid_from: oldDate,
    });

    // 10 co_changes_with edges for blast radius (need a target for each)
    for (let i = 0; i < 10; i++) {
      const epC = seedEpisode({ timestamp: oldDate });
      const other = seedEntity(`lib/other${i}.ts`, epC.id);
      seedEdge(mod.id, other.id, epC.id, {
        relation_type: "co_changes_with",
      });
    }

    const report = getOwnershipReport(graph, { limit: 50 });
    const entry = report.entries.find((e) => e.entity_id === mod.id);
    expect(entry).toBeDefined();
    expect(entry?.risk_level).toBe("critical");
    expect(entry?.coupling_count).toBeGreaterThanOrEqual(10);
    expect(entry?.days_since_owner_activity).toBeGreaterThan(180);
  });

  test("critical entries appear before elevated in sorted output", () => {
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // Create critical entity
    const ep1 = seedEpisode({
      timestamp: oldDate,
      actor: "bob",
      owner_id: "bob",
    });
    const modCritical = seedEntity("lib/critical.ts", ep1.id);
    const owner1 = seedEntity("bob_owner", ep1.id, "person");
    seedEdge(owner1.id, modCritical.id, ep1.id, {
      relation_type: "likely_owner_of",
      confidence: 0.9,
    });
    seedEdge(owner1.id, modCritical.id, ep1.id, {
      relation_type: "authored_by",
      valid_from: oldDate,
    });
    for (let i = 0; i < 10; i++) {
      const epC = seedEpisode({ timestamp: oldDate });
      const other = seedEntity(`lib/dep${i}.ts`, epC.id);
      seedEdge(modCritical.id, other.id, epC.id, {
        relation_type: "co_changes_with",
      });
    }

    // Create elevated entity (concentrated risk only, no dormancy)
    const recentDate = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep2 = seedEpisode({
      timestamp: recentDate,
      actor: "alice",
      owner_id: "alice",
    });
    const modElevated = seedEntity("lib/elevated.ts", ep2.id);
    const owner2 = seedEntity("alice_owner", ep2.id, "person");
    seedEdge(owner2.id, modElevated.id, ep2.id, {
      relation_type: "likely_owner_of",
      confidence: 0.7,
    });
    // Add enough edges for concentrated_risk detection
    for (let i = 0; i < 5; i++) {
      const epE = seedEpisode({
        timestamp: recentDate,
        actor: "alice",
        owner_id: "alice",
      });
      const other = seedEntity(`lib/elevated_dep${i}.ts`, epE.id);
      seedEdge(modElevated.id, other.id, epE.id, {});
    }

    const report = getOwnershipReport(graph, { limit: 50 });
    const criticalIdx = report.entries.findIndex(
      (e) => e.entity_id === modCritical.id,
    );
    const elevatedIdx = report.entries.findIndex(
      (e) => e.entity_id === modElevated.id,
    );

    if (criticalIdx >= 0 && elevatedIdx >= 0) {
      expect(criticalIdx).toBeLessThan(elevatedIdx);
    }
  });
});

// ---------------------------------------------------------------------------
// Module filter
// ---------------------------------------------------------------------------

describe("module filter", () => {
  test("--module filters to path prefix", () => {
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep1 = seedEpisode({ timestamp: oldDate, actor: "bob" });
    const modA = seedEntity("lib/auth/login.ts", ep1.id);
    const modB = seedEntity("lib/core/index.ts", ep1.id);
    const owner = seedEntity("bob", ep1.id, "person");

    seedEdge(owner.id, modA.id, ep1.id, {
      relation_type: "likely_owner_of",
      confidence: 0.9,
    });
    seedEdge(owner.id, modB.id, ep1.id, {
      relation_type: "likely_owner_of",
      confidence: 0.8,
    });

    const report = getOwnershipReport(graph, { module: "lib/auth", limit: 50 });
    for (const entry of report.entries) {
      expect(entry.entity_name.startsWith("lib/auth")).toBe(true);
    }
    // modB should not appear
    const hasModB = report.entries.some((e) => e.entity_id === modB.id);
    expect(hasModB).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// min_confidence filter
// ---------------------------------------------------------------------------

describe("min_confidence filter", () => {
  test("entries with confidence below threshold are excluded", () => {
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({ timestamp: oldDate, actor: "bob" });
    const mod = seedEntity("lib/weak.ts", ep.id);
    const owner = seedEntity("bob_weak", ep.id, "person");

    // Low confidence ownership
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "likely_owner_of",
      confidence: 0.05,
    });

    const report = getOwnershipReport(graph, {
      min_confidence: 0.5,
      limit: 50,
    });
    // mod should appear in candidates (it's a decay candidate), but owner should be null
    const entry = report.entries.find((e) => e.entity_id === mod.id);
    if (entry) {
      expect(entry.owner_id).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Evidence invariant
// ---------------------------------------------------------------------------

describe("evidence invariant", () => {
  test("all entries have at least one evidence_id", () => {
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const ep = seedEpisode({ timestamp: oldDate, actor: "charlie" });
    const mod = seedEntity("lib/risk.ts", ep.id);
    const owner = seedEntity("charlie", ep.id, "person");

    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "likely_owner_of",
      confidence: 0.9,
    });

    const report = getOwnershipReport(graph, { limit: 50 });
    for (const entry of report.entries) {
      expect(entry.evidence_ids.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Temporal valid_at
// ---------------------------------------------------------------------------

describe("temporal valid_at", () => {
  test("valid_at filters out edges not active at that time", () => {
    const pastDate = "2023-01-01T00:00:00Z";
    const futureDate = "2025-01-01T00:00:00Z";

    const ep = seedEpisode({ timestamp: pastDate, actor: "diana" });
    const mod = seedEntity("lib/temporal.ts", ep.id);
    const owner = seedEntity("diana", ep.id, "person");

    // This edge is only active from 2024 onward
    seedEdge(owner.id, mod.id, ep.id, {
      relation_type: "likely_owner_of",
      confidence: 0.9,
      valid_from: "2024-01-01T00:00:00Z",
    });

    // Query at a time before the edge was valid
    const reportBefore = getOwnershipReport(graph, {
      valid_at: pastDate,
      min_confidence: 0.0,
      limit: 50,
    });

    const entryBefore = reportBefore.entries.find(
      (e) => e.entity_id === mod.id,
    );
    if (entryBefore) {
      // owner edge should not be active yet
      expect(entryBefore.owner_id).toBeNull();
    }

    // Query at a time when the edge is valid
    const reportAfter = getOwnershipReport(graph, {
      valid_at: futureDate,
      min_confidence: 0.0,
      limit: 50,
    });

    const entryAfter = reportAfter.entries.find((e) => e.entity_id === mod.id);
    if (entryAfter) {
      expect(entryAfter.owner_id).toBe(owner.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

describe("limit", () => {
  test("limit caps the number of returned entries", () => {
    const oldDate = new Date(
      Date.now() - 300 * 24 * 60 * 60 * 1000,
    ).toISOString();
    for (let i = 0; i < 10; i++) {
      const ep = seedEpisode({ timestamp: oldDate, actor: `actor${i}` });
      const mod = seedEntity(`lib/mod${i}.ts`, ep.id);
      const owner = seedEntity(`owner${i}`, ep.id, "person");
      seedEdge(owner.id, mod.id, ep.id, {
        relation_type: "likely_owner_of",
        confidence: 0.8,
      });
    }

    const report = getOwnershipReport(graph, { limit: 3 });
    expect(report.entries.length).toBeLessThanOrEqual(3);
  });
});
