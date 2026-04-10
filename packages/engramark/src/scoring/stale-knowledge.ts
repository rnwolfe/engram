/**
 * scoring/stale-knowledge.ts — Metrics computation for stale-knowledge detection benchmarks.
 *
 * Computes precision, recall, F1, and placeholder fields for the stale-knowledge
 * detection benchmark. Each ScenarioResult records what the runner detected
 * versus the ground-truth expected_stale flag.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Result of running a single benchmark scenario through a runner.
 */
export interface ScenarioResult {
  /** Scenario ID (e.g. 'sk-001'). */
  scenario_id: string;
  /** Ground-truth: was the projection expected to be stale? */
  expected_stale: boolean;
  /** Detected: did the runner flag the projection as stale? */
  detected_stale: boolean;
  /** Optional details from the runner (reconcile verdict, stale_reason, etc.). */
  details?: string;
  /** Latency of this detection in milliseconds. */
  latency_ms: number;
}

/**
 * Aggregated metrics for a stale-knowledge detection benchmark run.
 */
export interface StaleKnowledgeMetrics {
  /**
   * Recall: fraction of truly-stale projections correctly flagged as stale.
   *   stale_recall = TP / (TP + FN)
   */
  stale_recall: number;

  /**
   * Precision: fraction of flagged-stale projections that are truly stale.
   *   stale_precision = TP / (TP + FP)
   */
  stale_precision: number;

  /**
   * F1: harmonic mean of recall and precision.
   *   stale_f1 = 2 * (precision * recall) / (precision + recall)
   */
  stale_f1: number;

  /**
   * Reconcile accuracy: fraction of scenarios where the reconcile() verdict
   * matches expected_reconcile_outcome.
   *
   * Placeholder 0.0 — LLM grader integration is a separate issue.
   */
  reconcile_accuracy: number;

  /**
   * Cost per staleness resolved: average latency (ms) per true-positive detection.
   * Infinity when TP=0 (no stale projections correctly identified).
   */
  cost_per_staleness_resolved: number;

  /** Total scenarios evaluated. */
  total: number;

  /** Number of truly-stale projections in the scenario set. */
  total_stale: number;

  /** Number of projections flagged stale by the runner. */
  flagged_stale: number;

  /** True positives: stale and detected. */
  true_positives: number;

  /** False positives: not stale but detected. */
  false_positives: number;

  /** False negatives: stale but not detected. */
  false_negatives: number;
}

// ─── Metric computation ───────────────────────────────────────────────────────

/**
 * Compute stale-knowledge detection metrics from a set of scenario results.
 *
 * @param results - Per-scenario detection outcomes.
 * @returns Aggregated StaleKnowledgeMetrics.
 */
export function computeStaleKnowledgeMetrics(
  results: ScenarioResult[],
): StaleKnowledgeMetrics {
  const total = results.length;
  const total_stale = results.filter((r) => r.expected_stale).length;
  const flagged_stale = results.filter((r) => r.detected_stale).length;

  const true_positives = results.filter(
    (r) => r.expected_stale && r.detected_stale,
  ).length;
  const false_positives = results.filter(
    (r) => !r.expected_stale && r.detected_stale,
  ).length;
  const false_negatives = results.filter(
    (r) => r.expected_stale && !r.detected_stale,
  ).length;

  // Recall = TP / (TP + FN)
  const stale_recall =
    true_positives + false_negatives > 0
      ? true_positives / (true_positives + false_negatives)
      : 0;

  // Precision = TP / (TP + FP)
  const stale_precision =
    true_positives + false_positives > 0
      ? true_positives / (true_positives + false_positives)
      : 0;

  // F1 = 2 * (P * R) / (P + R)
  const stale_f1 =
    stale_precision + stale_recall > 0
      ? (2 * stale_precision * stale_recall) / (stale_precision + stale_recall)
      : 0;

  // Cost per staleness resolved: avg latency per TP
  const tp_results = results.filter(
    (r) => r.expected_stale && r.detected_stale,
  );
  const cost_per_staleness_resolved =
    tp_results.length > 0
      ? tp_results.reduce((sum, r) => sum + r.latency_ms, 0) / tp_results.length
      : Number.POSITIVE_INFINITY;

  // Placeholder: LLM-graded reconcile accuracy is out of scope
  const reconcile_accuracy = 0.0;

  return {
    stale_recall,
    stale_precision,
    stale_f1,
    reconcile_accuracy,
    cost_per_staleness_resolved,
    total,
    total_stale,
    flagged_stale,
    true_positives,
    false_positives,
    false_negatives,
  };
}
