/**
 * baseline.ts — Baseline persistence and regression detection for EngRAMark.
 *
 * Provides utilities for saving benchmark results as a baseline JSON file
 * and comparing future runs against that baseline to detect regressions.
 */

import { readFileSync, writeFileSync } from "node:fs";
import type { BenchmarkReport } from "./metrics.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BaselineEntry {
  recall_at_5: number;
  mrr: number;
}

export interface BaselineFile {
  recorded_at: string;
  strategies: Record<string, BaselineEntry>;
}

export interface RegressionResult {
  strategy: string;
  baseline_recall: number;
  current_recall: number;
  baseline_mrr: number;
  current_mrr: number;
  recall_delta: number;
  mrr_delta: number;
  /** True if recall or MRR dropped beyond the regression threshold. */
  regressed: boolean;
}

export interface CompareBaselineResult {
  regressions: RegressionResult[];
  has_regressions: boolean;
}

// ─── Save / Load ──────────────────────────────────────────────────────────────

/**
 * Save benchmark results to a baseline JSON file.
 *
 * @param reports - Array of BenchmarkReports (one per strategy).
 * @param path - File path to write baseline JSON.
 */
export function saveBaseline(reports: BenchmarkReport[], path: string): void {
  const strategies: Record<string, BaselineEntry> = {};

  for (const report of reports) {
    strategies[report.baseline] = {
      recall_at_5: report.aggregate.avg_recall_at_5,
      mrr: report.aggregate.avg_mrr,
    };
  }

  const baseline: BaselineFile = {
    recorded_at: new Date().toISOString(),
    strategies,
  };

  writeFileSync(path, JSON.stringify(baseline, null, 2), "utf-8");
}

/**
 * Load a baseline file from disk.
 *
 * @param path - File path to the baseline JSON.
 * @returns Parsed BaselineFile.
 * @throws If the file cannot be read or parsed.
 */
export function loadBaseline(path: string): BaselineFile {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as BaselineFile;
}

// ─── Regression Detection ─────────────────────────────────────────────────────

/**
 * Compare current benchmark results against a saved baseline.
 *
 * A regression is triggered when recall@5 or MRR drops by more than
 * `threshold` (absolute, default 0.05 = 5pp).
 *
 * @param current - Array of current BenchmarkReports.
 * @param baseline - Loaded BaselineFile to compare against.
 * @param threshold - Absolute regression threshold (default 0.05).
 * @returns CompareBaselineResult listing regressions.
 */
export function compareToBaseline(
  current: BenchmarkReport[],
  baseline: BaselineFile,
  threshold = 0.05,
): CompareBaselineResult {
  const regressions: RegressionResult[] = [];

  for (const report of current) {
    const baselineEntry = baseline.strategies[report.baseline];
    if (!baselineEntry) {
      // No baseline for this strategy — skip regression check
      continue;
    }

    const recallDelta =
      report.aggregate.avg_recall_at_5 - baselineEntry.recall_at_5;
    const mrrDelta = report.aggregate.avg_mrr - baselineEntry.mrr;

    const regressed = recallDelta < -threshold || mrrDelta < -threshold;

    regressions.push({
      strategy: report.baseline,
      baseline_recall: baselineEntry.recall_at_5,
      current_recall: report.aggregate.avg_recall_at_5,
      baseline_mrr: baselineEntry.mrr,
      current_mrr: report.aggregate.avg_mrr,
      recall_delta: recallDelta,
      mrr_delta: mrrDelta,
      regressed,
    });
  }

  return {
    regressions,
    has_regressions: regressions.some((r) => r.regressed),
  };
}
