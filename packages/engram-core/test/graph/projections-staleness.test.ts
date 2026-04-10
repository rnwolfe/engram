/**
 * projections-staleness.test.ts — tests for listActiveProjections(),
 * searchProjections(), and computeBatchedStaleness().
 *
 * All tests use real SQLite in-memory databases.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type {
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ResolvedInput,
} from "../../src/index.js";
import {
  addEpisode,
  closeGraph,
  computeBatchedStaleness,
  createGraph,
  listActiveProjections,
  project,
  searchProjections,
} from "../../src/index.js";

// ─── Mock generator ───────────────────────────────────────────────────────────

function makeMockGenerator(opts?: {
  body?: string;
  confidence?: number;
}): ProjectionGenerator {
  return {
    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();

      const body =
        opts?.body ??
        `---\n` +
          `id: test-id\n` +
          `kind: entity_summary\n` +
          `anchor: entity:test\n` +
          `title: "Test Projection"\n` +
          `model: mock\n` +
          `prompt_template_id: test.v1\n` +
          `prompt_hash: testhash\n` +
          `input_fingerprint: testfingerprint\n` +
          `valid_from: ${now}\n` +
          `valid_until: null\n` +
          `inputs:\n${inputList || "  []"}\n` +
          `---\n\n` +
          `# Test Projection\n\nContent here.\n`;

      return { body, confidence: opts?.confidence ?? 1.0 };
    },

    async assess(
      _projection: Projection,
      _currentInputs: ResolvedInput[],
    ): Promise<{
      verdict: "still_accurate" | "needs_update" | "contradicted";
    }> {
      return { verdict: "still_accurate" };
    },

    async regenerate(
      _projection: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      return this.generate(inputs);
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

function makeEpisode(content = "test content") {
  return addEpisode(graph, {
    source_type: "manual",
    content,
    timestamp: new Date().toISOString(),
  });
}

async function makeProjection(opts?: {
  kind?: string;
  anchorId?: string;
  content?: string;
}) {
  const ep = makeEpisode(opts?.content ?? "test content");
  return {
    ep,
    proj: await project(graph, {
      kind: opts?.kind ?? "entity_summary",
      anchor: { type: "entity", id: opts?.anchorId ?? "ent-1" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: makeMockGenerator(),
    }),
  };
}

// ─── computeBatchedStaleness() ────────────────────────────────────────────────

describe("computeBatchedStaleness()", () => {
  test("returns stale=false for fresh projections", async () => {
    const { proj } = await makeProjection();
    const projRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(proj.id);
    if (!projRow) throw new Error("projection not found");

    const map = computeBatchedStaleness(graph, [projRow]);
    const entry = map.get(proj.id);
    expect(entry?.stale).toBe(false);
    expect(entry?.stale_reason).toBeUndefined();
  });

  test("returns empty map for empty input", () => {
    const map = computeBatchedStaleness(graph, []);
    expect(map.size).toBe(0);
  });

  test("detects input_content_changed when episode content is updated", async () => {
    const { ep, proj } = await makeProjection({ content: "original content" });

    const newHash = createHash("sha256")
      .update("changed content")
      .digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed content', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    const projRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(proj.id);
    if (!projRow) throw new Error("projection not found");

    const map = computeBatchedStaleness(graph, [projRow]);
    const entry = map.get(proj.id);
    expect(entry?.stale).toBe(true);
    expect(entry?.stale_reason).toBe("input_content_changed");
  });

  test("detects input_deleted when episode is redacted", async () => {
    const { ep, proj } = await makeProjection({ content: "sensitive content" });

    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    const projRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(proj.id);
    if (!projRow) throw new Error("projection not found");

    const map = computeBatchedStaleness(graph, [projRow]);
    const entry = map.get(proj.id);
    expect(entry?.stale).toBe(true);
    expect(entry?.stale_reason).toBe("input_deleted");
  });

  test("batches multiple projections in one call", async () => {
    const { proj: proj1 } = await makeProjection({
      anchorId: "ent-a",
      content: "content a",
    });
    const { ep: ep2, proj: proj2 } = await makeProjection({
      anchorId: "ent-b",
      content: "content b",
    });

    // Modify ep2 content to make proj2 stale
    const newHash = createHash("sha256").update("updated b").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'updated b', content_hash = ? WHERE id = ?",
      [newHash, ep2.id],
    );

    const rows = graph.db
      .query<Projection, string[]>(
        `SELECT * FROM projections WHERE id IN (?, ?)`,
      )
      .all(proj1.id, proj2.id);

    const map = computeBatchedStaleness(graph, rows);

    expect(map.get(proj1.id)?.stale).toBe(false);
    expect(map.get(proj2.id)?.stale).toBe(true);
    expect(map.get(proj2.id)?.stale_reason).toBe("input_content_changed");
  });
});

// ─── listActiveProjections() ──────────────────────────────────────────────────

describe("listActiveProjections()", () => {
  test("returns all active projections with stale=false when fresh", async () => {
    await makeProjection({ anchorId: "ent-1" });
    await makeProjection({ anchorId: "ent-2" });

    const results = listActiveProjections(graph);
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(r.stale).toBe(false);
      expect(r.stale_reason).toBeUndefined();
    }
  });

  test("includes last_assessed_at (null when never assessed)", async () => {
    await makeProjection();
    const results = listActiveProjections(graph);
    expect(results.length).toBe(1);
    expect(results[0].last_assessed_at).toBeNull();
  });

  test("returns stale=true when episode content changes", async () => {
    const { ep } = await makeProjection({ content: "old content" });

    const newHash = createHash("sha256").update("new content").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'new content', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    const results = listActiveProjections(graph);
    expect(results.length).toBe(1);
    expect(results[0].stale).toBe(true);
    expect(results[0].stale_reason).toBe("input_content_changed");
  });

  test("returns stale=true with input_deleted when episode is redacted", async () => {
    const { ep } = await makeProjection();

    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    const results = listActiveProjections(graph);
    expect(results.length).toBe(1);
    expect(results[0].stale).toBe(true);
    expect(results[0].stale_reason).toBe("input_deleted");
  });

  test("returns stale=true with input_deleted when edge is invalidated", async () => {
    const ep = makeEpisode("edge content");

    // Insert two entity stubs (required for edge FK)
    const now = new Date().toISOString();
    graph.db.run(
      `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
       VALUES ('src-ent', 'Source', 'module', ?, ?)`,
      [now, now],
    );
    graph.db.run(
      `INSERT INTO entities (id, canonical_name, entity_type, created_at, updated_at)
       VALUES ('tgt-ent', 'Target', 'module', ?, ?)`,
      [now, now],
    );

    // Insert an edge
    graph.db.run(
      `INSERT INTO edges (id, source_id, target_id, relation_type, edge_kind, fact, created_at)
       VALUES ('edge-1', 'src-ent', 'tgt-ent', 'depends_on', 'observed', 'A depends on B', ?)`,
      [now],
    );

    // Create projection with edge as input
    const edgeFact = "A depends on B";
    const edgeHash = createHash("sha256").update(edgeFact).digest("hex");
    const epRow = graph.db
      .query<{ content_hash: string }, [string]>(
        "SELECT content_hash FROM episodes WHERE id = ?",
      )
      .get(ep.id);
    if (!epRow) throw new Error("episode not found");
    const epHash = epRow.content_hash;

    // Build fingerprint matching what project() would compute
    const entries = [
      `episode:${ep.id}:${epHash}`,
      `edge:edge-1:${edgeHash}`,
    ].sort();
    const fingerprint = createHash("sha256")
      .update(entries.join("\n"))
      .digest("hex");

    const projId = "proj-edge-test";
    graph.db.run(
      `INSERT INTO projections
         (id, kind, anchor_type, anchor_id, title, body, body_format, model,
          prompt_template_id, prompt_hash, input_fingerprint, confidence,
          valid_from, created_at)
       VALUES (?, 'entity_summary', 'entity', 'ent-1', 'T',
               '---\nid: x\nkind: entity_summary\nanchor: none\ntitle: T\n' ||
               'model: m\ninput_fingerprint: f\nvalid_from: 2026-01-01T00:00:00Z\n' ||
               'inputs:\n  []\n---\n# T\n',
               'markdown', 'mock', NULL, NULL, ?, 1.0, ?, ?)`,
      [projId, fingerprint, now, now],
    );
    graph.db.run(
      `INSERT INTO projection_evidence (projection_id, target_type, target_id, role, content_hash)
       VALUES (?, 'episode', ?, 'input', ?)`,
      [projId, ep.id, epHash],
    );
    graph.db.run(
      `INSERT INTO projection_evidence (projection_id, target_type, target_id, role, content_hash)
       VALUES (?, 'edge', 'edge-1', 'input', ?)`,
      [projId, edgeHash],
    );

    // Also insert into projections_fts so triggers have fired
    // (the INSERT above bypassed the triggers — rebuild)
    graph.db.run(
      "INSERT INTO projections_fts(projections_fts) VALUES ('rebuild')",
    );

    // Verify not stale yet
    const before = listActiveProjections(graph);
    const beforeEntry = before.find((r) => r.projection.id === projId);
    expect(beforeEntry?.stale).toBe(false);

    // Now invalidate the edge
    graph.db.run("UPDATE edges SET invalidated_at = ? WHERE id = 'edge-1'", [
      now,
    ]);

    const after = listActiveProjections(graph);
    const afterEntry = after.find((r) => r.projection.id === projId);
    expect(afterEntry?.stale).toBe(true);
    expect(afterEntry?.stale_reason).toBe("input_deleted");
  });

  test("does not modify invalidated_at (stale flag is read-only)", async () => {
    const { ep, proj } = await makeProjection();

    const newHash = createHash("sha256").update("modified").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'modified', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    listActiveProjections(graph);

    const row = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(row?.invalidated_at).toBeNull();
  });

  test("filters by kind", async () => {
    const ep1 = makeEpisode("content 1");
    const ep2 = makeEpisode("content 2");
    const gen = makeMockGenerator();

    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-1" },
      inputs: [{ type: "episode", id: ep1.id }],
      generator: gen,
    });
    await project(graph, {
      kind: "decision_page",
      anchor: { type: "entity", id: "ent-2" },
      inputs: [{ type: "episode", id: ep2.id }],
      generator: gen,
    });

    const results = listActiveProjections(graph, { kind: "entity_summary" });
    expect(results.length).toBe(1);
    expect(results[0].projection.kind).toBe("entity_summary");
  });

  test("filters by anchor_type", async () => {
    const ep1 = makeEpisode("c1");
    const ep2 = makeEpisode("c2");
    const gen = makeMockGenerator();

    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-1" },
      inputs: [{ type: "episode", id: ep1.id }],
      generator: gen,
    });
    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep2.id }],
      generator: gen,
    });

    const results = listActiveProjections(graph, { anchor_type: "entity" });
    expect(results.length).toBe(1);
    expect(results[0].projection.anchor_type).toBe("entity");
  });

  test("excludes invalidated projections", async () => {
    const { proj } = await makeProjection();
    graph.db.run("UPDATE projections SET invalidated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      proj.id,
    ]);

    const results = listActiveProjections(graph);
    expect(results.length).toBe(0);
  });
});

// ─── searchProjections() ──────────────────────────────────────────────────────

describe("searchProjections()", () => {
  test("finds projections matching FTS query and returns staleness", async () => {
    await makeProjection({ anchorId: "ent-search" });

    // Verify FTS is populated
    const results = searchProjections(graph, "Test Projection");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].projection.title).toContain("Test");
    expect(results[0].stale).toBe(false);
  });

  test("returns stale=true when matching projection has changed inputs", async () => {
    const { ep } = await makeProjection({ content: "unique search content" });

    const newHash = createHash("sha256").update("something else").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'something else', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    const results = searchProjections(graph, "Test Projection");
    expect(results.length).toBeGreaterThan(0);
    const target = results.find((r) => r.projection.anchor_id === "ent-1");
    expect(target?.stale).toBe(true);
    expect(target?.stale_reason).toBe("input_content_changed");
  });

  test("returns empty array when no projections match", () => {
    const results = searchProjections(graph, "xyzzy-no-match-guaranteed");
    expect(results).toEqual([]);
  });

  test("filters by kind in addition to FTS match", async () => {
    const ep1 = makeEpisode("content summary one");
    const ep2 = makeEpisode("content decision one");
    const gen = makeMockGenerator();

    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-s" },
      inputs: [{ type: "episode", id: ep1.id }],
      generator: gen,
    });
    await project(graph, {
      kind: "decision_page",
      anchor: { type: "entity", id: "ent-d" },
      inputs: [{ type: "episode", id: ep2.id }],
      generator: gen,
    });

    const results = searchProjections(graph, "Test Projection", {
      kind: "entity_summary",
    });
    for (const r of results) {
      expect(r.projection.kind).toBe("entity_summary");
    }
  });

  test("includes last_assessed_at (null when never assessed)", async () => {
    await makeProjection();
    const results = searchProjections(graph, "Test Projection");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].last_assessed_at).toBeNull();
  });

  test("does not return invalidated projections", async () => {
    const { proj } = await makeProjection({ anchorId: "ent-inv" });
    graph.db.run("UPDATE projections SET invalidated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      proj.id,
    ]);

    // Rebuild FTS so the invalidated row is still in FTS index but query filter excludes it
    const results = searchProjections(graph, "Test Projection");
    const found = results.find((r) => r.projection.id === proj.id);
    expect(found).toBeUndefined();
  });
});
