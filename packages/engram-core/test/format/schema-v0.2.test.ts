/**
 * schema-v0.2.test.ts — tests for the v0.2 schema migration and projection layer DDL.
 *
 * Covers:
 *  - Fresh v0.2 database: all new tables, indexes, FTS virtual table, and triggers exist
 *  - Migration from v0.1: schema_version bumps to '0.2.0' and new tables exist
 *  - Data preservation: v0.1 data survives migration intact
 *  - Compatibility: v0.2 reader on a migrated v0.1 file works (projection tables empty)
 *  - Integration: raw insert/read of projections + projection_evidence
 */

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ulid } from "ulid";
import {
  closeGraph,
  createGraph,
  migrate_0_1_0_to_0_2_0,
  openGraph,
} from "../../src/format/index.js";
import {
  CREATE_EDGE_EVIDENCE,
  CREATE_EDGES,
  CREATE_EDGES_INDEXES,
  CREATE_EMBEDDINGS,
  CREATE_EMBEDDINGS_INDEXES,
  CREATE_ENTITIES,
  CREATE_ENTITIES_INDEXES,
  CREATE_ENTITY_ALIASES,
  CREATE_ENTITY_ALIASES_INDEXES,
  CREATE_ENTITY_EVIDENCE,
  CREATE_EPISODES,
  CREATE_EPISODES_INDEXES,
  CREATE_FTS_TABLES,
  CREATE_FTS_TRIGGERS,
  CREATE_INGESTION_RUNS,
  CREATE_INGESTION_RUNS_INDEXES,
  CREATE_METADATA,
} from "../../src/format/schema.js";

function tmpPath(name: string): string {
  return join(
    tmpdir(),
    `engram-test-v02-${name}-${crypto.randomUUID()}.engram`,
  );
}

