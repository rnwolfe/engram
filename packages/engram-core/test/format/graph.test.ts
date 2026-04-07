/**
 * Tests for the .engram format lifecycle: createGraph, openGraph, closeGraph.
 */

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeGraph,
  createGraph,
  EngramFormatError,
  openGraph,
} from "../../src/format/index.js";
import { ENGINE_VERSION, FORMAT_VERSION } from "../../src/index.js";

function tmpPath(name: string): string {
  return join(tmpdir(), `engram-test-${name}-${Date.now()}.engram`);
}

function cleanupFiles(paths: string[]): void {
  for (const p of paths) {
    // SQLite WAL mode creates -wal and -shm sidecar files
    for (const suffix of ["", "-wal", "-shm"]) {
      const full = p + suffix;
      if (existsSync(full)) {
        try {
          unlinkSync(full);
        } catch {
          // ignore
        }
      }
    }
  }
}

describe("createGraph", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("creates a new .engram file and returns a graph handle", () => {
    const path = tmpPath("create-basic");
    created.push(path);

    const graph = createGraph(path);
    expect(graph.path).toBe(path);
    expect(graph.formatVersion).toBe(FORMAT_VERSION);
    expect(graph.engineVersion).toBe(ENGINE_VERSION);
    expect(graph.createdAt).toBeTruthy();
    expect(graph.ownerId).toBeTruthy();
    closeGraph(graph);
  });

  it("stores required metadata keys", () => {
    const path = tmpPath("create-meta");
    created.push(path);

    const graph = createGraph(path, {
      ownerId: "owner-123",
      defaultTimezone: "America/New_York",
    });

    const getMeta = (key: string) =>
      (
        graph.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
          | { value: string }
          | undefined
      )?.value;

    expect(getMeta("format_version")).toBe(FORMAT_VERSION);
    expect(getMeta("engine_version")).toBe(ENGINE_VERSION);
    expect(getMeta("owner_id")).toBe("owner-123");
    expect(getMeta("default_timezone")).toBe("America/New_York");
    expect(getMeta("created_at")).toBeTruthy();

    closeGraph(graph);
  });

  it("uses default ownerId (ULID) and timezone when opts not provided", () => {
    const path = tmpPath("create-defaults");
    created.push(path);

    const graph = createGraph(path);

    const getMeta = (key: string) =>
      (
        graph.db.prepare("SELECT value FROM metadata WHERE key = ?").get(key) as
          | { value: string }
          | undefined
      )?.value;

    expect(getMeta("default_timezone")).toBe("UTC");
    // ULID is 26 chars
    expect(getMeta("owner_id")).toHaveLength(26);

    closeGraph(graph);
  });

  it("enables WAL mode", () => {
    const path = tmpPath("create-wal");
    created.push(path);

    const graph = createGraph(path);
    const row = graph.db
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get();
    expect(row?.journal_mode).toBe("wal");
    closeGraph(graph);
  });

  it("enforces foreign keys", () => {
    const path = tmpPath("create-fk");
    created.push(path);

    const graph = createGraph(path);
    const row = graph.db
      .query<{ foreign_keys: number }, []>("PRAGMA foreign_keys")
      .get();
    expect(row?.foreign_keys).toBe(1);
    closeGraph(graph);
  });
});

describe("schema: all required tables exist", () => {
  const REQUIRED_TABLES = [
    "metadata",
    "entities",
    "entity_aliases",
    "edges",
    "episodes",
    "entity_evidence",
    "edge_evidence",
    "embeddings",
    "ingestion_runs",
  ];

  const REQUIRED_FTS_TABLES = ["entities_fts", "edges_fts", "episodes_fts"];

  let path: string;
  let graph: ReturnType<typeof createGraph>;

  afterEach(() => {
    if (graph) closeGraph(graph);
    cleanupFiles([path]);
  });

  it("has all required base tables", () => {
    path = tmpPath("schema-tables");
    graph = createGraph(path);

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const table of REQUIRED_TABLES) {
      expect(existing).toContain(table);
    }
  });

  it("has all required FTS5 virtual tables", () => {
    path = tmpPath("schema-fts");
    graph = createGraph(path);

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const table of REQUIRED_FTS_TABLES) {
      expect(existing).toContain(table);
    }
  });

  it("has all required triggers", () => {
    path = tmpPath("schema-triggers");
    graph = createGraph(path);

    const REQUIRED_TRIGGERS = [
      "entities_ai",
      "entities_ad",
      "entities_au",
      "edges_ai",
      "edges_ad",
      "edges_au",
      "episodes_ai",
      "episodes_ad",
      "episodes_au",
    ];

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const trigger of REQUIRED_TRIGGERS) {
      expect(existing).toContain(trigger);
    }
  });

  it("has all required indexes", () => {
    path = tmpPath("schema-indexes");
    graph = createGraph(path);

    const REQUIRED_INDEXES = [
      "idx_entities_type",
      "idx_entities_name",
      "idx_aliases_entity",
      "idx_aliases_name",
      "idx_edges_source",
      "idx_edges_target",
      "idx_edges_type",
      "idx_edges_kind",
      "idx_edges_valid",
      "idx_edges_active",
      "idx_episodes_identity",
      "idx_episodes_source",
      "idx_episodes_time",
      "idx_episodes_hash",
      "idx_embeddings_target",
      "idx_runs_scope",
    ];

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const idx of REQUIRED_INDEXES) {
      expect(existing).toContain(idx);
    }
  });
});

