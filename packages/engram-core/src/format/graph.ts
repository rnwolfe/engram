/**
 * graph.ts — lifecycle operations for .engram files.
 *
 * createGraph: creates a new .engram file with the full schema.
 * openGraph:   opens an existing .engram file and validates format_version.
 * closeGraph:  cleanly closes the database connection.
 */

import { Database } from "bun:sqlite";
import { ulid } from "ulid";
import { SCHEMA_DDL } from "./schema.js";
import { ENGINE_VERSION, FORMAT_VERSION } from "./version.js";

export interface EngramGraph {
  db: Database;
  path: string;
  formatVersion: string;
  engineVersion: string;
  createdAt: string;
  ownerId: string;
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

  if (formatVersion !== FORMAT_VERSION) {
    db.close();
    throw new EngramFormatError(
      `openGraph: unsupported format_version '${formatVersion}' (expected '${FORMAT_VERSION}'): ${path}`,
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

  return {
    db,
    path,
    formatVersion,
    engineVersion,
    createdAt,
    ownerId,
  };
}

/**
 * Closes the database connection cleanly.
 */
export function closeGraph(graph: EngramGraph): void {
  graph.db.close();
}
