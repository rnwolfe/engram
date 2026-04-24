/**
 * doctor-checks.ts — Check and fix functions for `engram doctor`.
 * Extracted from doctor.ts to keep each file under 500 lines.
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import {
  closeGraph,
  computeFreshness,
  ENGINE_VERSION,
  FORMAT_VERSION,
  type FreshnessReport,
  getEmbeddingModel,
  migrate_0_1_0_to_0_2_0,
  openGraph,
} from "engram-core";
import { checkForUpdate } from "../release-check.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CheckStatus = "pass" | "fail" | "warn" | "skip";

export interface CheckResult {
  name: string;
  status: CheckStatus;
  message: string;
  fix: string | null;
}

// ─── Result helpers ───────────────────────────────────────────────────────────

export const pass = (name: string, message: string): CheckResult => ({
  name,
  status: "pass",
  message,
  fix: null,
});

export const fail = (
  name: string,
  message: string,
  fix: string | null,
): CheckResult => ({ name, status: "fail", message, fix });

export const warn = (
  name: string,
  message: string,
  fix: string | null,
): CheckResult => ({ name, status: "warn", message, fix });

export const skip = (name: string, message: string): CheckResult => ({
  name,
  status: "skip",
  message,
  fix: null,
});

// ─── Individual checks ────────────────────────────────────────────────────────

/** layout: fail if flat file, pass if .engram/engram.db directory layout. */
export function checkLayout(rawDbPath: string): CheckResult {
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

/** gitignore: .gitignore must have `.engram/` (with trailing slash), not `.engram`. */
export function checkGitignore(cwd: string, dbDirName: string): CheckResult {
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

/** schema: format_version in the DB must match the engine FORMAT_VERSION. */
export function checkSchema(dbPath: string): CheckResult {
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

/** fts_index: FTS5 indexes must exist and pass an integrity check. */
export function checkFtsIndex(dbPath: string): CheckResult {
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

/** embedding_index: if an embedding model is recorded, dimensions must be consistent. */
export function checkEmbeddingIndex(dbPath: string): CheckResult {
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
 * wal: No stale WAL/SHM files from the old flat-file layout.
 * Names are derived from rawDbPath (e.g. `.engram` → `.engram-wal`, `.engram-shm`).
 */
export function checkWal(cwd: string, rawDbPath: string): CheckResult {
  const absPath = nodePath.resolve(rawDbPath);
  const staleFiles: string[] = [];
  const candidates = [`${absPath}-wal`, `${absPath}-shm`];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      staleFiles.push(nodePath.relative(cwd, f));
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
 * update_available: ask GitHub Releases whether a newer engram tag has been
 * published and suggest `engram update` if so. Result is cached for 24h under
 * $XDG_CACHE_HOME/engram so repeat `doctor` runs don't hit the API.
 *
 * Skipped if `offline` is true. Network errors render as `skip`, not `fail` —
 * a slow network is not a broken install.
 */
export async function checkUpdateAvailable(opts: {
  offline: boolean;
}): Promise<CheckResult> {
  const result = await checkForUpdate({
    currentVersion: ENGINE_VERSION,
    offline: opts.offline,
  });
  if (result.error) {
    return skip("update_available", result.error);
  }
  if (!result.latest) {
    return skip("update_available", "no release info available");
  }
  if (result.updateAvailable) {
    return warn(
      "update_available",
      `newer release v${result.latest.version} available (running v${ENGINE_VERSION})`,
      "engram update",
    );
  }
  return pass(
    "update_available",
    `v${ENGINE_VERSION} is latest${result.fromCache ? " (cached)" : ""}`,
  );
}

/**
 * engine_version_drift: compare the last engine version the user reviewed
 * (via `engram whats-new`) against the running binary. Different values mean
 * the user upgraded but hasn't yet looked at what changed.
 *
 * Renders as `warn` (not `fail`) — drift is informational, not a health problem.
 * The check keeps firing on every `doctor` run until the user runs `whats-new`,
 * which is the intended nudge loop.
 */
export function checkEngineVersionDrift(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    const lastSeen = graph.lastSeenEngineVersion;
    const createdWith = graph.engineVersion;
    closeGraph(graph);

    if (lastSeen === ENGINE_VERSION) {
      return pass("engine_version_drift", `v${ENGINE_VERSION} (up to date)`);
    }
    if (lastSeen === null) {
      return warn(
        "engine_version_drift",
        `graph created with v${createdWith}, running v${ENGINE_VERSION} — never reviewed`,
        `engram whats-new`,
      );
    }
    return warn(
      "engine_version_drift",
      `last reviewed v${lastSeen}, running v${ENGINE_VERSION}`,
      `engram whats-new`,
    );
  } catch (err) {
    return fail(
      "engine_version_drift",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

/**
 * freshness: every ingested source should have recent data. For git sources we
 * also compare the stored cursor SHA against HEAD — commits-behind is the
 * primary signal for fast-moving repos, since 14 days with 200 commits is a
 * different situation than 14 days with 2 commits.
 */
export function checkFreshness(dbPath: string): CheckResult {
  try {
    const graph = openGraph(dbPath);
    let report: FreshnessReport;
    try {
      report = computeFreshness(graph);
    } finally {
      closeGraph(graph);
    }

    if (report.sources.length === 0) {
      return pass("freshness", "no ingested sources yet");
    }

    const summary = report.sources
      .map((s) => `${s.sourceType}: ${s.reason}`)
      .join("; ");

    if (report.overall === "fresh") {
      return pass("freshness", summary);
    }

    const fixHint = "engram sync (or re-run the relevant ingest command)";
    if (report.overall === "stale") {
      return fail("freshness", summary, fixHint);
    }
    return warn("freshness", summary, fixHint);
  } catch (err) {
    return fail(
      "freshness",
      `cannot open database: ${err instanceof Error ? err.message : String(err)}`,
      null,
    );
  }
}

/** evidence_integrity: every active entity and non-invalidated edge must have ≥1 evidence link. */
export function checkEvidenceIntegrity(dbPath: string): CheckResult {
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
 * Fix layout: atomically migrate flat .engram file to .engram/engram.db.
 *
 * Copies to a temp sibling, verifies, deletes the flat file, creates the
 * directory, then moves the temp copy in. Also updates .gitignore as an
 * intentional side effect — the orchestrator re-runs gitignore check and
 * skips if already correct.
 */
export function fixLayout(
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
    // 1. Force WAL checkpoint so the copy is self-contained
    const srcDb = new Database(absFlat);
    srcDb.run("PRAGMA wal_checkpoint(TRUNCATE)");
    srcDb.close();

    // 2. Copy flat file to temp staging path
    fs.copyFileSync(absFlat, tmpDbPath);

    // 3. Verify temp copy is a valid SQLite database
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

    // 7. Update .gitignore (intentional side effect — see JSDoc above)
    fixGitignore(cwd, nodePath.basename(absFlat));

    return { ok: true, msg: `migrated ${absFlat} → ${newDbPath}` };
  } catch (err) {
    // Safety: only delete the temp file if the original flat file still exists.
    // If the original is already gone (deleted in step 4 above), tmpDbPath is the
    // only surviving copy of the database — do NOT destroy it.
    if (fs.existsSync(absFlat)) {
      try {
        if (fs.existsSync(tmpDbPath)) fs.unlinkSync(tmpDbPath);
      } catch {
        // best-effort
      }
      return {
        ok: false,
        msg: `layout migration failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    } else {
      // Original already deleted — tmpDbPath is the only copy. Leave it in place
      // and surface its location so the user can recover manually.
      return {
        ok: false,
        msg: `layout migration partially failed. Your database was copied to ${tmpDbPath}. Manually move it to ${newDbPath} to complete the migration. Error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/** Fix gitignore: replace flat entry with directory entry, or append it. */
export function fixGitignore(
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
 * Fix schema: run migrations to bring DB to FORMAT_VERSION.
 * Logs a warning if FORMAT_VERSION has advanced beyond the highest known migration
 * so that missing migration steps are caught early.
 */
export function fixSchema(dbPath: string): { ok: boolean; msg: string } {
  // Warn if FORMAT_VERSION has advanced beyond the highest migration we know.
  // Update HIGHEST_KNOWN_VERSION when adding new migrations to this function.
  const HIGHEST_KNOWN_VERSION = "0.2.0";
  if (FORMAT_VERSION > HIGHEST_KNOWN_VERSION) {
    console.warn(
      `[doctor] WARNING: FORMAT_VERSION is ${FORMAT_VERSION} but fixSchema only knows ` +
        `migrations up to ${HIGHEST_KNOWN_VERSION}. Update fixSchema in doctor-checks.ts.`,
    );
  }

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

/** Fix FTS index: rebuild all FTS5 indexes. */
export function fixFtsIndex(dbPath: string): { ok: boolean; msg: string } {
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
 * Fix WAL: delete stale WAL/SHM files derived from the raw DB path
 * (e.g. `.engram` → `.engram-wal`, `.engram-shm`).
 */
export function fixWal(rawDbPath: string): { ok: boolean; msg: string } {
  const absPath = nodePath.resolve(rawDbPath);
  const deleted: string[] = [];
  const candidates = [`${absPath}-wal`, `${absPath}-shm`];
  try {
    for (const f of candidates) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        deleted.push(nodePath.basename(f));
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
