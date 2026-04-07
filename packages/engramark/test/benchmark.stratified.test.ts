/**
 * benchmark.stratified.test.ts — Strategy comparison and stratified breakdown tests.
 *
 * Covers:
 * - compareStrategies() multi-strategy report rendering
 * - printStratifiedBreakdown() per-query_type breakdown
 * - aggregateByType() metric aggregation helper
 */

import { describe, expect, test } from "bun:test";
import type { BenchmarkReport, BenchmarkResult } from "../src/metrics.js";
import { aggregateByType, compareStrategies } from "../src/report.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeReport(
  baseline: string,
  recall: number,
  mrrVal: number,
  results: BenchmarkResult[] = [],
): BenchmarkReport {
  return {
    run_at: new Date().toISOString(),
    baseline,
    results,
    aggregate: {
      avg_recall_at_5: recall,
      avg_mrr: mrrVal,
      avg_latency_ms: 5.0,
      total_questions: results.length || 5,
    },
  };
}

function makeResult(overrides: Partial<BenchmarkResult> = {}): BenchmarkResult {
  return {
    baseline: "vcs-only",
    category: "ownership",
    query_type: "keyword",
    question_id: "test-001",
    question: "test",
    retrieved_entities: [],
    metrics: { recall_at_k: 0.5, mrr: 0.5, avg_context_size: 100 },
    latency_ms: 5.0,
    ...overrides,
  };
}

// ─── compareStrategies tests ─────────────────────────────────────────────────

describe("compareStrategies", () => {
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

// ─── aggregateByType tests ───────────────────────────────────────────────────

describe("aggregateByType", () => {
  test("returns zeros for empty results", () => {
    const m = aggregateByType([]);
    expect(m.count).toBe(0);
    expect(m.avg_recall).toBe(0);
    expect(m.avg_mrr).toBe(0);
  });

  test("computes correct averages for single result", () => {
    const results = [
      makeResult({
        metrics: { recall_at_k: 0.8, mrr: 0.6, avg_context_size: 50 },
      }),
    ];
    const m = aggregateByType(results);
    expect(m.count).toBe(1);
    expect(m.avg_recall).toBeCloseTo(0.8, 5);
    expect(m.avg_mrr).toBeCloseTo(0.6, 5);
  });

  test("computes correct averages for multiple results", () => {
    const results = [
      makeResult({
        metrics: { recall_at_k: 0.4, mrr: 0.2, avg_context_size: 50 },
      }),
      makeResult({
        metrics: { recall_at_k: 0.8, mrr: 0.6, avg_context_size: 100 },
      }),
    ];
    const m = aggregateByType(results);
    expect(m.count).toBe(2);
    expect(m.avg_recall).toBeCloseTo(0.6, 5);
    expect(m.avg_mrr).toBeCloseTo(0.4, 5);
  });
});

// ─── printStratifiedBreakdown tests ──────────────────────────────────────────

describe("printStratifiedBreakdown (via compareStrategies)", () => {
  test("renders per-type breakdown for mixed query_type results", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      const keywordResult = makeResult({
        query_type: "keyword",
        question_id: "kw-001",
        metrics: { recall_at_k: 0.8, mrr: 0.9, avg_context_size: 50 },
      });
      const relationalResult = makeResult({
        query_type: "relational",
        question_id: "rel-001",
        metrics: { recall_at_k: 0.4, mrr: 0.5, avg_context_size: 80 },
      });
      const graphResult = makeResult({
        query_type: "graph_traversal",
        question_id: "graph-001",
        metrics: { recall_at_k: 0.2, mrr: 0.3, avg_context_size: 120 },
      });

      const results = [keywordResult, relationalResult, graphResult];

      const report = makeReport("vcs-only", 0.47, 0.57, results);
      compareStrategies([report]);

      const output = logs.join("\n");

      // Should contain the stratified breakdown header
      expect(output).toContain("By Query Type");

      // Should contain type labels with counts
      expect(output).toContain("keyword (1)");
      expect(output).toContain("relational (1)");
      expect(output).toContain("graph (1)");

      // Should contain the legend
      expect(output).toContain("keyword = text-scannable");
      expect(output).toContain("relational = graph edges required");
      expect(output).toContain("graph = multi-hop traversal");
    } finally {
      console.log = origLog;
    }
  });

  test("skips breakdown when all results have the same query_type", () => {
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };

    try {
      const results = [
        makeResult({ query_type: "keyword", question_id: "kw-001" }),
        makeResult({ query_type: "keyword", question_id: "kw-002" }),
      ];

      const report = makeReport("vcs-only", 0.5, 0.5, results);
      compareStrategies([report]);

      const output = logs.join("\n");
      // Should NOT contain the breakdown header when only one type
      expect(output).not.toContain("By Query Type");
    } finally {
      console.log = origLog;
    }
  });
});
