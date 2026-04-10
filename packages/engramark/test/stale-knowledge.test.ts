/**
 * stale-knowledge.test.ts — Tests for the stale-knowledge detection benchmark.
 *
 * Covers:
 *   - StaleKnowledgeDataset loader (validation)
 *   - prepareScenarios() anchoring + projection authoring
 *   - computeStaleKnowledgeMetrics() metric computation
 *   - All three runner implementations (naive-rag, read-time, full-reconcile)
 *   - Report helpers (printStaleKnowledgeReport, compareStaleKnowledgeRunners)
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
import {
  loadDataset,
  prepareScenarios,
  type StaleKnowledgeDataset,
} from "../src/datasets/stale-knowledge/loader.js";
import {
  compareStaleKnowledgeRunners,
  printStaleKnowledgeReport,
  type StaleKnowledgeRunnerResult,
} from "../src/report.js";
import { runBenchmark as runFullReconcile } from "../src/runners/stale-full-reconcile.js";
import { runBenchmark as runNaiveRag } from "../src/runners/stale-naive-rag.js";
import { runBenchmark as runReadTime } from "../src/runners/stale-read-time.js";
import {
  computeStaleKnowledgeMetrics,
  type ScenarioResult,
} from "../src/scoring/stale-knowledge.js";

// ─── Fixture setup ────────────────────────────────────────────────────────────

let graph: EngramGraph;

/** Build a small graph with entities that can serve as projection anchors. */
function buildFixtureGraph(): EngramGraph {
  const g = createGraph(":memory:");

  const ep1 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "stale-test-001",
    content: "Initial implementation of fastify.js core routing module.",
    actor: "author@example.com",
    timestamp: "2024-01-01T00:00:00.000Z",
  });

  const ep2 = addEpisode(g, {
    source_type: "git_commit",
    source_ref: "stale-test-002",
    content: "Update lib/reply.js to add streaming support.",
    actor: "other@example.com",
    timestamp: "2024-02-01T00:00:00.000Z",
  });

  const fastifyJs = addEntity(
    g,
    {
      canonical_name: "fastify.js",
      entity_type: "file",
      summary: "Core entry point",
    },
    [{ episode_id: ep1.id, extractor: "test", confidence: 1.0 }],
  );

  const replyJs = addEntity(
    g,
    {
      canonical_name: "lib/reply.js",
      entity_type: "file",
      summary: "Reply object implementation",
    },
    [{ episode_id: ep2.id, extractor: "test", confidence: 1.0 }],
  );

  addEdge(
    g,
    {
      source_id: fastifyJs.id,
      target_id: replyJs.id,
      relation_type: "depends_on",
      edge_kind: "inferred",
      fact: "fastify.js depends on lib/reply.js",
    },
    [{ episode_id: ep1.id, extractor: "test", confidence: 0.8 }],
  );

  return g;
}

beforeEach(() => {
  graph = buildFixtureGraph();
});

afterEach(() => {
  closeGraph(graph);
});

// ─── Dataset loader tests ─────────────────────────────────────────────────────

