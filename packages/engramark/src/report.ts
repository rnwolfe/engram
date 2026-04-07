/**
 * EngRAMark — benchmark suite for engram knowledge retrieval.
 *
 * Measures retrieval quality and answer accuracy against ground-truth
 * Q&A datasets built from public repositories (Fastify for v0.1).
 */

export type {
  BaselineEntry,
  BaselineFile,
  CompareBaselineResult,
  RegressionResult,
} from "./baseline.js";
export { compareToBaseline, loadBaseline, saveBaseline } from "./baseline.js";
export type {
  BenchmarkReport,
  BenchmarkResult,
  RetrievalMetrics,
} from "./metrics.js";
export {
  computeMetrics,
  estimateContextSize,
  mrr,
  recallAtK,
} from "./metrics.js";
export { BENCHMARK_VERSION } from "./version.js";

import type { BenchmarkReport, BenchmarkResult } from "./metrics.js";

/**
 * Aggregates a list of BenchmarkResults into a full BenchmarkReport.
 *
 * @param results - Array of per-question results.
 * @param baseline - Baseline name (e.g. 'vcs-only', 'grep-baseline').
 * @returns Aggregated BenchmarkReport.
 */
export function generateReport(
  results: BenchmarkResult[],
  baseline: string,
): BenchmarkReport {
  const total = results.length;
  const avgRecall =
    total > 0
      ? results.reduce((sum, r) => sum + r.metrics.recall_at_k, 0) / total
      : 0;
  const avgMrr =
    total > 0 ? results.reduce((sum, r) => sum + r.metrics.mrr, 0) / total : 0;
  const avgLatency =
    total > 0 ? results.reduce((sum, r) => sum + r.latency_ms, 0) / total : 0;

  return {
    run_at: new Date().toISOString(),
    baseline,
    results,
    aggregate: {
      avg_recall_at_5: avgRecall,
      avg_mrr: avgMrr,
      avg_latency_ms: avgLatency,
      total_questions: total,
    },
  };
}

/**
 * Prints a formatted benchmark report table to stdout.
 *
 * @param report - BenchmarkReport to print.
 */
export function printReport(report: BenchmarkReport): void {
  const { aggregate, baseline, run_at, results } = report;

  console.log(`\nEngRAMark Report — ${baseline}`);
  console.log(`Run at: ${run_at}`);
  console.log("─".repeat(80));

  // Header
  console.log(
    padRight("Question ID", 22) +
      padRight("Category", 12) +
      padRight("Recall@5", 10) +
      padRight("MRR", 8) +
      padRight("Ctx(tok)", 10) +
      "Latency(ms)",
  );
  console.log("─".repeat(80));

  // Per-question rows
  for (const r of results) {
    const { metrics } = r;
    console.log(
      padRight(r.question_id, 22) +
        padRight(r.category, 12) +
        padRight(metrics.recall_at_k.toFixed(2), 10) +
        padRight(metrics.mrr.toFixed(2), 8) +
        padRight(String(metrics.avg_context_size), 10) +
        r.latency_ms.toFixed(1),
    );
  }

  console.log("─".repeat(80));
  console.log("Aggregate:");
  console.log(`  Total questions : ${aggregate.total_questions}`);
  console.log(`  Avg Recall@5    : ${aggregate.avg_recall_at_5.toFixed(4)}`);
  console.log(`  Avg MRR         : ${aggregate.avg_mrr.toFixed(4)}`);
  console.log(`  Avg Latency(ms) : ${aggregate.avg_latency_ms.toFixed(2)}`);
  console.log("");
}

function padRight(s: string, width: number): string {
  return s.length >= width ? `${s.slice(0, width - 1)} ` : s.padEnd(width);
}

/**
 * Renders a side-by-side comparison table for multiple strategy results.
 * Includes delta columns relative to the vcs-only baseline.
 *
 * @param reports - Array of BenchmarkReports to compare (one per strategy).
 */
export function compareStrategies(reports: BenchmarkReport[]): void {
  if (reports.length === 0) {
    console.log("\nNo strategies to compare.");
    return;
  }

  const vcsReport = reports.find((r) => r.baseline === "vcs-only");

  console.log("\nEngRAMark — Strategy Comparison");
  console.log("─".repeat(72));
  console.log(
    padRight("Strategy", 22) +
      padRight("Recall@5", 12) +
      padRight("MRR", 10) +
      padRight("Avg Latency(ms)", 18) +
      "vs vcs-only",
  );
  console.log("─".repeat(72));

  for (const report of reports) {
    const { aggregate, baseline } = report;
    const recallStr = aggregate.avg_recall_at_5.toFixed(2);
    const mrrStr = aggregate.avg_mrr.toFixed(2);
    const latencyStr = aggregate.avg_latency_ms.toFixed(1);

    let deltaStr = "—";
    if (vcsReport && baseline !== "vcs-only") {
      const recallDelta =
        aggregate.avg_recall_at_5 - vcsReport.aggregate.avg_recall_at_5;
      const mrrDelta = aggregate.avg_mrr - vcsReport.aggregate.avg_mrr;
      const recallSign = recallDelta >= 0 ? "+" : "";
      const mrrSign = mrrDelta >= 0 ? "+" : "";
      deltaStr = `${recallSign}${(recallDelta * 100).toFixed(1)}pp Recall, ${mrrSign}${(mrrDelta * 100).toFixed(1)}pp MRR`;
    } else if (baseline === "vcs-only") {
      deltaStr = "(baseline)";
    }

    console.log(
      padRight(baseline, 22) +
        padRight(recallStr, 12) +
        padRight(mrrStr, 10) +
        padRight(latencyStr, 18) +
        deltaStr,
    );
  }

  console.log("─".repeat(72));
  console.log("");
}
