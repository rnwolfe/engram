/**
 * context-sparse.test.ts — Tests that the sparse-results diagnostic note on
 * stderr is gated on --verbose or process.stderr.isTTY.
 *
 * Issue #155: the note was unconditionally written, causing noise in CI.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { createGraph } from "engram-core";
import { registerContext } from "../../src/commands/context.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerContext(program);
  return program;
}

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "engram-context-sparse-test-"),
  );
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

async function runContext(
  dbPath: string,
  extraArgs: string[] = [],
  stderrIsTTY = false,
): Promise<{ stderrWrites: string[] }> {
  const program = makeProgram();
  const stderrWrites: string[] = [];

  const origWrite = process.stderr.write.bind(process.stderr);
  const origIsTTY = process.stderr.isTTY;

  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process.stderr as any).isTTY = stderrIsTTY;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process.stderr as any).write = (chunk: string | Uint8Array) => {
    stderrWrites.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };

  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process as any).exit = (code?: number) => {
    throw new Error(`process.exit(${code})`);
  };

  try {
    await program.parseAsync([
      "node",
      "engram",
      "context",
      "test query",
      "--db",
      dbPath,
      ...extraArgs,
    ]);
  } catch {
    // expected — process.exit throws or commander exits
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (process.stderr as any).write = origWrite;
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    (process.stderr as any).isTTY = origIsTTY;
    process.exit = origExit;
  }
  return { stderrWrites };
}

describe("engram context — sparse-results note gating", () => {
  it("suppresses note when stderr is non-TTY and --verbose not set", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { stderrWrites } = await runContext(
        dbPath,
        [],
        false, // non-TTY
      );
      const combined = stderrWrites.join("");
      expect(combined).not.toContain("fewer than 3 entities");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("emits note when --verbose is set and db is sparse", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { stderrWrites } = await runContext(
        dbPath,
        ["--verbose"],
        false, // non-TTY — note should still appear due to --verbose
      );
      const combined = stderrWrites.join("");
      expect(combined).toContain("fewer than 3 entities");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("emits note when stderr is TTY even without --verbose", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { stderrWrites } = await runContext(
        dbPath,
        [],
        true, // TTY — note should appear
      );
      const combined = stderrWrites.join("");
      expect(combined).toContain("fewer than 3 entities");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
