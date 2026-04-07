/**
 * runners/index.ts — Runner registry and factory.
 *
 * Provides a unified interface for discovering and instantiating benchmark
 * runners by strategy name.
 */

import type { AIProvider, EngramGraph } from "engram-core";
import type { GroundTruthQuestion } from "../datasets/fastify/questions.js";
import type { BenchmarkReport } from "../metrics.js";

/** Strategy names supported by the registry. */
export type StrategyName = "grep-baseline" | "vcs-only" | "ai-enhanced";

/** All available strategy names in order. */
export const ALL_STRATEGIES: StrategyName[] = [
  "grep-baseline",
  "vcs-only",
  "ai-enhanced",
];

/**
 * Run a benchmark for a given strategy.
 *
 * @param strategy - Strategy name to run.
 * @param graph - Populated EngramGraph to benchmark against.
 * @param questions - Ground-truth questions to evaluate.
 * @param provider - AIProvider for ai-enhanced strategy (ignored for others).
 * @returns BenchmarkReport for the strategy.
 */
export async function runStrategy(
  strategy: StrategyName,
  graph: EngramGraph,
  questions: GroundTruthQuestion[],
  provider?: AIProvider,
): Promise<BenchmarkReport> {
  switch (strategy) {
    case "grep-baseline": {
      const { runBenchmark } = await import("./grep-baseline.js");
      return runBenchmark(graph, questions);
    }
    case "vcs-only": {
      const { runBenchmark } = await import("./vcs-only.js");
      return runBenchmark(graph, questions);
    }
    case "ai-enhanced": {
      const { runBenchmark } = await import("./ai-enhanced.js");
      if (!provider) {
        throw new Error(
          "ai-enhanced strategy requires an AIProvider instance. Pass one as the third argument to runStrategy().",
        );
      }
      return runBenchmark(graph, questions, provider);
    }
    default: {
      const _exhaustive: never = strategy;
      throw new Error(`Unknown strategy: ${_exhaustive}`);
    }
  }
}
