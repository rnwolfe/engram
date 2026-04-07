/**
 * benchmark.ai.test.ts — AI-enhanced benchmark runner tests.
 *
 * Tests the ai-enhanced runner using a mocked AIProvider to avoid
 * requiring a live Ollama instance. Set SKIP_AI_BENCHMARK=1 to skip.
 *
 * Covers:
 * - ai-enhanced runner with mocked OllamaProvider
 * - Graceful degradation when provider returns empty embeddings
 * - compareStrategies() multi-strategy report rendering
 * - baseline.ts: saveBaseline, loadBaseline, compareToBaseline
 * - runners/index.ts: runStrategy factory
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AIProvider, EngramGraph } from "engram-core";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
} from "engram-core";
import {
  compareToBaseline,
  loadBaseline,
  saveBaseline,
} from "../src/baseline.js";
import type { GroundTruthQuestion } from "../src/datasets/fastify/questions.js";
import type { BenchmarkReport } from "../src/metrics.js";
import { compareStrategies, generateReport } from "../src/report.js";
import { runBenchmark, runQuestion } from "../src/runners/ai-enhanced.js";
import { ALL_STRATEGIES, runStrategy } from "../src/runners/index.js";
import { runQuestion as runVcsOnlyQuestion } from "../src/runners/vcs-only.js";

// ─── Skip guard ───────────────────────────────────────────────────────────────

const SKIP = process.env.SKIP_AI_BENCHMARK === "1";

// ─── Mock AIProvider ──────────────────────────────────────────────────────────

/**
 * A mock AIProvider that returns deterministic non-zero embeddings.
 * Used to test the ai-enhanced runner without a live Ollama instance.
 */
class MockAIProvider implements AIProvider {
  private readonly dims: number;
  private callCount = 0;

  constructor(dims = 4) {
    this.dims = dims;
  }

  modelName(): string {
    return "mock-embed";
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.callCount++;
    // Return a simple deterministic vector for each text
    return texts.map((text, i) => {
      const base = (text.length + i + this.callCount) % 10;
      return Array.from({ length: this.dims }, (_, j) => (base + j) / 10);
    });
  }

  async extractEntities(_text: string): Promise<[]> {
    return [];
  }

  getCallCount(): number {
    return this.callCount;
  }
}

/**
 * A mock AIProvider that always returns empty embeddings (simulates Ollama offline).
 */
class NullEmbedProvider implements AIProvider {
  modelName(): string {
    return "null-embed";
  }

  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }

  async extractEntities(_text: string): Promise<[]> {
    return [];
  }
}

// ─── Fixture ──────────────────────────────────────────────────────────────────

let graph: EngramGraph;

function buildFixture(): EngramGraph {
  const g = createGraph(":memory:");

  const ep1 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "ai-abc001",
    content:
      "Matteo Collina authored fastify core. Primary maintainer of fastify/fastify.js route handling.",
    actor: "Matteo Collina",
    timestamp: "2024-01-10T10:00:00.000Z",
  });

  const ep2 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "ai-abc002",
    content:
      "Tomas Della Vedova updated lib/reply.js and lib/request.js. Co-change detected.",
    actor: "Tomas Della Vedova",
    timestamp: "2024-02-15T12:00:00.000Z",
  });

  const matteo = addEntity(
    g,
    {
      canonical_name: "Matteo Collina",
      entity_type: "person",
      summary: "Core maintainer of Fastify",
    },
    [{ episode_id: ep1.id, extractor: "test", confidence: 1.0 }],
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

  const tomas = addEntity(
    g,
    {
      canonical_name: "Tomas Della Vedova",
      entity_type: "person",
      summary: "Fastify core contributor",
    },
    [{ episode_id: ep2.id, extractor: "test", confidence: 1.0 }],
  );

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
      target_id: fastifyJs.id,
      relation_type: "contributed",
      edge_kind: "observed",
      fact: "Tomas Della Vedova contributed to fastify/fastify.js",
    },
    [{ episode_id: ep2.id, extractor: "git_blame", confidence: 0.8 }],
  );

  return g;
}

