/**
 * benchmark.test.ts — EngRAMark benchmark runner tests.
 *
 * Uses a small in-memory fixture graph with synthetic entities, episodes,
 * and edges. Does NOT clone Fastify. Verifies:
 *  - BenchmarkReport has the correct structure
 *  - All metrics are in valid ranges (0–1 for recall/mrr)
 *  - generateReport aggregation is numerically correct
 *  - recallAtK and mrr compute correctly for known inputs
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "engram-core";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
} from "engram-core";
import type { GroundTruthQuestion } from "../src/datasets/fastify/questions.js";
import { FASTIFY_QUESTIONS } from "../src/datasets/fastify/questions.js";
import type { BenchmarkResult } from "../src/metrics.js";
import {
  computeMetrics,
  estimateContextSize,
  mrr,
  recallAtK,
} from "../src/metrics.js";
import { generateReport, printReport } from "../src/report.js";
import { runQuestion as grepRunQuestion } from "../src/runners/grep-baseline.js";
import { runQuestion as vcsRunQuestion } from "../src/runners/vcs-only.js";

// ─── Fixture setup ────────────────────────────────────────────────────────────

let graph: EngramGraph;

/** Build a small synthetic graph for benchmark testing. */
function buildFixture(): EngramGraph {
  const g = createGraph(":memory:");

  // Episodes
  const ep1 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "abc001",
    content:
      "Matteo Collina authored fastify core. Primary maintainer of fastify/fastify.js route handling.",
    actor: "Matteo Collina",
    timestamp: "2024-01-10T10:00:00.000Z",
  });

  const ep2 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "abc002",
    content:
      "Tomas Della Vedova updated lib/reply.js and lib/request.js. Co-change detected.",
    actor: "Tomas Della Vedova",
    timestamp: "2024-02-15T12:00:00.000Z",
  });

  const ep3 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "abc003",
    content:
      "lib/logger.js sole contributor: Matteo Collina. Bus factor risk identified.",
    actor: "Matteo Collina",
    timestamp: "2024-03-01T08:00:00.000Z",
  });

  // Entities
  const matteo = addEntity(
    g,
    {
      canonical_name: "Matteo Collina",
      entity_type: "person",
      summary: "Core maintainer of Fastify",
    },
    [{ episode_id: ep1.id, extractor: "test", confidence: 1.0 }],
  );

  const tomas = addEntity(
    g,
    {
      canonical_name: "Tomas Della Vedova",
      entity_type: "person",
      summary: "Fastify core contributor",
    },
    [{ episode_id: ep2.id, extractor: "test", confidence: 1.0 }],
  );

  const fastifyJs = addEntity(
    g,
    {
      canonical_name: "fastify/fastify.js",
      entity_type: "file",
      summary: "Core entry point of the Fastify framework",
    },
    [{ episode_id: ep1.id, extractor: "test", confidence: 1.0 }],
  );

  const replyJs = addEntity(
    g,
    {
      canonical_name: "lib/reply.js",
      entity_type: "file",
      summary: "Fastify reply object",
    },
    [{ episode_id: ep2.id, extractor: "test", confidence: 1.0 }],
  );

  const loggerJs = addEntity(
    g,
    {
      canonical_name: "lib/logger.js",
      entity_type: "file",
      summary: "Fastify logger integration",
    },
    [{ episode_id: ep3.id, extractor: "test", confidence: 1.0 }],
  );

  // Edges
  addEdge(
    g,
    {
      source_id: matteo.id,
      target_id: fastifyJs.id,
      relation_type: "authored",
      edge_kind: "observed",
      fact: "Matteo Collina authored fastify/fastify.js",
    },
    [{ episode_id: ep1.id, extractor: "git_blame", confidence: 0.95 }],
  );

  addEdge(
    g,
    {
      source_id: tomas.id,
      target_id: replyJs.id,
      relation_type: "authored",
      edge_kind: "observed",
      fact: "Tomas Della Vedova authored lib/reply.js",
    },
    [{ episode_id: ep2.id, extractor: "git_blame", confidence: 0.9 }],
  );

  addEdge(
    g,
    {
      source_id: matteo.id,
      target_id: loggerJs.id,
      relation_type: "sole_author",
      edge_kind: "inferred",
      fact: "Matteo Collina is the sole author of lib/logger.js",
    },
    [
      {
        episode_id: ep3.id,
        extractor: "bus_factor_heuristic",
        confidence: 0.8,
      },
    ],
  );

  return g;
}

