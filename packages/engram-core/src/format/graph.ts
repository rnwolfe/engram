/**
 * graph.ts — lifecycle operations for .engram files.
 *
 * createGraph:    creates a new .engram file with the full schema.
 * openGraph:      opens an existing .engram file and validates format_version.
 * closeGraph:     cleanly closes the database connection.
 * resolveDbPath:  resolves a user-supplied path to the actual SQLite file.
 *                 Handles both the legacy flat-file layout and the new directory layout.
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as nodePath from "node:path";
import { ulid } from "ulid";
import {
  ADDITIVE_DDL,
  MIGRATE_EPISODES_SUPERSEDED_BY,
  SCHEMA_DDL,
} from "./schema.js";
import {
  ENGINE_VERSION,
  FORMAT_VERSION,
  MIN_READABLE_VERSION,
} from "./version.js";

/**
 * Resolves the user-supplied --db path to the actual SQLite file path.
 *
 * Resolution rules (in priority order):
 *  1. If input is a directory → return `<input>/engram.db`
 *  2. If input exists as a file → emit deprecation warning, return as-is
 *  3. If input doesn't exist → return `<input>/engram.db`
 *     (treats input as directory that will be created by the caller)
 */
export function resolveDbPath(input: string): string {
  try {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      return nodePath.join(input, "engram.db");
    }
    // Exists as a flat file — legacy layout. Emit deprecation warning.
    process.stderr.write(
      `warning: ${input} is a flat file — see docs/format-spec.md for migration instructions\n`,
    );
    return input;
  } catch {
    // Path doesn't exist — new database; resolve to directory layout.
    // If the caller passed an explicit .db file path (e.g. --db graph.db), honour it as-is.
    if (nodePath.extname(input) === ".db") {
      return input;
    }
    return nodePath.join(input, "engram.db");
  }
}

export interface EngramGraph {
  db: Database;
  path: string;
  formatVersion: string;
  engineVersion: string;
  createdAt: string;
  ownerId: string;
  /**
   * The last engine version the user has explicitly acknowledged (by running
   * `engram whats-new`). Compare against `ENGINE_VERSION` (the running binary)
   * to detect that the user upgraded but hasn't yet reviewed what changed:
   *
   *   - null → no prior observation (graph predates the field). Callers may
   *     show whats-new from `engineVersion` onward.
   *   - value < ENGINE_VERSION → user upgraded but hasn't reviewed yet; surface a nudge.
   *   - value === ENGINE_VERSION → reviewed up to current.
   *   - value > ENGINE_VERSION → user downgraded; rare, usually a no-op.
   *
   * This value is **never** mutated on open. `createGraph` initialises it to
   * `ENGINE_VERSION` (new graph = nothing new to review). It is bumped only by
   * `markEngineVersionSeen()` — i.e., after the user runs `engram whats-new`.
   */
  lastSeenEngineVersion: string | null;
}

export interface CreateOpts {
  ownerId?: string;
  defaultTimezone?: string;
}

export class EngramFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngramFormatError";
  }
}

/**
 * Compares two semver strings. Returns negative if a < b, 0 if equal, positive if a > b.
 * Only handles simple MAJOR.MINOR.PATCH format.
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Returns true if the given format version can be opened by this engine.
 * The readable range is [MIN_READABLE_VERSION, FORMAT_VERSION].
 */
function isVersionReadable(version: string): boolean {
  return (
    compareSemver(version, MIN_READABLE_VERSION) >= 0 &&
    compareSemver(version, FORMAT_VERSION) <= 0
  );
}

function applyPragmas(db: Database): void {
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
}

function applySchema(db: Database): void {
  // Each entry in SCHEMA_DDL may contain multiple statements separated by semicolons.
  // bun:sqlite's exec() handles multi-statement strings.
  const allDdl = SCHEMA_DDL.join("\n");
  db.exec(allDdl);
}

/**
 * Creates a new .engram SQLite database at the given path.
 * The file will be created if it doesn't exist.
 */