beforeEach(() => {
  graph = buildFixture();
});

afterEach(() => {
  closeGraph(graph);
});

// ─── ai-enhanced runner tests ─────────────────────────────────────────────────

describe("ai-enhanced runner", () => {
  test.skipIf(SKIP)("runQuestion returns a valid BenchmarkResult", async () => {
    const provider = new MockAIProvider();
    const question: GroundTruthQuestion = {
      id: "ai-test-001",
      category: "ownership",
      question: "Matteo Collina fastify",
      expected_entities: ["Matteo Collina", "fastify/fastify.js"],
    };

    const result = await runQuestion(graph, question, provider);

    expect(result.baseline).toBe("ai-enhanced");
    expect(result.question_id).toBe("ai-test-001");
    expect(result.category).toBe("ownership");
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.retrieved_entities)).toBe(true);
    expect(result.metrics.recall_at_k).toBeGreaterThanOrEqual(0);
    expect(result.metrics.recall_at_k).toBeLessThanOrEqual(1);
    expect(result.metrics.mrr).toBeGreaterThanOrEqual(0);
    expect(result.metrics.mrr).toBeLessThanOrEqual(1);
    expect(result.metrics.avg_context_size).toBeGreaterThanOrEqual(0);
  });

  test.skipIf(SKIP)(
    "runBenchmark returns full report for multiple questions",
    async () => {
      const provider = new MockAIProvider();
      const questions: GroundTruthQuestion[] = [
        {
          id: "ai-test-002",
          category: "ownership",
          question: "Matteo Collina",
          expected_entities: ["Matteo Collina"],
        },
        {
          id: "ai-test-003",
          category: "ownership",
          question: "Tomas Della Vedova",
          expected_entities: ["Tomas Della Vedova"],
        },
      ];

      const report = await runBenchmark(graph, questions, provider);

      expect(report.baseline).toBe("ai-enhanced");
      expect(report.results).toHaveLength(2);
      expect(report.aggregate.total_questions).toBe(2);
      expect(report.aggregate.avg_recall_at_5).toBeGreaterThanOrEqual(0);
      expect(report.aggregate.avg_recall_at_5).toBeLessThanOrEqual(1);
      expect(report.aggregate.avg_mrr).toBeGreaterThanOrEqual(0);
      expect(report.aggregate.avg_mrr).toBeLessThanOrEqual(1);
    },
  );

  test.skipIf(SKIP)(
    "degrades gracefully when provider returns empty embeddings",
    async () => {
      const provider = new NullEmbedProvider();
      const question: GroundTruthQuestion = {
        id: "ai-test-004",
        category: "ownership",
        question: "Matteo Collina fastify",
        expected_entities: ["Matteo Collina"],
      };

      // Should not throw even when provider returns no embeddings.
      // More importantly, when degraded the runner must use the FTS-only path
      // so results are identical to what vcs-only produces — not "hybrid mode
      // with zero vectors" which would be a meaningless intermediate state.
      const [degradedResult, vcsOnlyResult] = await Promise.all([
        runQuestion(graph, question, provider),
        runVcsOnlyQuestion(graph, question),
      ]);

      expect(degradedResult.baseline).toBe("ai-enhanced");
      expect(degradedResult.latency_ms).toBeGreaterThanOrEqual(0);

      // Retrieved entities must exactly match vcs-only output — true degradation.
      expect(degradedResult.retrieved_entities).toEqual(
        vcsOnlyResult.retrieved_entities,
      );
      expect(degradedResult.metrics.recall_at_k).toBe(
        vcsOnlyResult.metrics.recall_at_k,
      );
      expect(degradedResult.metrics.mrr).toBe(vcsOnlyResult.metrics.mrr);
    },
  );
});

// ─── compareStrategies tests ──────────────────────────────────────────────────