describe("loadDataset", () => {
  const validDataset = {
    version: "1.0",
    description: "Test dataset",
    commit_x: "v1.0.0",
    commit_y: "v1.1.0",
    scenarios: [
      {
        id: "sk-001",
        description: "Test scenario",
        anchor_description: "fastify.js",
        projection_kind: "entity_summary",
        expected_stale: true,
        expected_reconcile_outcome: "needs_update",
      },
    ],
  };

  test("loads a valid dataset", () => {
    const dataset = loadDataset(validDataset);
    expect(dataset.version).toBe("1.0");
    expect(dataset.commit_x).toBe("v1.0.0");
    expect(dataset.commit_y).toBe("v1.1.0");
    expect(dataset.scenarios).toHaveLength(1);
    expect(dataset.scenarios[0].id).toBe("sk-001");
    expect(dataset.scenarios[0].expected_stale).toBe(true);
    expect(dataset.scenarios[0].expected_reconcile_outcome).toBe(
      "needs_update",
    );
  });

  test("throws on null input", () => {
    expect(() => loadDataset(null)).toThrow();
  });

  test("throws on missing version", () => {
    expect(() =>
      loadDataset({ ...validDataset, version: undefined }),
    ).toThrow();
  });

  test("throws on missing commit_x", () => {
    expect(() =>
      loadDataset({ ...validDataset, commit_x: undefined }),
    ).toThrow();
  });

  test("throws on missing scenarios array", () => {
    expect(() =>
      loadDataset({ ...validDataset, scenarios: "not-an-array" }),
    ).toThrow();
  });

  test("throws on scenario missing id", () => {
    const bad = {
      ...validDataset,
      scenarios: [{ ...validDataset.scenarios[0], id: undefined }],
    };
    expect(() => loadDataset(bad)).toThrow();
  });

  test("throws on invalid expected_reconcile_outcome", () => {
    const bad = {
      ...validDataset,
      scenarios: [
        {
          ...validDataset.scenarios[0],
          expected_reconcile_outcome: "invalid_value",
        },
      ],
    };
    expect(() => loadDataset(bad)).toThrow();
  });

  test("accepts all valid reconcile outcomes", () => {
    for (const outcome of ["still_accurate", "needs_update", "contradicted"]) {
      const d = {
        ...validDataset,
        scenarios: [
          { ...validDataset.scenarios[0], expected_reconcile_outcome: outcome },
        ],
      };
      expect(() => loadDataset(d)).not.toThrow();
    }
  });

  test("loads the real fastify.json fixture", async () => {
    const raw = await import("../src/datasets/stale-knowledge/fastify.json", {
      with: { type: "json" },
    });
    const dataset = loadDataset(raw.default);
    expect(dataset.scenarios).toHaveLength(10);
    // 7 stale + 3 fresh
    const staleCount = dataset.scenarios.filter((s) => s.expected_stale).length;
    const freshCount = dataset.scenarios.filter(
      (s) => !s.expected_stale,
    ).length;
    expect(staleCount).toBe(7);
    expect(freshCount).toBe(3);
    // Verify IDs sk-001 through sk-010
    const ids = dataset.scenarios.map((s) => s.id);
    for (let i = 1; i <= 9; i++) {
      expect(ids).toContain(`sk-00${i}`);
    }
    expect(ids).toContain("sk-010");
  });
});

// ─── prepareScenarios tests ───────────────────────────────────────────────────

describe("prepareScenarios", () => {
  const makeDataset = (
    scenarios: StaleKnowledgeDataset["scenarios"],
  ): StaleKnowledgeDataset => ({
    version: "1.0",
    description: "Test",
    commit_x: "v1.0.0",
    commit_y: "v1.1.0",
    scenarios,
  });

  test("returns one PreparedScenario per scenario", async () => {
    const dataset = makeDataset([
      {
        id: "sk-001",
        description: "test",
        anchor_description: "fastify.js",
        projection_kind: "entity_summary",
        expected_stale: true,
        expected_reconcile_outcome: "needs_update",
      },
    ]);

    const prepared = await prepareScenarios(graph, dataset);
    expect(prepared).toHaveLength(1);
    expect(prepared[0].scenario.id).toBe("sk-001");
  });

  test("resolves anchor_id for known entity", async () => {
    const dataset = makeDataset([
      {
        id: "sk-001",
        description: "test",
        anchor_description: "fastify.js",
        projection_kind: "entity_summary",
        expected_stale: true,
        expected_reconcile_outcome: "needs_update",
      },
    ]);

    const prepared = await prepareScenarios(graph, dataset);
    expect(prepared[0].anchor_id).not.toBeNull();
  });

  test("sets anchor_id=null and error for unknown entity", async () => {
    const dataset = makeDataset([
      {
        id: "sk-999",
        description: "test",
        anchor_description: "zzzz-absolutely-does-not-exist-xyzzy",
        projection_kind: "entity_summary",
        expected_stale: false,
        expected_reconcile_outcome: "still_accurate",
      },
    ]);

    const prepared = await prepareScenarios(graph, dataset);
    expect(prepared[0].anchor_id).toBeNull();
    expect(prepared[0].projection).toBeNull();
    expect(prepared[0].error).toBeTruthy();
  });

  test("authors projection when anchor resolves", async () => {
    const dataset = makeDataset([
      {
        id: "sk-001",
        description: "test",
        anchor_description: "fastify.js",
        projection_kind: "entity_summary",
        expected_stale: true,
        expected_reconcile_outcome: "needs_update",
      },
    ]);

    const prepared = await prepareScenarios(graph, dataset);
    // fastify.js has evidence episodes (ep1 added in buildFixtureGraph),
    // so the anchor must resolve and the projection must be authored.
    expect(prepared[0].anchor_id).not.toBeNull();
    expect(prepared[0].projection).not.toBeNull();
    expect(prepared[0].projection?.kind).toBe("entity_summary");
  });
});

