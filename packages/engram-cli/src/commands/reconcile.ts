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
import { intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  createGenerator,
  openGraph,
  reconcile,
  resolveDbPath,
} from "engram-core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReconcileOpts {
  phase: "assess" | "discover" | "both";
  scope?: string;
  maxCost?: string;
  maxDeltaItems?: string;
  dryRun: boolean;
  resetCursor: boolean;
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
    .option(
      "--max-delta-items <n>",
      "max substrate items per discover call — larger values use more tokens (default: 500)",
    )
    .option("--dry-run", "assess but do not persist any changes", false)
    .option(
      "--reset-cursor",
      "clear reconciliation history so the next run re-processes all substrate data",
      false,
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Run both phases with a token budget
  engram reconcile --max-cost 50000

  # Run only the assess phase (refresh stale projections)
  engram reconcile --phase assess --max-cost 50000

  # Run only the discover phase (find uncovered substrate)
  engram reconcile --phase discover --max-cost 50000

  # Preview what would change without persisting
  engram reconcile --dry-run

When to use:
  After ingesting new commits or enrichment data to keep projections current,
  or on a scheduled basis to ensure the graph stays fresh.

See also:
  engram project   author a projection on a specific anchor manually`,
    )
    .action(async (opts: ReconcileOpts) => {
      intro("engram reconcile");

      // ── Reset cursor (no other flags required) ──────────────────────────────
      if (opts.resetCursor) {
        const dbPath = resolveDbPath(path.resolve(opts.db));
        let graph: EngramGraph | undefined;
        try {
          graph = openGraph(dbPath);
        } catch (err) {
          log.error(
            `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
        const deleted = (
          graph.db.prepare("DELETE FROM reconciliation_runs").run() as {
            changes: number;
          }
        ).changes;
        closeGraph(graph);
        log.info(
          `Cursor reset — deleted ${deleted} reconciliation run(s). Re-run without --reset-cursor to discover from scratch.`,
        );
        outro("Done");
        process.exit(0);
      }

      // ── Validate --phase ────────────────────────────────────────────────────
      const validPhases = ["assess", "discover", "both"];
      if (!validPhases.includes(opts.phase)) {
        log.error(
          `--phase must be one of: assess, discover, both (got "${opts.phase}")`,
        );
        process.exit(2);
      }

      // ── Validate --scope ────────────────────────────────────────────────────
      if (opts.scope) {
        const scopeErr = validateScope(opts.scope);
        if (scopeErr) {
          log.error(scopeErr);
          process.exit(2);
        }
      }

      // ── Require --max-cost unless --dry-run ─────────────────────────────────
      if (!opts.dryRun && opts.maxCost === undefined) {
        log.error(
          "--max-cost <n> is required for non-dry-run reconcile.\n" +
            "Use --dry-run to assess without persisting, or set --max-cost to proceed.",
        );
        process.exit(2);
      }

      // ── Parse --max-cost ────────────────────────────────────────────────────
      let maxCost: number | undefined;
      if (opts.maxCost !== undefined) {
        maxCost = Number(opts.maxCost);
        if (!Number.isFinite(maxCost) || maxCost < 0) {
          log.error(
            `--max-cost must be a non-negative number (got "${opts.maxCost}")`,
          );
          process.exit(2);
        }
      }

      // ── Parse --max-delta-items ─────────────────────────────────────────────
      let maxDeltaItems: number | undefined;
      if (opts.maxDeltaItems !== undefined) {
        maxDeltaItems = Number(opts.maxDeltaItems);
        if (!Number.isFinite(maxDeltaItems) || maxDeltaItems < 1) {
          log.error(
            `--max-delta-items must be a positive number (got "${opts.maxDeltaItems}")`,
          );
          process.exit(2);
        }
      }

      // ── Open graph ──────────────────────────────────────────────────────────
      const dbPath = resolveDbPath(path.resolve(opts.db));
      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      // ── Build phase list ────────────────────────────────────────────────────
      const phases: ("assess" | "discover")[] =
        opts.phase === "both" ? ["assess", "discover"] : [opts.phase];

      // ── Print plan ──────────────────────────────────────────────────────────
      const planLines = [`Phases: ${phases.join(", ")}`];
      if (opts.dryRun) planLines.push("Mode:   dry-run (no writes)");
      if (opts.scope) planLines.push(`Scope:  ${opts.scope}`);
      if (maxCost !== undefined) planLines.push(`Budget: ${maxCost} tokens`);
      planLines.push(
        `Delta:  up to ${maxDeltaItems ?? 500} items/discover call`,
      );
      log.info(planLines.join("\n"));

      // ── Create generator ────────────────────────────────────────────────────
      const generator = createGenerator();

      // ── Run reconciliation ──────────────────────────────────────────────────
      const s = spinner();
      s.start(
        phases.length === 2
          ? "Running assess + discover phases"
          : `Running ${phases[0]} phase`,
      );

      let result: Awaited<ReturnType<typeof reconcile>>;
      try {
        result = await reconcile(graph, generator, {
          scope: opts.scope,
          phases,
          maxCost,
          dryRun: opts.dryRun,
          maxDeltaItems,
        });
        s.stop("Reconciliation complete");
      } catch (err) {
        s.stop("Reconciliation failed");
        const errMsg = err instanceof Error ? err.message : String(err);
        log.error(errMsg);
        if (
          errMsg.includes("NullGenerator") ||
          errMsg.includes("no AI provider configured")
        ) {
          log.warn(
            "No AI provider configured. Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY to enable projection authoring.",
          );
        }
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);

      // ── Summary ─────────────────────────────────────────────────────────────
      const elapsed = (
        (new Date(result.completed_at).getTime() -
          new Date(result.started_at).getTime()) /
        1000
      ).toFixed(1);

      const summaryLines = [
        `Status:       ${result.status}${opts.dryRun ? " (dry-run)" : ""}`,
        `Elapsed:      ${elapsed}s`,
      ];
      if (phases.includes("assess")) {
        summaryLines.push(
          `Assessed:     ${result.assessed}`,
          `Refreshed:    ${result.soft_refreshed}`,
          `Superseded:   ${result.superseded}`,
        );
      }
      if (phases.includes("discover")) {
        summaryLines.push(`Discovered:   ${result.discovered}`);
      }
      summaryLines.push(`Run ID:       ${result.run_id}`);
      log.info(summaryLines.join("\n"));

      if (result.status === "partial") {
        log.warn(
          "Budget exhausted — partial run recorded. Re-run to continue.",
        );
      }
      if (result.stub_mode) {
        log.warn(
          "Generator has no API key — discover phase was a no-op and cursor was NOT advanced.\n" +
            "Set the API key env var (e.g. GEMINI_API_KEY, ANTHROPIC_API_KEY) and re-run.",
        );
      }

      outro("Done");
      process.exit(0);
    });
}
