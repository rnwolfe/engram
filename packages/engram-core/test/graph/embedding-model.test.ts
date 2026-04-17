/**
 * embedding-model.test.ts — Tests for per-database embedding model enforcement.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  assertEmbeddingModelForWrite,
  checkEmbeddingModelForRead,
  closeGraph,
  createGraph,
  EmbeddingModelMismatchError,
  getEmbeddingModel,
  setEmbeddingModel,
  storeEmbedding,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

describe("getEmbeddingModel", () => {
  test("returns null when no model is recorded", () => {
    expect(getEmbeddingModel(graph)).toBeNull();
  });

  test("returns stored model after setEmbeddingModel", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    const cfg = getEmbeddingModel(graph);
    expect(cfg).not.toBeNull();
    expect(cfg?.model).toBe("nomic-embed-text");
    expect(cfg?.dimensions).toBe(384);
  });

  test("setEmbeddingModel upserts — second call overwrites", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    setEmbeddingModel(graph, "text-embedding-3-small", 1536);
    const cfg = getEmbeddingModel(graph);
    expect(cfg?.model).toBe("text-embedding-3-small");
    expect(cfg?.dimensions).toBe(1536);
  });
});

describe("assertEmbeddingModelForWrite", () => {
  test("populates metadata on first call when absent", () => {
    expect(getEmbeddingModel(graph)).toBeNull();
    assertEmbeddingModelForWrite(graph, "nomic-embed-text", 384);
    const cfg = getEmbeddingModel(graph);
    expect(cfg?.model).toBe("nomic-embed-text");
    expect(cfg?.dimensions).toBe(384);
  });

  test("succeeds silently when model matches stored", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    expect(() =>
      assertEmbeddingModelForWrite(graph, "nomic-embed-text", 384),
    ).not.toThrow();
  });

  test("throws EmbeddingModelMismatchError when model differs", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    expect(() =>
      assertEmbeddingModelForWrite(graph, "text-embedding-3-small", 1536),
    ).toThrow(EmbeddingModelMismatchError);
  });

  test("mismatch error exposes stored and active model", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    try {
      assertEmbeddingModelForWrite(graph, "text-embedding-004", 768);
    } catch (err) {
      expect(err).toBeInstanceOf(EmbeddingModelMismatchError);
      const e = err as EmbeddingModelMismatchError;
      expect(e.storedModel).toBe("nomic-embed-text");
      expect(e.storedDimensions).toBe(384);
      expect(e.activeModel).toBe("text-embedding-004");
      expect(e.activeDimensions).toBe(768);
    }
  });
});

describe("checkEmbeddingModelForRead", () => {
  test("returns 'unrecorded' when no model is stored", () => {
    expect(checkEmbeddingModelForRead(graph, "nomic-embed-text")).toBe(
      "unrecorded",
    );
  });

  test("returns 'ok' when active model matches stored", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    expect(checkEmbeddingModelForRead(graph, "nomic-embed-text")).toBe("ok");
  });

  test("throws EmbeddingModelMismatchError when model differs", () => {
    setEmbeddingModel(graph, "nomic-embed-text", 384);
    expect(() =>
      checkEmbeddingModelForRead(graph, "text-embedding-3-small"),
    ).toThrow(EmbeddingModelMismatchError);
  });
});

describe("storeEmbedding integration", () => {
  test("populates embedding_model metadata on first storeEmbedding", () => {
    expect(getEmbeddingModel(graph)).toBeNull();
    storeEmbedding(
      graph,
      "ep-1",
      "episode",
      "nomic-embed-text",
      [0.1, 0.2, 0.3],
      "text",
    );
    const cfg = getEmbeddingModel(graph);
    expect(cfg?.model).toBe("nomic-embed-text");
    expect(cfg?.dimensions).toBe(3);
  });

  test("throws when storeEmbedding uses a different model than stored", () => {
    storeEmbedding(
      graph,
      "ep-1",
      "episode",
      "nomic-embed-text",
      [0.1, 0.2, 0.3],
      "text",
    );
    expect(() =>
      storeEmbedding(
        graph,
        "ep-2",
        "episode",
        "text-embedding-3-small",
        [0.4, 0.5, 0.6],
        "other",
      ),
    ).toThrow(EmbeddingModelMismatchError);
  });
});
