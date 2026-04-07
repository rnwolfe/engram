/**
 * bench.ts — Self-contained EngRAMark benchmark entrypoint.
 *
 * Usage:
 *   bun run -F engramark bench [options]
 *
 * Options:
 *   --strategy <name>      Run only this strategy: grep-baseline, vcs-only, ai-enhanced
 *   --save-baseline        Write results to .engramark-baseline.json
 *   --ci                   Exit 1 on regression vs .engramark-baseline.json
 *   --cached <path>        Skip cloning/ingestion; open existing .engram file
 *
 * Environment variables:
 *   ENGRAM_AI_PROVIDER     Provider name: ollama, gemini, or unset (NullProvider)
 *   ENGRAM_OLLAMA_BASE_URL Ollama base URL (default: http://localhost:11434)
 *   GEMINI_API_KEY         Gemini API key (required when ENGRAM_AI_PROVIDER=gemini)
 *
 * Examples:
 *   bun run -F engramark bench
 *   bun run -F engramark bench --strategy vcs-only
 *   bun run -F engramark bench --save-baseline
 *   bun run -F engramark bench --ci
 *   bun run -F engramark bench --cached /tmp/fastify.engram
 *   ENGRAM_AI_PROVIDER=ollama bun run -F engramark bench
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  closeGraph,
  createProvider,
  ingestGitRepo,
  NullProvider,
  openGraph,
} from "engram-core";

import { compareToBaseline, loadBaseline, saveBaseline } from "./baseline.js";
import { FASTIFY_QUESTIONS } from "./datasets/fastify/questions.js";
import { FASTIFY_REPO_URL, FASTIFY_TAG } from "./fixtures/fastify.js";
import type { BenchmarkReport } from "./metrics.js";
import { compareStrategies, printReport } from "./report.js";
import {
  ALL_STRATEGIES,
  runStrategy,
  type StrategyName,
} from "./runners/index.js";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getFlag(flag: string): boolean {
  return argv.includes(flag);
}

function getFlagValue(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

const strategyArg = getFlagValue("--strategy");
let cachedPath = getFlagValue("--cached");
const saveBaselineFlag = getFlag("--save-baseline");
const ciFlag = getFlag("--ci");
const baselinePath = ".engramark-baseline.json";

// Resolve --cached path to absolute
if (cachedPath) cachedPath = resolve(cachedPath);

// Validate --strategy flag
const VALID_STRATEGIES: StrategyName[] = ALL_STRATEGIES;

function isValidStrategy(s: string): s is StrategyName {
  return (VALID_STRATEGIES as string[]).includes(s);
}

if (strategyArg && !isValidStrategy(strategyArg)) {
  console.error(
    `[bench] Unknown strategy: "${strategyArg}". Valid options: ${VALID_STRATEGIES.join(", ")}`,
  );
  process.exit(1);
}

const strategies: StrategyName[] = strategyArg
  ? [strategyArg as StrategyName]
  : ALL_STRATEGIES;

// ---------------------------------------------------------------------------
// AI provider setup
// ---------------------------------------------------------------------------

const providerLabel = process.env.ENGRAM_AI_PROVIDER ?? null;
const provider = providerLabel
  ? createProvider({ provider: providerLabel as "ollama" | "gemini" })
  : new NullProvider();

// Determine the label for ai-enhanced when no real provider is configured
const aiEnhancedLabel = providerLabel
  ? "ai-enhanced"
  : "ai-enhanced (no provider — FTS only)";

// ---------------------------------------------------------------------------
// Graph setup: either open cached file or clone + ingest
// ---------------------------------------------------------------------------

let cloneDir: string | null = null;
let graphPath: string;

// Signal handlers — clean up temp dir on early exit
const cleanup = () => {
  if (cloneDir) {
    rmSync(cloneDir, { recursive: true, force: true });
  }
};
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

if (cachedPath) {
  if (!existsSync(cachedPath)) {
    console.error(`[bench] --cached path not found: ${cachedPath}`);
    process.exit(1);
  }
  graphPath = cachedPath;
  console.log(`[bench] Using cached graph: ${cachedPath}`);
} else {
  // Clone Fastify into a temp dir
  cloneDir = mkdtempSync(join(tmpdir(), "engramark-fastify-"));
  const cloneTarget = join(cloneDir, "fastify");

  console.log(`[bench] Cloning fastify ${FASTIFY_TAG}...`);
  const cloneStart = performance.now();
  try {
    execFileSync(
      "git",
      [
        "clone",
        "--depth",
        "1",
        "--branch",
        FASTIFY_TAG,
        FASTIFY_REPO_URL,
        cloneTarget,
      ],
      { stdio: "pipe" },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bench] git clone failed: ${msg}`);
    rmSync(cloneDir, { recursive: true, force: true });
    process.exit(1);
  }
  const cloneMs = (performance.now() - cloneStart).toFixed(0);
  console.log(`[bench] Clone complete in ${cloneMs}ms`);

  // Create an in-memory graph for this run
  graphPath = ":memory:";
  const graph = openGraph(graphPath);

  console.log("[bench] Ingesting git history...");
  const ingestStart = performance.now();
  try {
    const ingestResult = await ingestGitRepo(graph, cloneTarget, {
      provider: providerLabel ? provider : undefined,
    });
    const ingestMs = (performance.now() - ingestStart).toFixed(0);
    console.log(
      `[bench] Ingestion complete in ${ingestMs}ms — ` +
        `${ingestResult.episodesCreated} episodes, ` +
        `${ingestResult.entitiesCreated} entities, ` +
        `${ingestResult.edgesCreated} edges`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[bench] Ingestion failed: ${msg}`);
    closeGraph(graph);
    rmSync(cloneDir, { recursive: true, force: true });
    process.exit(1);
  }

  // Run strategies against this graph synchronously (graph is already open)
  await runBenchmarkOnGraph(graph);

  // Cleanup
  closeGraph(graph);
  rmSync(cloneDir, { recursive: true, force: true });
  process.exit(0);
}

// If --cached, open the graph and run
const cachedGraph = openGraph(graphPath);
await runBenchmarkOnGraph(cachedGraph);
closeGraph(cachedGraph);
process.exit(0);

// ---------------------------------------------------------------------------
// Core benchmark execution
// ---------------------------------------------------------------------------

async function runBenchmarkOnGraph(
  graph: ReturnType<typeof openGraph>,
): Promise<void> {
  const reports: BenchmarkReport[] = [];

  for (const strategy of strategies) {
    console.log(`[bench] Running ${strategy}...`);
    const runStart = performance.now();

    let report: BenchmarkReport;
    if (strategy === "ai-enhanced") {
      // ai-enhanced always runs — with NullProvider if no provider is configured
      report = await runStrategy(strategy, graph, FASTIFY_QUESTIONS, provider);

      // Re-label the baseline field when using NullProvider
      if (!providerLabel) {
        report = { ...report, baseline: aiEnhancedLabel };
      }
    } else {
      report = await runStrategy(strategy, graph, FASTIFY_QUESTIONS);
    }

    const runMs = (performance.now() - runStart).toFixed(0);
    console.log(`[bench] ${strategy} complete in ${runMs}ms`);
    reports.push(report);
  }

  // Output results
  console.log("");
  if (reports.length === 1) {
    printReport(reports[0]);
  } else {
    compareStrategies(reports);
  }

  // Save baseline if requested
  if (saveBaselineFlag) {
    saveBaseline(reports, baselinePath);
    console.log(`[bench] Baseline saved to ${baselinePath}`);
  }

  // CI regression check
  if (ciFlag) {
    if (!existsSync(baselinePath)) {
      console.error(
        `[bench] --ci: baseline file not found at ${baselinePath}. Run --save-baseline first.`,
      );
      process.exit(1);
    }
    const baseline = loadBaseline(baselinePath);
    const comparison = compareToBaseline(reports, baseline);

    if (comparison.has_regressions) {
      console.error("[bench] Regressions detected:");
      for (const r of comparison.regressions) {
        if (r.regressed) {
          console.error(
            `  ${r.strategy}: recall ${(r.baseline_recall * 100).toFixed(1)}% → ` +
              `${(r.current_recall * 100).toFixed(1)}% ` +
              `(${(r.recall_delta * 100).toFixed(1)}pp), ` +
              `MRR ${r.baseline_mrr.toFixed(3)} → ${r.current_mrr.toFixed(3)} ` +
              `(${(r.mrr_delta * 100).toFixed(1)}pp)`,
          );
        }
      }
      process.exit(1);
    } else {
      console.log("[bench] No regressions detected.");
    }
  }
}
