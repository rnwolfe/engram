/**
 * utils.ts — Shared AI utility helpers used by ingestion pipelines.
 */

import type { EngramGraph } from "../format/index.js";
import { setEmbeddingModel } from "../graph/embedding-model.js";
import { storeEmbedding } from "../graph/embeddings.js";
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
 * Clears all existing embeddings first, then re-generates in batches.
 * Updates the stored embedding model metadata after completion.
 *
 * onProgress is called after each batch (batch size 50).
 */
export async function reindexEmbeddings(
  graph: EngramGraph,
  provider: AIProvider,
  onProgress?: (p: ReindexProgress) => void,
): Promise<ReindexProgress> {
  // Clear existing embeddings and metadata so assertEmbeddingModelForWrite
  // will populate fresh values on the first write.
  graph.db.run("DELETE FROM embeddings");
  graph.db.run(
    "DELETE FROM metadata WHERE key IN ('embedding_model', 'embedding_dimensions')",
  );

  const allEpisodes = graph.db
    .query<{ id: string; content: string }, []>(
      "SELECT id, content FROM episodes WHERE status != 'redacted' ORDER BY id",
    )
    .all();

  const total = allEpisodes.length;
  let done = 0;
  let errors = 0;

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
          storeEmbedding(
            graph,
            batch[i].id,
            "episode",
            provider.modelName(),
            embedding,
            batch[i].content.slice(0, 500),
          );
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

  // Ensure metadata is always updated even if no episodes exist
  const firstEmbed = graph.db
    .query<{ model: string; dimensions: number }, []>(
      "SELECT model, dimensions FROM embeddings LIMIT 1",
    )
    .get();
  if (firstEmbed) {
    setEmbeddingModel(graph, firstEmbed.model, firstEmbed.dimensions);
  }

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
