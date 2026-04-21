/**
 * doctor.ts — `engram doctor` command.
 *
 * Runs a suite of diagnostic checks against a .engram database and, optionally,
 * auto-applies safe fixes. Modelled on `brew doctor`.
 *
 * Check and fix implementations live in doctor-checks.ts; this file handles
 * command registration, CLI parsing, orchestration, and report rendering.
 *
 * Checks implemented:
 *   layout            .engram/ directory contains engram.db (not a flat file)
 *   gitignore         .gitignore contains `.engram/` (directory entry, not flat file)
 *   schema            DB format_version matches current engine FORMAT_VERSION
 *   fts_index         FTS5 index present and not corrupted
 *   embedding_index   Stored embedding model dimensions match what is recorded
 *   wal               No stale WAL/SHM files at repo root from old flat-file layout
 *   evidence_integrity Every active entity and non-invalidated edge has ≥1 evidence link
 *
 * Exit codes:
 *   0 — all checks pass or only warnings
 *   1 — one or more checks failed
 */

import * as fs from "node:fs";
import * as nodePath from "node:path";
import { confirm, log } from "@clack/prompts";
import type { Command } from "commander";
import { resolveDbPath } from "engram-core";
import { c } from "../colors.js";
import type { CheckResult, CheckStatus } from "./doctor-checks.js";
import {
  checkEmbeddingIndex,
  checkEvidenceIntegrity,
  checkFtsIndex,
  checkGitignore,
  checkLayout,
  checkSchema,
  checkWal,
  fixFtsIndex,
  fixGitignore,
  fixLayout,
  fixSchema,
  fixWal,
  skip,
} from "./doctor-checks.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DoctorReport {
  db: string;
  checks: CheckResult[];
  fixes_applied: string[];
}

interface DoctorOpts {
  db: string;
  fix: boolean;
  yes: boolean;
  format?: string;
  j?: boolean;
}

// ─── Report rendering ─────────────────────────────────────────────────────────

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return c.green("✓");
    case "fail":
      return c.red("✗");
    case "warn":
      return c.yellow("⚠");
    case "skip":
      return "-";
  }
}

