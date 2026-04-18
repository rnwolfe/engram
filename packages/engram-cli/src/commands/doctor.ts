/**
 * doctor.ts — `engram doctor` command.
 *
 * Runs a suite of diagnostic checks against a .engram database and, optionally,
 * auto-applies safe fixes. Modelled on `brew doctor`.
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

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { confirm, log } from "@clack/prompts";
import type { Command } from "commander";
import {
  closeGraph,
  FORMAT_VERSION,
  getEmbeddingModel,
  migrate_0_1_0_to_0_2_0,
  openGraph,
  resolveDbPath,
} from "engram-core";

// ─── Types ────────────────────────────────────────────────────────────────────

type CheckStatus = "pass" | "fail" | "warn" | "skip";

interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  fix: string | null;
}

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
  json?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pass(name: string, message: string): CheckResult {
  return { name, status: "pass", message, fix: null };
}

function fail(name: string, message: string, fix: string | null): CheckResult {
  return { name, status: "fail", message, fix };
}

function warn(name: string, message: string, fix: string | null): CheckResult {
  return { name, status: "warn", message, fix };
}

function skip(name: string, message: string): CheckResult {
  return { name, status: "skip", message, fix: null };
}

// ─── Individual checks ────────────────────────────────────────────────────────

/**
 * layout: .engram/ directory exists with engram.db inside.
 * Returns fail if the path is a flat file; pass if it is already a directory.
 */
function checkLayout(rawDbPath: string): CheckResult {
  const absPath = nodePath.resolve(rawDbPath);
  try {
    const stat = fs.statSync(absPath);
    if (stat.isDirectory()) {
      // Confirm engram.db exists inside
      const dbFile = nodePath.join(absPath, "engram.db");
      if (fs.existsSync(dbFile)) {
        return pass("layout", ".engram/ directory layout");
      }
      return fail(
        "layout",
        `${absPath}/ directory exists but engram.db is missing`,
        null,
      );
    }
    // It's a flat file — needs migration
    return fail(
      "layout",
      `${absPath} is a flat file — directory layout required`,
      `engram doctor --fix (migrates flat file to ${nodePath.dirname(absPath)}/${nodePath.basename(absPath, nodePath.extname(absPath))}/engram.db)`,
    );
  } catch {
    return fail("layout", `${absPath} not found`, null);
  }
}

/**
 * gitignore: .gitignore contains `.engram/` (with trailing slash) not just `.engram`.
 */
function checkGitignore(cwd: string, dbDirName: string): CheckResult {
  const gitignorePath = nodePath.join(cwd, ".gitignore");
  if (!fs.existsSync(gitignorePath)) {
    return warn("gitignore", "no .gitignore found in current directory", null);
  }

  const content = fs.readFileSync(gitignorePath, "utf8");
  const lines = content.split("\n").map((l) => l.trim());
  const dirEntry = `${dbDirName}/`;
  const flatEntry = dbDirName;

  if (lines.includes(dirEntry)) {
    return pass("gitignore", `${dirEntry} in .gitignore`);
  }
  if (lines.includes(flatEntry)) {
    return fail(
      "gitignore",
      `.gitignore has ${flatEntry} (flat-file entry) — should be ${dirEntry}`,
      `engram doctor --fix (updates .gitignore entry)`,
    );
  }
  return warn(
    "gitignore",
    `${dirEntry} not found in .gitignore — database may be committed`,
    `add '${dirEntry}' to .gitignore`,
  );
}

/**
 * schema: format_version in the DB matches FORMAT_VERSION.
 */
