/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import type {
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ResolvedInput,
} from "engram-core";
import {
  addEpisode,
  closeGraph,
  createGraph,
  openGraph,
  project,
} from "engram-core";
import { registerReconcile } from "../../src/commands/reconcile.js";

// ─── Test helpers ──────────────────────────────────────────────────────────────

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "engram-reconcile-test-"),
  );
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

/** Run a CLI command with a patched process.exit and captured stdout output. */
async function runCommand(
  args: string[],
): Promise<{ exitCode: number | undefined; output: string }> {
  const program = new Command().exitOverride();
  registerReconcile(program);

  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
    );
    return true;
  };

  let exitCode: number | undefined;
  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test needs to intercept process.exit
  (process as any).exit = (code?: number) => {
    exitCode = code;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await program.parseAsync(["node", "engram", ...args]);
  } catch {
    // either exitOverride or our process.exit mock
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: restoring process.stdout.write
    (process.stdout as any).write = origWrite;
    // biome-ignore lint/suspicious/noExplicitAny: restoring process.exit
    (process as any).exit = origExit;
  }

  // Strip ANSI escape codes so assertions can match plain text
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching ANSI escape sequences
  const output = chunks.join("").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
  return { exitCode, output };
}

/** A recording generator that tracks all calls and returns 'still_accurate' by default. */
interface RecordingCall {
  method: "generate" | "assess" | "regenerate";
  projectionId?: string;
}

function makeRecordingGenerator(opts?: {
  assessVerdict?: AssessVerdict;
}): ProjectionGenerator & { calls: RecordingCall[] } {
  const calls: RecordingCall[] = [];
  return {
    calls,
    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      calls.push({ method: "generate" });
      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();
      const body =
        `---\n` +
        `id: mock-id\n` +
        `kind: entity_summary\n` +
        `anchor: none\n` +
        `title: "Mock Projection"\n` +
        `model: mock\n` +
        `prompt_template_id: mock.v1\n` +
        `prompt_hash: mockhash\n` +
        `input_fingerprint: mockfp\n` +
        `valid_from: ${now}\n` +
        `valid_until: null\n` +
        `inputs:\n${inputList || "  []"}\n` +
        `---\n\n# Mock Projection\n\nContent.\n`;
      return { body, confidence: 1.0 };
    },
    async assess(
      p: Projection,
      _inputs: ResolvedInput[],
    ): Promise<AssessVerdict> {
      calls.push({ method: "assess", projectionId: p.id });
      return opts?.assessVerdict ?? { verdict: "still_accurate" };
    },
    async regenerate(
      p: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      calls.push({ method: "regenerate", projectionId: p.id });
      return (this as ProjectionGenerator).generate(inputs);
    },
  };
}

// ─── Test setup ────────────────────────────────────────────────────────────────

let graph: EngramGraph;
let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  const tmp = tmpDb();
  tmpDir = tmp.tmpDir;
  dbPath = tmp.dbPath;
  graph = createGraph(dbPath);
});

afterEach(() => {
  try {
    closeGraph(graph);
  } catch {
    // already closed
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Test: command registration ────────────────────────────────────────────────

describe("reconcile command registration", () => {
  it("registers 'reconcile' command on the CLI", () => {
    const program = new Command();
    registerReconcile(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("reconcile");
  });
});

// ─── Test: usage errors (exit 2) ──────────────────────────────────────────────

describe("reconcile usage errors", () => {
  it("exits with code 2 when --max-cost is missing without --dry-run", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(2);
    expect(output).toContain("--max-cost");
  });

  it("exits with code 2 for invalid --phase value", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "invalid",
      "--max-cost",
      "10",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(2);
    expect(output).toContain("--phase");
  });

  it("exits with code 2 for invalid --scope format", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--scope",
      "badformat",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(2);
    expect(output).toContain("--scope");
  });
});

// ─── Test: assess phase happy path (dry-run, no stale projections) ────────────

describe("reconcile assess phase", () => {
  it("completes with zero projections on empty graph (dry-run)", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "assess",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Reconciliation complete");
    expect(output).toContain("Run ID");
    expect(output).toContain("dry-run");
  });

  it("assess phase with a stale projection fails with NullGenerator (no AI configured)", async () => {
    // Create a projection then make it stale
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "original content",
      timestamp: new Date().toISOString(),
    });

    const generator = makeRecordingGenerator();
    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator,
    });

    // Make the episode content differ to mark projection stale
    graph.db
      .prepare(
        "UPDATE episodes SET content = 'changed content', content_hash = 'newhash' WHERE id = ?",
      )
      .run(ep.id);

    closeGraph(graph);

    // CLI uses NullGenerator which throws on assess() for stale projections
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "assess",
      "--dry-run",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBe(1);
    expect(output).toContain("Reconciliation failed");
  });
});

// ─── Test: discover phase ─────────────────────────────────────────────────────

describe("reconcile discover phase", () => {
  it("discover phase completes (no-op stub) with dry-run", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "discover",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Reconciliation complete");
    expect(output).toContain("Run ID");
  });

  it("both phases complete with dry-run on empty graph", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "both",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Reconciliation complete");
  });
});

// ─── Test: --dry-run does not persist ─────────────────────────────────────────

