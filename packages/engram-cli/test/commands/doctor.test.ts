/**
 * doctor.test.ts — Tests for `engram doctor` command.
 *
 * Uses real SQLite databases (no mocks). Each test constructs the relevant
 * on-disk state and exercises the check logic through the registered command.
 */

import { describe, expect, it } from "bun:test";
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
  it("passes when .engram/ directory contains engram.db", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      let exited = false;
      const origExit = process.exit.bind(process);
      process.exit = (() => {
        exited = true;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
      });

      process.exit = origExit;
      expect(exited).toBe(false);
      expect(output).toContain("layout");
      expect(output).toContain("✓");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("fails when .engram is a flat file", async () => {
    const dir = makeTmpDir();
    const flatPath = makeFlatDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code ?? 1;
    }) as never;

    try {
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
      process.chdir(origCwd);
    }

    expect(exitCode).toBe(1);
  });
});

describe("engram doctor — gitignore check", () => {
  it("passes when .gitignore contains .engram/ (directory entry)", async () => {
    const dir = makeTmpDir();
    makeGoodDb(dir);
    fs.writeFileSync(path.join(dir, ".gitignore"), ".engram/\n", "utf8");
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      let _exited = false;
      const origExit = process.exit.bind(process);
      process.exit = (() => {
        _exited = true;
      }) as never;

      const output = await captureOutput(async () => {
        await program.parseAsync([
          "node",
          "engram",
          "doctor",
          "--db",
          path.join(dir, ".engram"),
        ]);
      });

      process.exit = origExit;
      expect(output).toContain("gitignore");
    } finally {
      process.chdir(origCwd);
    }
  });

  it("warns when .gitignore contains .engram (flat-file entry)", async () => {
    const dir = makeTmpDir();
    makeGoodDb(dir);
    fs.writeFileSync(path.join(dir, ".gitignore"), ".engram\n", "utf8");
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);

    let exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync([
        "node",
        "engram",
        "doctor",
        "--db",
        path.join(dir, ".engram"),
      ]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("gitignore");
    expect(output).toContain("✗"); // fail because flat entry
    expect(exitCode).toBe(1);
  });
});

describe("engram doctor — schema check", () => {
  it("passes for a freshly created database at current FORMAT_VERSION", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("schema");
    // schema pass means no schema fail
    const lines = output.split("\n").filter((l) => l.includes("schema"));
    const schemaLine = lines[0] ?? "";
    expect(schemaLine).toContain("✓");
  });
});

describe("engram doctor — fts_index check", () => {
  it("passes for a normal database", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("fts_index");
    const lines = output.split("\n").filter((l) => l.includes("fts_index"));
    expect(lines[0]).toContain("✓");
  });
});

describe("engram doctor — embedding_index check", () => {
  it("passes when no embedding model configured", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("embedding_index");
  });

  it("passes when embedding model is recorded with valid dimensions", async () => {
    const dir = makeTmpDir();
    const engramDir = path.join(dir, ".engram");
    fs.mkdirSync(engramDir, { recursive: true });
    const dbPath = path.join(engramDir, "engram.db");
    const graph = createGraph(dbPath);
    setEmbeddingModel(graph, "nomic-embed-text", 768);
    closeGraph(graph);

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", engramDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("embedding_index");
    const lines = output
      .split("\n")
      .filter((l) => l.includes("embedding_index"));
    expect(lines[0]).toContain("✓");
  });
});

describe("engram doctor — wal check", () => {
  it("passes when no stale WAL files exist", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("wal");
    const lines = output.split("\n").filter((l) => l.includes("  wal"));
    expect(lines[0]).toContain("✓");
  });

  it("fails when stale .engram-wal file exists", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    // Create a stale WAL file
    fs.writeFileSync(path.join(dir, ".engram-wal"), "", "utf8");
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("wal");
    expect(exitCode).toBe(1);
  });
});

