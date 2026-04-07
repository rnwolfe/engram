/**
 * embeddings.ts — Embedding storage and similarity search.
 *
 * Provides storeEmbedding() and findSimilar() over the embeddings table.
 * Uses brute-force cosine similarity — no sqlite-vec required at v0.1 scale.
 * Float32Array encoding for the BLOB column.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";

export type EmbeddingTargetType = "entity" | "episode";

export interface StoredEmbedding {
  id: string;
  target_id: string;
  target_type: EmbeddingTargetType;
  model: string;
  dimensions: number;
  vector: number[];
  source_text: string;
  created_at: string;
}

export interface SimilarResult {
  id: string;
  target_id: string;
  target_type: EmbeddingTargetType;
  model: string;
  score: number; // cosine similarity 0-1
}

export interface FindSimilarOpts {
  limit?: number; // default 20
  min_score?: number; // 0-1, default 0.0
  target_type?: EmbeddingTargetType; // filter by type
  model?: string; // filter by model
}

interface EmbeddingRow {
  id: string;
  target_id: string;
  target_type: string;
  model: string;
  dimensions: number;
  vector: Buffer;
  source_text: string;
  created_at: string;
}

/**
 * Encode a number[] as a Float32Array BLOB buffer.
 */
function encodeVector(vec: number[]): Buffer {
  const f32 = new Float32Array(vec);
  return Buffer.from(f32.buffer);
}

/**
 * Decode a BLOB buffer back to number[].
 */
function decodeVector(blob: Buffer): number[] {
  const f32 = new Float32Array(
    blob.buffer,
    blob.byteOffset,
    blob.byteLength / 4,
  );
  return Array.from(f32);
}

/**
 * Compute cosine similarity between two vectors.
 * Returns 0 if either vector is zero-length or has magnitude 0.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 0;

  // Clamp to [0, 1] — cosine can be [-1, 1] but embeddings are typically non-negative
  return Math.max(0, Math.min(1, dot / denom));
}

/**
 * Store an embedding for an entity or episode.
 * Upserts by (target_type, target_id, model) — one embedding per target per model.
 */
export function storeEmbedding(
  graph: EngramGraph,
  targetId: string,
  targetType: EmbeddingTargetType,
  model: string,
  embedding: number[],
  sourceText: string,
): void {
  const id = ulid();
  const now = new Date().toISOString();
  const vectorBlob = encodeVector(embedding);

  graph.db
    .prepare<
      void,
      [string, string, string, string, number, Buffer, string, string]
    >(
      `INSERT INTO embeddings (id, target_type, target_id, model, dimensions, vector, source_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_type, target_id, model) DO UPDATE SET
         id = excluded.id,
         dimensions = excluded.dimensions,
         vector = excluded.vector,
         source_text = excluded.source_text,
         created_at = excluded.created_at`,
    )
    .run(
      id,
      targetType,
      targetId,
      model,
      embedding.length,
      vectorBlob,
      sourceText,
      now,
    );
}

/**
 * Find items similar to a query embedding using brute-force cosine similarity.
 * Returns results sorted by score descending.
 */
export function findSimilar(
  graph: EngramGraph,
  queryEmbedding: number[],
  opts: FindSimilarOpts = {},
): SimilarResult[] {
  if (queryEmbedding.length === 0) return [];

  const limit = opts.limit ?? 20;
  const minScore = opts.min_score ?? 0.0;

  let sql =
    "SELECT id, target_id, target_type, model, dimensions, vector, source_text, created_at FROM embeddings WHERE 1=1";
  const params: unknown[] = [];

  if (opts.target_type) {
    sql += " AND target_type = ?";
    params.push(opts.target_type);
  }

  if (opts.model) {
    sql += " AND model = ?";
    params.push(opts.model);
  }

  const rows = graph.db.query<EmbeddingRow, unknown[]>(sql).all(...params);

  const results: SimilarResult[] = rows
    .map((row) => {
      const vec = decodeVector(row.vector);
      const score = cosineSimilarity(queryEmbedding, vec);
      return {
        id: row.id,
        target_id: row.target_id,
        target_type: row.target_type as EmbeddingTargetType,
        model: row.model,
        score,
      };
    })
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}
