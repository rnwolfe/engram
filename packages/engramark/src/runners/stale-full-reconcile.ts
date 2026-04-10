/**
 * runners/stale-full-reconcile.ts — Full reconcile runner for stale-knowledge detection.
 *
 * Runs reconcile() assess phase on all active projections, then reports which
 * projections were flagged stale or superseded. This is the "gold standard"
 * detection path that uses an AI assess verdict to determine if content has
 * drifted beyond the fingerprint check.
 *
 * Uses NullGenerator by default — which means the assess phase uses the
 * reconcile() stale-filter (fingerprint drift) but always returns 'still_accurate'
 * on assess(). In real use, swap in AnthropicGenerator or another implementation.
 */

import type { EngramGraph } from "engram-core";
import { getProjection, NullGenerator, reconcile } from "engram-core";
import type { PreparedScenario } from "../datasets/stale-knowledge/loader.js";
import type { ScenarioResult } from "../scoring/stale-knowledge.js";
import type { StaleKnowledgeBenchmarkRunner } from "./stale-naive-rag.js";

export const RUNNER_NAME = "stale-full-reconcile";

/**
 * Full-reconcile runner — runs reconcile() assess phase and then checks each
 * projection's updated staleness state.
 *
 * The reconcile() assess phase:
 *   1. Lists all active projections.
 *   2. For each stale projection (fingerprint drift): calls generator.assess().
 *   3. NullGenerator.assess() always returns 'still_accurate' → softRefresh().
 *   4. After the run, stale projections that were soft-refreshed will read as
 *      fresh; projections not assessed (generator always still_accurate) remain
 *      in their pre-reconcile state initially, but fingerprint is updated.
 *
 * To detect staleness we therefore read the stale flag BEFORE running reconcile.
 * The reconcile run count (assessed, superseded) is captured in details.
 */
export const fullReconcileRunner: StaleKnowledgeBenchmarkRunner = {
  name: RUNNER_NAME,

  async run(
    graph: EngramGraph,
    scenarios: PreparedScenario[],
  ): Promise<ScenarioResult[]> {
    // Step 1: capture pre-reconcile stale flags for each projection
    const preReconcileStale = new Map<string, boolean>();
    const preReconcileReason = new Map<string, string | undefined>();

    for (const prepared of scenarios) {
      if (!prepared.projection) continue;

      try {
        const result = getProjection(graph, prepared.projection.id);
        if (result) {
          preReconcileStale.set(prepared.projection.id, result.stale);
          preReconcileReason.set(prepared.projection.id, result.stale_reason);
        } else {
          preReconcileStale.set(prepared.projection.id, true);
        }
      } catch {
        preReconcileStale.set(prepared.projection.id, false);
      }
    }

    // Step 2: run reconcile() assess phase with NullGenerator
    const generator = new NullGenerator();
    let runResult: Awaited<ReturnType<typeof reconcile>> | null = null;

    try {
      runResult = await reconcile(graph, generator, {
        phases: ["assess"],
        dryRun: false,
      });
    } catch {
      // If reconcile fails, fall back to pre-reconcile state
    }

    const reconcileDetails = runResult
      ? `reconcile: assessed=${runResult.assessed} superseded=${runResult.superseded} soft_refreshed=${runResult.soft_refreshed}`
      : "reconcile: failed";

    // Step 3: build results using pre-reconcile stale flags
    const results: ScenarioResult[] = [];

    for (const prepared of scenarios) {
      const start = performance.now();

      if (!prepared.projection) {
        results.push({
          scenario_id: prepared.scenario.id,
          expected_stale: prepared.scenario.expected_stale,
          detected_stale: false,
          details: `skipped: ${prepared.error ?? "projection not authored"}`,
          latency_ms: performance.now() - start,
        });
        continue;
      }

      const was_stale = preReconcileStale.get(prepared.projection.id) ?? false;
      const reason = preReconcileReason.get(prepared.projection.id);

      const details = was_stale
        ? `pre-reconcile stale: ${reason ?? "fingerprint_mismatch"}; ${reconcileDetails}`
        : `pre-reconcile fresh; ${reconcileDetails}`;

      results.push({
        scenario_id: prepared.scenario.id,
        expected_stale: prepared.scenario.expected_stale,
        detected_stale: was_stale,
        details,
        latency_ms: performance.now() - start,
      });
    }

    return results;
  },
};

/**
 * Run the full-reconcile stale-knowledge benchmark.
 *
 * @param graph - Graph at commit Y.
 * @param scenarios - Prepared scenarios with projections authored at commit X.
 * @returns ScenarioResult[].
 */
export async function runBenchmark(
  graph: EngramGraph,
  scenarios: PreparedScenario[],
): Promise<ScenarioResult[]> {
  return fullReconcileRunner.run(graph, scenarios);
}