// ─── computeStaleKnowledgeMetrics tests ──────────────────────────────────────

describe("computeStaleKnowledgeMetrics", () => {
  const makeResult = (
    expected_stale: boolean,
    detected_stale: boolean,
    latency_ms = 5,
  ): ScenarioResult => ({
    scenario_id: "sk-001",
    expected_stale,
    detected_stale,
    latency_ms,
  });

  test("returns zero metrics for empty results", () => {
    const m = computeStaleKnowledgeMetrics([]);
    expect(m.stale_recall).toBe(0);
    expect(m.stale_precision).toBe(0);
    expect(m.stale_f1).toBe(0);
    expect(m.total).toBe(0);
    expect(m.total_stale).toBe(0);
  });

  test("perfect detection: all stale correctly flagged", () => {
    const results = [
      makeResult(true, true),
      makeResult(true, true),
      makeResult(false, false),
    ];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.stale_recall).toBe(1.0);
    expect(m.stale_precision).toBe(1.0);
    expect(m.stale_f1).toBe(1.0);
    expect(m.true_positives).toBe(2);
    expect(m.false_positives).toBe(0);
    expect(m.false_negatives).toBe(0);
  });

  test("naive: detects nothing (all false)", () => {
    const results = [
      makeResult(true, false),
      makeResult(true, false),
      makeResult(false, false),
    ];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.stale_recall).toBe(0);
    expect(m.stale_precision).toBe(0);
    expect(m.stale_f1).toBe(0);
    expect(m.false_negatives).toBe(2);
    expect(m.true_positives).toBe(0);
  });

  test("false positive case", () => {
    const results = [
      makeResult(false, true), // FP
      makeResult(false, false), // TN
    ];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.false_positives).toBe(1);
    expect(m.stale_precision).toBe(0);
    expect(m.stale_recall).toBe(0);
  });

  test("partial detection: recall 0.5", () => {
    const results = [
      makeResult(true, true), // TP
      makeResult(true, false), // FN
      makeResult(false, false), // TN
    ];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.stale_recall).toBeCloseTo(0.5, 5);
    expect(m.stale_precision).toBe(1.0);
    expect(m.stale_f1).toBeCloseTo(2 / 3, 4);
  });

  test("cost_per_staleness_resolved is Infinity when no TPs", () => {
    const results = [makeResult(true, false)];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.cost_per_staleness_resolved).toBe(Number.POSITIVE_INFINITY);
  });

  test("cost_per_staleness_resolved is avg latency per TP", () => {
    const results = [makeResult(true, true, 10), makeResult(true, true, 20)];
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.cost_per_staleness_resolved).toBeCloseTo(15, 2);
  });

  test("reconcile_accuracy is 0.0 (placeholder)", () => {
    const m = computeStaleKnowledgeMetrics([makeResult(true, true)]);
    expect(m.reconcile_accuracy).toBe(0.0);
  });
});

