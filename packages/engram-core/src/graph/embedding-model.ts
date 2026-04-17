/**
 * embedding-model.ts — Per-database embedding model identity helpers.
 *
 * Stores and enforces the embedding model used within a .engram file.
 * All embeddings in one database must use the same model — mismatch means
 * similarity search returns garbage.
 */

import type { EngramGraph } from "../format/index.js";

export class EmbeddingModelMismatchError extends Error {
  constructor(
    public readonly storedModel: string,
    public readonly storedDimensions: number,
    public readonly activeModel: string,
    public readonly activeDimensions?: number,
  ) {
    super("Embedding model mismatch.");
    this.name = "EmbeddingModelMismatchError";
  }
}

export interface EmbeddingModelConfig {
  model: string;
  dimensions: number;
}

function getMeta(graph: EngramGraph, key: string): string | null {
  const row = graph.db
    .query<{ value: string }, [string]>(
      "SELECT value FROM metadata WHERE key = ?",
    )
    .get(key);
  return row?.value ?? null;
}

/**
 * Returns the embedding model recorded in this database, or null if unset.
 */
export function getEmbeddingModel(
  graph: EngramGraph,
): EmbeddingModelConfig | null {
  const model = getMeta(graph, "embedding_model");
  if (!model) return null;
  const dims = getMeta(graph, "embedding_dimensions");
  return {
    model,
    dimensions: dims ? parseInt(dims, 10) : 0,
  };
}

/**
 * Records the embedding model in this database's metadata.
 * Upserts — safe to call on both new and existing databases.
 */
export function setEmbeddingModel(
  graph: EngramGraph,
  model: string,
  dimensions: number,
): void {
  const upsert = graph.db.prepare(
    "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  );
  graph.db.transaction(() => {
    upsert.run("embedding_model", model);
    upsert.run("embedding_dimensions", String(dimensions));
  })();
}

/**
 * Called before any vector write. If no model is recorded, records it now.
 * If a different model is recorded, throws EmbeddingModelMismatchError.
 */
export function assertEmbeddingModelForWrite(
  graph: EngramGraph,
  model: string,
  dimensions: number,
): void {
  const stored = getEmbeddingModel(graph);
  if (!stored) {
    setEmbeddingModel(graph, model, dimensions);
    return;
  }
  if (stored.model !== model) {
    throw new EmbeddingModelMismatchError(
      stored.model,
      stored.dimensions,
      model,
      dimensions,
    );
  }
}

/**
 * Called before any vector read (similarity search). Returns 'ok' or 'unrecorded'.
 * Throws EmbeddingModelMismatchError if the active model differs from the stored model.
 */
export function checkEmbeddingModelForRead(
  graph: EngramGraph,
  activeModel: string,
): "ok" | "unrecorded" {
  const stored = getEmbeddingModel(graph);
  if (!stored) return "unrecorded";
  if (stored.model !== activeModel) {
    throw new EmbeddingModelMismatchError(
      stored.model,
      stored.dimensions,
      activeModel,
    );
  }
  return "ok";
}