function cleanupFiles(paths: string[]): void {
  for (const p of paths) {
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

/**
 * Build a minimal v0.1 database at the given path.
 * Applies all v0.1 DDL and sets format_version='0.1.0'.
 */
function createV1Db(path: string): Database {
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");

  const v1Ddl = [
    CREATE_METADATA,
    CREATE_ENTITIES,
    CREATE_ENTITIES_INDEXES,
    CREATE_EPISODES,
    CREATE_EPISODES_INDEXES,
    CREATE_ENTITY_ALIASES,
    CREATE_ENTITY_ALIASES_INDEXES,
    CREATE_EDGES,
    CREATE_EDGES_INDEXES,
    CREATE_ENTITY_EVIDENCE,
    CREATE_EDGE_EVIDENCE,
    CREATE_EMBEDDINGS,
    CREATE_EMBEDDINGS_INDEXES,
    CREATE_INGESTION_RUNS,
    CREATE_INGESTION_RUNS_INDEXES,
    CREATE_FTS_TABLES,
    CREATE_FTS_TRIGGERS,
  ].join("\n");

  db.exec(v1Ddl);

  const now = new Date().toISOString();
  db.run(
    "INSERT INTO metadata (key, value) VALUES ('format_version', '0.1.0')",
  );
  db.run(
    "INSERT INTO metadata (key, value) VALUES ('engine_version', '0.1.0')",
  );
  db.run(`INSERT INTO metadata (key, value) VALUES ('created_at', '${now}')`);
  db.run("INSERT INTO metadata (key, value) VALUES ('owner_id', 'test-owner')");
  db.run(
    "INSERT INTO metadata (key, value) VALUES ('default_timezone', 'UTC')",
  );

  return db;
}

// ─── Fresh v0.2 database ─────────────────────────────────────────────────────

describe("fresh v0.2 database — new tables exist", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  const NEW_TABLES = [
    "projections",
    "projection_evidence",
    "reconciliation_runs",
    "projections_fts",
  ];

  it("has all new v0.2 base tables", () => {
    const path = tmpPath("fresh-tables");
    created.push(path);
    const graph = createGraph(path);

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const table of NEW_TABLES) {
      expect(existing).toContain(table);
    }
    closeGraph(graph);
  });

  it("has all new v0.2 indexes", () => {
    const path = tmpPath("fresh-indexes");
    created.push(path);
    const graph = createGraph(path);

    const NEW_INDEXES = [
      "idx_projections_anchor",
      "idx_projections_kind",
      "idx_projections_valid",
      "idx_projections_active",
      "idx_projections_active_unique",
      "idx_projection_evidence_target",
    ];

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const idx of NEW_INDEXES) {
      expect(existing).toContain(idx);
    }
    closeGraph(graph);
  });

  it("has all new v0.2 triggers", () => {
    const path = tmpPath("fresh-triggers");
    created.push(path);
    const graph = createGraph(path);

    const NEW_TRIGGERS = ["projections_ai", "projections_ad", "projections_au"];

    const existing = (
      graph.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const trigger of NEW_TRIGGERS) {
      expect(existing).toContain(trigger);
    }
    closeGraph(graph);
  });

  it("projections table has the expected columns", () => {
    const path = tmpPath("fresh-cols");
    created.push(path);
    const graph = createGraph(path);

    const cols = (
      graph.db.prepare("PRAGMA table_info(projections)").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);

    const EXPECTED_COLS = [
      "_rowid",
      "id",
      "kind",
      "anchor_type",
      "anchor_id",
      "title",
      "body",
      "body_format",
      "model",
      "prompt_template_id",
      "prompt_hash",
      "input_fingerprint",
      "confidence",
      "valid_from",
      "valid_until",
      "last_assessed_at",
      "invalidated_at",
      "superseded_by",
      "created_at",
      "owner_id",
    ];

    for (const col of EXPECTED_COLS) {
      expect(cols).toContain(col);
    }
    closeGraph(graph);
  });

  it("projection_evidence table has the expected columns", () => {
    const path = tmpPath("fresh-pe-cols");
    created.push(path);
    const graph = createGraph(path);

    const cols = (
      graph.db
        .prepare("PRAGMA table_info(projection_evidence)")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const col of [
      "projection_id",
      "target_type",
      "target_id",
      "role",
      "content_hash",
    ]) {
      expect(cols).toContain(col);
    }
    closeGraph(graph);
  });

  it("reconciliation_runs table has the expected columns", () => {
    const path = tmpPath("fresh-rr-cols");
    created.push(path);
    const graph = createGraph(path);

    const cols = (
      graph.db
        .prepare("PRAGMA table_info(reconciliation_runs)")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const col of [
      "id",
      "started_at",
      "completed_at",
      "scope",
      "phases",
      "projections_checked",
      "projections_refreshed",
      "projections_superseded",
      "projections_discovered",
      "dry_run",
      "status",
      "error",
    ]) {
      expect(cols).toContain(col);
    }
    closeGraph(graph);
  });

  it("schema_version metadata is '0.2.0' in a fresh db", () => {
    const path = tmpPath("fresh-version");
    created.push(path);
    const graph = createGraph(path);

    const row = graph.db
      .prepare("SELECT value FROM metadata WHERE key = 'format_version'")
      .get() as { value: string } | undefined;

    expect(row?.value).toBe("0.2.0");
    closeGraph(graph);
  });
});

// ─── Migration from v0.1 ─────────────────────────────────────────────────────

describe("migrate_0_1_0_to_0_2_0", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("bumps schema_version to '0.2.0'", () => {
    const path = tmpPath("migrate-version");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);

    const row = db
      .prepare("SELECT value FROM metadata WHERE key = 'format_version'")
      .get() as { value: string };
    expect(row.value).toBe("0.2.0");
    db.close();
  });

  it("creates all new tables after migration", () => {
    const path = tmpPath("migrate-tables");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);

    const existing = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const table of [
      "projections",
      "projection_evidence",
      "reconciliation_runs",
      "projections_fts",
    ]) {
      expect(existing).toContain(table);
    }
    db.close();
  });

  it("creates all new indexes after migration", () => {
    const path = tmpPath("migrate-indexes");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);

    const existing = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const idx of [
      "idx_projections_anchor",
      "idx_projections_kind",
      "idx_projections_valid",
      "idx_projections_active",
      "idx_projections_active_unique",
      "idx_projection_evidence_target",
    ]) {
      expect(existing).toContain(idx);
    }
    db.close();
  });

  it("creates all new triggers after migration", () => {
    const path = tmpPath("migrate-triggers");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);

    const existing = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);

    for (const trigger of [
      "projections_ai",
      "projections_ad",
      "projections_au",
    ]) {
      expect(existing).toContain(trigger);
    }
    db.close();
  });
});

