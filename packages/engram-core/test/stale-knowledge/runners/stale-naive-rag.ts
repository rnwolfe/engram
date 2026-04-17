/**
 * runners/stale-naive-rag.ts — Naive RAG baseline for stale-knowledge detection.
 *
 * This runner represents a system with no staleness awareness. It always returns
 * "cannot detect staleness", scoring 0.0 detected_stale for every scenario.
 *
 * Purpose: establishes a lower-bound baseline to contrast against read-time
 * and full-reconcile runners in the comparison table.
 */

import type { EngramGraph } from "engram-core";
import type { PreparedScenario } from "../datasets/loader.js";
import type { ScenarioResult } from "../scoring.js";

export const RUNNER_NAME = "stale-naive-rag";

// ─── StaleKnowledgeBenchmarkRunner interface ──────────────────────────────────

export interface StaleKnowledgeBenchmarkRunner {
  /** Human-readable runner name shown in the report. */
  name: string;

  /**
   * Run all prepared scenarios and return one ScenarioResult per scenario.
   *
   * @param graph - Graph populated at commit Y (the "after" state).
   * @param scenarios - Prepared scenarios (projections authored at commit X).
   * @returns ScenarioResult[] in the same order as scenarios.
   */
  run(
    graph: EngramGraph,
    scenarios: PreparedScenario[],
  ): Promise<ScenarioResult[]>;
}

// ─── Naive RAG runner ─────────────────────────────────────────────────────────

/**
 * Naive RAG runner — always reports detected_stale=false (score 0.0).
 *
 * Represents the performance of a retrieval system that has no mechanism to
 * detect whether its cached projections are out of date.
 */
export const naiveRagRunner: StaleKnowledgeBenchmarkRunner = {
  name: RUNNER_NAME,

  async run(
    _graph: EngramGraph,
    scenarios: PreparedScenario[],
  ): Promise<ScenarioResult[]> {
    return scenarios.map((s) => ({
      scenario_id: s.scenario.id,
      expected_stale: s.scenario.expected_stale,
      detected_stale: false,
      details: "naive-rag: no staleness detection capability",
      latency_ms: 0,
    }));
  },
};

/**
 * Run the naive-rag detection against prepared scenarios.
 *
 * @param graph - Graph at commit Y.
 * @param scenarios - Prepared scenarios.
 * @returns ScenarioResult[].
 */
export async function runBenchmark(
  graph: EngramGraph,
  scenarios: PreparedScenario[],
): Promise<ScenarioResult[]> {
  return naiveRagRunner.run(graph, scenarios);
}
