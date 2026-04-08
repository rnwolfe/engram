/**
 * decay-api.test.ts — tests for GET /api/decay and GET /api/ownership handlers.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "engram-core";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
} from "engram-core";
import { handleDecay } from "../src/api/decay.js";
import { handleOwnership } from "../src/api/ownership-api.js";

let graph: EngramGraph;

/** Create a minimal graph with two entities and a single owner edge. */
function addTestData(g: EngramGraph) {
  const ep = addEpisode(g, {
    source_type: "manual",
    source_ref: "decay-test-001",
    content: "Decay test episode",
    timestamp: "2024-01-01T00:00:00Z",
  });

  const evidence = [{ episode_id: ep.id, extractor: "test" }];

  const personEntity = addEntity(
    g,
    { canonical_name: "Alice", entity_type: "person" },
    evidence,
  );

  const moduleEntity = addEntity(
    g,
    { canonical_name: "src/core.ts", entity_type: "file" },
    evidence,
  );

  // Add a likely_owner_of edge so ownership report has data
  addEdge(
    g,
    {
      source_id: personEntity.id,
      target_id: moduleEntity.id,
      relation_type: "likely_owner_of",
      edge_kind: "inferred",
      fact: "Alice is likely the owner of src/core.ts",
      valid_from: "2024-01-01T00:00:00Z",
    },
    evidence,
  );

  return { ep, personEntity, moduleEntity };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// GET /api/decay → handleDecay
// ---------------------------------------------------------------------------

describe("handleDecay", () => {
  test("returns correct shape on empty graph", () => {
    const result = handleDecay(graph);

    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("summary");

    // Summary keys
    expect(result.summary).toHaveProperty("concentrated-risk");
    expect(result.summary).toHaveProperty("dormant");
    expect(result.summary).toHaveProperty("stale");
    expect(result.summary).toHaveProperty("orphaned");

    // All counts should be 0 for empty graph
    expect(result.summary["concentrated-risk"]).toBe(0);
    expect(result.summary.dormant).toBe(0);
    expect(result.summary.stale).toBe(0);
    expect(result.summary.orphaned).toBe(0);

    expect(typeof result.entries).toBe("object");
  });

  test("entries values have required fields when decay is present", () => {
    addTestData(graph);
    const result = handleDecay(graph);

    // Inspect any entries that were produced
    for (const [_id, entry] of Object.entries(result.entries)) {
      expect(typeof entry.status).toBe("string");
      const validStatuses = [
        "concentrated-risk",
        "dormant",
        "stale",
        "orphaned",
      ];
      expect(validStatuses).toContain(entry.status);

      if (entry.last_activity_days !== undefined) {
        expect(typeof entry.last_activity_days).toBe("number");
      }
    }
  });

  test("summary counts match entries", () => {
    addTestData(graph);
    const result = handleDecay(graph);

    const counted = {
      "concentrated-risk": 0,
      dormant: 0,
      stale: 0,
      orphaned: 0,
    };

    for (const entry of Object.values(result.entries)) {
      counted[entry.status]++;
    }

    expect(result.summary["concentrated-risk"]).toBe(
      counted["concentrated-risk"],
    );
    expect(result.summary.dormant).toBe(counted.dormant);
    expect(result.summary.stale).toBe(counted.stale);
    expect(result.summary.orphaned).toBe(counted.orphaned);
  });
});

// ---------------------------------------------------------------------------
// GET /api/ownership → handleOwnership
// ---------------------------------------------------------------------------

describe("handleOwnership", () => {
  test("returns correct shape on empty graph", () => {
    const result = handleOwnership(graph);

    expect(result).toHaveProperty("generated_at");
    expect(result).toHaveProperty("total_entities_analyzed");
    expect(result).toHaveProperty("critical_count");
    expect(result).toHaveProperty("elevated_count");
    expect(result).toHaveProperty("stable_count");
    expect(result).toHaveProperty("entries");

    expect(Array.isArray(result.entries)).toBe(true);
    expect(typeof result.generated_at).toBe("string");
  });

  test("returns populated report after adding ownership data", () => {
    addTestData(graph);
    const result = handleOwnership(graph);

    expect(result.total_entities_analyzed).toBeGreaterThanOrEqual(0);
    expect(typeof result.critical_count).toBe("number");
    expect(typeof result.elevated_count).toBe("number");
    expect(typeof result.stable_count).toBe("number");
  });

  test("entries have correct shape", () => {
    addTestData(graph);
    const result = handleOwnership(graph);

    for (const entry of result.entries) {
      expect(entry).toHaveProperty("entity_id");
      expect(entry).toHaveProperty("entity_name");
      expect(entry).toHaveProperty("risk_level");
      expect(entry).toHaveProperty("owner_confidence");
      expect(entry).toHaveProperty("decay_types");
      expect(entry).toHaveProperty("coupling_count");
      expect(entry).toHaveProperty("evidence_ids");

      const validRiskLevels = ["critical", "elevated", "stable"];
      expect(validRiskLevels).toContain(entry.risk_level);
      expect(Array.isArray(entry.decay_types)).toBe(true);
      expect(Array.isArray(entry.evidence_ids)).toBe(true);
    }
  });
});
