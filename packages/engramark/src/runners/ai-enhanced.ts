/**
 * runners/ai-enhanced.ts — AI-enhanced benchmark runner.
 *
 * Uses the appropriate retrieval operation per question type:
 *   - keyword:         search() with hybrid FTS+vector (or FTS-only fallback).
 *                      search() will short-circuit to entity-anchored graph
 *                      traversal when the query string exactly matches an
 *                      entity canonical name or alias — that's the search()
 *                      contract; the benchmark measures what the real
 *                      retrieval API does.
 *   - relational:      resolveEntity() + findEdges() filtered by
 *                      question.expected_relation (same as vcs-only).
 *   - graph_traversal: resolveEntity() + getNeighbors({ edge_kinds: ["inferred"] })
 *                      — traversal is restricted to inferred edges
 *                      (likely_owner_of, co_changes_with) so the high-fanout
 *                      observed authored_by edges don't drown out the intended
 *                      signal. Same as vcs-only.
 *
 * Relational and graph questions use identical graph operations regardless of
 * AI provider availability — the graph structure is the same. The AI-enhanced
 * difference only applies to keyword (text retrieval) questions.
 */

import type { AIProvider, EngramGraph } from "engram-core";
import {
  findEdges,
  getEntity,
  getNeighbors,
  resolveEntity,
  search,
} from "engram-core";
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
 * Run a keyword question via hybrid FTS+vector search (or FTS-only fallback).
 */
async function runKeywordQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
  provider: AIProvider,
  providerAvailable: boolean,
): Promise<BenchmarkResult> {
  const start = performance.now();

  const results = await search(graph, question.question, {
    limit: 20,
    ...(providerAvailable
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
 * Run a relational question via entity resolution + single-hop edge traversal.
 */
function runRelationalQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): BenchmarkResult {
  const start = performance.now();

  const anchor = resolveEntity(graph, question.question.trim());

  const retrievedEntities: string[] = [];

  if (anchor && question.expected_relation) {
    const outbound = findEdges(graph, {
      source_id: anchor.id,
      relation_type: question.expected_relation,
      active_only: true,
    });
    const inbound = findEdges(graph, {
      target_id: anchor.id,
      relation_type: question.expected_relation,
      active_only: true,
    });

    const allEdges = [...outbound, ...inbound].sort(
      (a, b) => b.confidence - a.confidence,
    );

    const seen = new Set<string>();
    for (const edge of allEdges) {
      const otherId =
        edge.source_id === anchor.id ? edge.target_id : edge.source_id;
      if (seen.has(otherId)) continue;
      seen.add(otherId);

      const other = getEntity(graph, otherId);
      if (other && other.status === "active") {
        retrievedEntities.push(other.canonical_name);
      }
    }
  }

  const latency_ms = performance.now() - start;

  const metrics = computeMetrics(
    question.expected_entities,
    retrievedEntities,
    retrievedEntities,
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
 * Run a graph traversal question via entity resolution + multi-hop BFS.
 */
function runGraphQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): BenchmarkResult {
  const start = performance.now();

  const anchor = resolveEntity(graph, question.question.trim());

  let retrievedEntities: string[] = [];

  if (anchor) {
    // Restrict traversal to inferred edges (likely_owner_of, co_changes_with).
    // Without this filter, observed edges like authored_by create a high-fanout
    // star from every person to every file they ever touched, flooding the
    // neighbor set and drowning out the intended signal.
    const subgraph = getNeighbors(graph, anchor.id, {
      depth: 2,
      edge_kinds: ["inferred"],
    });

    retrievedEntities = subgraph.entities
      .filter((e) => e.id !== anchor.id && e.status === "active")
      .map((e) => e.canonical_name);
  }

  const latency_ms = performance.now() - start;

  const metrics = computeMetrics(
    question.expected_entities,
    retrievedEntities,
    retrievedEntities,
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
 * Run a single question using the appropriate retrieval operation.
 */
export async function runQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
  provider: AIProvider,
  providerAvailable?: boolean,
): Promise<BenchmarkResult> {
  switch (question.query_type) {
    case "relational":
      return runRelationalQuestion(graph, question);
    case "graph_traversal":
      return runGraphQuestion(graph, question);
    default: {
      const available =
        providerAvailable ?? (await isProviderAvailable(provider));
      return runKeywordQuestion(graph, question, provider, available);
    }
  }
}

/**
 * Run the full AI-enhanced benchmark suite.
 */
export async function runBenchmark(
  graph: EngramGraph,
  questions: GroundTruthQuestion[],
  provider: AIProvider,
): Promise<BenchmarkReport> {
  const providerAvailable = await isProviderAvailable(provider);

  const results = await Promise.all(
    questions.map((q) => runQuestion(graph, q, provider, providerAvailable)),
  );
  return generateReport(results, BASELINE_NAME);
}
