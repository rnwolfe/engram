/**
 * context-max-flags.test.ts — Tests for --max-entities and --max-edges
 * hard-cap flags on `engram context`.
 *
 * Issue #162: flags apply as secondary filters after the token budget,
 * limiting candidate sets before the budget loop.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { addEdge, addEntity, addEpisode, createGraph } from "engram-core";
import { registerContext } from "../../src/commands/context.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerContext(program);
  return program;
}

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "engram-context-max-flags-test-"),
  );
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

function makePopulatedDb(dbPath: string, entityCount = 8, edgeCount = 6) {
  const graph = createGraph(dbPath);
  const entityIds: string[] = [];

  for (let i = 0; i < entityCount; i++) {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: `auth middleware service episode ${i} token authentication`,
      timestamp: new Date().toISOString(),
    });
    const entity = addEntity(
      graph,
      {
        canonical_name: `AuthService${i}`,
        entity_type: "module",
        summary: `auth middleware module ${i}`,
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );
    entityIds.push(entity.id);
  }

  for (let i = 0; i < edgeCount && i + 1 < entityIds.length; i++) {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: `co-change edge ${i} auth token middleware`,
      timestamp: new Date().toISOString(),
    });
    addEdge(
      graph,
      {
        source_id: entityIds[i],
        target_id: entityIds[i + 1],
        fact: `AuthService${i} co-changes with AuthService${i + 1}`,
        edge_kind: "observed",
        relation_type: "co_changes_with",
      },
      [{ episode_id: ep.id, extractor: "test" }],
    );
  }

  graph.db.close();
}

async function runContextCapture(
  dbPath: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; exitCode: number | null }> {
  const program = makeProgram();
  const logs: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  let exitCode: number | null = null;

  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process as any).exit = (code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await program.parseAsync([
      "node",
      "engram",
      "context",
      "auth middleware",
      "--db",
      dbPath,
      ...extraArgs,
    ]);
  } catch {
    // expected when process.exit is called
  } finally {
    console.log = origLog;
    console.error = origError;
    process.exit = origExit;
  }

  return { stdout: logs.join("\n"), exitCode };
}

describe("engram context --max-entities", () => {
  it("caps entities to the specified limit", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      makePopulatedDb(dbPath, 8, 0);
      const { stdout } = await runContextCapture(dbPath, [
        "--max-entities",
        "3",
      ]);
      const entityMatches = stdout.match(/`AuthService\d+`/g) ?? [];
      expect(entityMatches.length).toBeLessThanOrEqual(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("without flag returns more entities when available", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      makePopulatedDb(dbPath, 8, 0);
      const { stdout } = await runContextCapture(dbPath);
      const entityMatches = stdout.match(/`AuthService\d+`/g) ?? [];
      expect(entityMatches.length).toBeGreaterThan(3);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects non-integer value", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { exitCode } = await runContextCapture(dbPath, [
        "--max-entities",
        "abc",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects negative value", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { exitCode } = await runContextCapture(dbPath, [
        "--max-entities",
        "-1",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram context --max-edges", () => {
  it("rejects non-integer value", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { exitCode } = await runContextCapture(dbPath, [
        "--max-edges",
        "abc",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("rejects negative value", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { exitCode } = await runContextCapture(dbPath, [
        "--max-edges",
        "-1",
      ]);
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram context --max-entities and --max-edges combined", () => {
  it("both flags can be combined", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      makePopulatedDb(dbPath, 8, 6);
      const { stdout, exitCode } = await runContextCapture(dbPath, [
        "--max-entities",
        "2",
        "--max-edges",
        "2",
      ]);
      expect(exitCode).toBeNull();
      const entityMatches = stdout.match(/`AuthService\d+`/g) ?? [];
      expect(entityMatches.length).toBeLessThanOrEqual(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