beforeEach(() => {
  graph = buildFixture();
});

afterEach(() => {
  closeGraph(graph);
});

// ─── Metric unit tests ────────────────────────────────────────────────────────

describe("recallAtK", () => {
  test("returns 1.0 when all expected are in top-k", () => {
    expect(recallAtK(["A", "B"], ["A", "B", "C"], 5)).toBe(1.0);
  });

  test("returns 0.5 when half expected are in top-k", () => {
    expect(recallAtK(["A", "B"], ["A", "C", "D"], 5)).toBe(0.5);
  });

  test("returns 0.0 when none expected in top-k", () => {
    expect(recallAtK(["A", "B"], ["C", "D", "E"], 5)).toBe(0.0);
  });

  test("respects k cutoff", () => {
    expect(recallAtK(["A"], ["C", "D", "A"], 2)).toBe(0.0);
    expect(recallAtK(["A"], ["C", "D", "A"], 3)).toBe(1.0);
  });

  test("returns 0 for empty expected", () => {
    expect(recallAtK([], ["A", "B"], 5)).toBe(0);
  });
});

describe("mrr", () => {
  test("returns 1.0 when first result matches", () => {
    expect(mrr(["A"], ["A", "B", "C"])).toBe(1.0);
  });

  test("returns 0.5 when second result matches", () => {
    expect(mrr(["A"], ["B", "A", "C"])).toBe(0.5);
  });

  test("returns 1/3 when third result matches", () => {
    expect(mrr(["A"], ["B", "C", "A"])).toBeCloseTo(1 / 3, 5);
  });

  test("returns 0 when no match found", () => {
    expect(mrr(["A"], ["B", "C", "D"])).toBe(0);
  });

  test("uses first match among multiple expected", () => {
    // "B" is at index 0 (rank 1), "A" at index 1 (rank 2)
    expect(mrr(["A", "B"], ["B", "A", "C"])).toBe(1.0);
  });
});

describe("estimateContextSize", () => {
  test("returns 0 for empty input", () => {
    expect(estimateContextSize([])).toBe(0);
  });

  test("approximates tokens as chars/4 ceiling", () => {
    expect(estimateContextSize(["abcd"])).toBe(1); // 4 chars -> 1 token
    expect(estimateContextSize(["abcde"])).toBe(2); // 5 chars -> ceil(5/4) = 2
    expect(estimateContextSize(["a", "bbb"])).toBe(1); // 4 chars total -> 1 token
  });
});

