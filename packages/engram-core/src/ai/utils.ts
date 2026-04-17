/**
 * utils.ts — Shared AI utility helpers used by ingestion pipelines.
 */

import type { EngramGraph } from "../format/index.js";
import { setEmbeddingModel } from "../graph/embedding-model.js";
import { storeEmbedding, storeEmbeddingRaw } from "../graph/embeddings.js";
import type { AIProvider } from "./provider.js";

interface EpisodeContentRow {
  id: string;
  content: string;
}

/**
 * Generate embeddings for a batch of episode IDs using the given provider.
 * Never throws — embedding failures are logged and skipped.
 */
export async function generateEpisodeEmbeddings(
  graph: EngramGraph,
  provider: AIProvider,
  episodeIds: string[],
): Promise<void> {
  if (episodeIds.length === 0) return;

  // Fetch episode content
  const rows: EpisodeContentRow[] = [];
  for (const id of episodeIds) {
    const row = graph.db
      .query<EpisodeContentRow, [string]>(
        "SELECT id, content FROM episodes WHERE id = ?",
      )
      .get(id);
    if (row) rows.push(row);
  }

  if (rows.length === 0) return;

  try {
    const texts = rows.map((r) => r.content);
    const embeddings = await provider.embed(texts);

    for (let i = 0; i < rows.length; i++) {
      const embedding = embeddings[i];
      if (!embedding || embedding.length === 0) continue;

      try {
        storeEmbedding(
          graph,
          rows[i].id,
          "episode",
          provider.modelName(),
          embedding,
          rows[i].content.slice(0, 500),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[engram] generateEpisodeEmbeddings: skip ${rows[i].id}: ${msg}`,
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[engram] generateEpisodeEmbeddings: provider error: ${msg}`);
  }
}

export interface ReindexProgress {
  total: number;
  done: number;
  errors: number;
}

/**
 * Re-index all episodes in the graph with the given provider.
 *
 * Atomic approach: write new embeddings first (old ones preserved), then swap
 * in a single transaction (delete stale rows, update metadata). A crash at any
 * point before the final swap leaves the database in its previous valid state.
 *
 * onProgress is called after each batch (batch size 50).
 */
export async function reindexEmbeddings(
  graph: EngramGraph,
  provider: AIProvider,
  onProgress?: (p: ReindexProgress) => void,
): Promise<ReindexProgress> {
  const newModel = provider.modelName();

  const allEpisodes = graph.db
    .query<{ id: string; content: string }, []>(
      "SELECT id, content FROM episodes WHERE status != 'redacted' ORDER BY id",
    )
    .all();

  const total = allEpisodes.length;
  let done = 0;
  let errors = 0;
  let newDimensions = 0;

  const BATCH = 50;
  for (let offset = 0; offset < allEpisodes.length; offset += BATCH) {
    const batch = allEpisodes.slice(offset, offset + BATCH);
    const texts = batch.map((r) => r.content);

    try {
      const embeddings = await provider.embed(texts);
      for (let i = 0; i < batch.length; i++) {
        const embedding = embeddings[i];
        if (!embedding || embedding.length === 0) {
          errors++;
          continue;
        }
        try {
          // storeEmbeddingRaw bypasses the model assertion — old embeddings
          // remain under their original model key until the final swap.
          storeEmbeddingRaw(
            graph,
            batch[i].id,
            "episode",
            newModel,
            embedding,
            batch[i].content.slice(0, 500),
          );
          if (newDimensions === 0) newDimensions = embedding.length;
          done++;
        } catch {
          errors++;
        }
      }
    } catch {
      errors += batch.length;
    }

    onProgress?.({ total, done, errors });
  }

  // Atomic swap: delete stale embeddings and record the new model.
  // Old embeddings with a different model are removed here, not before.
  graph.db.transaction(() => {
    graph.db.run("DELETE FROM embeddings WHERE model != ?", newModel);
    if (newDimensions > 0) {
      setEmbeddingModel(graph, newModel, newDimensions);
    }
  })();

  return { total, done, errors };
}

/**
 * Count embeddings in the graph, split by target type.
 */
export function countEmbeddings(graph: EngramGraph): {
  entities: number;
  episodes: number;
  total: number;
} {
  const row = graph.db
    .query<{ entities: number; episodes: number }, []>(
      `SELECT
        SUM(CASE WHEN target_type = 'entity' THEN 1 ELSE 0 END) AS entities,
        SUM(CASE WHEN target_type = 'episode' THEN 1 ELSE 0 END) AS episodes
       FROM embeddings`,
    )
    .get();
  const entities = row?.entities ?? 0;
  const episodes = row?.episodes ?? 0;
  return { entities, episodes, total: entities + episodes };
}