describe("engram doctor — evidence_integrity check", () => {
  it("passes when all entities and edges have evidence", async () => {
    const dir = makeTmpDir();
    const engramDir = path.join(dir, ".engram");
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
    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      _exitCode = code ?? 1;
    }) as never;

    const output = await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", engramDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(output).toContain("evidence_integrity");
    const lines = output
      .split("\n")
      .filter((l) => l.includes("evidence_integrity"));
    expect(lines[0]).toContain("✓");
  });
});

describe("engram doctor — JSON output", () => {
  it("--format json emits valid JSON with correct shape", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
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

    process.exit = origExit;
    process.chdir(origCwd);

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
  });

  it("-j shorthand emits JSON", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    const program = makeProgram();

    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
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

    process.exit = origExit;
    process.chdir(origCwd);

    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty("checks");
  });
});

describe("engram doctor — --fix layout migration", () => {
  it("migrates flat .engram file to .engram/engram.db atomically", async () => {
    const dir = makeTmpDir();
    const flatPath = path.join(dir, ".engram");

    // Create flat file DB
    const graph = createGraph(flatPath);
    closeGraph(graph);

    expect(fs.existsSync(flatPath)).toBe(true);
    expect(fs.statSync(flatPath).isFile()).toBe(true);

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
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

    process.exit = origExit;
    process.chdir(origCwd);

    // After fix: flat file replaced by .engram/ directory containing engram.db
    // flatPath = /tmp/.../  .engram — now a directory, not a file
    expect(fs.existsSync(path.join(dir, ".engram"))).toBe(true);
    expect(fs.statSync(path.join(dir, ".engram")).isDirectory()).toBe(true);
    expect(fs.existsSync(path.join(dir, ".engram", "engram.db"))).toBe(true);
    // The flat file (same path as dir) is no longer a regular file
    expect(fs.statSync(path.join(dir, ".engram")).isFile()).toBe(false);

    // New DB should be openable
    const newPath = path.join(dir, ".engram", "engram.db");
    const newGraph = openGraph(newPath);
    expect(newGraph.formatVersion).toBeTruthy();
    closeGraph(newGraph);
  });
});

describe("engram doctor — --fix gitignore update", () => {
  it("updates flat .engram entry to .engram/ in .gitignore", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    // Write flat entry
    fs.writeFileSync(path.join(dir, ".gitignore"), ".engram\n", "utf8");

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
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

    process.exit = origExit;
    process.chdir(origCwd);

    const content = fs.readFileSync(path.join(dir, ".gitignore"), "utf8");
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
  it("deletes stale .engram-wal and .engram-shm files", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);

    // Create stale files
    fs.writeFileSync(path.join(dir, ".engram-wal"), "stale", "utf8");
    fs.writeFileSync(path.join(dir, ".engram-shm"), "stale", "utf8");

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let _exitCode = 0;
    const origExit = process.exit.bind(process);
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

    process.exit = origExit;
    process.chdir(origCwd);

    expect(fs.existsSync(path.join(dir, ".engram-wal"))).toBe(false);
    expect(fs.existsSync(path.join(dir, ".engram-shm"))).toBe(false);
  });
});

describe("engram doctor — exit codes", () => {
  it("exits 0 when all checks pass", async () => {
    const dir = makeTmpDir();
    const dbDir = makeGoodDb(dir);
    fs.writeFileSync(path.join(dir, ".gitignore"), ".engram/\n", "utf8");

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code;
    }) as never;

    await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", dbDir]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    // exitCode should remain undefined (no call to process.exit) or 0
    expect(exitCode === undefined || exitCode === 0).toBe(true);
  });

  it("exits 1 when any check fails", async () => {
    const dir = makeTmpDir();
    const flatPath = makeFlatDb(dir);

    const program = makeProgram();
    const origCwd = process.cwd();
    process.chdir(dir);
    let exitCode = 0;
    const origExit = process.exit.bind(process);
    process.exit = ((code: number) => {
      exitCode = code ?? 1;
    }) as never;

    await captureOutput(async () => {
      await program.parseAsync(["node", "engram", "doctor", "--db", flatPath]);
    });

    process.exit = origExit;
    process.chdir(origCwd);

    expect(exitCode).toBe(1);
  });
});
