/**
 * status.test.ts — Tests for `engram status` command.
 *
 * Focuses on exit code and output correctness for BM25-only databases
 * (initialized with --embedding-model none).
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { createGraph, openGraph } from "engram-core";
import { registerStatus } from "../../src/commands/status.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerStatus(program);
  return program;
}

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-status-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

function setMeta(dbPath: string, key: string, value: string): void {
  const graph = openGraph(dbPath);
  graph.db
    .prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?)" +
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
  graph.db.close();
}

async function runStatus(
  dbPath: string,
  extraArgs: string[] = [],
): Promise<{ exitCode: number | undefined; logs: string[]; errors: string[] }> {
  const program = makeProgram();
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origErr = console.error;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));
  console.error = (...args: unknown[]) => errors.push(args.join(" "));
  let exitCode: number | undefined;
  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process as any).exit = (code?: number) => {
    if (exitCode === undefined) exitCode = code;
    throw new Error(`process.exit(${code})`);
  };
  try {
    await program.parseAsync([
      "node",
      "engram",
      "status",
      "--db",
      dbPath,
      "--no-verify",
      ...extraArgs,
    ]);
  } catch {
    // expected — process.exit throws
  } finally {
    console.log = origLog;
    console.error = origErr;
    process.exit = origExit;
  }
  return { exitCode, logs, errors };
}

describe("engram status — BM25-only database (embedding-model none)", () => {
  it("exits 0 when embedding_model is 'none'", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      setMeta(dbPath, "embedding_model", "none");
      const { exitCode } = await runStatus(dbPath);
      expect(exitCode).toBe(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits 0 in quiet mode for BM25-only database", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      setMeta(dbPath, "embedding_model", "none");
      const { exitCode, logs } = await runStatus(dbPath, ["--quiet"]);
      expect(exitCode).toBe(0);
      expect(logs.join("\n")).toBe("");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("shows 'BM25 only' in human output when model is 'none'", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      setMeta(dbPath, "embedding_model", "none");
      const { logs } = await runStatus(dbPath);
      const output = logs.join("\n");
      expect(output).toContain("BM25 only");
      expect(output).not.toContain("(not recorded)");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes model: 'none' (not null) in JSON output", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      setMeta(dbPath, "embedding_model", "none");
      const { logs } = await runStatus(dbPath, ["--json"]);
      const json = JSON.parse(logs.join("\n"));
      expect(json.embedding.model).toBe("none");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits 2 for a database with genuinely missing embedding model", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      // No embedding_model metadata set at all
      const { exitCode } = await runStatus(dbPath);
      expect(exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
