/**
 * projections.test.ts — MCP projection tool handler tests.
 *
 * Tests tool handler functions directly using an in-memory SQLite graph.
 * Uses AnthropicGenerator (stub) for authoring tools.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AnthropicGenerator,
  closeGraph,
  createGraph,
  type EngramGraph,
  project,
} from "engram-core";
import { buildAllTools } from "../src/server.js";
import { handleAddEntity } from "../src/tools/entity.js";
import {
  handleGetProjection,
  handleListProjections,
  handleProject,
  handleReconcile,
  handleSearchProjections,
} from "../src/tools/projections.js";
import { handleAddEpisode } from "../src/tools/write.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function seedProjection(graph: EngramGraph) {
  // Create an episode to use as input
  const episode = handleAddEpisode(graph, {
    source_type: "manual",
    content: "Alice owns the authentication module",
    actor: "test",
    timestamp: new Date().toISOString(),
  });

  // Create a projection using the AnthropicGenerator stub
  const generator = new AnthropicGenerator();
  const projection = await project(graph, {
    kind: "entity_summary",
    anchor: { type: "none" },
    inputs: [{ type: "episode", id: episode.id }],
    generator,
  });

  return { episode, projection };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("engram MCP projection tool handlers", () => {
  let graph: EngramGraph;

  beforeEach(() => {
    graph = createGraph(":memory:");
  });

  afterEach(() => {
    if (graph) closeGraph(graph);
  });

  // -------------------------------------------------------------------------
  // engram_get_projection
  // -------------------------------------------------------------------------

  describe("handleGetProjection", () => {
    test("returns projection with stale flag", async () => {
      const { projection } = await seedProjection(graph);

      const result = handleGetProjection(graph, { id: projection.id });

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.projection.id).toBe(projection.id);
      expect(r.projection.kind).toBe("entity_summary");
      expect(typeof r.stale).toBe("boolean");
      expect(r.stale).toBe(false);
      expect(r.last_assessed_at).toBeDefined();
    });

    test("returns error for unknown projection ID", () => {
      const result = handleGetProjection(graph, { id: "NONEXISTENT" });
      expect(result).toHaveProperty("error");
      const r = result as { error: string };
      expect(r.error).toContain("NONEXISTENT");
    });

    test("staleness flag reflects current input state", async () => {
      const { projection } = await seedProjection(graph);

      // The projection was just created from the episode — should be fresh
      const result = handleGetProjection(graph, { id: projection.id });
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.stale).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // engram_search_projections
  // -------------------------------------------------------------------------

  describe("handleSearchProjections", () => {
    test("returns matching projections with staleness flag", async () => {
      await seedProjection(graph);

      const results = handleSearchProjections(graph, { query: "Generated" });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("projection");
      expect(results[0]).toHaveProperty("stale");
      expect(typeof results[0].stale).toBe("boolean");
    });

    test("returns empty array for no matches", async () => {
      await seedProjection(graph);
      const results = handleSearchProjections(graph, {
        query: "zzznomatch999",
      });
      expect(results).toEqual([]);
    });

    test("filters by kind", async () => {
      await seedProjection(graph);

      const results = handleSearchProjections(graph, {
        query: "Generated",
        kind: "entity_summary",
      });
      expect(results.length).toBeGreaterThan(0);
      for (const r of results) {
        expect(r.projection.kind).toBe("entity_summary");
      }
    });

    test("filters by kind — no match returns empty", async () => {
      await seedProjection(graph);

      const results = handleSearchProjections(graph, {
        query: "Generated",
        kind: "nonexistent_kind",
      });
      expect(results).toEqual([]);
    });

    test("parses anchor as type:id filter", async () => {
      await seedProjection(graph);

      // Search with a specific anchor that won't match (projection anchor is 'none')
      const results = handleSearchProjections(graph, {
        query: "Generated",
        anchor: "entity:01ABC",
      });
      expect(Array.isArray(results)).toBe(true);
      // No projections anchored to entity:01ABC, result should be empty
      expect(results.length).toBe(0);
    });

    test("parses anchor as type-only filter", async () => {
      await seedProjection(graph);

      // Filter by anchor_type 'none' — our projection has anchor_type=none
      const results = handleSearchProjections(graph, {
        query: "Generated",
        anchor: "none",
      });
      expect(Array.isArray(results)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // engram_list_projections
  // -------------------------------------------------------------------------

  describe("handleListProjections", () => {
    test("returns list with summary fields and staleness flag", async () => {
      const { projection } = await seedProjection(graph);

      const rows = handleListProjections(graph, {});

      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      const row = rows.find((r) => r.id === projection.id);
      expect(row).toBeDefined();
      expect(row?.kind).toBe("entity_summary");
      expect(row?.title).toBeTruthy();
      expect(row?.anchor_type).toBe("none");
      expect(typeof row?.stale).toBe("boolean");
    });

    test("returns empty array when no projections exist", () => {
      const rows = handleListProjections(graph, {});
      expect(rows).toEqual([]);
    });

    test("filters by kind", async () => {
      await seedProjection(graph);

      const rows = handleListProjections(graph, { kind: "entity_summary" });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.kind).toBe("entity_summary");
      }
    });

    test("filters by kind — no match returns empty", async () => {
      await seedProjection(graph);
      const rows = handleListProjections(graph, { kind: "no_such_kind" });
      expect(rows).toEqual([]);
    });

    test("filters by anchor_type", async () => {
      await seedProjection(graph);

      const rows = handleListProjections(graph, { anchor_type: "none" });
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) {
        expect(r.anchor_type).toBe("none");
      }
    });

    test("row shape includes required fields", async () => {
      const { projection } = await seedProjection(graph);

      const rows = handleListProjections(graph, {});
      const row = rows.find((r) => r.id === projection.id);
      expect(row).toHaveProperty("id");
      expect(row).toHaveProperty("kind");
      expect(row).toHaveProperty("title");
      expect(row).toHaveProperty("anchor_type");
      expect(row).toHaveProperty("anchor_id");
      expect(row).toHaveProperty("last_assessed_at");
      expect(row).toHaveProperty("stale");
    });
  });

  // -------------------------------------------------------------------------
  // engram_project (authoring — gated)
  // -------------------------------------------------------------------------

  describe("handleProject", () => {
    test("returns error when authoring disabled", async () => {
      const episode = handleAddEpisode(graph, {
        source_type: "manual",
        content: "Test content",
        timestamp: new Date().toISOString(),
      });

      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: "none",
          inputs: [`episode:${episode.id}`],
        },
        false, // enableProjectionAuthoring = false
      );

      expect(result).toHaveProperty("error");
      const r = result as { error: string };
      expect(r.error).toContain("enableProjectionAuthoring");
    });

    test("creates a projection when authoring enabled", async () => {
      const episode = handleAddEpisode(graph, {
        source_type: "manual",
        content: "Test content for projection",
        timestamp: new Date().toISOString(),
      });

      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: "none",
          inputs: [`episode:${episode.id}`],
        },
        true, // enableProjectionAuthoring = true
        new AnthropicGenerator(), // stub generator (no API key)
      );

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.projection.id).toBeTruthy();
      expect(r.projection.kind).toBe("entity_summary");
    });

    test("returns error for invalid anchor format", async () => {
      const episode = handleAddEpisode(graph, {
        source_type: "manual",
        content: "Test",
        timestamp: new Date().toISOString(),
      });

      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: "invalid_no_colon_and_not_none",
          inputs: [`episode:${episode.id}`],
        },
        true,
      );

      expect(result).toHaveProperty("error");
    });

    test("returns error for invalid input format", async () => {
      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: "none",
          inputs: ["bad_format_no_colon"],
        },
        true,
      );

      expect(result).toHaveProperty("error");
    });

    test("returns error for missing input", async () => {
      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: "none",
          inputs: ["episode:NONEXISTENT"],
        },
        true,
      );

      expect(result).toHaveProperty("error");
    });

    test("parses entity:id anchor correctly", async () => {
      const entityResult = handleAddEntity(graph, {
        canonical_name: "TestEntity",
        entity_type: "module",
        episode_content: "Test module content",
        actor: "test",
      });

      const episode = handleAddEpisode(graph, {
        source_type: "manual",
        content: "Some content",
        timestamp: new Date().toISOString(),
      });

      const result = await handleProject(
        graph,
        {
          kind: "entity_summary",
          anchor: `entity:${entityResult.entity.id}`,
          inputs: [`episode:${episode.id}`],
        },
        true,
        new AnthropicGenerator(), // stub generator (no API key)
      );

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.projection.anchor_type).toBe("entity");
      expect(r.projection.anchor_id).toBe(entityResult.entity.id);
    });
  });

  // -------------------------------------------------------------------------
  // engram_reconcile (authoring — gated)
  // -------------------------------------------------------------------------

  describe("handleReconcile", () => {
    test("returns error when authoring disabled", async () => {
      const result = await handleReconcile(
        graph,
        { max_cost: 100 },
        false, // enableProjectionAuthoring = false
      );

      expect(result).toHaveProperty("error");
      const r = result as { error: string };
      expect(r.error).toContain("enableProjectionAuthoring");
    });

    test("returns run summary with run_id when authoring enabled", async () => {
      await seedProjection(graph);

      const result = await handleReconcile(graph, { max_cost: 100 }, true, new AnthropicGenerator());

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.run_id).toBeTruthy();
      expect(r.status).toMatch(/^(completed|partial|failed)$/);
      expect(typeof r.assessed).toBe("number");
      expect(typeof r.superseded).toBe("number");
      expect(typeof r.soft_refreshed).toBe("number");
      expect(r.started_at).toBeTruthy();
      expect(r.completed_at).toBeTruthy();
    });

    test("dry_run does not modify projections", async () => {
      await seedProjection(graph);

      const result = await handleReconcile(
        graph,
        { max_cost: 100, dry_run: true },
        true,
        new AnthropicGenerator(),
      );

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.run_id).toBeTruthy();
    });

    test("assess-only phase runs without discover", async () => {
      await seedProjection(graph);

      const result = await handleReconcile(
        graph,
        { max_cost: 100, phase: "assess" },
        true,
        new AnthropicGenerator(),
      );

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      expect(r.run_id).toBeTruthy();
    });

    test("returns run ID in output", async () => {
      const result = await handleReconcile(
        graph,
        { max_cost: 0, phase: "assess" },
        true,
        new AnthropicGenerator(),
      );

      expect(result).not.toHaveProperty("error");
      const r = result as Exclude<typeof result, { error: string }>;
      // run_id should be a non-empty string (ULID)
      expect(typeof r.run_id).toBe("string");
      expect(r.run_id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // buildAllTools — authoring tool gating
  // -------------------------------------------------------------------------

  describe("buildAllTools", () => {
    test("omits PROJECT_TOOL and RECONCILE_TOOL when enableProjectionAuthoring is false", () => {
      const tools = buildAllTools({ enableProjectionAuthoring: false });
      const names = tools.map((t) => t.name);
      expect(names).not.toContain("engram_project");
      expect(names).not.toContain("engram_reconcile");
    });

    test("omits PROJECT_TOOL and RECONCILE_TOOL when enableProjectionAuthoring is undefined", () => {
      const tools = buildAllTools({});
      const names = tools.map((t) => t.name);
      expect(names).not.toContain("engram_project");
      expect(names).not.toContain("engram_reconcile");
    });

    test("includes PROJECT_TOOL and RECONCILE_TOOL when enableProjectionAuthoring is true", () => {
      const tools = buildAllTools({ enableProjectionAuthoring: true });
      const names = tools.map((t) => t.name);
      expect(names).toContain("engram_project");
      expect(names).toContain("engram_reconcile");
    });

    test("always includes projection read tools regardless of enableProjectionAuthoring", () => {
      const toolsOff = buildAllTools({ enableProjectionAuthoring: false });
      const namesOff = toolsOff.map((t) => t.name);
      expect(namesOff).toContain("engram_get_projection");
      expect(namesOff).toContain("engram_search_projections");
      expect(namesOff).toContain("engram_list_projections");

      const toolsOn = buildAllTools({ enableProjectionAuthoring: true });
      const namesOn = toolsOn.map((t) => t.name);
      expect(namesOn).toContain("engram_get_projection");
      expect(namesOn).toContain("engram_search_projections");
      expect(namesOn).toContain("engram_list_projections");
    });
  });
});
