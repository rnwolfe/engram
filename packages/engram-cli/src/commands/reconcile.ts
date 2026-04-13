/**
 * reconcile.ts — `engram reconcile` command.
 *
 * Runs the two-phase projection maintenance loop:
 *   Phase 1 (assess): checks stale projections and refreshes or supersedes them.
 *   Phase 2 (discover): finds new substrate rows not yet covered by projections.
 *
 * Usage:
 *   engram reconcile [--phase assess|discover|both] [--scope <filter>]
 *                    [--max-cost <n>] [--dry-run] [--db <path>]
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, createGenerator, openGraph, reconcile } from "engram-core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReconcileOpts {
  phase: "assess" | "discover" | "both";
  scope?: string;
  maxCost?: string;
  dryRun: boolean;
  db: string;
}

// ─── Scope validation ─────────────────────────────────────────────────────────

/**
 * Validates the --scope flag format.
 * Accepted: 'kind:<value>' or 'anchor:<value>'
 */
function validateScope(scope: string): string | null {
  if (scope.startsWith("kind:") && scope.length > 5) return null;
  if (scope.startsWith("anchor:") && scope.length > 7) return null;
  return `Invalid --scope value: "${scope}". Expected format: kind:<value> or anchor:<value>`;
}

// ─── Progress output ──────────────────────────────────────────────────────────

function printPhaseHeader(phase: string): void {
  console.log(`\n  [reconcile] ${phase} phase starting...`);
}

function printProgress(label: string, value: number | string): void {
  console.log(`    ${label}: ${value}`);
}

function printSummary(
  runId: string,
  status: string,
  assessed: number,
  softRefreshed: number,
  superseded: number,
  startedAt: string,
  completedAt: string,
  dryRun: boolean,
): void {
  const elapsed = (
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) /
    1000
  ).toFixed(1);

  console.log("\n  Reconciliation complete");
  console.log(`  Status:          ${status}${dryRun ? " (dry-run)" : ""}`);
  console.log(`  Run ID:          ${runId}`);
  console.log(`  Elapsed:         ${elapsed}s`);
  console.log(`  Assessed:        ${assessed}`);
  console.log(`  Soft-refreshed:  ${softRefreshed}`);
  console.log(`  Superseded:      ${superseded}`);
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerReconcile(program: Command): void {
  program
    .command("reconcile")
    .description("Run the two-phase projection maintenance loop")
    .option(
      "--phase <phase>",
      "which phase to run: assess, discover, or both (default: both)",
      "both",
    )
    .option("--scope <filter>", "limit scope: kind:<value> or anchor:<value>")
    .option("--max-cost <n>", "token budget cap (required unless --dry-run)")
    .option("--dry-run", "assess but do not persist any changes", false)
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: ReconcileOpts) => {
      // ── Validate --phase ────────────────────────────────────────────────────
      const validPhases = ["assess", "discover", "both"];
      if (!validPhases.includes(opts.phase)) {
        console.error(
          `Error: --phase must be one of: assess, discover, both (got "${opts.phase}")`,
        );
        process.exit(2);
      }

      // ── Validate --scope ────────────────────────────────────────────────────
      if (opts.scope) {
        const scopeErr = validateScope(opts.scope);
        if (scopeErr) {
          console.error(`Error: ${scopeErr}`);
          process.exit(2);
        }
      }

      // ── Require --max-cost unless --dry-run ─────────────────────────────────
      if (!opts.dryRun && opts.maxCost === undefined) {
        console.error(
          "Error: --max-cost <n> is required for non-dry-run reconcile.\n" +
            "  This forces you to acknowledge the token budget before making changes.\n" +
            "  Use --dry-run to assess without persisting, or set --max-cost to proceed.",
        );
        process.exit(2);
      }

      // ── Parse --max-cost ────────────────────────────────────────────────────
      let maxCost: number | undefined;
      if (opts.maxCost !== undefined) {
        maxCost = Number(opts.maxCost);
        if (!Number.isFinite(maxCost) || maxCost < 0) {
          console.error(
            `Error: --max-cost must be a non-negative number (got "${opts.maxCost}")`,
          );
          process.exit(2);
        }
      }

      // ── Open graph ──────────────────────────────────────────────────────────
      const dbPath = path.resolve(opts.db);
      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      // ── Build phase list ────────────────────────────────────────────────────
      const phases: ("assess" | "discover")[] =
        opts.phase === "both" ? ["assess", "discover"] : [opts.phase];

      // ── Print plan ──────────────────────────────────────────────────────────
      console.log("  Reconciling projections...");
      if (opts.dryRun) {
        console.log("  Mode:  dry-run (no writes)");
      }
      if (opts.scope) {
        console.log(`  Scope: ${opts.scope}`);
      }
      if (maxCost !== undefined) {
        console.log(`  Budget: ${maxCost} tokens`);
      }

      // ── Create generator ────────────────────────────────────────────────────
      // createGenerator() resolves the provider from ENGRAM_AI_PROVIDER
      // (anthropic | gemini | openai) or auto-detects from present API keys.
      // Falls back to NullGenerator when nothing is configured, which will
      // error on the first LLM call with a clear message.
      const generator = createGenerator();

      // ── Run reconciliation ──────────────────────────────────────────────────
      let result: Awaited<ReturnType<typeof reconcile>>;
      try {
        if (phases.includes("assess")) {
          printPhaseHeader("assess");
        }

        result = await reconcile(graph, generator, {
          scope: opts.scope,
          phases,
          maxCost,
          dryRun: opts.dryRun,
        });

        if (phases.includes("discover")) {
          printPhaseHeader("discover");
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`\n  Reconcile failed: ${errMsg}`);
        if (
          errMsg.includes("NullGenerator") ||
          errMsg.includes("no AI provider configured")
        ) {
          console.error(
            "\n  No AI provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY to enable projection authoring.",
          );
        }
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);

      // ── Print per-phase progress ────────────────────────────────────────────
      if (phases.includes("assess")) {
        printProgress("Projections assessed", result.assessed);
        printProgress("Soft-refreshed", result.soft_refreshed);
        printProgress("Superseded", result.superseded);
      }

      // ── Handle partial (budget exhausted) ──────────────────────────────────
      if (result.status === "partial") {
        console.log(
          "\n  Budget exhausted — partial run recorded. Re-run to continue.",
        );
        console.log(
          `  Cursor saved in reconciliation_runs.id = ${result.run_id}`,
        );
      }

      // ── Final summary ───────────────────────────────────────────────────────
      printSummary(
        result.run_id,
        result.status,
        result.assessed,
        result.soft_refreshed,
        result.superseded,
        result.started_at,
        result.completed_at,
        opts.dryRun,
      );

      process.exit(0);
    });
}
