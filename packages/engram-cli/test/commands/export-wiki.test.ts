/**
 * export-wiki.test.ts — Integration tests for `engram export wiki`.
 *
 * Projections are inserted via raw SQL to bypass the AI requirement of project().
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, createGraph } from "engram-core";
import { registerExport } from "../../src/commands/export.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerExport(program);
  return program;
}

interface TmpEnv {
  tmpDir: string;
  dbPath: string;
  outDir: string;
  graph: EngramGraph;
}

function makeTmpEnv(): TmpEnv {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-wiki-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  const outDir = path.join(tmpDir, "wiki-out");
  const graph = createGraph(dbPath);
  return { tmpDir, dbPath, outDir, graph };
}

/**
 * Insert a projection row directly via raw SQL, bypassing the AI layer.
 */
function insertProjection(
  graph: EngramGraph,
  opts: {
    kind: string;
    anchor_type?: string;
    anchor_id?: string | null;
    title?: string;
    body?: string;
    invalidated_at?: string | null;
  },
): string {
  const id = randomUUID().replace(/-/g, "").toUpperCase();
  const now = new Date().toISOString();
  graph.db.run(
    `INSERT INTO projections
       (id, kind, anchor_type, anchor_id, title, body, body_format, model,
        input_fingerprint, confidence, valid_from, created_at, invalidated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'markdown', 'test-model', 'fp-test', 1.0, ?, ?, ?)`,
    [
      id,
      opts.kind,
      opts.anchor_type ?? "none",
      opts.anchor_id ?? null,
      opts.title ?? "Test Projection",
      opts.body ?? `# ${opts.title ?? "Test Projection"}\n\nContent here.\n`,
      now,
      now,
      opts.invalidated_at ?? null,
    ],
  );
  return id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("engram export wiki", () => {
  let env: TmpEnv;

  beforeEach(() => {
    env = makeTmpEnv();
  });

  afterEach(() => {
    try {
      closeGraph(env.graph);
    } catch {
      // already closed in test body
    }
    fs.rmSync(env.tmpDir, { recursive: true, force: true });
  });

  it("command is registered under export", () => {
    const program = makeProgram();
    const exportCmd = program.commands.find((c) => c.name() === "export");
    expect(exportCmd).toBeDefined();
    const subNames = exportCmd?.commands.map((c) => c.name()) ?? [];
    expect(subNames).toContain("wiki");
  });

  it("creates output dir and files for active projections", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "alice-chen",
      anchor_type: "entity",
      body: "# Alice Chen\n\nSome content.\n",
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
    ]);

    expect(fs.existsSync(env.outDir)).toBe(true);
    const kindDir = path.join(env.outDir, "entity_summary");
    expect(fs.existsSync(kindDir)).toBe(true);

    const files = fs.readdirSync(kindDir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^alice-chen__[A-Z0-9]{8}\.md$/);
  });

  it("round-trip: exported body equals projection.body byte-for-byte", () => {
    const body = "# My Projection\n\nExact content.\nWith newlines.\n";
    insertProjection(env.graph, {
      kind: "decision_page",
      anchor_id: "auth-decision",
      anchor_type: "entity",
      body,
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
    ]);

    const kindDir = path.join(env.outDir, "decision_page");
    const files = fs.readdirSync(kindDir);
    expect(files.length).toBe(1);

    const written = fs.readFileSync(path.join(kindDir, files[0]), "utf8");
    expect(written).toBe(body);
  });

  it("default excludes invalidated projections", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "active-entity",
      anchor_type: "entity",
    });
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "old-entity",
      anchor_type: "entity",
      invalidated_at: new Date().toISOString(),
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
    ]);

    const kindDir = path.join(env.outDir, "entity_summary");
    const files = fs.readdirSync(kindDir);
    // Only the active projection should be exported
    expect(files.length).toBe(1);
  });

  it("--include-superseded includes invalidated projections", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "active-entity",
      anchor_type: "entity",
    });
    // Insert superseded (invalidated) without anchor_id conflict (different anchor_id)
    // by using a different kind to avoid unique constraint
    insertProjection(env.graph, {
      kind: "decision_page",
      anchor_id: "old-decision",
      anchor_type: "entity",
      invalidated_at: new Date().toISOString(),
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
      "--include-superseded",
    ]);

    // Should have files in both kind dirs
    const entitySummaryFiles = fs.readdirSync(
      path.join(env.outDir, "entity_summary"),
    );
    const decisionPageFiles = fs.readdirSync(
      path.join(env.outDir, "decision_page"),
    );
    expect(entitySummaryFiles.length).toBe(1);
    expect(decisionPageFiles.length).toBe(1);
  });

  it("--scope filters to only the specified kind", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "entity-a",
      anchor_type: "entity",
    });
    // Different anchor to avoid unique constraint
    insertProjection(env.graph, {
      kind: "decision_page",
      anchor_id: "decision-b",
      anchor_type: "entity",
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
      "--scope",
      "entity_summary",
    ]);

    expect(fs.existsSync(path.join(env.outDir, "entity_summary"))).toBe(true);
    // decision_page should not be exported
    expect(fs.existsSync(path.join(env.outDir, "decision_page"))).toBe(false);
  });

  it("creates output dir if missing", () => {
    // Close graph so the action can open it
    closeGraph(env.graph);
    const nestedOut = path.join(env.outDir, "deep", "nested");

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      nestedOut,
    ]);

    expect(fs.existsSync(nestedOut)).toBe(true);
    expect(fs.existsSync(path.join(nestedOut, "index.md"))).toBe(true);
  });

  it("writes index.md grouping projections by kind", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "person-a",
      anchor_type: "entity",
    });
    insertProjection(env.graph, {
      kind: "decision_page",
      anchor_id: "decision-x",
      anchor_type: "entity",
    });
    closeGraph(env.graph);

    const program = makeProgram();
    program.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
    ]);

    const indexContent = fs.readFileSync(
      path.join(env.outDir, "index.md"),
      "utf8",
    );
    expect(indexContent).toContain("# Engram Wiki Export");
    expect(indexContent).toContain("## entity_summary (1)");
    expect(indexContent).toContain("## decision_page (1)");
    expect(indexContent).toContain("person-a");
    expect(indexContent).toContain("decision-x");
  });

  it("overwrite existing file emits warn and does not error", () => {
    insertProjection(env.graph, {
      kind: "entity_summary",
      anchor_id: "some-entity",
      anchor_type: "entity",
      body: "First write.\n",
    });
    closeGraph(env.graph);

    // First export
    const program1 = makeProgram();
    program1.parse([
      "node",
      "engram",
      "export",
      "wiki",
      "--db",
      env.dbPath,
      "--out",
      env.outDir,
    ]);

    // Second export (should overwrite, not throw)
    const program2 = makeProgram();
    expect(() => {
      program2.parse([
        "node",
        "engram",
        "export",
        "wiki",
        "--db",
        env.dbPath,
        "--out",
        env.outDir,
      ]);
    }).not.toThrow();

    // File should still be readable
    const kindDir = path.join(env.outDir, "entity_summary");
    const files = fs.readdirSync(kindDir);
    expect(files.length).toBe(1);
  });
});
