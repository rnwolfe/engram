import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  closeGraph,
  createGraph,
  ENGINE_VERSION,
  openGraph,
} from "engram-core";
import { registerWhatsNew } from "../../src/commands/whats-new.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerWhatsNew(program);
  return program;
}

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "engram-whatsnew-test-"));
}

function makeGraph(dir: string): string {
  const engramDir = path.join(dir, ".engram");
  fs.mkdirSync(engramDir, { recursive: true });
  const dbPath = path.join(engramDir, "engram.db");
  closeGraph(createGraph(dbPath));
  return engramDir;
}

function setLastSeen(dbDir: string, value: string | null): void {
  const dbPath = path.join(dbDir, "engram.db");
  const graph = openGraph(dbPath);
  if (value === null) {
    graph.db
      .prepare("DELETE FROM metadata WHERE key = ?")
      .run("last_seen_engine_version");
  } else {
    graph.db
      .prepare(
        "INSERT INTO metadata (key, value) VALUES ('last_seen_engine_version', ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(value);
  }
  closeGraph(graph);
}

function readLastSeen(dbDir: string): string | null {
  const dbPath = path.join(dbDir, "engram.db");
  const graph = openGraph(dbPath);
  const v = graph.lastSeenEngineVersion;
  closeGraph(graph);
  return v;
}

async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log.bind(console);
  process.stdout.write = (chunk: string | Uint8Array) => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };
  console.log = (...args: unknown[]) => {
    chunks.push(`${args.join(" ")}\n`);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
  }
  return chunks.join("");
}

describe("engram whats-new", () => {
  let tmp: string | undefined;

  afterEach(() => {
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it("reports 'up to date' when last_seen matches ENGINE_VERSION", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    const out = await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
      ]);
    });
    expect(out).toContain("up to date");
  });

  it("prints v0.2.0 notes when --since 0.1.0 is used", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    const out = await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
        "--since",
        "0.1.0",
      ]);
    });
    expect(out).toContain("v0.2.0");
    expect(out).toContain("engram reconcile");
    expect(out).toContain("Migration");
  });

  it("prints all versions when --all", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    const out = await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
        "--all",
      ]);
    });
    expect(out).toContain("v0.2.0");
    expect(out).toContain("v0.1.0");
  });

  it("emits structured JSON with -j and does not mutate last_seen (no side effects for scripts)", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    setLastSeen(dbDir, "0.1.0");
    const out = await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
        "-j",
      ]);
    });
    const parsed = JSON.parse(out);
    expect(parsed.currentVersion).toBe(ENGINE_VERSION);
    expect(parsed.lastSeen).toBe("0.1.0");
    expect(Array.isArray(parsed.versions)).toBe(true);
    expect(parsed.versions[0].version).toBe("0.3.2");

    // JSON consumers should not have metadata side effects.
    expect(readLastSeen(dbDir)).toBe("0.1.0");
  });

  it("bumps last_seen_engine_version after a default text render", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    setLastSeen(dbDir, "0.1.0");

    await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
      ]);
    });

    expect(readLastSeen(dbDir)).toBe(ENGINE_VERSION);
  });

  it("does not bump last_seen when --no-mark is passed", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    setLastSeen(dbDir, "0.1.0");

    await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
        "--no-mark",
      ]);
    });

    expect(readLastSeen(dbDir)).toBe("0.1.0");
  });

  it("does not bump last_seen when --since is used (ad-hoc read)", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    setLastSeen(dbDir, "0.1.0");

    await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
        "--since",
        "0.0.1",
      ]);
    });

    expect(readLastSeen(dbDir)).toBe("0.1.0");
  });

  it("handles a legacy graph with last_seen_engine_version absent", async () => {
    tmp = makeTmpDir();
    const dbDir = makeGraph(tmp);
    setLastSeen(dbDir, null);

    const out = await captureStdout(async () => {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "whats-new",
        "--db",
        dbDir,
      ]);
    });

    expect(out).toContain("initial graph creation");
    expect(readLastSeen(dbDir)).toBe(ENGINE_VERSION);
  });
});