function checkSchema(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    const storedVersion = graph.formatVersion;
    closeGraph(graph);

    if (storedVersion === FORMAT_VERSION) {
      return pass("schema", `schema v${storedVersion} (current)`);
    }
    return fail(
      "schema",
      `schema v${storedVersion} (current engine expects v${FORMAT_VERSION})`,
      "engram doctor --fix (runs migrations)",
    );
  } catch (err) {
    return fail(
      "schema",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

/**
 * fts_index: FTS5 indexes exist and pass integrity check.
 */
function checkFtsIndex(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    try {
      // Check each FTS table exists by doing an integrity check
      const tables = ["entities_fts", "edges_fts", "episodes_fts"];
      for (const table of tables) {
        // 'integrity-check' will throw if the FTS index is corrupt
        graph.db.run(
          `INSERT INTO ${table}(${table}) VALUES ('integrity-check')`,
        );
      }
      closeGraph(graph);
      return pass("fts_index", "ok");
    } catch (err) {
      closeGraph(graph);
      return fail(
        "fts_index",
        `FTS index error: ${err instanceof Error ? err.message : String(err)}`,
        "engram doctor --fix (rebuilds FTS index)",
      );
    }
  } catch (err) {
    return fail(
      "fts_index",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

/**
 * embedding_index: If embedding model is recorded, dimensions must be consistent.
 */
function checkEmbeddingIndex(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    const config = getEmbeddingModel(graph);
    closeGraph(graph);

    if (!config) {
      return pass("embedding_index", "no embedding model configured");
    }

    if (!config.model || config.model === "none") {
      return pass("embedding_index", "embeddings disabled");
    }

    if (config.dimensions <= 0) {
      return warn(
        "embedding_index",
        `embedding model ${config.model} has unrecorded dimensions`,
        "run: engram embed reindex",
      );
    }

    return pass(
      "embedding_index",
      `model=${config.model} dimensions=${config.dimensions}`,
    );
  } catch (err) {
    return fail(
      "embedding_index",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

/**
 * wal: No stale WAL/SHM files at the repo root from old flat-file layout.
 * Looks for `.engram-wal` and `.engram-shm` in cwd.
 */
function checkWal(cwd: string): CheckResult {
  const staleFiles: string[] = [];
  const candidates = [".engram-wal", ".engram-shm"];
  for (const f of candidates) {
    if (fs.existsSync(nodePath.join(cwd, f))) {
      staleFiles.push(f);
    }
  }
  if (staleFiles.length === 0) {
    return pass("wal", "no stale WAL files");
  }
  return fail(
    "wal",
    `stale WAL/SHM files found: ${staleFiles.join(", ")}`,
    "engram doctor --fix (deletes stale files)",
  );
}

/**
 * evidence_integrity: Every active entity and non-invalidated edge has ≥1 evidence link.
 */
function checkEvidenceIntegrity(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    try {
      const orphanedEntities = graph.db
        .query<{ count: number }, []>(`
          SELECT COUNT(*) as count
          FROM entities e
          WHERE e.status = 'active'
            AND NOT EXISTS (
              SELECT 1 FROM entity_evidence ee WHERE ee.entity_id = e.id
            )
        `)
        .get();

      const orphanedEdges = graph.db
        .query<{ count: number }, []>(`
          SELECT COUNT(*) as count
          FROM edges ed
          WHERE ed.invalidated_at IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM edge_evidence ee WHERE ee.edge_id = ed.id
            )
        `)
        .get();

      closeGraph(graph);

      const entityCount = orphanedEntities?.count ?? 0;
      const edgeCount = orphanedEdges?.count ?? 0;
      const total = entityCount + edgeCount;

      if (total === 0) {
        return pass(
          "evidence_integrity",
          "all entities and edges have evidence",
        );
      }

      const parts: string[] = [];
      if (entityCount > 0) parts.push(`${entityCount} orphaned entities`);
      if (edgeCount > 0) parts.push(`${edgeCount} orphaned edges`);

      return warn(
        "evidence_integrity",
        `${parts.join(", ")} (no evidence links)`,
        null, // no auto-fix — report only
      );
    } catch (err) {
      closeGraph(graph);
      throw err;
    }
  } catch (err) {
    return fail(
      "evidence_integrity",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

// ─── Auto-fix implementations ─────────────────────────────────────────────────

/**
 * Fix layout: atomically migrate flat .engram file to .engram/engram.db
 *
 * Steps:
 *  1. Copy flat file to a temp path (sibling, won't collide with the directory we'll create)
 *  2. Verify the temp copy opens cleanly
 *  3. Delete original flat file (and any .engram-wal / .engram-shm)
 *  4. Create the target directory
 *  5. Move temp copy into the new directory as engram.db
 *  6. Update .gitignore
 *
 * This approach handles the common case where the flat file and target directory
 * share the same path prefix (e.g. `.engram` flat → `.engram/` directory).
 */
function fixLayout(
  rawDbPath: string,
  cwd: string,
): { ok: boolean; msg: string } {
  const absFlat = nodePath.resolve(rawDbPath);
  // The target directory has the same name as the flat file.
  // E.g. `/repo/.engram` (flat) → `/repo/.engram/` (dir) + `/repo/.engram/engram.db`
  const dirPath = absFlat; // same path, will become a directory after the flat file is deleted
  const newDbPath = nodePath.join(dirPath, "engram.db");

  // Use a sibling temp path to stage the copy before deleting the flat file
  const tmpDbPath = `${absFlat}.migration-tmp`;

  try {
    // 1. Open the source DB and force a WAL checkpoint so all data is in the main file.
    // This ensures the copy will be self-contained (no dependency on a companion WAL file).
    const srcDb = new Database(absFlat);
    srcDb.run("PRAGMA wal_checkpoint(TRUNCATE)");
    srcDb.close();

    // 2. Copy flat file to temp staging path
    fs.copyFileSync(absFlat, tmpDbPath);

    // 3. Verify temp copy opens as a valid SQLite database
    const testDb = new Database(tmpDbPath, { readonly: true });
    testDb.query("SELECT name FROM sqlite_master LIMIT 1").get();
    testDb.close();

    // 4. Delete original flat file (and any WAL/SHM companions)
    fs.unlinkSync(absFlat);
    const walFile = `${absFlat}-wal`;
    const shmFile = `${absFlat}-shm`;
    if (fs.existsSync(walFile)) fs.unlinkSync(walFile);
    if (fs.existsSync(shmFile)) fs.unlinkSync(shmFile);

    // 5. Create the target directory (now safe — flat file is gone)
    fs.mkdirSync(dirPath, { recursive: true });

    // 6. Move temp copy into new directory
    fs.renameSync(tmpDbPath, newDbPath);

    // 7. Update .gitignore
    fixGitignore(cwd, nodePath.basename(absFlat));

    return { ok: true, msg: `migrated ${absFlat} → ${newDbPath}` };
  } catch (err) {
    // Clean up temp file if it exists
    try {
      if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
    } catch {
      // best-effort
    }
    return {
      ok: false,
      msg: `layout migration failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fix gitignore: replace flat entry with directory entry (or append directory entry).
 */
function fixGitignore(
  cwd: string,
  dbDirName: string,
): { ok: boolean; msg: string } {
  const gitignorePath = nodePath.join(cwd, ".gitignore");
  const flatEntry = dbDirName.endsWith("/")
    ? dbDirName.slice(0, -1)
    : dbDirName;
  const dirEntry = `${flatEntry}/`;

  try {
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, `${dirEntry}\n`, "utf8");
      return { ok: true, msg: `created .gitignore with ${dirEntry}` };
    }

    const content = fs.readFileSync(gitignorePath, "utf8");
    const lines = content.split("\n");

    // Check if already correct
    if (lines.some((l) => l.trim() === dirEntry)) {
      return { ok: true, msg: ".gitignore already correct" };
    }

    // Replace flat entry if present
    const idx = lines.findIndex((l) => l.trim() === flatEntry);
    if (idx !== -1) {
      lines[idx] = dirEntry;
      fs.writeFileSync(gitignorePath, lines.join("\n"), "utf8");
      return {
        ok: true,
        msg: `updated .gitignore: ${flatEntry} → ${dirEntry}`,
      };
    }

    // Append
    const newContent = content.endsWith("\n")
      ? `${content + dirEntry}\n`
      : `${content}\n${dirEntry}\n`;
    fs.writeFileSync(gitignorePath, newContent, "utf8");
    return { ok: true, msg: `appended ${dirEntry} to .gitignore` };
  } catch (err) {
    return {
      ok: false,
      msg: `gitignore fix failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fix schema: run available migrations to bring DB to FORMAT_VERSION.
 */
function fixSchema(dbPath: string): { ok: boolean; msg: string } {
  try {
    const graph = openGraph(dbPath);
    try {
      migrate_0_1_0_to_0_2_0(graph.db);
      closeGraph(graph);
      return { ok: true, msg: `migrated schema to v${FORMAT_VERSION}` };
    } catch (err) {
      closeGraph(graph);
      throw err;
    }
  } catch (err) {
    return {
      ok: false,
      msg: `schema migration failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fix FTS index: rebuild all FTS5 indexes.
 */
function fixFtsIndex(dbPath: string): { ok: boolean; msg: string } {
  try {
    const graph = openGraph(dbPath);
    try {
      graph.db.run("INSERT INTO entities_fts(entities_fts) VALUES('rebuild')");
      graph.db.run("INSERT INTO edges_fts(edges_fts) VALUES('rebuild')");
      graph.db.run("INSERT INTO episodes_fts(episodes_fts) VALUES('rebuild')");
      closeGraph(graph);
      return { ok: true, msg: "FTS index rebuilt" };
    } catch (err) {
      closeGraph(graph);
      throw err;
    }
  } catch (err) {
    return {
      ok: false,
      msg: `FTS rebuild failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Fix WAL: delete stale .engram-wal and .engram-shm files in cwd.
 */
function fixWal(cwd: string): { ok: boolean; msg: string } {
  const deleted: string[] = [];
  const candidates = [".engram-wal", ".engram-shm"];
  try {
    for (const f of candidates) {
      const fp = nodePath.join(cwd, f);
      if (fs.existsSync(fp)) {
        fs.unlinkSync(fp);
        deleted.push(f);
      }
    }
    return {
      ok: true,
      msg:
        deleted.length > 0
          ? `deleted: ${deleted.join(", ")}`
          : "nothing to delete",
    };
  } catch (err) {
    return {
      ok: false,
      msg: `WAL cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Report rendering ─────────────────────────────────────────────────────────

function statusIcon(status: CheckStatus): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "warn":
      return "⚠";
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
    console.log("\nIssues found:");
    for (const check of [...failed, ...warned]) {
      if (check.fix) {
        console.log(`  ${check.name}  ${check.message}`);
        console.log(`    fix: ${check.fix}`);
      } else {
        console.log(`  ${check.name}  ${check.message}`);
      }
    }
  }

  if (report.fixes_applied.length > 0) {
    console.log("\nFixes applied:");
    for (const f of report.fixes_applied) {
      console.log(`  ✓  ${f}`);
    }
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
    .option(
      "--format <format>",
      "output format: human (default) or json",
      "human",
    )
    .option("-j, --json", "shorthand for --format json")
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
      const cwd = process.cwd();
      const rawDb = opts.db;

      // Resolve format flag: -j / --json shorthand
      const jsonOutput = opts.json === true || opts.format === "json";

      const applyFixes = opts.fix === true || opts.yes === true;
      const autoYes = opts.yes === true;

      // Determine the resolved DB path for checks that need to open the DB.
      // We need to know whether the layout is flat or directory *before* resolveDbPath
      // so that checkLayout can report accurately.
      const absRaw = nodePath.resolve(rawDb);
      const resolvedDbPath = resolveDbPath(absRaw);

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

      // 6. wal
      checks.push(checkWal(cwd));

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
              result = fixWal(cwd);
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