describe("computeMetrics", () => {
  test("returns valid metric object", () => {
    const metrics = computeMetrics(["A", "B"], ["A", "C"], ["hello world"], 5);
    expect(metrics.recall_at_k).toBeGreaterThanOrEqual(0);
    expect(metrics.recall_at_k).toBeLessThanOrEqual(1);
    expect(metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(metrics.mrr).toBeLessThanOrEqual(1);
    expect(metrics.avg_context_size).toBeGreaterThanOrEqual(0);
  });
});

// ─── generateReport tests ─────────────────────────────────────────────────────

describe("generateReport", () => {
  const makeResult = (
    recall: number,
    mrrVal: number,
    latency: number,
  ): BenchmarkResult => ({
    baseline: "test",
    category: "ownership",
    question_id: "test-001",
    question: "Who owns X?",
    retrieved_entities: [],
    metrics: {
      recall_at_k: recall,
      mrr: mrrVal,
      avg_context_size: 10,
    },
    latency_ms: latency,
  });

  test("produces correct aggregate for empty results", () => {
    const report = generateReport([], "test-baseline");
    expect(report.aggregate.total_questions).toBe(0);
    expect(report.aggregate.avg_recall_at_5).toBe(0);
    expect(report.aggregate.avg_mrr).toBe(0);
    expect(report.aggregate.avg_latency_ms).toBe(0);
  });

  test("aggregates correctly for single result", () => {
    const report = generateReport([makeResult(0.8, 0.5, 10)], "test");
    expect(report.aggregate.avg_recall_at_5).toBeCloseTo(0.8, 5);
    expect(report.aggregate.avg_mrr).toBeCloseTo(0.5, 5);
    expect(report.aggregate.avg_latency_ms).toBeCloseTo(10, 2);
  });

  test("aggregates correctly for multiple results", () => {
    const report = generateReport(
      [makeResult(1.0, 1.0, 20), makeResult(0.5, 0.5, 10)],
      "test",
    );
    expect(report.aggregate.avg_recall_at_5).toBeCloseTo(0.75, 5);
    expect(report.aggregate.avg_mrr).toBeCloseTo(0.75, 5);
    expect(report.aggregate.avg_latency_ms).toBeCloseTo(15, 2);
    expect(report.aggregate.total_questions).toBe(2);
  });

  test("report has required fields", () => {
    const report = generateReport([makeResult(0.5, 0.5, 5)], "vcs-only");
    expect(report.run_at).toBeTruthy();
    expect(report.baseline).toBe("vcs-only");
    expect(Array.isArray(report.results)).toBe(true);
    expect(report.aggregate).toBeDefined();
  });
});

// ─── printReport smoke test ───────────────────────────────────────────────────

describe("printReport", () => {
  test("does not throw for a well-formed report", () => {
    const result: BenchmarkResult = {
      baseline: "vcs-only",
      category: "ownership",
      question_id: "fastify-own-001",
      question: "Who is the primary author of fastify/fastify.js?",
      retrieved_entities: ["Matteo Collina"],
      metrics: { recall_at_k: 0.5, mrr: 1.0, avg_context_size: 20 },
      latency_ms: 3.14,
    };
    const report = generateReport([result], "vcs-only");
    expect(() => printReport(report)).not.toThrow();
  });
});

// ─── VCS-only runner integration test ────────────────────────────────────────

describe("vcs-only runner", () => {
  test("runQuestion returns a valid BenchmarkResult", () => {
    const question: GroundTruthQuestion = {
      id: "test-own-001",
      category: "ownership",
      question: "Matteo Collina fastify",
      expected_entities: ["Matteo Collina", "fastify/fastify.js"],
    };

    const result = vcsRunQuestion(graph, question);

    expect(result.baseline).toBe("vcs-only");
    expect(result.question_id).toBe("test-own-001");
    expect(result.category).toBe("ownership");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.retrieved_entities)).toBe(true);
    expect(result.metrics.recall_at_k).toBeGreaterThanOrEqual(0);
    expect(result.metrics.recall_at_k).toBeLessThanOrEqual(1);
    expect(result.metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(result.metrics.mrr).toBeLessThanOrEqual(1);
    expect(result.metrics.avg_context_size).toBeGreaterThanOrEqual(0);
  });

  test("retrieves Matteo Collina for ownership question", () => {
    const question: GroundTruthQuestion = {
      id: "test-own-002",
      category: "ownership",
      // Use just the entity name so FTS matches the canonical_name directly
      question: "Matteo Collina",
      expected_entities: ["Matteo Collina"],
    };

    const result = vcsRunQuestion(graph, question);
    // recall_at_k should be > 0 since we have Matteo in the graph
    expect(result.metrics.recall_at_k).toBeGreaterThan(0);
  });

  test("runBenchmark returns full report for subset of questions", () => {
    const { runBenchmark } = require("../src/runners/vcs-only.js");
    const subset = FASTIFY_QUESTIONS.slice(0, 3);
    const report = runBenchmark(graph, subset);

    expect(report.baseline).toBe("vcs-only");
    expect(report.results).toHaveLength(3);
    expect(report.aggregate.total_questions).toBe(3);
    expect(report.aggregate.avg_recall_at_5).toBeGreaterThanOrEqual(0);
    expect(report.aggregate.avg_recall_at_5).toBeLessThanOrEqual(1);
    expect(report.aggregate.avg_mrr).toBeGreaterThanOrEqual(0);
    expect(report.aggregate.avg_mrr).toBeLessThanOrEqual(1);
  });
});