// ─── Naive RAG runner tests ───────────────────────────────────────────────────

describe("stale-naive-rag runner", () => {
  test("always returns detected_stale=false", async () => {
    const scenarios = [
      {
        scenario: {
          id: "sk-001",
          description: "test",
          anchor_description: "fastify.js",
          projection_kind: "entity_summary",
          expected_stale: true,
          expected_reconcile_outcome: "needs_update" as const,
        },
        anchor_id: "some-id",
        projection: null,
      },
      {
        scenario: {
          id: "sk-002",
          description: "test2",
          anchor_description: "lib/reply.js",
          projection_kind: "bus_factor_report",
          expected_stale: false,
          expected_reconcile_outcome: "still_accurate" as const,
        },
        anchor_id: "other-id",
        projection: null,
      },
    ];

    const results = await runNaiveRag(graph, scenarios);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.detected_stale).toBe(false);
    }
  });

  test("naive-rag metrics: recall=0, precision=0", async () => {
    const prepared = [
      {
        scenario: {
          id: "sk-001",
          description: "t",
          anchor_description: "fastify.js",
          projection_kind: "entity_summary",
          expected_stale: true,
          expected_reconcile_outcome: "needs_update" as const,
        },
        anchor_id: null,
        projection: null,
      },
    ];

    const results = await runNaiveRag(graph, prepared);
    const m = computeStaleKnowledgeMetrics(results);
    expect(m.stale_recall).toBe(0);
    expect(m.stale_precision).toBe(0);
  });
});

// ─── Read-time runner tests ───────────────────────────────────────────────────

describe("stale-read-time runner", () => {
  test("returns detected_stale=false for scenarios without projection", async () => {
    const scenarios = [
      {
        scenario: {
          id: "sk-999",
          description: "missing anchor",
          anchor_description: "nonexistent.js",
          projection_kind: "entity_summary",
          expected_stale: false,
          expected_reconcile_outcome: "still_accurate" as const,
        },
        anchor_id: null,
        projection: null,
        error: "anchor not found",
      },
    ];

    const results = await runReadTime(graph, scenarios);
    expect(results).toHaveLength(1);
    expect(results[0].detected_stale).toBe(false);
    expect(results[0].details).toContain("skipped");
  });

  test("returns valid ScenarioResult for prepared scenarios", async () => {
    const dataset: StaleKnowledgeDataset = {
      version: "1.0",
      description: "Test",
      commit_x: "v1.0.0",
      commit_y: "v1.1.0",
      scenarios: [
        {
          id: "sk-001",
          description: "test",
          anchor_description: "fastify.js",
          projection_kind: "entity_summary",
          expected_stale: true,
          expected_reconcile_outcome: "needs_update",
        },
      ],
    };

    const prepared = await prepareScenarios(graph, dataset);
    const results = await runReadTime(graph, prepared);
    expect(results).toHaveLength(1);
    expect(results[0].scenario_id).toBe("sk-001");
    expect(typeof results[0].detected_stale).toBe("boolean");
    expect(results[0].latency_ms).toBeGreaterThanOrEqual(0);
  });

  test("returns detected_stale=true when substrate advances after projection authoring", async () => {
    const { createHash } = await import("node:crypto");

    const dataset: StaleKnowledgeDataset = {
      version: "1.0",
      description: "Test",
      commit_x: "v1.0.0",
      commit_y: "v1.1.0",
      scenarios: [
        {
          id: "sk-stale-001",
          description: "stale after substrate advance",
          anchor_description: "fastify.js",
          projection_kind: "entity_summary",
          expected_stale: true,
          expected_reconcile_outcome: "needs_update",
        },
      ],
    };

    // Author projection at "commit X"
    const prepared = await prepareScenarios(graph, dataset);
    const projection = prepared[0].projection;
    expect(projection).not.toBeNull();
    if (!projection) return; // narrow type; expect above will fail the test

    // Advance substrate: update the content of the episode that the projection
    // cites, changing its content_hash so the fingerprint drifts.
    const evidenceRows = graph.db
      .query<{ target_id: string }, [string]>(
        "SELECT target_id FROM projection_evidence WHERE projection_id = ? AND role = 'input' AND target_type = 'episode'",
      )
      .all(projection.id);

    expect(evidenceRows.length).toBeGreaterThan(0);
    const episodeId = evidenceRows[0].target_id;
    const newContent = "UPDATED: major rewrite of fastify.js routing layer.";
    const newHash = createHash("sha256").update(newContent).digest("hex");
    graph.db
      .prepare("UPDATE episodes SET content = ?, content_hash = ? WHERE id = ?")
      .run(newContent, newHash, episodeId);

    // Now read-time runner should detect staleness
    const results = await runReadTime(graph, prepared);
    expect(results).toHaveLength(1);
    expect(results[0].detected_stale).toBe(true);
  });
});

