/**
 * runners/grep-baseline.ts — Raw grep/FTS5 baseline benchmark runner.
 *
 * Simulates raw "git log + grep" retrieval by querying episode content
 * directly via SQLite FTS5, without any graph structure or scoring.
 * This is the baseline that the VCS-only runner should outperform.
 */

import type { EngramGraph } from "engram-core";
import type { GroundTruthQuestion } from "../datasets/fastify/questions.js";
import type { BenchmarkReport, BenchmarkResult } from "../metrics.js";
import { computeMetrics } from "../metrics.js";
import { generateReport } from "../report.js";

export const BASELINE_NAME = "grep-baseline";

interface EpisodeRow {
  id: string;
  content: string;
}

/**
 * Escape a query string for FTS5 MATCH, token-by-token.
 */
function escapeFts(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}

/**
 * Run a single question using direct FTS5 episode search (no graph layer).
 *
 * Retrieves episode content snippets and treats them as the "entities"
 * returned — i.e. raw text matches, not structured graph nodes.
 *
 * @param graph - EngramGraph to search against.
 * @param question - Ground-truth question.
 * @param limit - Maximum results to retrieve (default 10).
 * @returns BenchmarkResult with metrics and latency.
 */
export function runQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
  limit = 10,
): BenchmarkResult {
  const start = performance.now();

  let rows: EpisodeRow[] = [];

  try {
    const ftsQuery = escapeFts(question.question);
    rows = graph.db
      .query<EpisodeRow, [string, number]>(
        `SELECT episodes.id, episodes.content
         FROM episodes_fts
         JOIN episodes ON episodes._rowid = episodes_fts.rowid
         WHERE episodes_fts MATCH ?
           AND episodes.status = 'active'
         ORDER BY episodes_fts.rank
         LIMIT ?`,
      )
      .all(ftsQuery, limit);
  } catch {
    rows = [];
  }

  const latency_ms = performance.now() - start;

  // For entity matching: scan the full episode content (not truncated).
  // Build retrievedEntities in ranked order: scan content top-to-bottom
  // and record the first expected entity found in each episode.
  const retrievedEntities: string[] = [];
  const addedEntities = new Set<string>();
  for (const row of rows) {
    for (const expected of question.expected_entities) {
      if (
        !addedEntities.has(expected) &&
        row.content.toLowerCase().includes(expected.toLowerCase())
      ) {
        retrievedEntities.push(expected);
        addedEntities.add(expected);
      }
    }
  }

  // Extract truncated content snippets for display / context-size metrics.
  const contents = rows.map((r) =>
    r.content.length > 200 ? `${r.content.slice(0, 200)}…` : r.content,
  );

  const metrics = computeMetrics(
    question.expected_entities,
    retrievedEntities,
    contents,
    5,
  );

  return {
    baseline: BASELINE_NAME,
    category: question.category,
    question_id: question.id,
    question: question.question,
    retrieved_entities: retrievedEntities,
    metrics,
    latency_ms,
  };
}

/**
 * Run the full grep baseline benchmark suite.
 *
 * @param graph - Populated EngramGraph to search.
 * @param questions - Ground-truth questions to evaluate.
 * @returns BenchmarkReport with per-question results and aggregate metrics.
 */
export function runBenchmark(
  graph: EngramGraph,
  questions: GroundTruthQuestion[],
): BenchmarkReport {
  const results = questions.map((q) => runQuestion(graph, q));
  return generateReport(results, BASELINE_NAME);
}
