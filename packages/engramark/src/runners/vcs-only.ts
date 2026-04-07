/**
 * runners/vcs-only.ts — VCS-only baseline benchmark runner.
 *
 * Ingests a git repository using ingestGitRepo, then evaluates retrieval
 * quality by running search() against each ground-truth question and
 * measuring recall@5, MRR, and context size.
 */

import type { EngramGraph } from "engram-core";
import { search } from "engram-core";
import type { GroundTruthQuestion } from "../datasets/fastify/questions.js";
import type { BenchmarkReport, BenchmarkResult } from "../metrics.js";
import { computeMetrics } from "../metrics.js";
import { generateReport } from "../report.js";

export const BASELINE_NAME = "vcs-only";

/**
 * Run a single question against the graph using full-text search.
 *
 * @param graph - Populated EngramGraph to search.
 * @param question - Ground-truth question.
 * @returns BenchmarkResult with metrics and latency.
 */
export async function runQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): Promise<BenchmarkResult> {
  const start = performance.now();

  const results = await search(graph, question.question, {
    limit: 10,
    mode: "fulltext",
  });

  const latency_ms = performance.now() - start;

  // Extract canonical names / content from results
  const retrievedEntities = results
    .filter((r) => r.type === "entity")
    .map((r) => r.content);

  const contents = results.map((r) => r.content);

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
 * Run the full benchmark suite against the given graph and questions.
 *
 * @param graph - Populated EngramGraph (pre-ingested with git data).
 * @param questions - Ground-truth questions to evaluate.
 * @returns BenchmarkReport with per-question results and aggregate metrics.
 */
export async function runBenchmark(
  graph: EngramGraph,
  questions: GroundTruthQuestion[],
): Promise<BenchmarkReport> {
  const results = await Promise.all(
    questions.map((q) => runQuestion(graph, q)),
  );
  return generateReport(results, BASELINE_NAME);
}
