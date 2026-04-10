/**
 * verify-projections.test.ts — projection invariant checks in verifyGraph().
 *
 * Tests:
 *  1. Healthy projection graph → no violations
 *  2. Projection without evidence → ProjectionMissingEvidenceError (checkProjectionEvidence)
 *  3. Supersession cycle (A→B→A via superseded_by) → checkProjectionSupersessionCycles
 *  4. Projection-dependency cycle via evidence (A depends on B depends on A) →
 *     checkProjectionDependencyCycles
 *  5. v0.1 file (no projection tables) → checks skip cleanly, no error
 */

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ulid } from "ulid";
import { SCHEMA_DDL } from "../../src/format/schema.js";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph, verifyGraph } from "../../src/index.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/**
 * Insert a minimal projection row (bypassing the public API so we can
 * create deliberately broken states).
 */
function insertProjection(
  graph: EngramGraph,
  id: string,
  superseded_by: string | null = null,
): void {
  graph.db.run(
    `INSERT INTO projections
       (id, kind, anchor_type, title, body, model,
        input_fingerprint, confidence, valid_from, created_at,
        superseded_by)
     VALUES (?, 'entity_summary', 'none', 'Test', 'body', 'human',
             'fp', 1.0, ?, ?, ?)`,
    [id, now(), now(), superseded_by],
  );
}

/**
 * Insert a projection_evidence row linking projection_id → target.
 */
function insertEvidence(
  graph: EngramGraph,
  projectionId: string,
  targetType: string,
  targetId: string,
  role = "input",
): void {
  graph.db.run(
    `INSERT INTO projection_evidence (projection_id, target_type, target_id, role)
     VALUES (?, ?, ?, ?)`,
    [projectionId, targetType, targetId, role],
  );
}

// ─── fixture ─────────────────────────────────────────────────────────────────

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ─── 1. Healthy projection graph ─────────────────────────────────────────────

describe("healthy projection graph", () => {
  test("single projection with one input evidence → no violations", () => {
    const pid = ulid();
    insertProjection(graph, pid);
    // Add a minimal episode so it can be referenced
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertEvidence(graph, pid, "episode", epId, "input");

    const result = verifyGraph(graph);
    const projViolations = result.violations.filter((v) =>
      v.check.startsWith("checkProjection"),
    );
    expect(projViolations).toHaveLength(0);
  });

  test("linear supersession chain A→B → no cycle violation", () => {
    const [pidA, pidB] = [ulid(), ulid()];
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    // Insert B first (no superseded_by), then A pointing at B
    graph.db.run("PRAGMA foreign_keys = OFF");
    insertProjection(graph, pidB, null);
    insertProjection(graph, pidA, pidB);
    graph.db.run("PRAGMA foreign_keys = ON");
    insertEvidence(graph, pidA, "episode", epId, "input");
    insertEvidence(graph, pidB, "episode", epId, "input");

    const result = verifyGraph(graph);
    const cycleViolations = result.violations.filter(
      (v) => v.check === "checkProjectionSupersessionCycles",
    );
    expect(cycleViolations).toHaveLength(0);
  });
});

// ─── 2. Projection without evidence ──────────────────────────────────────────

describe("checkProjectionEvidence", () => {
  test("projection with no evidence rows produces error violation", () => {
    const pid = ulid();
    insertProjection(graph, pid);
    // Deliberately insert no projection_evidence rows

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);

    const v = result.violations.find(
      (x) =>
        x.check === "checkProjectionEvidence" && x.entity_or_edge_id === pid,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("projection with only anchor evidence (role='anchor') still violates", () => {
    const pid = ulid();
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertProjection(graph, pid);
    // Insert evidence with role='anchor', not 'input'
    insertEvidence(graph, pid, "episode", epId, "anchor");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const v = result.violations.find(
      (x) =>
        x.check === "checkProjectionEvidence" && x.entity_or_edge_id === pid,
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
  });

  test("projection with role='input' evidence produces no violation", () => {
    const pid = ulid();
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertProjection(graph, pid);
    insertEvidence(graph, pid, "episode", epId, "input");

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkProjectionEvidence",
    );
    expect(violations).toHaveLength(0);
  });
});

// ─── 3. Supersession cycle ────────────────────────────────────────────────────

describe("checkProjectionSupersessionCycles", () => {
  test("A→B→A supersession cycle is detected as error", () => {
    const [pidA, pidB] = [ulid(), ulid()];
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );

    // Disable FK checks to allow the cycle
    graph.db.run("PRAGMA foreign_keys = OFF");
    insertProjection(graph, pidA, pidB); // A superseded by B
    insertProjection(graph, pidB, pidA); // B superseded by A → cycle!
    graph.db.run("PRAGMA foreign_keys = ON");

    // Both projections need evidence to avoid triggering that check too
    insertEvidence(graph, pidA, "episode", epId, "input");
    insertEvidence(graph, pidB, "episode", epId, "input");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);

    const v = result.violations.find(
      (x) => x.check === "checkProjectionSupersessionCycles",
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
    expect(v?.message).toContain("cycle");
  });

  test("no superseded_by links → no cycle violations", () => {
    const pid = ulid();
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertProjection(graph, pid, null);
    insertEvidence(graph, pid, "episode", epId, "input");

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkProjectionSupersessionCycles",
    );
    expect(violations).toHaveLength(0);
  });
});