describe("compareStrategies", () => {
  const makeReport = (
    baseline: string,
    recall: number,
    mrrVal: number,
  ): BenchmarkReport => ({
    run_at: new Date().toISOString(),
    baseline,
    results: [],
    aggregate: {
      avg_recall_at_5: recall,
      avg_mrr: mrrVal,
      avg_latency_ms: 5.0,
      total_questions: 5,
    },
  });

  test("does not throw for empty reports array", () => {
    expect(() => compareStrategies([])).not.toThrow();
  });

  test("does not throw for single strategy report", () => {
    const report = makeReport("vcs-only", 0.6, 0.7);
    expect(() => compareStrategies([report])).not.toThrow();
  });

  test("does not throw for multiple strategy reports", () => {
    const reports = [
      makeReport("grep-baseline", 0.35, 0.42),
      makeReport("vcs-only", 0.6, 0.71),
      makeReport("ai-enhanced", 0.78, 0.85),
    ];
    expect(() => compareStrategies(reports)).not.toThrow();
  });
});

// ─── baseline.ts tests ────────────────────────────────────────────────────────

describe("saveBaseline / loadBaseline / compareToBaseline", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "engramark-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeReport = (
    baseline: string,
    recall: number,
    mrrVal: number,
  ): BenchmarkReport => ({
    run_at: new Date().toISOString(),
    baseline,
    results: [],
    aggregate: {
      avg_recall_at_5: recall,
      avg_mrr: mrrVal,
      avg_latency_ms: 5.0,
      total_questions: 5,
    },
  });

  test("saveBaseline writes a valid JSON file", () => {
    const reports = [
      makeReport("vcs-only", 0.6, 0.71),
      makeReport("ai-enhanced", 0.78, 0.85),
    ];
    const filePath = join(tmpDir, "baseline.json");
    saveBaseline(reports, filePath);

    const loaded = loadBaseline(filePath);
    expect(loaded.recorded_at).toBeTruthy();
    expect(loaded.strategies["vcs-only"]).toBeDefined();
    expect(loaded.strategies["vcs-only"].recall_at_5).toBeCloseTo(0.6, 5);
    expect(loaded.strategies["vcs-only"].mrr).toBeCloseTo(0.71, 5);
    expect(loaded.strategies["ai-enhanced"]).toBeDefined();
    expect(loaded.strategies["ai-enhanced"].recall_at_5).toBeCloseTo(0.78, 5);
  });

  test("compareToBaseline detects no regression when metrics improve", () => {
    const baseline = {
      recorded_at: "2026-01-01T00:00:00Z",
      strategies: {
        "vcs-only": { recall_at_5: 0.6, mrr: 0.71 },
      },
    };

    const current = [makeReport("vcs-only", 0.65, 0.75)];
    const result = compareToBaseline(current, baseline);

    expect(result.has_regressions).toBe(false);
    expect(result.regressions).toHaveLength(1);
    expect(result.regressions[0].regressed).toBe(false);
    expect(result.regressions[0].recall_delta).toBeCloseTo(0.05, 5);
  });

  test("compareToBaseline detects regression on recall drop", () => {
    const baseline = {
      recorded_at: "2026-01-01T00:00:00Z",
      strategies: {
        "vcs-only": { recall_at_5: 0.6, mrr: 0.71 },
      },
    };

    // Drop recall by 10pp (beyond default 5pp threshold)
    const current = [makeReport("vcs-only", 0.5, 0.71)];
    const result = compareToBaseline(current, baseline, 0.05);

    expect(result.has_regressions).toBe(true);
    expect(result.regressions[0].regressed).toBe(true);
    expect(result.regressions[0].recall_delta).toBeCloseTo(-0.1, 5);
  });

  test("compareToBaseline detects regression on MRR drop", () => {
    const baseline = {
      recorded_at: "2026-01-01T00:00:00Z",
      strategies: {
        "ai-enhanced": { recall_at_5: 0.78, mrr: 0.85 },
      },
    };

    // Drop MRR by 10pp (beyond threshold)
    const current = [makeReport("ai-enhanced", 0.78, 0.75)];
    const result = compareToBaseline(current, baseline, 0.05);

    expect(result.has_regressions).toBe(true);
    expect(result.regressions[0].mrr_delta).toBeCloseTo(-0.1, 5);
  });

  test("compareToBaseline ignores strategies not in baseline", () => {
    const baseline = {
      recorded_at: "2026-01-01T00:00:00Z",
      strategies: {}, // empty — no baseline for any strategy
    };

    const current = [makeReport("ai-enhanced", 0.78, 0.85)];
    const result = compareToBaseline(current, baseline);

    expect(result.has_regressions).toBe(false);
    expect(result.regressions).toHaveLength(0);
  });

  test("compareToBaseline respects configurable threshold", () => {
    const baseline = {
      recorded_at: "2026-01-01T00:00:00Z",
      strategies: {
        "vcs-only": { recall_at_5: 0.6, mrr: 0.71 },
      },
    };

    // Drop recall by 3pp — within default threshold (5pp) but beyond tight threshold (2pp)
    const current = [makeReport("vcs-only", 0.57, 0.71)];

    const withinThreshold = compareToBaseline(current, baseline, 0.05);
    expect(withinThreshold.has_regressions).toBe(false);

    const beyondThreshold = compareToBaseline(current, baseline, 0.02);
    expect(beyondThreshold.has_regressions).toBe(true);
  });
});

