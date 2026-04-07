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
 * Check whether the provider can produce embeddings by attempting a small
 * probe embed. Returns true if embeddings are available, false otherwise.
 */
async function isProviderAvailable(provider: AIProvider): Promise<boolean> {
  try {
    const result = await provider.embed(["probe"]);
    return result.length > 0 && result[0].length > 0;
  } catch {
    return false;
  }
}

/**
 * Run a single question against the graph using hybrid FTS+vector search.
 *
 * When the provider is unavailable (returns empty embeddings), the runner
 * falls back to FTS-only search — identical to vcs-only behavior — so that
 * degraded results are truly comparable rather than being "hybrid with zero
 * vectors".
 *
 * @param graph - Populated EngramGraph to search.
 * @param question - Ground-truth question.
 * @param provider - AIProvider for embedding generation.
 * @param providerAvailable - Pre-checked availability (avoids redundant probe per question).
 * @returns BenchmarkResult with metrics and latency.
 */
export async function runQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
  provider: AIProvider,
  providerAvailable?: boolean,
): Promise<BenchmarkResult> {
  const start = performance.now();

  // If the provider is known unavailable (Ollama offline / returns empty
  // embeddings), skip hybrid mode entirely and use FTS-only — this produces
  // results identical to the vcs-only runner rather than "hybrid with zero
  // vectors" which would be a meaningless intermediate state.
  const useHybrid = providerAvailable ?? (await isProviderAvailable(provider));

  // limit: 20 ensures enough entity results survive after filtering out
  // episode/edge results. Graph traversal adds entity candidates that need
  // room to surface alongside FTS-direct hits.
  const results = await search(graph, question.question, {
    limit: 20,
    ...(useHybrid
      ? { mode: "hybrid" as const, provider }
      : { mode: "fulltext" as const }),
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
    query_type: question.query_type,
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
 * Probes the provider once before the run to determine availability. If the
 * provider is offline, all questions are evaluated using FTS-only search
 * (identical to vcs-only behavior).
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
  // Probe availability once so every question gets a consistent mode rather
  // than each question independently re-probing (avoids unnecessary overhead).
  const providerAvailable = await isProviderAvailable(provider);

  const results = await Promise.all(
    questions.map((q) => runQuestion(graph, q, provider, providerAvailable)),
  );
  return generateReport(results, BASELINE_NAME);
}