describe("openGraph", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("opens an existing graph and returns correct handle", () => {
    const path = tmpPath("open-basic");
    created.push(path);

    const g1 = createGraph(path, { ownerId: "owner-abc" });
    const { createdAt } = g1;
    closeGraph(g1);

    const g2 = openGraph(path);
    expect(g2.formatVersion).toBe(FORMAT_VERSION);
    expect(g2.engineVersion).toBe(ENGINE_VERSION);
    expect(g2.ownerId).toBe("owner-abc");
    expect(g2.createdAt).toBe(createdAt);
    closeGraph(g2);
  });

  it("throws EngramFormatError when file has no metadata table (not a .engram file)", () => {
    // Use a fresh DB with no schema
    const path = tmpPath("open-invalid");
    created.push(path);

    const rawDb = new Database(path, { create: true });
    rawDb.close();

    expect(() => openGraph(path)).toThrow(EngramFormatError);
  });

  it("throws EngramFormatError when format_version is missing", () => {
    const path = tmpPath("open-no-version");
    created.push(path);

    const rawDb = new Database(path, { create: true });
    rawDb.exec(
      "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    rawDb.run("INSERT INTO metadata (key, value) VALUES ('owner_id', 'x')");
    rawDb.close();

    expect(() => openGraph(path)).toThrow(EngramFormatError);
  });

  it("throws EngramFormatError when format_version is incompatible", () => {
    const path = tmpPath("open-wrong-version");
    created.push(path);

    const rawDb = new Database(path, { create: true });
    rawDb.exec(
      "CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    rawDb.run(
      "INSERT INTO metadata (key, value) VALUES ('format_version', '99.0.0')",
    );
    rawDb.close();

    expect(() => openGraph(path)).toThrow(EngramFormatError);
  });
});

describe("closeGraph", () => {
  it("closes the database connection without error", () => {
    const path = tmpPath("close-basic");
    const graph = createGraph(path);
    expect(() => closeGraph(graph)).not.toThrow();
    cleanupFiles([path]);
  });

  it("allows the file to be reopened after closing", () => {
    const path = tmpPath("close-reopen");
    const g1 = createGraph(path);
    closeGraph(g1);

    const g2 = openGraph(path);
    expect(g2.formatVersion).toBe(FORMAT_VERSION);
    closeGraph(g2);

    cleanupFiles([path]);
  });
});

describe("FTS5 triggers", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("FTS index is updated when an entity is inserted", () => {
    const path = tmpPath("fts-entity");
    created.push(path);

    const graph = createGraph(path);
    const now = new Date().toISOString();

    graph.db
      .prepare(
        `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("ent-1", "AuthService", "module", now, now);

    const hits = graph.db
      .prepare("SELECT * FROM entities_fts WHERE entities_fts MATCH ?")
      .all("AuthService") as unknown[];

    expect(hits.length).toBeGreaterThan(0);
    closeGraph(graph);
  });

  it("FTS index is updated when an edge is inserted", () => {
    const path = tmpPath("fts-edge");
    created.push(path);

    const graph = createGraph(path);
    const now = new Date().toISOString();

    // Need source and target entities first (FK)
    graph.db
      .prepare(
        `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("ent-a", "ServiceA", "module", now, now);
    graph.db
      .prepare(
        `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run("ent-b", "ServiceB", "module", now, now);

    graph.db
      .prepare(
        `INSERT INTO edges (id, source_id, target_id, relation_type, edge_kind, fact, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "edge-1",
        "ent-a",
        "ent-b",
        "depends_on",
        "observed",
        "ServiceA depends on ServiceB for auth",
        now,
      );

    const hits = graph.db
      .prepare("SELECT * FROM edges_fts WHERE edges_fts MATCH ?")
      .all("auth") as unknown[];

    expect(hits.length).toBeGreaterThan(0);
    closeGraph(graph);
  });

  it("FTS index is updated when an episode is inserted", () => {
    const path = tmpPath("fts-episode");
    created.push(path);

    const graph = createGraph(path);
    const now = new Date().toISOString();

    graph.db
      .prepare(
        `INSERT INTO episodes (id, source_type, content, content_hash, status, timestamp, ingested_at, extractor_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "ep-1",
        "manual",
        "Refactored the payment gateway module",
        "deadbeef",
        "active",
        now,
        now,
        "0.1.0",
      );

    const hits = graph.db
      .prepare("SELECT * FROM episodes_fts WHERE episodes_fts MATCH ?")
      .all("payment") as unknown[];

    expect(hits.length).toBeGreaterThan(0);
    closeGraph(graph);
  });
});