export function createGraph(path: string, opts: CreateOpts = {}): EngramGraph {
  const db = new Database(path, { create: true });

  try {
    applyPragmas(db);
    applySchema(db);

    const createdAt = new Date().toISOString();
    const ownerId = opts.ownerId ?? ulid();
    const defaultTimezone = opts.defaultTimezone ?? "UTC";

    const insertMeta = db.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?)",
    );

    db.transaction(() => {
      insertMeta.run("format_version", FORMAT_VERSION);
      insertMeta.run("engine_version", ENGINE_VERSION);
      insertMeta.run("last_seen_engine_version", ENGINE_VERSION);
      insertMeta.run("created_at", createdAt);
      insertMeta.run("owner_id", ownerId);
      insertMeta.run("default_timezone", defaultTimezone);
    })();

    return {
      db,
      path,
      formatVersion: FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      createdAt,
      ownerId,
      lastSeenEngineVersion: ENGINE_VERSION,
    };
  } catch (err) {
    db.close();
    throw err;
  }
}

/**
 * Opens an existing .engram database, validates format_version, and returns the graph handle.
 * Throws EngramFormatError if the file is missing required metadata or has an incompatible version.
 */
export function openGraph(path: string): EngramGraph {
  const db = new Database(path);

  applyPragmas(db);

  const getMeta = (key: string): string | undefined => {
    try {
      const row = db
        .query<{ value: string }, [string]>(
          "SELECT value FROM metadata WHERE key = ?",
        )
        .get(key);
      return row?.value;
    } catch {
      return undefined;
    }
  };

  const formatVersion = getMeta("format_version");
  if (!formatVersion) {
    db.close();
    throw new EngramFormatError(
      `openGraph: missing 'format_version' in metadata — not a valid .engram file: ${path}`,
    );
  }

  // Accept any version between MIN_READABLE_VERSION and FORMAT_VERSION (inclusive).
  if (!isVersionReadable(formatVersion)) {
    db.close();
    throw new EngramFormatError(
      `openGraph: unsupported format_version '${formatVersion}' (readable range: ${MIN_READABLE_VERSION}–${FORMAT_VERSION}): ${path}`,
    );
  }

  const engineVersion = getMeta("engine_version") ?? ENGINE_VERSION;

  const createdAt = getMeta("created_at");
  if (!createdAt) {
    db.close();
    throw new EngramFormatError(
      `openGraph: missing 'created_at' in metadata — not a valid .engram file: ${path}`,
    );
  }

  const ownerId = getMeta("owner_id");
  if (!ownerId) {
    db.close();
    throw new EngramFormatError(
      `openGraph: missing 'owner_id' in metadata — not a valid .engram file: ${path}`,
    );
  }

  // Apply additive DDL (idempotent IF NOT EXISTS) so existing databases gain
  // new optional tables (e.g. unresolved_refs) without a schema version bump.
  for (const ddl of ADDITIVE_DDL) {
    db.exec(ddl);
  }

  // Migration: add episodes.superseded_by if the column is absent.
  // Use a column-exists guard so this is safe to run on both new and old DBs.
  const episodeCols = db
    .query<{ name: string }, []>("PRAGMA table_info(episodes)")
    .all();
  const hasSupersededBy = episodeCols.some((c) => c.name === "superseded_by");
  if (!hasSupersededBy) {
    for (const stmt of MIGRATE_EPISODES_SUPERSEDED_BY) {
      db.exec(stmt);
    }
  }

  // Read but do not mutate. `last_seen_engine_version` is only bumped via
  // markEngineVersionSeen() once the user runs `engram whats-new` — otherwise
  // drift would be reported at most once per upgrade, which defeats the point
  // of surfacing it in `doctor` and `status` until acknowledged.
  const lastSeenEngineVersion = getMeta("last_seen_engine_version") ?? null;

  return {
    db,
    path,
    formatVersion,
    engineVersion,
    createdAt,
    ownerId,
    lastSeenEngineVersion,
  };
}

/**
 * Records that the user has acknowledged the current engine version — called
 * after `engram whats-new` renders its summary. Returns the value that was
 * stored before the write (null if the field was absent).
 */
export function markEngineVersionSeen(graph: EngramGraph): {
  previous: string | null;
} {
  const row = graph.db
    .query<{ value: string }, [string]>(
      "SELECT value FROM metadata WHERE key = ?",
    )
    .get("last_seen_engine_version");
  const previous = row?.value ?? null;
  if (previous !== ENGINE_VERSION) {
    graph.db.run(
      "INSERT INTO metadata (key, value) VALUES ('last_seen_engine_version', ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [ENGINE_VERSION],
    );
  }
  return { previous };
}

/**
 * Closes the database connection cleanly.
 */
export function closeGraph(graph: EngramGraph): void {
  graph.db.close();
}
