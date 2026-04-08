/**
 * runners/vcs-only.ts — VCS-only benchmark runner.
 *
 * Uses the appropriate retrieval operation per question type:
 *   - keyword:         search() with FTS (text retrieval)
 *   - relational:      resolveEntity() + findEdges() (single-hop edge traversal)
 *   - graph_traversal: resolveEntity() + getNeighbors() (multi-hop traversal)
 */

import type { EngramGraph } from "engram-core";
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

export const BASELINE_NAME = "vcs-only";

/**
 * Run a keyword question via full-text search.
 */
async function runKeywordQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): Promise<BenchmarkResult> {
  const start = performance.now();

  const results = await search(graph, question.question, {
    limit: 20,
    mode: "fulltext",
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
 *
 * Resolves the query to an entity, then follows edges of the expected
 * relation type to find connected entities. This tests whether the graph
 * has the right edges — something grep cannot do.
 */
function runRelationalQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): BenchmarkResult {
  const start = performance.now();

  const anchor = resolveEntity(graph, question.question.trim());

  const retrievedEntities: string[] = [];

  if (anchor && question.expected_relation) {
    // Find edges in both directions with the expected relation type
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

    // Collect the "other end" entities, sorted by confidence descending
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
 *
 * Resolves the query to an entity, then traverses up to 2 hops across
 * all edge types. This tests multi-hop reasoning — something that requires
 * composing multiple edges across the graph.
 */
function runGraphQuestion(
  graph: EngramGraph,
  question: GroundTruthQuestion,
): BenchmarkResult {
  const start = performance.now();

  const anchor = resolveEntity(graph, question.question.trim());

  let retrievedEntities: string[] = [];

  if (anchor) {
    const subgraph = getNeighbors(graph, anchor.id, { depth: 2 });

    // Exclude the anchor itself from results
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
): Promise<BenchmarkResult> {
  switch (question.query_type) {
    case "relational":
      return runRelationalQuestion(graph, question);
    case "graph_traversal":
      return runGraphQuestion(graph, question);
    default:
      return runKeywordQuestion(graph, question);
  }
}

/**
 * Run the full benchmark suite against the given graph and questions.
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
