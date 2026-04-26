/**
 * module_overview-staleness.test.ts — integration test for module_overview
 * projection staleness detection.
 *
 * Exercises the existing computeBatchedStaleness() and getProjection() plumbing
 * against a file entity fixture. Does NOT implement new staleness logic.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type {
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ResolvedInput,
} from "../../src/index.js";
import {
  addEntity,
  addEpisode,
  closeGraph,
  computeBatchedStaleness,
  createGraph,
  getProjection,
  listActiveProjections,
  project,
} from "../../src/index.js";

// ─── Mock generator ───────────────────────────────────────────────────────────

function makeMockGenerator(): ProjectionGenerator {
  return {
    isConfigured(): boolean {
      return true;
    },

    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();
      const body =
        `---\n` +
        `id: test-module-overview\n` +
        `kind: module_overview\n` +
        `anchor: entity:file-entity\n` +
        `title: "Module Overview"\n` +
        `model: mock\n` +
        `prompt_template_id: test.v1\n` +
        `prompt_hash: testhash\n` +
        `input_fingerprint: testfingerprint\n` +
        `valid_from: ${now}\n` +
        `valid_until: null\n` +
        `inputs:\n${inputList || "  []"}\n` +
        `---\n\n` +
        `# Module Overview\n\nThis module handles file ingestion.\n`;
      return { body, confidence: 0.9 };
    },

    async assess(
      _projection: Projection,
      _currentInputs: ResolvedInput[],
    ): Promise<AssessVerdict> {
      return { verdict: "still_accurate" };
    },

    async regenerate(
      _projection: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      return this.generate(inputs);
    },

    async discover(): Promise<[]> {
      return [];
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("module_overview projection staleness", () => {
  test("newly created projection is not stale", async () => {
    // Create a backing episode
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "This file handles git ingestion.",
      timestamp: new Date().toISOString(),
    });

    // Create a file entity with evidence
    const fileEntity = addEntity(
      graph,
      {
        canonical_name: "packages/engram-core/src/ingest/git.ts",
        entity_type: "file",
        summary: "Git VCS ingestion layer",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    // Author a module_overview projection anchored to the file entity
    const proj = await project(graph, {
      kind: "module_overview",
      anchor: { type: "entity", id: fileEntity.id },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    });

    // Read back via getProjection and verify not stale
    const result = getProjection(graph, proj.id);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(false);
    expect(result?.stale_reason).toBeUndefined();
    expect(result?.projection.kind).toBe("module_overview");
  });

  test("projection becomes stale when episode content changes", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "Original file content description.",
      timestamp: new Date().toISOString(),
    });

    const fileEntity = addEntity(
      graph,
      {
        canonical_name: "packages/engram-core/src/ingest/git.ts",
        entity_type: "file",
        summary: "Git VCS ingestion layer",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    const proj = await project(graph, {
      kind: "module_overview",
      anchor: { type: "entity", id: fileEntity.id },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    });

    // Simulate a substrate change — update the episode content
    const newHash = createHash("sha256")
      .update("Updated file content description.")
      .digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'Updated file content description.', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    // Re-fetch and verify stale
    const result = getProjection(graph, proj.id);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(true);
    expect(result?.stale_reason).toBe("input_content_changed");
  });

  test("projection becomes stale with input_deleted when episode is redacted", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "Sensitive module description.",
      timestamp: new Date().toISOString(),
    });

    const fileEntity = addEntity(
      graph,
      {
        canonical_name: "packages/engram-core/src/sensitive.ts",
        entity_type: "file",
        summary: "Sensitive file",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    const proj = await project(graph, {
      kind: "module_overview",
      anchor: { type: "entity", id: fileEntity.id },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    });

    // Redact the backing episode
    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    // Re-fetch and verify stale with input_deleted reason
    const result = getProjection(graph, proj.id);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(true);
    expect(result?.stale_reason).toBe("input_deleted");
  });

  test("computeBatchedStaleness detects staleness for module_overview projections", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "Batch test content.",
      timestamp: new Date().toISOString(),
    });

    const fileEntity = addEntity(
      graph,
      {
        canonical_name: "packages/engram-core/src/graph/projections.ts",
        entity_type: "file",
        summary: "Projection write operations",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    const proj = await project(graph, {
      kind: "module_overview",
      anchor: { type: "entity", id: fileEntity.id },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    });

    // Verify fresh
    const projRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(proj.id);
    if (!projRow) throw new Error("projection not found");

    const freshMap = computeBatchedStaleness(graph, [projRow]);
    expect(freshMap.get(proj.id)?.stale).toBe(false);

    // Mutate substrate
    const newHash = createHash("sha256")
      .update("Changed projection content.")
      .digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'Changed projection content.', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    // Re-run batch staleness check
    const staleMap = computeBatchedStaleness(graph, [projRow]);
    expect(staleMap.get(proj.id)?.stale).toBe(true);
    expect(staleMap.get(proj.id)?.stale_reason).toBe("input_content_changed");
  });

  test("listActiveProjections returns module_overview projections with stale field", async () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "Module listing test.",
      timestamp: new Date().toISOString(),
    });

    const fileEntity = addEntity(
      graph,
      {
        canonical_name: "packages/engram-core/src/graph/index.ts",
        entity_type: "file",
        summary: "Graph module barrel export",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    await project(graph, {
      kind: "module_overview",
      anchor: { type: "entity", id: fileEntity.id },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    });

    const results = listActiveProjections(graph, {
      kind: "module_overview",
      anchor_type: "entity",
      anchor_id: fileEntity.id,
    });

    expect(results.length).toBe(1);
    expect(results[0].projection.kind).toBe("module_overview");
    expect(typeof results[0].stale).toBe("boolean");
    expect(results[0].stale).toBe(false);
  });
});