// ─── Grep baseline runner integration test ───────────────────────────────────

describe("grep-baseline runner", () => {
  test("runQuestion returns a valid BenchmarkResult", () => {
    const question: GroundTruthQuestion = {
      id: "test-bus-001",
      category: "bus_factor",
      question: "logger sole contributor Matteo Collina bus factor",
      expected_entities: ["lib/logger.js"],
    };

    const result = grepRunQuestion(graph, question);

    expect(result.baseline).toBe("grep-baseline");
    expect(result.question_id).toBe("test-bus-001");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.retrieved_entities)).toBe(true);
    expect(result.metrics.recall_at_k).toBeGreaterThanOrEqual(0);
    expect(result.metrics.recall_at_k).toBeLessThanOrEqual(1);
    expect(result.metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(result.metrics.mrr).toBeLessThanOrEqual(1);
  });

  test("finds content containing expected entity name", () => {
    const question: GroundTruthQuestion = {
      id: "test-bus-002",
      category: "bus_factor",
      question: "logger sole contributor",
      expected_entities: ["lib/logger.js"],
    };

    const result = grepRunQuestion(graph, question);
    // The episode content contains "lib/logger.js" so recall should be > 0
    expect(result.metrics.recall_at_k).toBeGreaterThan(0);
  });

  test("runBenchmark returns full report", () => {
    const { runBenchmark } = require("../src/runners/grep-baseline.js");
    const subset = FASTIFY_QUESTIONS.slice(0, 3);
    const report = runBenchmark(graph, subset);

    expect(report.baseline).toBe("grep-baseline");
    expect(report.results).toHaveLength(3);
    expect(report.aggregate.total_questions).toBe(3);
  });
});

// ─── Dataset sanity check ─────────────────────────────────────────────────────

describe("FASTIFY_QUESTIONS dataset", () => {
  test("has at least 20 questions", () => {
    expect(FASTIFY_QUESTIONS.length).toBeGreaterThanOrEqual(20);
  });

  test("all questions have required fields", () => {
    for (const q of FASTIFY_QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(["ownership", "bus_factor", "co_change"]).toContain(q.category);
      expect(q.question).toBeTruthy();
      expect(Array.isArray(q.expected_entities)).toBe(true);
      expect(q.expected_entities.length).toBeGreaterThan(0);
    }
  });

  test("has exactly 7 ownership questions", () => {
    const ownership = FASTIFY_QUESTIONS.filter(
      (q) => q.category === "ownership",
    );
    expect(ownership.length).toBe(7);
  });

  test("has exactly 7 bus_factor questions", () => {
    const busFactor = FASTIFY_QUESTIONS.filter(
      (q) => q.category === "bus_factor",
    );
    expect(busFactor.length).toBe(7);
  });

  test("has exactly 6 co_change questions", () => {
    const coChange = FASTIFY_QUESTIONS.filter(
      (q) => q.category === "co_change",
    );
    expect(coChange.length).toBe(6);
  });

  test("question IDs are unique", () => {
    const ids = FASTIFY_QUESTIONS.map((q) => q.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});
