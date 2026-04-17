/**
 * runners/stale-read-time.ts — Read-time staleness detection runner.
 *
 * Uses getProjection() to check the stale flag on each projection without
 * running reconcile(). This is the "O(inputs)" read-time invariant described
 * in the architecture: every getProjection() call recomputes the input
 * fingerprint and returns stale=true if the fingerprint has drifted.
 *
 * No LLM calls. No mutation. Pure read path.
 */

import type { EngramGraph } from "engram-core";
import { getProjection } from "engram-core";
import type { PreparedScenario } from "../datasets/loader.js";
import type { ScenarioResult } from "../scoring.js";
import type { StaleKnowledgeBenchmarkRunner } from "./stale-naive-rag.js";

export const RUNNER_NAME = "stale-read-time";

/**
 * Read-time runner — detects staleness by calling getProjection() and
 * checking the returned stale flag. No reconcile, no LLM.
 */
export const readTimeRunner: StaleKnowledgeBenchmarkRunner = {
  name: RUNNER_NAME,

  async run(
    graph: EngramGraph,
    scenarios: PreparedScenario[],
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];

    for (const prepared of scenarios) {
      const start = performance.now();

      if (!prepared.projection) {
        // Scenario was not prepared (anchor missing or project() failed)
        results.push({
          scenario_id: prepared.scenario.id,
          expected_stale: prepared.scenario.expected_stale,
          detected_stale: false,
          details: `skipped: ${prepared.error ?? "projection not authored"}`,
          latency_ms: performance.now() - start,
        });
        continue;
      }

      let detected_stale = false;
      let details: string | undefined;

      try {
        const result = getProjection(graph, prepared.projection.id);

        if (!result) {
          // Projection no longer exists — treat as stale
          detected_stale = true;
          details = "projection not found after graph advance";
        } else {
          detected_stale = result.stale;
          details = result.stale
            ? `stale: ${result.stale_reason ?? "fingerprint_mismatch"}`
            : "fresh";
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        details = `getProjection() error: ${msg}`;
        detected_stale = false;
      }

      results.push({
        scenario_id: prepared.scenario.id,
        expected_stale: prepared.scenario.expected_stale,
        detected_stale,
        details,
        latency_ms: performance.now() - start,
      });
    }

    return results;
  },
};

/**
 * Run the read-time staleness detection against prepared scenarios.
 *
 * @param graph - Graph at commit Y (advanced past commit X).
 * @param scenarios - Prepared scenarios with projections authored at commit X.
 * @returns ScenarioResult[].
 */
export async function runBenchmark(
  graph: EngramGraph,
  scenarios: PreparedScenario[],
): Promise<ScenarioResult[]> {
  return readTimeRunner.run(graph, scenarios);
}
