/**
 * detail.test.ts — unit tests for the entity/edge/episode detail API handlers.
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
import {
  handleEdgeDetail,
  handleEntityDetail,
  handleEpisodeDetail,
} from "../src/api/detail.js";

let graph: EngramGraph;

function addTestData(g: EngramGraph) {
  const ep = addEpisode(g, {
    source_type: "git",
    source_ref: "abc123",
    content: "Initial commit with setup code",
    timestamp: "2024-01-01T00:00:00Z",
  });

  const evidence = [{ episode_id: ep.id, extractor: "test-extractor" }];

  const entityA = addEntity(
    g,
    { canonical_name: "lib/auth.ts", entity_type: "file" },
    evidence,
  );
  const entityB = addEntity(
    g,
    { canonical_name: "AuthService", entity_type: "module" },
    evidence,
  );

  const edge = addEdge(
    g,
    {
      source_id: entityA.id,
      target_id: entityB.id,
      relation_type: "owned_by",
      edge_kind: "inferred",
      fact: "lib/auth.ts is owned by AuthService",
      valid_from: "2024-01-01T00:00:00Z",
    },
    evidence,
  );

  return { ep, entityA, entityB, edge };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// handleEntityDetail
// ---------------------------------------------------------------------------

describe("handleEntityDetail", () => {
  test("returns entity with evidence on happy path", () => {
    const { entityA, ep } = addTestData(graph);
    const result = handleEntityDetail(graph, entityA.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(entityA.id);
    expect(result?.canonical_name).toBe("lib/auth.ts");
    expect(result?.entity_type).toBe("file");
    expect(result?.status).toBe("active");
    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0].episode_id).toBe(ep.id);
    expect(result?.evidence[0].source_type).toBe("git");
    expect(result?.evidence[0].source_ref).toBe("abc123");
    expect(typeof result?.evidence[0].created_at).toBe("string");
  });

  test("returns null for unknown entity ID", () => {
    const result = handleEntityDetail(graph, "ent_doesnotexist");
    expect(result).toBeNull();
  });

  test("includes summary truncated to 120 chars", () => {
    const longContent = "A".repeat(200);
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: "long-001",
      content: longContent,
      timestamp: "2024-01-01T00:00:00Z",
    });
    const evidence = [{ episode_id: ep.id, extractor: "test" }];
    const entity = addEntity(
      graph,
      { canonical_name: "BigEntity", entity_type: "module" },
      evidence,
    );
    const result = handleEntityDetail(graph, entity.id);
    expect(result).not.toBeNull();
    // Summary should be truncated
    const summary = result?.evidence[0].summary;
    expect(summary).not.toBeNull();
    expect(summary?.length).toBeLessThanOrEqual(122); // 120 + ellipsis char
  });
});

// ---------------------------------------------------------------------------
// handleEdgeDetail
// ---------------------------------------------------------------------------

describe("handleEdgeDetail", () => {
  test("returns edge with evidence on happy path", () => {
    const { edge, ep } = addTestData(graph);
    const result = handleEdgeDetail(graph, edge.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(edge.id);
    expect(result?.relation_type).toBe("owned_by");
    expect(result?.edge_kind).toBe("inferred");
    expect(result?.confidence).toBeGreaterThanOrEqual(0);
    expect(result?.evidence).toHaveLength(1);
    expect(result?.evidence[0].episode_id).toBe(ep.id);
  });

  test("returns null for unknown edge ID", () => {
    const result = handleEdgeDetail(graph, "edg_doesnotexist");
    expect(result).toBeNull();
  });

  test("edge result includes source_id and target_id", () => {
    const { edge, entityA, entityB } = addTestData(graph);
    const result = handleEdgeDetail(graph, edge.id);
    expect(result?.source_id).toBe(entityA.id);
    expect(result?.target_id).toBe(entityB.id);
  });
});

// ---------------------------------------------------------------------------
// handleEpisodeDetail
// ---------------------------------------------------------------------------

describe("handleEpisodeDetail", () => {
  test("returns episode on happy path", () => {
    const { ep } = addTestData(graph);
    const result = handleEpisodeDetail(graph, ep.id);
    expect(result).not.toBeNull();
    expect(result?.id).toBe(ep.id);
    expect(result?.source_type).toBe("git");
    expect(result?.source_ref).toBe("abc123");
    expect(result?.content).toBe("Initial commit with setup code");
    expect(result?.status).toBe("active");
  });

  test("returns null content for redacted episode", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      source_ref: "secret-001",
      content: "sensitive content",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Redact the episode by directly updating status
    graph.db
      .query(
        "UPDATE episodes SET status = 'redacted', content = '' WHERE id = ?",
      )
      .run(ep.id);

    const result = handleEpisodeDetail(graph, ep.id);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("redacted");
    expect(result?.content).toBeNull();
  });

  test("returns null for unknown episode ID", () => {
    const result = handleEpisodeDetail(graph, "ep_doesnotexist");
    expect(result).toBeNull();
  });
});
