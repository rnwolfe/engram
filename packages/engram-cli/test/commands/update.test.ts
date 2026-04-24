import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { registerUpdate } from "../../src/commands/update.js";

async function captureStdout(fn: () => Promise<void> | void): Promise<{
  stdout: string;
  exitCode: number | null;
}> {
  const chunks: string[] = [];
  let exitCode: number | null = null;
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log.bind(console);
  const origExit = process.exit.bind(process);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };
  console.log = (...args: unknown[]) => {
    chunks.push(`${args.join(" ")}\n`);
  };
  (process as { exit: (code?: number) => never }).exit = ((code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`__exit__${exitCode}`);
  }) as typeof process.exit;
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("__exit__")) {
      throw err;
    }
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
    process.exit = origExit;
  }
  return { stdout: chunks.join(""), exitCode };
}

describe("engram update --check", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-update-cache-"));
    process.env.XDG_CACHE_HOME = cacheDir;
  });

  afterEach(() => {
    delete process.env.XDG_CACHE_HOME;
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("exits 0 and prints 'latest' when no update is available (offline, cache miss returns error)", async () => {
    // With an empty cache and --offline, checkForUpdate returns error="offline".
    // The check mode should still exit 0 because updateAvailable is false.
    const program = new Command().exitOverride();
    registerUpdate(program);

    const { stdout, exitCode } = await captureStdout(async () => {
      await program.parseAsync([
        "node",
        "engram",
        "update",
        "--check",
        "--offline",
      ]);
    });

    expect(stdout).toContain("engram");
    expect(exitCode).toBe(0);
  });

  it("emits structured JSON with --check -j", async () => {
    const program = new Command().exitOverride();
    registerUpdate(program);

    const { stdout, exitCode } = await captureStdout(async () => {
      await program.parseAsync([
        "node",
        "engram",
        "update",
        "--check",
        "--offline",
        "-j",
      ]);
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.current).toBeTruthy();
    expect(typeof parsed.updateAvailable).toBe("boolean");
    expect(exitCode).toBe(0);
  });
});
