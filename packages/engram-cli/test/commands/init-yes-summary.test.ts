/**
 * init-yes-summary.test.ts — Tests for structured summary emitted by
 * `engram init --yes` in non-interactive mode.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { registerInit } from "../../src/commands/init.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerInit(program);
  return program;
}

function tmpDir(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-init-summary-"));
  const dbPath = path.join(dir, "test.engram");
  return { dir, dbPath };
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ): boolean => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return orig(
      chunk,
      ...(rest as Parameters<typeof process.stdout.write>).slice(1),
    );
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

describe("engram init --yes summary", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ dir, dbPath } = tmpDir());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("no ingestion flags: shows Created and Next steps, source always runs", {
    timeout: 120000,
  }, async () => {
    const out = await captureStdout(async () => {
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
      }
    });

    expect(out).toContain("Created");
    expect(out).toContain(path.join(dir, "test.engram", "engram.db"));
    expect(out).toContain("Next steps:");
    expect(out).toContain("engram context");

    // Source ingest always runs now (even without explicit flag)
    expect(out).toContain("Source ingestion");

    expect(out).not.toContain("Git ingestion:");
    expect(out).not.toContain("Markdown:");
    expect(out).not.toContain("Embeddings:");
  });

  it("--from-git: shows git ingestion stats in summary (source always runs)", {
    timeout: 120000,
  }, async () => {
    const repoPath = path.resolve(__dirname, "../../../..");

    const out = await captureStdout(async () => {
      // chdir to isolated temp dir so companion/source ingest never touch
      // the real repo root or any real harness files.
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--from-git",
          repoPath,
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
      }
    });

    expect(out).toContain("Created");
    expect(out).toContain("Git ingestion:");
    expect(out).toContain("episodes");
    expect(out).toContain("entities");
    expect(out).toContain("edges");
    expect(out).toContain("Next steps:");

    // Source ingest always runs
    expect(out).toContain("Source ingestion");

    expect(out).not.toContain("Markdown:");
    expect(out).not.toContain("Embeddings:");
  });

  it("--from-git: shows both git and source stats (source unconditional)", {
    timeout: 120000,
  }, async () => {
    const repoPath = path.resolve(__dirname, "../../../..");

    const out = await captureStdout(async () => {
      // chdir to isolated temp dir so companion/source ingest never touch
      // the real repo root or any real harness files.
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--from-git",
          repoPath,
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
      }
    });

    expect(out).toContain("Git ingestion:");
    expect(out).toContain("Source ingestion");
    expect(out).toContain("files parsed");
    expect(out).toContain("Next steps:");

    expect(out).not.toContain("Embeddings:");
  });
});
