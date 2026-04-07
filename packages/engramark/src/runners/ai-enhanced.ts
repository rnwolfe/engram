/**
 * runners/ai-enhanced.ts — AI-enhanced benchmark runner.
 *
 * Ingests a git repository with an OllamaProvider, then evaluates retrieval
 * quality using hybrid FTS+vector search. Degrades gracefully to vcs-only
 * behavior when Ollama is unavailable (provider returns empty embeddings).
 */

import type { AIProvider, EngramGraph } from "engram-core";
import { search } from "engram-core";
import type { GroundTruthQuestion } from "../datasets/fastify/questions.js";
import type { BenchmarkReport, BenchmarkResult } from "../metrics.js";
import { computeMetrics } from "../metrics.js";
import { generateReport } from "../report.js";

export const BASELINE_NAME = "ai-enhanced";

/**
 * Run a single question against the graph using hybrid FTS+vector search.
 *
 * @param graph - Populated EngramGraph to search.
 * @param question - Ground-truth question.
 * @param provider - AIProvider for embedding generation.
 * @returns BenchmarkResult with metrics and latency.
 */
export async function runQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
  provider: AIProvider,
): Promise<BenchmarkResult> {
  const start = performance.now();

  const results = await search(graph, question.question, {
    limit: 10,
    mode: "hybrid",
    provider,
  });

  const latency_ms = performance.now() - start;

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
 * Run the full AI-enhanced benchmark suite against the given graph and questions.
 *
 * @param graph - Populated EngramGraph (pre-ingested with git data).
 * @param questions - Ground-truth questions to evaluate.
 * @param provider - AIProvider for embedding generation (OllamaProvider recommended).
 * @returns BenchmarkReport with per-question results and aggregate metrics.
 */
export async function runBenchmark(
  graph: EngramGraph,
  questions: GroundTruthQuestion[],
  provider: AIProvider,
): Promise<BenchmarkReport> {
  const results = await Promise.all(
    questions.map((q) => runQuestion(graph, q, provider)),
  );
  return generateReport(results, BASELINE_NAME);
}
