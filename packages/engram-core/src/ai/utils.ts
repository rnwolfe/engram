/**
 * utils.ts — Shared AI utility helpers used by ingestion pipelines.
 */

import type { EngramGraph } from "../format/index.js";
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