// ─── Data preservation ────────────────────────────────────────────────────────

describe("v0.1 data survives migration", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("existing entities are intact after migration", () => {
    const path = tmpPath("preserve-entities");
    created.push(path);

    const db = createV1Db(path);
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
       VALUES ('ent-1', 'AuthService', 'module', '${now}', '${now}')`,
    );

    migrate_0_1_0_to_0_2_0(db);

    const row = db.prepare("SELECT * FROM entities WHERE id = 'ent-1'").get() as
      | { canonical_name: string }
      | undefined;
    expect(row?.canonical_name).toBe("AuthService");
    db.close();
  });

  it("existing episodes are intact after migration", () => {
    const path = tmpPath("preserve-episodes");
    created.push(path);

    const db = createV1Db(path);
    const now = new Date().toISOString();
    db.run(
      `INSERT INTO episodes (id, source_type, source_ref, content, content_hash, status, timestamp, ingested_at, extractor_version)
       VALUES ('ep-1', 'manual', 'ref-1', 'test content', 'abc123', 'active', '${now}', '${now}', '0.1.0')`,
    );

    migrate_0_1_0_to_0_2_0(db);

    const row = db.prepare("SELECT * FROM episodes WHERE id = 'ep-1'").get() as
      | { content: string }
      | undefined;
    expect(row?.content).toBe("test content");
    db.close();
  });

  it("metadata keys other than format_version are preserved", () => {
    const path = tmpPath("preserve-meta");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);

    const owner = db
      .prepare("SELECT value FROM metadata WHERE key = 'owner_id'")
      .get() as { value: string };
    expect(owner.value).toBe("test-owner");

    const tz = db
      .prepare("SELECT value FROM metadata WHERE key = 'default_timezone'")
      .get() as { value: string };
    expect(tz.value).toBe("UTC");
    db.close();
  });
});

// ─── Compatibility: openGraph on migrated v0.1 file ──────────────────────────

describe("compatibility: openGraph on migrated v0.1 file", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("openGraph opens a migrated v0.1 file without error", () => {
    const path = tmpPath("compat-open");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);
    db.close();

    expect(() => {
      const g = openGraph(path);
      closeGraph(g);
    }).not.toThrow();
  });

  it("projection tables are empty on a freshly migrated v0.1 file", () => {
    const path = tmpPath("compat-empty");
    created.push(path);

    const db = createV1Db(path);
    migrate_0_1_0_to_0_2_0(db);
    db.close();

    const g = openGraph(path);
    const projCount = (
      g.db.prepare("SELECT COUNT(*) as cnt FROM projections").get() as {
        cnt: number;
      }
    ).cnt;
    expect(projCount).toBe(0);

    const peCount = (
      g.db.prepare("SELECT COUNT(*) as cnt FROM projection_evidence").get() as {
        cnt: number;
      }
    ).cnt;
    expect(peCount).toBe(0);

    const rrCount = (
      g.db.prepare("SELECT COUNT(*) as cnt FROM reconciliation_runs").get() as {
        cnt: number;
      }
    ).cnt;
    expect(rrCount).toBe(0);

    closeGraph(g);
  });
});

// ─── Integration: raw insert/read of projections ─────────────────────────────

describe("integration: insert and read projections + projection_evidence", () => {
  const created: string[] = [];

  afterEach(() => {
    cleanupFiles(created);
    created.length = 0;
  });

  it("inserts a projection row and reads it back", () => {
    const path = tmpPath("insert-projection");
    created.push(path);
    const graph = createGraph(path);
    const now = new Date().toISOString();
    const projId = ulid();

    graph.db
      .prepare(
        `INSERT INTO projections
           (id, kind, anchor_type, anchor_id, title, body, model, input_fingerprint, valid_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projId,
        "entity_summary",
        "entity",
        "ent-1",
        "AuthService summary",
        `---\nid: ${projId}\n---\n\nThe auth module handles sessions.`,
        "anthropic:claude-opus-4-6",
        "sha256-fingerprint-abc",
        now,
        now,
      );

    const row = graph.db
      .prepare("SELECT * FROM projections WHERE id = ?")
      .get(projId) as { title: string; kind: string } | undefined;

    expect(row?.title).toBe("AuthService summary");
    expect(row?.kind).toBe("entity_summary");
    closeGraph(graph);
  });

  it("inserts projection_evidence and reads it back", () => {
    const path = tmpPath("insert-pe");
    created.push(path);
    const graph = createGraph(path);
    const now = new Date().toISOString();
    const projId = ulid();

    graph.db
      .prepare(
        `INSERT INTO projections
           (id, kind, anchor_type, anchor_id, title, body, model, input_fingerprint, valid_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projId,
        "entity_summary",
        "entity",
        "ent-1",
        "AuthService",
        "---\nbody\n---",
        "human",
        "fp-123",
        now,
        now,
      );

    graph.db
      .prepare(
        `INSERT INTO projection_evidence (projection_id, target_type, target_id, role, content_hash)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(projId, "episode", "ep-1", "input", "hash-abc");

    const pe = graph.db
      .prepare("SELECT * FROM projection_evidence WHERE projection_id = ?")
      .get(projId) as { target_type: string; role: string } | undefined;

    expect(pe?.target_type).toBe("episode");
    expect(pe?.role).toBe("input");
    closeGraph(graph);
  });

  it("FTS index is updated when a projection is inserted", () => {
    const path = tmpPath("fts-projection");
    created.push(path);
    const graph = createGraph(path);
    const now = new Date().toISOString();
    const projId = ulid();

    graph.db
      .prepare(
        `INSERT INTO projections
           (id, kind, anchor_type, title, body, model, input_fingerprint, valid_from, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projId,
        "entity_summary",
        "none",
        "Payment gateway overview",
        "The payment gateway handles Stripe integration.",
        "human",
        "fp-xyz",
        now,
        now,
      );

    const hits = graph.db
      .prepare("SELECT * FROM projections_fts WHERE projections_fts MATCH ?")
      .all("Stripe") as unknown[];

    expect(hits.length).toBeGreaterThan(0);
    closeGraph(graph);
  });

  it("unique active projection constraint prevents duplicate (anchor, kind)", () => {
    const path = tmpPath("unique-active");
    created.push(path);
    const graph = createGraph(path);
    const now = new Date().toISOString();

    const insertProj = (id: string) =>
      graph.db
        .prepare(
          `INSERT INTO projections
             (id, kind, anchor_type, anchor_id, title, body, model, input_fingerprint, valid_from, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          "entity_summary",
          "entity",
          "ent-1",
          "Title",
          "Body",
          "human",
          "fp",
          now,
          now,
        );

    insertProj(ulid());
    // Second active projection for the same (anchor_type, anchor_id, kind) must fail
    expect(() => insertProj(ulid())).toThrow();
    closeGraph(graph);
  });

  it("inserting a reconciliation_run row works", () => {
    const path = tmpPath("insert-rr");
    created.push(path);
    const graph = createGraph(path);
    const now = new Date().toISOString();
    const runId = ulid();

    graph.db
      .prepare(
        `INSERT INTO reconciliation_runs (id, started_at, status)
         VALUES (?, ?, ?)`,
      )
      .run(runId, now, "running");

    const row = graph.db
      .prepare("SELECT * FROM reconciliation_runs WHERE id = ?")
      .get(runId) as { status: string; phases: string } | undefined;

    expect(row?.status).toBe("running");
    expect(row?.phases).toBe("assess,discover");
    closeGraph(graph);
  });
});
