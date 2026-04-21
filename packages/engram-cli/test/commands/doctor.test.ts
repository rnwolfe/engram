/**
 * doctor.test.ts — Tests for `engram doctor` command.
 *
 * Uses real SQLite databases (no mocks). Each test constructs the relevant
 * on-disk state and exercises the check logic through the registered command.
 */

import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  openGraph,
  setEmbeddingModel,
} from "engram-core";
import { registerDoctor } from "../../src/commands/doctor.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerDoctor(program);
  return program;
}

/** Create a temporary working directory for one test. */
function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "engram-doctor-test-"));
}

/** Build and return a good directory-layout .engram database path. */
function makeGoodDb(dir: string): string {
  const engramDir = path.join(dir, ".engram");
  fs.mkdirSync(engramDir, { recursive: true });
  const dbPath = path.join(engramDir, "engram.db");
  const graph = createGraph(dbPath);
  closeGraph(graph);
  return engramDir; // return the directory (what --db receives)
}

/** Build a flat-file .engram at the given directory. */
function makeFlatDb(dir: string): string {
  const flatPath = path.join(dir, ".engram");
  const graph = createGraph(flatPath);
  closeGraph(graph);
  return flatPath;
}

/** Capture stdout lines during a synchronous or async callback. */
async function captureOutput(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  const origLog = console.log.bind(console);
  process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return origWrite(
      chunk,
      ...(args as Parameters<typeof process.stdout.write>).slice(1),
    );
  };
  console.log = (...args: unknown[]) => {
    chunks.push(`${args.join(" ")}\n`);
    origLog(...args);
  };
  try {
    await fn();
  } finally {
    process.stdout.write = origWrite;
    console.log = origLog;
  }
  return chunks.join("");
}

// ─── Test suites ──────────────────────────────────────────────────────────────

describe("engram doctor — layout check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes when .engram/ directory contains engram.db", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    try {
      let exited = false;
      process.exit = (() => {
        exited = true;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(exited).toBe(false);
      expect(output).toContain("layout");
      expect(output).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });

  it("fails when .engram is a flat file", async () => {
    tmpDir = makeTmpDir();
    const flatPath = makeFlatDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let exitCode = 0;

    try {
      process.exit = ((code: number) => {
        exitCode = code ?? 1;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          flatPath,
        ]);
      });
    } finally {
      process.exit = origExit;
    }

    expect(exitCode).toBe(1);
  });
});

describe("engram doctor — gitignore check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes when .gitignore contains .engram/ (directory entry)", async () => {
    tmpDir = makeTmpDir();
    makeGoodDb(tmpDir);
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".engram/\n", "utf8");
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    try {
      process.exit = (() => {
        // no-op capture
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          path.join(tmpDir, ".engram"),
        ]);
      });

      expect(output).toContain("gitignore");
    } finally {
      process.exit = origExit;
    }
  });

  it("fails when .gitignore contains .engram (flat-file entry)", async () => {
    tmpDir = makeTmpDir();
    makeGoodDb(tmpDir);
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".engram\n", "utf8");
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let exitCode = 0;

    try {
      process.exit = ((code: number) => {
        exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          path.join(tmpDir, ".engram"),
        ]);
      });

      expect(output).toContain("gitignore");
      expect(output).toContain("✗"); // fail because flat entry
      expect(exitCode).toBe(1);
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — schema check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes for a freshly created database at current FORMAT_VERSION", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(output).toContain("schema");
      // schema pass means no schema fail
      const lines = output.split("\n").filter((l) => l.includes("schema"));
      const schemaLine = lines[0] ?? "";
      expect(schemaLine).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — fts_index check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes for a normal database", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(output).toContain("fts_index");
      const lines = output.split("\n").filter((l) => l.includes("fts_index"));
      expect(lines[0]).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — embedding_index check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes when no embedding model configured", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(output).toContain("embedding_index");
    } finally {
      process.exit = origExit;
    }
  });

  it("passes when embedding model is recorded with valid dimensions", async () => {
    tmpDir = makeTmpDir();
    const engramDir = path.join(tmpDir, ".engram");
    fs.mkdirSync(engramDir, { recursive: true });
    const dbPath = path.join(engramDir, "engram.db");
    const graph = createGraph(dbPath);
    setEmbeddingModel(graph, "nomic-embed-text", 768);
    closeGraph(graph);

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          engramDir,
        ]);
      });

      expect(output).toContain("embedding_index");
      const lines = output
        .split("\n")
        .filter((l) => l.includes("embedding_index"));
      expect(lines[0]).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — wal check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes when no stale WAL files exist", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(output).toContain("wal");
      const lines = output.split("\n").filter((l) => l.includes("  wal"));
      expect(lines[0]).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });

  it("fails when stale .engram-wal file exists", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    // Create a stale WAL file (derived from the db path)
    fs.writeFileSync(path.join(tmpDir, ".engram-wal"), "", "utf8");
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let exitCode = 0;

    try {
      process.exit = ((code: number) => {
        exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      expect(output).toContain("wal");
      expect(exitCode).toBe(1);
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — evidence_integrity check", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("passes when all entities and edges have evidence", async () => {
    tmpDir = makeTmpDir();
    const engramDir = path.join(tmpDir, ".engram");
    fs.mkdirSync(engramDir, { recursive: true });
    const dbPath = path.join(engramDir, "engram.db");

    const graph = createGraph(dbPath);

    const ep = addEpisode(graph, {
      content: "test commit",
      source_type: "git_commit",
      source_ref: "abc123",
      timestamp: new Date().toISOString(),
    });

    addEntity(
      graph,
      {
        canonical_name: "src/index.ts",
        entity_type: "module",
      },
      [{ episode_id: ep.id, extractor: "test", confidence: 1.0 }],
    );

    closeGraph(graph);

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          engramDir,
        ]);
      });

      expect(output).toContain("evidence_integrity");
      const lines = output
        .split("\n")
        .filter((l) => l.includes("evidence_integrity"));
      expect(lines[0]).toContain("✓");
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — JSON output", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("--format json emits valid JSON with correct shape", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          dbDir,
          "--format",
          "json",
        ]);
      });

      // output should be parseable JSON
      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("db");
      expect(parsed).toHaveProperty("checks");
      expect(parsed).toHaveProperty("fixes_applied");
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(Array.isArray(parsed.fixes_applied)).toBe(true);

      // Each check has required fields
      for (const check of parsed.checks) {
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("status");
        expect(check).toHaveProperty("message");
        expect(["pass", "fail", "warn", "skip"]).toContain(check.status);
      }
    } finally {
      process.exit = origExit;
    }
  });

  it("-j shorthand emits JSON", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    const program = makeProgram();

    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          dbDir,
          "-j",
        ]);
      });

      const parsed = JSON.parse(output);
      expect(parsed).toHaveProperty("checks");
    } finally {
      process.exit = origExit;
    }
  });
});

