/**
 * metrics.ts — Retrieval quality metrics and result types for EngRAMark.
 */

import type { QueryType } from "./datasets/fastify/questions.js";

// ─── Core metric types ────────────────────────────────────────────────────────

export interface RetrievalMetrics {
  /** Fraction of expected entities found in top-k results (k=5). */
  recall_at_k: number;
  /** Mean reciprocal rank: 1 / rank_of_first_expected_entity. */
  mrr: number;
  /** Average token-equivalent context size: total chars / 4. */
  avg_context_size: number;
}

export interface BenchmarkResult {
  baseline: string;
  category: string;
  query_type: QueryType;
  question_id: string;
  question: string;
  retrieved_entities: string[];
  metrics: RetrievalMetrics;
  latency_ms: number;
}

export interface BenchmarkReport {
  run_at: string;
  baseline: string;
  results: BenchmarkResult[];
  aggregate: {
    avg_recall_at_5: number;
    avg_mrr: number;
    avg_latency_ms: number;
    total_questions: number;
  };
}

// ─── Metric computation ───────────────────────────────────────────────────────

/**
 * Recall@k: fraction of expected entities found in the top-k retrieved items.
 *
 * @param expected - Ground-truth entity names.
 * @param retrieved - Retrieved entity names in rank order.
 * @param k - Cutoff rank (default 5).
 * @returns Value in [0, 1]. Returns 0 if expected is empty.
 */
export function recallAtK(
  expected: string[],
  retrieved: string[],
  k = 5,
): number {
  if (expected.length === 0) return 0;
  const topK = retrieved.slice(0, k);
  const hits = expected.filter((e) => topK.includes(e)).length;
  return hits / expected.length;
}

/**
 * Mean Reciprocal Rank: 1 / rank of the first expected entity in retrieved list.
 *
 * @param expected - Ground-truth entity names.
 * @param retrieved - Retrieved entity names in rank order (1-indexed internally).
 * @returns Value in (0, 1]. Returns 0 if no expected entity is found.
 */
export function mrr(expected: string[], retrieved: string[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (expected.includes(retrieved[i])) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

/**
 * Estimate context size in tokens (chars / 4 approximation).
 *
 * @param contents - Array of content strings returned by search.
 * @returns Estimated token count.
 */
export function estimateContextSize(contents: string[]): number {
  const totalChars = contents.reduce((sum, c) => sum + c.length, 0);
  return Math.ceil(totalChars / 4);
}

/**
 * Compute RetrievalMetrics for a single question result.
 *
 * @param expected - Ground-truth entity names.
 * @param retrieved - Retrieved entity names in rank order.
 * @param contents - Content strings from search results (for context size).
 * @param k - Recall cutoff (default 5).
 */
export function computeMetrics(
  expected: string[],
  retrieved: string[],
  contents: string[],
  k = 5,
): RetrievalMetrics {
  return {
    recall_at_k: recallAtK(expected, retrieved, k),
    mrr: mrr(expected, retrieved),
    avg_context_size: estimateContextSize(contents),
  };
}
