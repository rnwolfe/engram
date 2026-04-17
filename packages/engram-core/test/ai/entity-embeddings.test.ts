/**
 * entity-embeddings.test.ts — Tests for generateEntityEmbeddings and reindexEmbeddings
 * with entity support.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AIProvider } from "../../src/ai/provider.js";
import type { EngramGraph } from "../../src/index.js";
import {
  addEntity,
  addEpisode,
  closeGraph,
  countEmbeddings,
  createGraph,
  findSimilar,
  generateEntityEmbeddings,
  reindexEmbeddings,
} from "../../src/index.js";

// Stub provider that returns a fixed embedding per text (deterministic)
function makeStubProvider(dims = 3): AIProvider {
  const _callCount = 0;
  return {
    modelName: () => "stub-model",
    embed: async (texts: string[]) => {
      return texts.map((_t, i) => {
        // Embed as a unit vector pointing in a direction derived from text length + call
        const v = new Array(dims).fill(0) as number[];
        v[i % dims] = 1;
        return v;
      });
    },
    extract: async () => [],
  };
}

// Minimal episode for evidence requirement
function addTestEpisode(graph: EngramGraph) {
  return addEpisode(graph, {
    source_type: "manual",
    source_ref: `test-${Date.now()}-${Math.random()}`,
    content: "test episode",
    timestamp: new Date().toISOString(),
  });
}

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

describe("generateEntityEmbeddings", () => {
  test("stores embeddings for given entity IDs", async () => {
    const ep = addTestEpisode(graph);
    const entity = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const provider = makeStubProvider(3);
    await generateEntityEmbeddings(graph, provider, [entity.id]);

    const counts = countEmbeddings(graph);
    expect(counts.entities).toBe(1);
    expect(counts.episodes).toBe(0);
  });

  test("uses name + summary as embedding text", async () => {
    const ep = addTestEpisode(graph);
    const entity = addEntity(
      graph,
      {
        canonical_name: "Search Module",
        entity_type: "module",
        summary: "Handles full-text and vector retrieval",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const capturedTexts: string[][] = [];
    const provider: AIProvider = {
      modelName: () => "stub-model",
      embed: async (texts) => {
        capturedTexts.push([...texts]);
        return texts.map(() => [1, 0, 0]);
      },
      extract: async () => [],
    };

    await generateEntityEmbeddings(graph, provider, [entity.id]);

    expect(capturedTexts.length).toBe(1);
    expect(capturedTexts[0][0]).toBe(
      "Search Module Handles full-text and vector retrieval",
    );
  });

  test("uses only name when summary is null", async () => {
    const ep = addTestEpisode(graph);
    const entity = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const capturedTexts: string[][] = [];
    const provider: AIProvider = {
      modelName: () => "stub-model",
      embed: async (texts) => {
        capturedTexts.push([...texts]);
        return texts.map(() => [1, 0, 0]);
      },
      extract: async () => [],
    };

    await generateEntityEmbeddings(graph, provider, [entity.id]);

    expect(capturedTexts[0][0]).toBe("Alice");
  });

  test("skips unknown IDs silently", async () => {
    const provider = makeStubProvider(3);
    await expect(
      generateEntityEmbeddings(graph, provider, ["nonexistent-id"]),
    ).resolves.toBeUndefined();
    expect(countEmbeddings(graph).entities).toBe(0);
  });

  test("is a no-op for empty ID list", async () => {
    const provider = makeStubProvider(3);
    await generateEntityEmbeddings(graph, provider, []);
    expect(countEmbeddings(graph).entities).toBe(0);
  });

  test("does not throw when provider.embed fails", async () => {
    const ep = addTestEpisode(graph);
    const entity = addEntity(
      graph,
      { canonical_name: "Fragile", entity_type: "module" },
      [{ episode_id: ep.id, extractor: "test" }],
    );

    const provider: AIProvider = {
      modelName: () => "stub-model",
      embed: async () => {
        throw new Error("provider offline");
      },
      extract: async () => [],
    };

    await expect(
      generateEntityEmbeddings(graph, provider, [entity.id]),
    ).resolves.toBeUndefined();
    expect(countEmbeddings(graph).entities).toBe(0);
  });
});

describe("reindexEmbeddings with entities", () => {
  test("reindexes both episodes and entities", async () => {
    const _ep1 = addEpisode(graph, {
      source_type: "manual",
      source_ref: "ep1",
      content: "episode content",
      timestamp: new Date().toISOString(),
    });
    const ep2 = addTestEpisode(graph);
    const _entity = addEntity(
      graph,
      { canonical_name: "FileModule", entity_type: "module" },
      [{ episode_id: ep2.id, extractor: "test" }],
    );

    const provider: AIProvider = {
      modelName: () => "reindex-model",
      embed: async (texts) => texts.map(() => [1, 0, 0]),
      extract: async () => [],
    };

    const result = await reindexEmbeddings(graph, provider);

    // Should have reindexed 2 episodes + 1 entity
    expect(result.total).toBe(3);
    expect(result.done).toBe(3);
    expect(result.errors).toBe(0);

    const counts = countEmbeddings(graph);
    expect(counts.episodes).toBe(2);
    expect(counts.entities).toBe(1);
  });

  test("entity embeddings are queryable via findSimilar after reindex", async () => {
    const ep = addTestEpisode(graph);
    addEntity(graph, { canonical_name: "EntityA", entity_type: "module" }, [
      { episode_id: ep.id, extractor: "test" },
    ]);
    addEntity(graph, { canonical_name: "EntityB", entity_type: "module" }, [
      { episode_id: ep.id, extractor: "test" },
    ]);

    const provider: AIProvider = {
      modelName: () => "search-model",
      embed: async (texts) => {
        // EntityA → [1,0,0], EntityB → [0,1,0] (based on index in batch)
        return texts.map((_, i) => {
          const v = [0, 0, 0];
          v[i % 3] = 1;
          return v;
        });
      },
      extract: async () => [],
    };

    await reindexEmbeddings(graph, provider);

    const results = findSimilar(graph, [1, 0, 0], {
      target_type: "entity",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.target_type === "entity")).toBe(true);
  });
});