// ─── Full reconcile runner tests ──────────────────────────────────────────────

describe("stale-full-reconcile runner", () => {
  test("returns detected_stale=false for scenarios without projection", async () => {
    const scenarios = [
      {
        scenario: {
          id: "sk-999",
          description: "missing",
          anchor_description: "nope.js",
          projection_kind: "entity_summary",
          expected_stale: false,
          expected_reconcile_outcome: "still_accurate" as const,
        },
        anchor_id: null,
        projection: null,
        error: "anchor not found",
      },
    ];

    const results = await runFullReconcile(graph, scenarios);
    expect(results).toHaveLength(1);
    expect(results[0].detected_stale).toBe(false);
    expect(results[0].details).toContain("skipped");
  });

  test("returns valid ScenarioResult for prepared scenarios", async () => {
    const dataset: StaleKnowledgeDataset = {
      version: "1.0",
      description: "Test",
      commit_x: "v1.0.0",
      commit_y: "v1.1.0",
      scenarios: [
        {
          id: "sk-001",
          description: "test",
          anchor_description: "fastify.js",
          projection_kind: "entity_summary",
          expected_stale: true,
          expected_reconcile_outcome: "needs_update",
        },
      ],
    };

    const prepared = await prepareScenarios(graph, dataset);
    const results = await runFullReconcile(graph, prepared);
    expect(results).toHaveLength(1);
    expect(results[0].scenario_id).toBe("sk-001");
    expect(typeof results[0].detected_stale).toBe("boolean");
  });
});

// ─── Report helpers ───────────────────────────────────────────────────────────

describe("stale-knowledge report helpers", () => {
  const makeBundle = (
    name: string,
    results: ScenarioResult[],
  ): StaleKnowledgeRunnerResult => ({
    runner_name: name,
    metrics: computeStaleKnowledgeMetrics(results),
    results,
  });

  const sampleResults: ScenarioResult[] = [
    {
      scenario_id: "sk-001",
      expected_stale: true,
      detected_stale: true,
      details: "stale: fingerprint_mismatch",
      latency_ms: 3,
    },
    {
      scenario_id: "sk-002",
      expected_stale: false,
      detected_stale: false,
      details: "fresh",
      latency_ms: 2,
    },
  ];

  test("printStaleKnowledgeReport does not throw", () => {
    const bundle = makeBundle("test-runner", sampleResults);
    expect(() => printStaleKnowledgeReport(bundle)).not.toThrow();
  });

  test("compareStaleKnowledgeRunners does not throw with empty array", () => {
    expect(() => compareStaleKnowledgeRunners([])).not.toThrow();
  });

  test("compareStaleKnowledgeRunners does not throw with multiple runners", () => {
    const bundles = [
      makeBundle("naive-rag", sampleResults),
      makeBundle("read-time", sampleResults),
      makeBundle("full-reconcile", sampleResults),
    ];
    expect(() => compareStaleKnowledgeRunners(bundles)).not.toThrow();
  });
});