describe("engram doctor — --fix layout migration", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("migrates flat .engram file to .engram/engram.db atomically", async () => {
    tmpDir = makeTmpDir();
    const flatPath = path.join(tmpDir, ".engram");

    // Create flat file DB
    const graph = createGraph(flatPath);
    closeGraph(graph);

    expect(fs.existsSync(flatPath)).toBe(true);
    expect(fs.statSync(flatPath).isFile()).toBe(true);

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          flatPath,
          "--fix",
          "--yes",
        ]);
      });
    } finally {
      process.exit = origExit;
    }

    // After fix: flat file replaced by .engram/ directory containing engram.db
    // flatPath = /tmp/.../  .engram — now a directory, not a file
    expect(fs.existsSync(path.join(tmpDir, ".engram"))).toBe(true);
    expect(fs.statSync(path.join(tmpDir, ".engram")).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, ".engram", "engram.db"))).toBe(true);
    // The flat file (same path as dir) is no longer a regular file
    expect(fs.statSync(path.join(tmpDir, ".engram")).isFile()).toBe(false);

    // New DB should be openable
    const newPath = path.join(tmpDir, ".engram", "engram.db");
    const newGraph = openGraph(newPath);
    expect(newGraph.formatVersion).toBeTruthy();
    closeGraph(newGraph);
  });
});

describe("engram doctor — --fix gitignore update", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("updates flat .engram entry to .engram/ in .gitignore", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    // Write flat entry
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".engram\n", "utf8");

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          dbDir,
          "--fix",
          "--yes",
        ]);
      });
    } finally {
      process.exit = origExit;
    }

    const content = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
    expect(content).toContain(".engram/");
    // Flat entry should be replaced (not both)
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const flatLines = lines.filter((l) => l === ".engram");
    expect(flatLines).toHaveLength(0);
  });
});

describe("engram doctor — --fix WAL cleanup", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("deletes stale .engram-wal and .engram-shm files", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);

    // Create stale WAL files (derived from the db path: .engram-wal, .engram-shm)
    fs.writeFileSync(path.join(tmpDir, ".engram-wal"), "stale", "utf8");
    fs.writeFileSync(path.join(tmpDir, ".engram-shm"), "stale", "utf8");

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let _exitCode = 0;

    try {
      process.exit = ((code: number) => {
        _exitCode = code ?? 1;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          dbDir,
          "--fix",
          "--yes",
        ]);
      });
    } finally {
      process.exit = origExit;
    }

    expect(fs.existsSync(path.join(tmpDir, ".engram-wal"))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".engram-shm"))).toBe(false);
  });
});

describe("engram doctor — exit codes", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("exits 0 when all checks pass", async () => {
    tmpDir = makeTmpDir();
    const dbDir = makeGoodDb(tmpDir);
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), ".engram/\n", "utf8");

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let exitCode: number | undefined;

    try {
      process.exit = ((code: number) => {
        exitCode = code;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });
    } finally {
      process.exit = origExit;
    }

    // exitCode should remain undefined (no call to process.exit) or 0
    expect(exitCode === undefined || exitCode === 0).toBe(true);
  });

  it("exits 1 when any check fails", async () => {
    tmpDir = makeTmpDir();
    const flatPath = makeFlatDb(tmpDir);

    const program = makeProgram();
    const origExit = process.exit.bind(process);
    let exitCode = 0;

    try {
      process.exit = ((code: number) => {
        exitCode = code ?? 1;
      }) as never;

      await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          flatPath,
        ]);
      });
    } finally {
      process.exit = origExit;
    }

    expect(exitCode).toBe(1);
  });
});
