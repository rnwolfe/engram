/**
 * Integration tests for `engram ingest source` CLI subcommand.
 *
 * Uses commander's .parseAsync() with a patched process.exit to exercise
 * the full action handler without exiting the test process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { closeGraph, createGraph, openGraph } from "engram-core";
import { registerIngest } from "../../src/commands/ingest.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-cli-source-test-"));
  dbPath = path.join(tmpDir, "test.engram");
  const g = await createGraph(dbPath);
  closeGraph(g);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function runIngestSource(
  args: string[],
): Promise<{ exitCode: number | undefined; output: string }> {
  const program = new Command().exitOverride();
  registerIngest(program);

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
    await program.parseAsync(["node", "engram", "ingest", "source", ...args]);
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

function writeFile(relPath: string, content: string) {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function activeEpisodeCount(): number {
  const g = openGraph(dbPath);
  const rows = g.db
    .query<{ n: number }, []>(
      "SELECT COUNT(*) as n FROM episodes WHERE source_type = 'source' AND status = 'active'",
    )
    .all();
  closeGraph(g);
  return rows[0]?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("engram ingest source", () => {
  test("runs against a specific subdirectory and writes episodes", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/b.ts", "export const b = 2;");

    const { exitCode, output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
    expect(output).toContain("Source ingestion complete");
    expect(activeEpisodeCount()).toBe(2);
  }, 15_000);

  test("--dry-run reports but does not write", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    const { exitCode, output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--dry-run",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
    expect(output).toContain("dry-run");
    expect(activeEpisodeCount()).toBe(0);
  }, 15_000);

  test("--verbose emits per-file progress lines", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    const { exitCode, output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--verbose",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
    // Verbose mode should emit a parsed/cached line for the file
    expect(output).toMatch(/parsed|cached/);
    expect(activeEpisodeCount()).toBe(1);
  }, 15_000);

  test("--exclude filters out matching files", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/a.test.ts", "import { a } from './a.js';");

    const { exitCode, output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--exclude",
      "**/*.test.ts",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
    expect(output).toContain("Source ingestion complete");
    // Only a.ts should be ingested
    expect(activeEpisodeCount()).toBe(1);

    const g = openGraph(dbPath);
    const rows = g.db
      .query<{ source_ref: string }, []>(
        "SELECT source_ref FROM episodes WHERE source_type = 'source' AND status = 'active'",
      )
      .all();
    closeGraph(g);
    expect(rows.every((r) => !r.source_ref?.includes(".test.ts"))).toBe(true);
  }, 15_000);

  test("invalid path exits non-zero", async () => {
    const nonExistent = path.join(tmpDir, "does-not-exist");

    const { exitCode } = await runIngestSource([nonExistent, "--db", dbPath]);

    expect(exitCode).toBe(1);
  }, 15_000);

  test("second run with unchanged files produces zero new episodes (idempotency)", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    await runIngestSource([path.join(tmpDir, "src"), "--db", dbPath]);
    const countAfterFirst = activeEpisodeCount();

    await runIngestSource([path.join(tmpDir, "src"), "--db", dbPath]);
    expect(activeEpisodeCount()).toBe(countAfterFirst);
  }, 15_000);

  test("--dry-run exits 1 when parse errors occur", async () => {
    writeFile("src/bad.ts", "export function (@@@@) {}");

    const { exitCode, output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--dry-run",
      "--db",
      dbPath,
    ]);

    expect(output).toContain("Errors:");
    expect(exitCode).toBe(1);
  }, 15_000);

  test("--dry-run exits 0 on a clean run with no errors", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    const { exitCode } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--dry-run",
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
  }, 15_000);

  test("real ingest exits 0 even with per-file parse errors", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/bad.ts", "export function (@@@@) {}");

    const { exitCode } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--db",
      dbPath,
    ]);

    expect(exitCode).toBeUndefined();
  }, 15_000);

  test("summary block always shows counts", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    const { output } = await runIngestSource([
      path.join(tmpDir, "src"),
      "--db",
      dbPath,
    ]);

    expect(output).toContain("Scanned:");
    expect(output).toContain("Parsed:");
    expect(output).toContain("Entities:");
    expect(output).toContain("Edges:");
    expect(output).toContain("Elapsed:");
  }, 15_000);
});
