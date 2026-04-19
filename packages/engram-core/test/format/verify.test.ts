/**
 * verify.test.ts — integrity verification tests for verifyGraph().
 *
 * Each test creates deliberate violations and confirms they are detected.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  verifyGraph,
} from "../../src/index.js";
import { ENTITY_TYPES, EPISODE_SOURCE_TYPES } from "../../src/vocab/index.js";

let graph: EngramGraph;

function now(): string {
  return new Date().toISOString();
}

function makeEpisode(g: EngramGraph, ref?: string) {
  return addEpisode(g, {
    source_type: "manual",
    source_ref: ref ?? ulid(),
    content: "test episode",
    timestamp: now(),
  });
}

function makeEntity(g: EngramGraph, ep: { id: string }) {
  return addEntity(
    g,
    {
      canonical_name: `Entity-${ulid()}`,
      entity_type: "person",
    },
    [{ episode_id: ep.id, extractor: "test", confidence: 1 }],
  );
}

function makeEdge(
  g: EngramGraph,
  sourceId: string,
  targetId: string,
  ep: { id: string },
) {
  return addEdge(
    g,
    {
      source_id: sourceId,
      target_id: targetId,
      relation_type: "knows",
      edge_kind: "observed",
      fact: "test fact",
    },
    [{ episode_id: ep.id, extractor: "test", confidence: 1 }],
  );
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Clean graph
// ---------------------------------------------------------------------------

describe("clean graph", () => {
  test("empty graph is valid (no violations)", () => {
    const result = verifyGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  test("graph with entities, edges, and evidence is valid", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    makeEdge(graph, a.id, b.id, ep);

    const result = verifyGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkMetadata
// ---------------------------------------------------------------------------

describe("checkMetadata", () => {
  test("missing required metadata key produces error violation", () => {
    graph.db.run("DELETE FROM metadata WHERE key = 'owner_id'");
    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) => x.check === "checkMetadata" && x.message.includes("owner_id"),
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("unrecognized format_version produces error violation", () => {
    graph.db.run(
      "UPDATE metadata SET value = '99.0.0' WHERE key = 'format_version'",
    );
    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) => x.check === "checkMetadata" && x.message.includes("99.0.0"),
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("all required keys present with correct version is clean", () => {
    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkMetadata",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkEntityEvidence
// ---------------------------------------------------------------------------

describe("checkEntityEvidence", () => {
  test("entity with no evidence rows produces error violation", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);

    // Remove evidence manually
    graph.db.run("DELETE FROM entity_evidence WHERE entity_id = ?", [
      entity.id,
    ]);

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) =>
        x.check === "checkEntityEvidence" && x.entity_or_edge_id === entity.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("entity with evidence produces no violation", () => {
    const ep = makeEpisode(graph);
    makeEntity(graph, ep);
    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkEntityEvidence",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkEdgeEvidence
// ---------------------------------------------------------------------------

describe("checkEdgeEvidence", () => {
  test("edge with no evidence rows produces error violation", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge = makeEdge(graph, a.id, b.id, ep);

    graph.db.run("DELETE FROM edge_evidence WHERE edge_id = ?", [edge.id]);

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) => x.check === "checkEdgeEvidence" && x.entity_or_edge_id === edge.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// checkSupersededByRefs
// ---------------------------------------------------------------------------

describe("checkSupersededByRefs", () => {
  test("edge with dangling superseded_by produces error", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge = makeEdge(graph, a.id, b.id, ep);

    // Temporarily disable FK checks to create a dangling reference
    graph.db.run("PRAGMA foreign_keys = OFF");
    graph.db.run("UPDATE edges SET superseded_by = ? WHERE id = ?", [
      "nonexistent-edge-id",
      edge.id,
    ]);
    graph.db.run("PRAGMA foreign_keys = ON");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) =>
        x.check === "checkSupersededByRefs" && x.entity_or_edge_id === edge.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("valid superseded_by ref produces no violation", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge1 = makeEdge(graph, a.id, b.id, ep);
    const edge2 = makeEdge(graph, a.id, b.id, ep);

    graph.db.run("UPDATE edges SET superseded_by = ? WHERE id = ?", [
      edge2.id,
      edge1.id,
    ]);

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkSupersededByRefs",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkAliasEpisodeRefs
// ---------------------------------------------------------------------------

describe("checkAliasEpisodeRefs", () => {
  test("alias with dangling episode_id produces warning", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);

    // Insert alias with broken episode ref directly (FK off to allow dangling ref)
    const aliasId = ulid();
    graph.db.run("PRAGMA foreign_keys = OFF");
    graph.db.run(
      "INSERT INTO entity_aliases (id, entity_id, alias, episode_id, created_at) VALUES (?, ?, ?, ?, ?)",
      [aliasId, entity.id, "BadAlias", "nonexistent-ep", now()],
    );
    graph.db.run("PRAGMA foreign_keys = ON");

    const result = verifyGraph(graph);
    const v = result.violations.find(
      (x) =>
        x.check === "checkAliasEpisodeRefs" && x.entity_or_edge_id === aliasId,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
    // Warning only — should still be valid
    const errors = result.violations.filter((x) => x.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("alias with null episode_id produces no violation", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);

    graph.db.run(
      "INSERT INTO entity_aliases (id, entity_id, alias, episode_id, created_at) VALUES (?, ?, ?, NULL, ?)",
      [ulid(), entity.id, "NullAlias", now()],
    );

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkAliasEpisodeRefs",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkEvidenceEpisodeRefs
// ---------------------------------------------------------------------------

describe("checkEvidenceEpisodeRefs", () => {
  test("entity_evidence with dangling episode_id produces error", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);

    // Update evidence to point at nonexistent episode (FK off to allow dangling ref)
    graph.db.run("PRAGMA foreign_keys = OFF");
    graph.db.run(
      "UPDATE entity_evidence SET episode_id = ? WHERE entity_id = ?",
      ["ghost-episode", entity.id],
    );
    graph.db.run("PRAGMA foreign_keys = ON");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) =>
        x.check === "checkEvidenceEpisodeRefs" &&
        x.entity_or_edge_id === entity.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("edge_evidence with dangling episode_id produces error", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge = makeEdge(graph, a.id, b.id, ep);

    // Update evidence to point at nonexistent episode (FK off to allow dangling ref)
    graph.db.run("PRAGMA foreign_keys = OFF");
    graph.db.run("UPDATE edge_evidence SET episode_id = ? WHERE edge_id = ?", [
      "ghost-episode",
      edge.id,
    ]);
    graph.db.run("PRAGMA foreign_keys = ON");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) =>
        x.check === "checkEvidenceEpisodeRefs" &&
        x.entity_or_edge_id === edge.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });
});

// ---------------------------------------------------------------------------
// checkEmbeddingTargets
// ---------------------------------------------------------------------------

describe("checkEmbeddingTargets", () => {
  test("embedding pointing at nonexistent entity produces warning", () => {
    const embId = ulid();
    graph.db.run(
      "INSERT INTO embeddings (id, target_type, target_id, model, dimensions, vector, source_text, created_at) VALUES (?, 'entity', ?, 'test-model', 4, ?, 'text', ?)",
      [embId, "ghost-entity", new Uint8Array(16), now()],
    );

    const result = verifyGraph(graph);
    const v = result.violations.find(
      (x) =>
        x.check === "checkEmbeddingTargets" &&
        x.entity_or_edge_id === "ghost-entity",
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
  });

  test("embedding pointing at nonexistent edge produces warning", () => {
    const embId = ulid();
    graph.db.run(
      "INSERT INTO embeddings (id, target_type, target_id, model, dimensions, vector, source_text, created_at) VALUES (?, 'edge', ?, 'test-model', 4, ?, 'text', ?)",
      [embId, "ghost-edge", new Uint8Array(16), now()],
    );

    const result = verifyGraph(graph);
    const v = result.violations.find(
      (x) =>
        x.check === "checkEmbeddingTargets" &&
        x.entity_or_edge_id === "ghost-edge",
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
  });

  test("valid embedding produces no violation", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);

    graph.db.run(
      "INSERT INTO embeddings (id, target_type, target_id, model, dimensions, vector, source_text, created_at) VALUES (?, 'entity', ?, 'test-model', 4, ?, 'text', ?)",
      [ulid(), entity.id, new Uint8Array(16), now()],
    );

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkEmbeddingTargets",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkActiveEdgeOverlaps
// ---------------------------------------------------------------------------

describe("checkActiveEdgeOverlaps", () => {
  test("two active edges with same (source, target, relation, kind) and overlapping windows produce warning", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const _edge1 = makeEdge(graph, a.id, b.id, ep);
    const _edge2 = makeEdge(graph, a.id, b.id, ep);

    // Both have NULL valid_from and valid_until → they fully overlap
    const result = verifyGraph(graph);
    const v = result.violations.find(
      (x) => x.check === "checkActiveEdgeOverlaps",
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
  });

  test("invalidated edge is excluded from overlap check", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge1 = makeEdge(graph, a.id, b.id, ep);
    makeEdge(graph, a.id, b.id, ep);

    // Invalidate edge1 — should remove it from overlap candidates
    graph.db.run("UPDATE edges SET invalidated_at = ? WHERE id = ?", [
      now(),
      edge1.id,
    ]);

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkActiveEdgeOverlaps",
    );
    expect(violations).toHaveLength(0);
  });

  test("non-overlapping windows produce no violation", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge1 = makeEdge(graph, a.id, b.id, ep);
    const edge2 = makeEdge(graph, a.id, b.id, ep);

    // Set non-overlapping windows: [2020, 2021) and [2022, 2023)
    graph.db.run(
      "UPDATE edges SET valid_from = '2020-01-01T00:00:00Z', valid_until = '2021-01-01T00:00:00Z' WHERE id = ?",
      [edge1.id],
    );
    graph.db.run(
      "UPDATE edges SET valid_from = '2022-01-01T00:00:00Z', valid_until = '2023-01-01T00:00:00Z' WHERE id = ?",
      [edge2.id],
    );

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkActiveEdgeOverlaps",
    );
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// VerifyResult.valid semantics
// ---------------------------------------------------------------------------

describe("VerifyResult.valid", () => {
  test("warnings alone do not make the graph invalid", () => {
    const ep = makeEpisode(graph);
    const _entity = makeEntity(graph, ep);

    // Insert an embedding with a nonexistent entity (warning)
    graph.db.run(
      "INSERT INTO embeddings (id, target_type, target_id, model, dimensions, vector, source_text, created_at) VALUES (?, 'entity', ?, 'test-model', 4, ?, 'text', ?)",
      [ulid(), "ghost-entity", new Uint8Array(16), now()],
    );

    const result = verifyGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.violations.some((v) => v.severity === "warning")).toBe(true);
  });

  test("a single error-severity violation makes valid = false", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);
    graph.db.run("DELETE FROM entity_evidence WHERE entity_id = ?", [
      entity.id,
    ]);

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifyGraph strict mode — vocab registry checks
// ---------------------------------------------------------------------------

describe("verifyGraph — strict mode vocab checks", () => {
  test("no violations on a clean graph with registry values", () => {
    const ep = makeEpisode(graph);
    makeEntity(graph, ep);
    const result = verifyGraph(graph, { strict: true });
    const vocabViolations = result.violations.filter(
      (v) => v.check === "checkVocab",
    );
    expect(vocabViolations).toHaveLength(0);
  });

  test("flags unknown entity_type as warning in strict mode", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);
    graph.db.run(
      "UPDATE entities SET entity_type = 'legacy_thing' WHERE id = ?",
      [entity.id],
    );

    const result = verifyGraph(graph, { strict: true });
    const v = result.violations.find(
      (v) => v.check === "checkVocab" && v.entity_or_edge_id === entity.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
    expect(v?.message).toContain("legacy_thing");
    expect(v?.message).toContain("ENTITY_TYPES");
  });

  test("flags unknown episode source_type as warning in strict mode", () => {
    const ep = makeEpisode(graph);
    graph.db.run(
      "UPDATE episodes SET source_type = 'unknown_source' WHERE id = ?",
      [ep.id],
    );

    const result = verifyGraph(graph, { strict: true });
    const v = result.violations.find(
      (v) => v.check === "checkVocab" && v.entity_or_edge_id === ep.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
    expect(v?.message).toContain("unknown_source");
  });

  test("flags unknown relation_type as warning in strict mode", () => {
    const ep = makeEpisode(graph);
    const a = makeEntity(graph, ep);
    const b = makeEntity(graph, ep);
    const edge = makeEdge(graph, a.id, b.id, ep);
    graph.db.run("UPDATE edges SET relation_type = 'custom_rel' WHERE id = ?", [
      edge.id,
    ]);

    const result = verifyGraph(graph, { strict: true });
    const v = result.violations.find(
      (v) => v.check === "checkVocab" && v.entity_or_edge_id === edge.id,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
    expect(v?.message).toContain("custom_rel");
  });

  test("flags unknown ingestion_runs source_type as warning in strict mode", () => {
    const runId = ulid();
    graph.db.run(
      `INSERT INTO ingestion_runs (id, source_type, source_scope, started_at, completed_at, extractor_version, episodes_created, entities_created, edges_created, status)
       VALUES (?, 'unknown_ingest_type', 'test-scope', ?, ?, '1.0.0', 0, 0, 0, 'completed')`,
      [runId, now(), now()],
    );

    const result = verifyGraph(graph, { strict: true });
    const v = result.violations.find(
      (v) => v.check === "checkVocab" && v.entity_or_edge_id === runId,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("warning");
    expect(v?.message).toContain("unknown_ingest_type");
  });

  test("non-strict mode does not flag unknown vocab values", () => {
    const ep = makeEpisode(graph);
    const entity = makeEntity(graph, ep);
    graph.db.run(
      "UPDATE entities SET entity_type = 'legacy_thing' WHERE id = ?",
      [entity.id],
    );

    const result = verifyGraph(graph);
    const vocabViolations = result.violations.filter(
      (v) => v.check === "checkVocab",
    );
    expect(vocabViolations).toHaveLength(0);
  });

  test("strict mode is backward compatible — existing registry values produce no warnings", () => {
    const ep = addEpisode(graph, {
      source_type: EPISODE_SOURCE_TYPES.GIT_COMMIT,
      source_ref: ulid(),
      content: "commit content",
      timestamp: new Date().toISOString(),
    });
    addEntity(
      graph,
      { canonical_name: "alice@example.com", entity_type: ENTITY_TYPES.PERSON },
      [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
    );

    const result = verifyGraph(graph, { strict: true });
    const vocabViolations = result.violations.filter(
      (v) => v.check === "checkVocab",
    );
    expect(vocabViolations).toHaveLength(0);
  });
});
