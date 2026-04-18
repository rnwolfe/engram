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

interface EntityTextRow {
  id: string;
  canonical_name: string;
  summary: string | null;
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

/**
 * Build the embedding text for an entity: name + optional summary.
 */
function entityEmbeddingText(name: string, summary: string | null): string {
  const trimmed = summary?.trim();
  return trimmed ? `${name.trim()} ${trimmed}` : name.trim();
}

/**
 * Generate embeddings for a batch of entity IDs using the given provider.
 * Never throws — embedding failures are logged and skipped.
 */
export async function generateEntityEmbeddings(
  graph: EngramGraph,
  provider: AIProvider,
  entityIds: string[],
): Promise<void> {
  if (entityIds.length === 0) return;

  const placeholders = entityIds.map(() => "?").join(", ");
  const rows = graph.db
    .query<EntityTextRow, string[]>(
      `SELECT id, canonical_name, summary FROM entities WHERE id IN (${placeholders}) AND status = 'active'`,
    )
    .all(...entityIds);

  if (rows.length === 0) return;

  try {
    const texts = rows.map((r) =>
      entityEmbeddingText(r.canonical_name, r.summary),
    );
    const embeddings = await provider.embed(texts);

    for (let i = 0; i < rows.length; i++) {
      const embedding = embeddings[i];
      if (!embedding || embedding.length === 0) continue;

      try {
        storeEmbedding(
          graph,
          rows[i].id,
          "entity",
          provider.modelName(),
          embedding,
          texts[i].slice(0, 500),
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[engram] generateEntityEmbeddings: skip ${rows[i].id}: ${msg}`,
        );
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[engram] generateEntityEmbeddings: provider error: ${msg}`);
  }
}

export interface ReindexProgress {
  total: number;
  done: number;
  errors: number;
}

/**
 * Re-index episodes/entities with the given provider.
 *
 * Full reindex (gapOnly=false, default): embeds all targeted items, then atomically
 * deletes stale embeddings under old models and records the new model in metadata.
 * A crash before the final swap leaves the DB in its previous valid state.
 *
 * Gap fill (gapOnly=true): embeds only items that have no embedding under the
 * current model. Existing embeddings are never touched. Model metadata is updated
 * only if it was previously unset.
 *
 * onProgress is called after each batch (batch size 50).
 */
export async function reindexEmbeddings(
  graph: EngramGraph,
  provider: AIProvider,
  onProgress?: (p: ReindexProgress) => void,
  target: "all" | "episodes" | "entities" = "all",
  gapOnly = false,
): Promise<ReindexProgress> {
  const newModel = provider.modelName();

  type WorkItem =
    | { kind: "episode"; id: string; text: string }
    | { kind: "entity"; id: string; text: string };

  const workItems: WorkItem[] = [];

  if (target === "all" || target === "episodes") {
    const sql = gapOnly
      ? `SELECT id, content FROM episodes
         WHERE status != 'redacted'
           AND id NOT IN (SELECT target_id FROM embeddings WHERE target_type = 'episode' AND model = ?)
         ORDER BY id`
      : "SELECT id, content FROM episodes WHERE status != 'redacted' ORDER BY id";
    const rows = gapOnly
      ? graph.db.query<{ id: string; content: string }, [string]>(sql).all(newModel)
      : graph.db.query<{ id: string; content: string }, []>(sql).all();
    for (const r of rows) {
      workItems.push({ kind: "episode", id: r.id, text: r.content });
    }
  }

  if (target === "all" || target === "entities") {
    const sql = gapOnly
      ? `SELECT id, canonical_name, summary FROM entities
         WHERE status = 'active'
           AND id NOT IN (SELECT target_id FROM embeddings WHERE target_type = 'entity' AND model = ?)
         ORDER BY id`
      : "SELECT id, canonical_name, summary FROM entities WHERE status = 'active' ORDER BY id";
    const rows = gapOnly
      ? graph.db.query<EntityTextRow, [string]>(sql).all(newModel)
      : graph.db.query<EntityTextRow, []>(sql).all();
    for (const r of rows) {
      workItems.push({
        kind: "entity",
        id: r.id,
        text: entityEmbeddingText(r.canonical_name, r.summary),
      });
    }
  }

  const total = workItems.length;
  let done = 0;
  let errors = 0;
  let newDimensions = 0;

  const BATCH = 50;
  for (let offset = 0; offset < workItems.length; offset += BATCH) {
    const batch = workItems.slice(offset, offset + BATCH);
    const texts = batch.map((r) => r.text);

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
            batch[i].kind,
            newModel,
            embedding,
            batch[i].text.slice(0, 500),
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

  // Gap fill: no stale-embedding cleanup — only update metadata if it was unset.
  if (gapOnly) {
    if (newDimensions > 0) {
      const existing = graph.db
        .query<{ model: string }, []>("SELECT model FROM embedding_model LIMIT 1")
        .get();
      if (!existing) {
        setEmbeddingModel(graph, newModel, newDimensions);
      }
    }
    return { total, done, errors };
  }

  // Full reindex — atomic swap: delete stale embeddings for targeted types.
  // Only update the stored model metadata for full reindex — a partial reindex
  // (entities or episodes only) leaves the other type's embeddings in place,
  // so updating metadata would record a false "all embeddings use model X" state.
  graph.db.transaction(() => {
    if (target === "all") {
      graph.db.run("DELETE FROM embeddings WHERE model != ?", newModel);
      if (newDimensions > 0) {
        setEmbeddingModel(graph, newModel, newDimensions);
      }
    } else {
      graph.db.run(
        "DELETE FROM embeddings WHERE target_type = ? AND model != ?",
        target === "episodes" ? "episode" : "entity",
        newModel,
      );
      // Do not update metadata — the other type may still use a different model.
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