// ─── runners/index.ts tests ───────────────────────────────────────────────────

describe("runners registry", () => {
  test("ALL_STRATEGIES contains all three strategies", () => {
    expect(ALL_STRATEGIES).toContain("grep-baseline");
    expect(ALL_STRATEGIES).toContain("vcs-only");
    expect(ALL_STRATEGIES).toContain("ai-enhanced");
    expect(ALL_STRATEGIES).toHaveLength(3);
  });

  test("runStrategy('grep-baseline') returns a BenchmarkReport", async () => {
    const questions: GroundTruthQuestion[] = [
      {
        id: "reg-test-001",
        category: "ownership",
        question: "Matteo Collina",
        expected_entities: ["Matteo Collina"],
      },
    ];
    const report = await runStrategy("grep-baseline", graph, questions);
    expect(report.baseline).toBe("grep-baseline");
    expect(report.results).toHaveLength(1);
  });

  test("runStrategy('vcs-only') returns a BenchmarkReport", async () => {
    const questions: GroundTruthQuestion[] = [
      {
        id: "reg-test-002",
        category: "ownership",
        question: "Matteo Collina",
        expected_entities: ["Matteo Collina"],
      },
    ];
    const report = await runStrategy("vcs-only", graph, questions);
    expect(report.baseline).toBe("vcs-only");
    expect(report.results).toHaveLength(1);
  });

  test.skipIf(SKIP)(
    "runStrategy('ai-enhanced') returns a BenchmarkReport",
    async () => {
      const provider = new MockAIProvider();
      const questions: GroundTruthQuestion[] = [
        {
          id: "reg-test-003",
          category: "ownership",
          question: "Matteo Collina",
          expected_entities: ["Matteo Collina"],
        },
      ];
      const report = await runStrategy(
        "ai-enhanced",
        graph,
        questions,
        provider,
      );
      expect(report.baseline).toBe("ai-enhanced");
      expect(report.results).toHaveLength(1);
    },
  );

  test("runStrategy('ai-enhanced') throws when provider is missing", async () => {
    const questions: GroundTruthQuestion[] = [
      {
        id: "reg-test-004",
        category: "ownership",
        question: "Matteo Collina",
        expected_entities: ["Matteo Collina"],
      },
    ];
    await expect(
      runStrategy("ai-enhanced", graph, questions),
    ).rejects.toThrow();
  });

  test("generateReport is re-exported from report.ts", () => {
    const result = generateReport([], "test");
    expect(result.baseline).toBe("test");
    expect(result.aggregate.total_questions).toBe(0);
  });
});