function renderHuman(report: DoctorReport): void {
  console.log("\nengram doctor\n");

  // Determine column width for check names
  const nameWidth = Math.max(...report.checks.map((c) => c.name.length));

  for (const check of report.checks) {
    const icon = statusIcon(check.status);
    const paddedName = check.name.padEnd(nameWidth);
    console.log(`  ${icon}  ${paddedName}  ${check.message}`);
  }

  const failed = report.checks.filter((c) => c.status === "fail");
  const warned = report.checks.filter((c) => c.status === "warn");
  const hasIssues = failed.length > 0 || warned.length > 0;

  if (hasIssues) {
    console.log(`\n${c.red("Issues found:")}`);
    for (const check of [...failed, ...warned]) {
      if (check.fix) {
        console.log(`  ${c.bold(check.name)}  ${check.message}`);
        console.log(`    fix: ${check.fix}`);
      } else {
        console.log(`  ${c.bold(check.name)}  ${check.message}`);
      }
    }
  }

  if (report.fixes_applied.length > 0) {
    console.log("\nFixes applied:");
    for (const f of report.fixes_applied) {
      console.log(`  ${c.green("✓")}  ${f}`);
    }
  }

  if (failed.length === 0 && warned.length === 0) {
    console.log(`\n${c.green("All checks passed.")}`);
  }

  if (failed.length > 0) {
    console.log("\nRun `engram doctor --fix` to auto-apply safe fixes.");
  }
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerDoctor(program: Command): void {
  program
    .command("doctor")
    .description("Run diagnostics and optionally repair common issues")
    .option("--db <path>", "path to .engram file or directory", ".engram")
    .option("--fix", "apply safe auto-fixes with confirmation prompts")
    .option("--yes", "apply all safe fixes non-interactively (implies --fix)")
    .option("--format <format>", "output format: human or json", "human")
    .option("-j", "shorthand for --format json")
    .addHelpText(
      "after",
      `
Checks performed:
  layout            .engram/ directory layout (not a flat file)
  gitignore         .engram/ entry in .gitignore
  schema            DB schema version matches engine version
  fts_index         FTS5 full-text index is present and healthy
  embedding_index   Embedding model dimensions are consistent
  wal               No stale WAL/SHM files from old flat-file layout
  evidence_integrity  All entities and edges have at least one evidence link

Exit codes:
  0   all checks pass or only warnings
  1   one or more checks failed

Examples:
  engram doctor                  # run all checks
  engram doctor --fix            # apply safe fixes interactively
  engram doctor --fix --yes      # apply safe fixes non-interactively
  engram doctor --format json    # machine-readable JSON output
  engram doctor -j               # same as --format json`,
    )
    .action(async (opts: DoctorOpts) => {
      const rawDb = opts.db;

      if (opts.j) opts.format = "json";
      const jsonOutput = opts.format === "json";

      const applyFixes = opts.fix === true || opts.yes === true;
      const autoYes = opts.yes === true;

      // Determine the resolved DB path for checks that need to open the DB.
      // We need to know whether the layout is flat or directory *before* resolveDbPath
      // so that checkLayout can report accurately.
      const absRaw = nodePath.resolve(rawDb);
      // Derive cwd from the db path (parent of .engram) rather than process.cwd()
      // so that gitignore and WAL checks work correctly regardless of the caller's
      // working directory. For the default `--db .engram` this resolves identically
      // to process.cwd().
      const cwd = nodePath.dirname(absRaw);
      let resolvedDbPath = resolveDbPath(absRaw);

      // Figure out the db dir name relative to cwd (for gitignore check)
      // rawDb is likely ".engram"; take the basename of the path used.
      const dbDirName = nodePath.basename(absRaw);

      // ── Run checks ────────────────────────────────────────────────────────
      const checks: CheckResult[] = [];
      const fixesApplied: string[] = [];

      // 1. layout
      const layoutResult = checkLayout(absRaw);
      checks.push(layoutResult);

      // 2. gitignore
      checks.push(checkGitignore(cwd, dbDirName));

      // The remaining checks require an openable DB.
      // If layout fails (flat file or missing), we can still attempt them using resolvedDbPath.
      const canOpenDb =
        layoutResult.status !== "fail" || fs.existsSync(resolvedDbPath);

      if (canOpenDb) {
        // 3. schema
        checks.push(checkSchema(resolvedDbPath));

        // 4. fts_index
        checks.push(checkFtsIndex(resolvedDbPath));

        // 5. embedding_index
        checks.push(checkEmbeddingIndex(resolvedDbPath));
      } else {
        checks.push(skip("schema", "skipped — database not accessible"));
        checks.push(skip("fts_index", "skipped — database not accessible"));
        checks.push(
          skip("embedding_index", "skipped — database not accessible"),
        );
      }

      // 6. wal — derive WAL/SHM names from rawDb path
      checks.push(checkWal(cwd, absRaw));

      // 7. evidence_integrity (only if DB accessible)
      if (canOpenDb) {
        checks.push(checkEvidenceIntegrity(resolvedDbPath));
      } else {
        checks.push(
          skip("evidence_integrity", "skipped — database not accessible"),
        );
      }

      // ── Apply fixes ───────────────────────────────────────────────────────
      if (applyFixes) {
        for (const check of checks) {
          if (check.status !== "fail") continue;
          if (!check.fix) continue;

          // confirm unless --yes
          let shouldFix = autoYes;
          if (!autoYes) {
            const answer = await confirm({
              message: `Fix '${check.name}': ${check.message}?`,
            });
            if (typeof answer === "symbol") {
              // cancelled
              break;
            }
            shouldFix = answer === true;
          }

          if (!shouldFix) continue;

          let result: { ok: boolean; msg: string } | undefined;

          switch (check.name) {
            case "layout":
              result = fixLayout(absRaw, cwd);
              if (result.ok) {
                // After fixLayout moves the DB, resolvedDbPath now points to the
                // old (deleted) flat file location. Re-resolve so that subsequent
                // fixes (schema, fts_index) open the correct new path.
                resolvedDbPath = resolveDbPath(absRaw);
              }
              break;
            case "gitignore":
              result = fixGitignore(cwd, dbDirName);
              break;
            case "schema":
              result = fixSchema(resolvedDbPath);
              break;
            case "fts_index":
              result = fixFtsIndex(resolvedDbPath);
              break;
            case "wal":
              result = fixWal(absRaw);
              break;
            default:
              continue;
          }

          if (result.ok) {
            check.status = "pass";
            check.message = result.msg;
            fixesApplied.push(`${check.name}: ${result.msg}`);
          } else {
            log.error(`Fix for '${check.name}' failed: ${result.msg}`);
          }
        }
      }

      // ── Output ────────────────────────────────────────────────────────────
      const report: DoctorReport = {
        db: resolvedDbPath,
        checks,
        fixes_applied: fixesApplied,
      };

      if (jsonOutput) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        renderHuman(report);
      }

      // Exit 1 if any check still fails after fixes
      const anyFail = checks.some((c) => c.status === "fail");
      if (anyFail) {
        process.exit(1);
      }
    });
}