// ─── 4. Projection-dependency DAG cycle ──────────────────────────────────────

describe("checkProjectionDependencyCycles", () => {
  test("A depends on B depends on A via evidence → cycle detected as error", () => {
    const [pidA, pidB] = [ulid(), ulid()];
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertProjection(graph, pidA);
    insertProjection(graph, pidB);
    // Give each an episode input (to avoid missing-evidence violations)
    insertEvidence(graph, pidA, "episode", epId, "input");
    insertEvidence(graph, pidB, "episode", epId, "input");
    // Create the cycle: A depends on B and B depends on A
    insertEvidence(graph, pidA, "projection", pidB, "input");
    insertEvidence(graph, pidB, "projection", pidA, "input");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);

    const v = result.violations.find(
      (x) => x.check === "checkProjectionDependencyCycles",
    );
    expect(v).toBeDefined();
    expect(v?.severity).toBe("error");
    expect(v?.message).toContain("cycle");
  });

  test("A depends on B (linear, acyclic) → no dependency cycle", () => {
    const [pidA, pidB] = [ulid(), ulid()];
    const epId = ulid();
    graph.db.run(
      `INSERT INTO episodes
         (id, source_type, source_ref, content, content_hash,
          status, timestamp, ingested_at, extractor_version)
       VALUES (?, 'manual', ?, 'content', 'hash', 'active', ?, ?, '1.0')`,
      [epId, ulid(), now(), now()],
    );
    insertProjection(graph, pidA);
    insertProjection(graph, pidB);
    insertEvidence(graph, pidA, "episode", epId, "input");
    insertEvidence(graph, pidB, "episode", epId, "input");
    // A depends on B, but B does NOT depend on A
    insertEvidence(graph, pidA, "projection", pidB, "input");

    const violations = verifyGraph(graph).violations.filter(
      (v) => v.check === "checkProjectionDependencyCycles",
    );
    expect(violations).toHaveLength(0);
  });
});

// ─── 5. v0.1 file (no projection tables) ─────────────────────────────────────

describe("v0.1 compatibility", () => {
  test("graph without projection tables skips projection checks cleanly", () => {
    // Build a v0.1-like in-memory DB by starting from a full v0.2 graph and
    // then dropping the projection-layer tables. This is simpler than trying
    // to replay individual DDL strings (trigger DDL contains embedded semicolons
    // that would confuse a naive splitter).
    const rawDb = new Database(":memory:");
    rawDb.run("PRAGMA journal_mode = WAL");
    rawDb.run("PRAGMA foreign_keys = ON");

    // Apply all DDL via exec (handles multi-statement strings correctly)
    for (const stmt of SCHEMA_DDL) {
      rawDb.exec(stmt);
    }

    // Now simulate a v0.1 file by dropping the v0.2 projection tables
    rawDb.run("PRAGMA foreign_keys = OFF");
    rawDb.run("DROP TABLE IF EXISTS projection_evidence");
    rawDb.run("DROP TABLE IF EXISTS reconciliation_runs");
    rawDb.run("DROP TABLE IF EXISTS projections_fts");
    // Drop triggers that reference projections_fts before the table
    rawDb.run("DROP TRIGGER IF EXISTS projections_ai");
    rawDb.run("DROP TRIGGER IF EXISTS projections_ad");
    rawDb.run("DROP TRIGGER IF EXISTS projections_au");
    rawDb.run("DROP TABLE IF EXISTS projections");
    rawDb.run("PRAGMA foreign_keys = ON");

    // Seed required metadata
    rawDb.run(
      "INSERT INTO metadata (key, value) VALUES ('format_version', '0.1.0')",
    );
    rawDb.run(
      "INSERT INTO metadata (key, value) VALUES ('engine_version', '0.1.0')",
    );
    rawDb.run("INSERT INTO metadata (key, value) VALUES ('created_at', ?)", [
      now(),
    ]);
    rawDb.run(
      "INSERT INTO metadata (key, value) VALUES ('owner_id', 'test-owner')",
    );
    rawDb.run(
      "INSERT INTO metadata (key, value) VALUES ('default_timezone', 'UTC')",
    );

    // Wrap the raw DB in the EngramGraph shape expected by verifyGraph()
    const v1Graph: EngramGraph = { db: rawDb } as EngramGraph;

    let result: ReturnType<typeof verifyGraph> | undefined;
    expect(() => {
      result = verifyGraph(v1Graph);
    }).not.toThrow();

    // No projection-related violations
    const projViolations = result?.violations.filter((v) =>
      v.check.startsWith("checkProjection"),
    );
    expect(projViolations ?? []).toHaveLength(0);

    rawDb.close();
  });
});
