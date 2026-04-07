/**
 * mcp.test.ts — MCP tool handler tests.
 *
 * Tests tool handler functions directly using an in-memory SQLite graph.
 * Does not test the full stdio protocol.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "engram-core";
import { closeGraph, createGraph } from "engram-core";
import { readRecentEpisodes, readStats } from "../src/resources.js";
import { handleGetContext } from "../src/tools/context.js";
import { handleGetDecay } from "../src/tools/decay.js";
import { handleAddEntity, handleGetEntity } from "../src/tools/entity.js";
import { handleGetHistory } from "../src/tools/history.js";
import { handleSearch } from "../src/tools/search.js";
import { handleAddEdge, handleAddEpisode } from "../src/tools/write.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seedGraph(graph: EngramGraph) {
  // Add an episode + entity + edge for testing
  const episodeResult = handleAddEpisode(graph, {
    source_type: "manual",
    content: "Alice owns the authentication module",
    actor: "test",
    timestamp: new Date().toISOString(),
  });

  const entityResult = handleAddEntity(graph, {
    canonical_name: "Alice",
    entity_type: "person",
    summary: "Developer",
    episode_content: "Alice is a developer on the team",
    actor: "test",
  });

  const authResult = handleAddEntity(graph, {
    canonical_name: "auth-module",
    entity_type: "module",
    summary: "Authentication module",
    episode_content: "Auth module handles login flows",
    actor: "test",
  });

  const edgeResult = handleAddEdge(graph, {
    source_id: entityResult.entity.id,
    target_id: authResult.entity.id,
    relation_type: "OWNS",
    edge_kind: "asserted",
    fact: "Alice owns auth-module",
    episode_content: "Alice owns the authentication module",
    actor: "test",
  });

  return {
    episode: episodeResult,
    alice: entityResult,
    authModule: authResult,
    edge: edgeResult,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("engram MCP tool handlers", () => {
  let graph: EngramGraph;

  beforeEach(() => {
    graph = createGraph(":memory:");
  });

  afterEach(() => {
    if (graph) closeGraph(graph);
  });

  // Write tools
  describe("handleAddEpisode", () => {
    test("creates an episode and returns it", () => {
      const result = handleAddEpisode(graph, {
        source_type: "manual",
        content: "Test episode content",
        timestamp: new Date().toISOString(),
      });

      expect(result.id).toBeTruthy();
      expect(result.source_type).toBe("manual");
      expect(result.content).toBe("Test episode content");
      expect(result.status).toBe("active");
    });

    test("deduplicates episodes by source_ref", () => {
      const first = handleAddEpisode(graph, {
        source_type: "git_commit",
        content: "First ingestion",
        source_ref: "abc123",
        timestamp: new Date().toISOString(),
      });

      const second = handleAddEpisode(graph, {
        source_type: "git_commit",
        content: "Duplicate ingestion",
        source_ref: "abc123",
        timestamp: new Date().toISOString(),
      });

      expect(first.id).toBe(second.id);
    });
  });

  describe("handleAddEntity", () => {
    test("creates an episode and entity, returns both", () => {
      const result = handleAddEntity(graph, {
        canonical_name: "TestEntity",
        entity_type: "module",
        episode_content: "This is a test module",
      });

      expect(result.episode.id).toBeTruthy();
      expect(result.entity.id).toBeTruthy();
      expect(result.entity.canonical_name).toBe("TestEntity");
      expect(result.entity.entity_type).toBe("module");
    });
  });

  describe("handleAddEdge", () => {
    test("creates an episode and edge, returns both", () => {
      const { alice, authModule } = seedGraph(graph);

      const result = handleAddEdge(graph, {
        source_id: alice.entity.id,
        target_id: authModule.entity.id,
        relation_type: "REVIEWS",
        edge_kind: "asserted",
        fact: "Alice reviews auth-module PRs",
        episode_content: "Alice is the primary reviewer for auth-module",
      });

      expect(result.episode.id).toBeTruthy();
      expect(result.edge.id).toBeTruthy();
      expect(result.edge.relation_type).toBe("REVIEWS");
      expect(result.edge.edge_kind).toBe("asserted");
      expect(result.edge.source_id).toBe(alice.entity.id);
      expect(result.edge.target_id).toBe(authModule.entity.id);
    });
  });

  // Read tools
  describe("handleGetEntity", () => {
    test("returns entity with edges and evidence", () => {
      const { alice } = seedGraph(graph);

      const result = handleGetEntity(graph, { entity_id: alice.entity.id });

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.entity.canonical_name).toBe("Alice");
      expect(r.outbound_edges.length).toBeGreaterThan(0);
      expect(r.evidence.length).toBeGreaterThan(0);
    });

    test("returns error for unknown entity", () => {
      const result = handleGetEntity(graph, { entity_id: "NONEXISTENT" });
      expect(result).toHaveProperty("error");
    });
  });

  describe("handleSearch", () => {
    test("returns results for matching query", async () => {
      seedGraph(graph);

      const results = await handleSearch(graph, { query: "Alice" });
      expect(results.length).toBeGreaterThan(0);
      // Results may be entity, edge, or episode — just check score
      expect(results[0].score).toBeGreaterThan(0);
      // Verify at least one entity result exists somewhere
      const entityResults = results.filter((r) => r.type === "entity");
      expect(entityResults.length).toBeGreaterThan(0);
    });

    test("returns empty array for no matches", async () => {
      seedGraph(graph);
      const results = await handleSearch(graph, { query: "zzznomatch999" });
      expect(results).toEqual([]);
    });

    test("respects limit", async () => {
      seedGraph(graph);
      const results = await handleSearch(graph, { query: "Alice", limit: 1 });
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe("handleGetContext", () => {
    test("returns context with entities and edges", async () => {
      seedGraph(graph);

      const result = await handleGetContext(graph, { query: "Alice auth" });

      expect(result).toHaveProperty("entities");
      expect(result).toHaveProperty("edges");
      expect(result).toHaveProperty("episodes");
      expect(result).toHaveProperty("truncated");
      expect(result).toHaveProperty("total_relevant");
      expect(result).toHaveProperty("context_tokens");
      expect(result.context_tokens).toBeGreaterThanOrEqual(0);
    });

    test("respects max_tokens budget", async () => {
      seedGraph(graph);

      // Very small budget — should truncate
      const result = await handleGetContext(graph, {
        query: "Alice",
        max_tokens: 10,
      });

      // With only 10 tokens budget, should be truncated
      expect(result.truncated).toBe(true);
    });

    test("returns empty context for no-match query", async () => {
      const result = await handleGetContext(graph, { query: "zzznomatch999" });

      expect(result.entities).toEqual([]);
      expect(result.edges).toEqual([]);
      expect(result.total_relevant).toBe(0);
    });
  });

  describe("handleGetDecay", () => {
    test("returns a decay report", () => {
      seedGraph(graph);

      const report = handleGetDecay(graph, {});

      expect(report).toHaveProperty("generated_at");
      expect(report).toHaveProperty("total_entities");
      expect(report).toHaveProperty("total_edges");
      expect(report).toHaveProperty("decay_items");
      expect(report).toHaveProperty("summary");
      expect(typeof report.total_entities).toBe("number");
    });

    test("accepts custom stale_days parameter", () => {
      seedGraph(graph);
      const report = handleGetDecay(graph, { stale_days: 30 });
      expect(report).toHaveProperty("decay_items");
    });
  });

  describe("handleGetHistory", () => {
    test("returns edge history between two entities", () => {
      const { alice, authModule } = seedGraph(graph);

      const result = handleGetHistory(graph, {
        source_id: alice.entity.id,
        target_id: authModule.entity.id,
      });

      expect(result.source_id).toBe(alice.entity.id);
      expect(result.target_id).toBe(authModule.entity.id);
      expect(result.edges.length).toBeGreaterThan(0);
    });

    test("returns empty edges for unrelated entities", () => {
      const { alice } = seedGraph(graph);

      // Create a completely separate entity
      const other = handleAddEntity(graph, {
        canonical_name: "Unrelated",
        entity_type: "module",
        episode_content: "Unrelated module",
      });

      const result = handleGetHistory(graph, {
        source_id: alice.entity.id,
        target_id: other.entity.id,
      });

      expect(result.edges).toEqual([]);
    });
  });

  // Resources
  describe("resources", () => {
    test("readStats returns entity/edge/episode counts", () => {
      seedGraph(graph);

      const stats = readStats(graph);

      expect(stats.entities).toBeGreaterThan(0);
      expect(stats.edges).toBeGreaterThan(0);
      expect(stats.episodes).toBeGreaterThan(0);
    });

    test("readRecentEpisodes returns up to 10 episodes", () => {
      seedGraph(graph);

      const recent = readRecentEpisodes(graph);

      expect(recent.length).toBeGreaterThan(0);
      expect(recent.length).toBeLessThanOrEqual(10);
      expect(recent[0]).toHaveProperty("id");
      expect(recent[0]).toHaveProperty("source_type");
      expect(recent[0]).toHaveProperty("content");
    });
  });
});