describe("reconcile --dry-run", () => {
  it("dry-run creates a reconciliation_runs row with dry_run=1", async () => {
    closeGraph(graph);
    const { exitCode } = await runCommand([
      "reconcile",
      "--phase",
      "assess",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);

    const g = openGraph(dbPath);
    try {
      const runs = g.db
        .query<{ id: string; dry_run: number; status: string }, []>(
          "SELECT id, dry_run, status FROM reconciliation_runs ORDER BY started_at DESC",
        )
        .all();
      expect(runs.length).toBeGreaterThanOrEqual(1);
      expect(runs[0].dry_run).toBe(1);
      expect(runs[0].status).toBe("completed");

      // No projections should have been created or modified
      const projCount = g.db
        .query<{ count: number }, []>(
          "SELECT COUNT(*) as count FROM projections",
        )
        .get();
      expect(projCount?.count ?? 0).toBe(0);
    } finally {
      g.db.close();
    }
  });

  it("dry-run does not advance any projection cursor", async () => {
    // Create a fresh projection, note its last_assessed_at (null), then dry-run
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: new Date().toISOString(),
    });
    const generator = makeRecordingGenerator();
    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator,
    });
    const projId = proj.id;

    // projection is NOT stale (just created), so no assess() will be called.
    // Verify last_assessed_at is still null after dry-run.
    closeGraph(graph);

    const { exitCode } = await runCommand([
      "reconcile",
      "--phase",
      "assess",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);

    const g = openGraph(dbPath);
    try {
      const row = g.db
        .query<{ last_assessed_at: string | null }, [string]>(
          "SELECT last_assessed_at FROM projections WHERE id = ?",
        )
        .get(projId);
      // Not stale → assess was not called → last_assessed_at stays null
      expect(row?.last_assessed_at).toBeNull();
    } finally {
      g.db.close();
    }
  });
});

// ─── Test: --max-cost 0 ───────────────────────────────────────────────────────

describe("reconcile --max-cost 0", () => {
  it("--max-cost 0 on empty graph records a completed run", async () => {
    // No stale projections → budget never triggers → status is 'completed'
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--max-cost",
      "0",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Reconciliation complete");
    expect(output).toContain("Run ID");

    const g = openGraph(dbPath);
    try {
      const runs = g.db
        .query<{ status: string }, []>(
          "SELECT status FROM reconciliation_runs ORDER BY started_at DESC",
        )
        .all();
      expect(runs.length).toBeGreaterThanOrEqual(1);
    } finally {
      g.db.close();
    }
  });

  it("--max-cost 0 with seeded stale projection exits 0 and outputs partial/Budget exhausted", async () => {
    // Seed a real graph: create an episode + projection, then make it stale
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "initial content",
      timestamp: new Date().toISOString(),
    });

    const generator = makeRecordingGenerator();
    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator,
    });

    // Make the projection stale by changing the episode content
    graph.db
      .prepare(
        "UPDATE episodes SET content = 'changed content', content_hash = 'differenthash' WHERE id = ?",
      )
      .run(ep.id);

    closeGraph(graph);

    const { exitCode, output } = await runCommand([
      "reconcile",
      "--phase",
      "assess",
      "--max-cost",
      "0",
      "--dry-run",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBe(0);
    // Budget=0 with stale projection → partial run
    expect(output.toLowerCase()).toMatch(/partial|budget exhausted/);
  });

  it("budget=0 with stale projection records partial run via core reconcile()", async () => {
    // Test core behavior directly to verify budget=0 gives partial status
    const { reconcile: coreReconcile } = await import("engram-core");

    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "some content",
      timestamp: new Date().toISOString(),
    });

    const generator = makeRecordingGenerator();
    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator,
    });

    // Make projection stale
    graph.db
      .prepare(
        "UPDATE episodes SET content = 'changed', content_hash = 'changed' WHERE id = ?",
      )
      .run(ep.id);

    const result = await coreReconcile(graph, generator, {
      phases: ["assess"],
      maxCost: 0,
      dryRun: false,
    });

    expect(result.status).toBe("partial");
    expect(result.assessed).toBe(0);
    // budget exhausted before any assess() call
    expect(generator.calls.filter((c) => c.method === "assess").length).toBe(0);
  });
});

// ─── Test: summary output ──────────────────────────────────────────────────────

describe("reconcile summary output", () => {
  it("prints Run ID as a ULID in the final summary", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    // ULID: 26 uppercase alphanumeric chars
    expect(output).toMatch(/Run ID:\s+[0-9A-Z]{26}/);
  });

  it("prints status, elapsed, assessed, soft-refreshed, superseded", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("Status:");
    expect(output).toContain("Elapsed:");
    expect(output).toContain("Assessed:");
    expect(output).toContain("Refreshed:");
    expect(output).toContain("Superseded:");
  });

  it("labels summary as dry-run when --dry-run is passed", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("dry-run");
  });
});

// ─── Test: scope filter ────────────────────────────────────────────────────────

describe("reconcile --scope", () => {
  it("accepts valid kind: scope and completes", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--scope",
      "kind:entity_summary",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("kind:entity_summary");
    expect(output).toContain("Reconciliation complete");
  });

  it("accepts valid anchor: scope and completes", async () => {
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--scope",
      "anchor:entity",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("anchor:entity");
    expect(output).toContain("Reconciliation complete");
  });

  it("accepts anchor:type:id scope (colon in value) and does not truncate value", async () => {
    // This tests the fix for split(':') truncating 'anchor:entity:01HX...' to 'entity'
    closeGraph(graph);
    const { exitCode, output } = await runCommand([
      "reconcile",
      "--scope",
      "anchor:entity:01HXABC123",
      "--dry-run",
      "--db",
      dbPath,
    ]);
    expect(exitCode).toBe(0);
    expect(output).toContain("anchor:entity:01HXABC123");
    expect(output).toContain("Reconciliation complete");
  });
});
