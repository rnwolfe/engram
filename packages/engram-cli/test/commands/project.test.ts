/**
 * project.test.ts — Integration and unit tests for the `engram project` command.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  listActiveProjections,
  openGraph,
} from "engram-core";
import { registerProject } from "../../src/commands/project.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-project-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

/**
 * Captures all process.stdout.write calls during fn() and returns the
 * concatenated output with ANSI escape codes stripped.
 *
 * Works with @clack/prompts which writes directly to process.stdout.
 * Errors from fn() are swallowed — callers check exitCode via a side-effecting
 * process.exit override instead of catching the thrown error here.
 */
async function captureOutput(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  // biome-ignore lint/suspicious/noExplicitAny: test shim
  (process.stdout as any).write = (chunk: string | Uint8Array) => {
    chunks.push(
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(),
    );
    return true;
  };
  try {
    await fn();
  } catch {
    // process.exit() throws to stop execution — swallow so we can return output
  } finally {
    // biome-ignore lint/suspicious/noExplicitAny: test shim
    (process.stdout as any).write = orig;
  }
  // Strip ANSI escape codes so assertions can match plain text
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentionally matching ANSI escape sequences
  return chunks.join("").replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
}

// ─── Test infrastructure ───────────────────────────────────────────────────────
//
// The project command calls createGenerator() internally. To test the happy path
// we need an AI provider. We set ENGRAM_AI_PROVIDER=anthropic which uses
// AnthropicGenerator (a stub that produces valid output without requiring an API key).
//

describe("engram project — unit: input/anchor parsing errors", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
    closeGraph(createGraph(dbPath));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 2 on invalid --anchor format (no colon)", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "invalidanchor",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output).toContain("Invalid --anchor");
  });

  it("exits 2 on invalid --anchor type", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "badtype:01HXABC123",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output).toContain("Invalid --anchor type");
  });

  it("exits 2 on invalid --input format (no colon)", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "none",
        "--input",
        "badinput",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output).toContain("Invalid --input");
  });

  it("exits 2 on invalid --input type", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "none",
        "--input",
        "badtype:01HXABC123",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output).toContain("Invalid --input type");
  });
});

describe("engram project — dry-run does not write", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("prints dry-run output without creating a projection", async () => {
    const graph = createGraph(dbPath);
    const episode = addEpisode(graph, {
      source_type: "manual",
      content: "dry run test episode",
      timestamp: new Date().toISOString(),
    });
    closeGraph(graph);

    const program = new Command().exitOverride();
    registerProject(program);

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "none",
        "--input",
        `episode:${episode.id}`,
        "--dry-run",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;

    expect(output).toContain("Dry run");
    expect(output).toContain("entity_summary");
    expect(output).toContain(episode.id);
    expect(exitCode).toBe(0);

    // Verify nothing was written
    const graph3 = openGraph(dbPath);
    try {
      const projections = listActiveProjections(graph3);
      expect(projections).toHaveLength(0);
    } finally {
      closeGraph(graph3);
    }
  });
});

describe("engram project — NullGenerator error", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 1 with a friendly error when no AI provider is configured", async () => {
    const graph = createGraph(dbPath);
    const episode = addEpisode(graph, {
      source_type: "manual",
      content: "test episode for null generator error",
      timestamp: new Date().toISOString(),
    });
    closeGraph(graph);

    // Blank all keys that createGenerator() auto-detects so it falls through to NullGenerator.
    // CI sets ANTHROPIC_API_KEY for Claude Code — this test must override all of them.
    const savedEnvs = {
      ENGRAM_AI_PROVIDER: process.env.ENGRAM_AI_PROVIDER,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };
    for (const key of Object.keys(savedEnvs)) delete process.env[key];

    const program = new Command().exitOverride();
    registerProject(program);

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "none",
        "--input",
        `episode:${episode.id}`,
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    for (const [key, val] of Object.entries(savedEnvs)) {
      if (val !== undefined) process.env[key] = val;
    }

    expect(exitCode).toBe(1);
    expect(output).toContain("No AI provider configured");
  });
});

describe("engram project — happy path with AnthropicGenerator stub", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("authors a projection and prints a summary", async () => {
    const graph = createGraph(dbPath);
    const episode = addEpisode(graph, {
      source_type: "manual",
      content: "test episode content for projection authoring",
      timestamp: new Date().toISOString(),
    });
    closeGraph(graph);

    process.env.ENGRAM_AI_PROVIDER = "anthropic";

    const program = new Command().exitOverride();
    registerProject(program);

    let output = "";
    try {
      output = await captureOutput(() =>
        program.parseAsync([
          "node",
          "engram",
          "project",
          "--kind",
          "entity_summary",
          "--anchor",
          "none",
          "--input",
          `episode:${episode.id}`,
          "--db",
          dbPath,
        ]),
      );
    } finally {
      delete process.env.ENGRAM_AI_PROVIDER;
    }

    expect(output).toContain("authored");
    expect(output).toContain("entity_summary");
    expect(output).toContain("ID:");

    // Verify the projection was actually written
    const graph2 = openGraph(dbPath);
    try {
      const projections = listActiveProjections(graph2);
      expect(projections.length).toBeGreaterThan(0);
      expect(projections[0].projection.kind).toBe("entity_summary");
    } finally {
      closeGraph(graph2);
    }
  });

  it("is idempotent — re-running with identical inputs prints idempotent status", async () => {
    const graph = createGraph(dbPath);
    const episode = addEpisode(graph, {
      source_type: "manual",
      content: "idempotent test episode",
      timestamp: new Date().toISOString(),
    });
    closeGraph(graph);

    process.env.ENGRAM_AI_PROVIDER = "anthropic";

    const makeCmd = () => {
      const program = new Command().exitOverride();
      registerProject(program);
      return program;
    };

    const args = [
      "node",
      "engram",
      "project",
      "--kind",
      "test_kind",
      "--anchor",
      "none",
      "--input",
      `episode:${episode.id}`,
      "--db",
      dbPath,
    ];

    // First run — should report "authored"
    const output1 = await captureOutput(() => makeCmd().parseAsync(args));
    expect(output1).toContain("authored");

    // Second run with same inputs — should report idempotent
    let output2 = "";
    try {
      output2 = await captureOutput(() => makeCmd().parseAsync(args));
    } finally {
      delete process.env.ENGRAM_AI_PROVIDER;
    }
    expect(output2).toContain("idempotent");

    // Only one active projection should exist (no supersession on identical inputs)
    const graph2 = openGraph(dbPath);
    try {
      const projections = listActiveProjections(graph2);
      expect(projections.length).toBe(1);
    } finally {
      closeGraph(graph2);
    }
  });
});

describe("engram project — default input resolution", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes entity + evidence episodes + touching edges when --input is omitted", async () => {
    // Set up a graph with an entity, evidence episode, and an edge touching it
    const graph = createGraph(dbPath);

    const episode = addEpisode(graph, {
      source_type: "manual",
      content: "evidence episode for entity",
      timestamp: new Date().toISOString(),
    });

    const entity = addEntity(
      graph,
      {
        canonical_name: "TestModule",
        entity_type: "module",
        summary: "A test module",
      },
      [{ episode_id: episode.id, extractor: "test", confidence: 1.0 }],
    );

    const episode2 = addEpisode(graph, {
      source_type: "manual",
      content: "another episode for edge",
      timestamp: new Date().toISOString(),
    });

    const otherEntity = addEntity(
      graph,
      {
        canonical_name: "OtherModule",
        entity_type: "module",
      },
      [{ episode_id: episode2.id, extractor: "test", confidence: 1.0 }],
    );

    const edge = addEdge(
      graph,
      {
        source_id: entity.id,
        target_id: otherEntity.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "TestModule depends on OtherModule",
        valid_from: new Date().toISOString(),
      },
      [{ episode_id: episode2.id, extractor: "test", confidence: 1.0 }],
    );

    closeGraph(graph);

    // Run project with --anchor entity:<id> but WITHOUT --input
    process.env.ENGRAM_AI_PROVIDER = "anthropic";

    const program = new Command().exitOverride();
    registerProject(program);

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        `entity:${entity.id}`,
        "--dry-run",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    delete process.env.ENGRAM_AI_PROVIDER;

    expect(exitCode).toBe(0);

    // The dry-run output should include the entity, the episode, and the edge
    expect(output).toContain(`entity:${entity.id}`);
    expect(output).toContain(`episode:${episode.id}`);
    expect(output).toContain(`edge:${edge.id}`);

    // Should have at least 3 inputs: entity + episode + edge
    const inputsMatch = output.match(/Inputs:\s+(\d+)/);
    expect(inputsMatch).toBeDefined();
    const count = Number.parseInt(inputsMatch?.[1] ?? "0", 10);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("exits 1 with entity-not-found error when anchor entity does not exist", async () => {
    const graph = createGraph(dbPath);
    closeGraph(graph);

    const program = new Command().exitOverride();
    registerProject(program);

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "entity:nonexistent_id",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;

    expect(exitCode).toBe(1);
    expect(output).toContain("not found");
  });
});

describe("engram project — kind validation", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ tmpDir, dbPath } = tmpDb());
    closeGraph(createGraph(dbPath));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 2 on invalid --kind with uppercase letters", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "Entity_Summary",
        "--anchor",
        "none",
        "--input",
        "episode:fakeid",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output.toLowerCase()).toContain("invalid");
  });

  it("exits 2 on --kind with path traversal characters", async () => {
    const program = new Command().exitOverride();
    registerProject(program);
    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };
    const output = await captureOutput(() =>
      program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "../etc/passwd",
        "--anchor",
        "none",
        "--input",
        "episode:fakeid",
        "--db",
        dbPath,
      ]),
    );
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = origExit;
    expect(exitCode).toBe(2);
    expect(output.toLowerCase()).toContain("invalid");
  });
});

describe("engram project — command registration", () => {
  it("registers the project command", () => {
    const program = new Command().exitOverride();
    registerProject(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("project");
  });

  it("project command has expected options", () => {
    const program = new Command().exitOverride();
    registerProject(program);
    const projectCmd = program.commands.find((c) => c.name() === "project");
    expect(projectCmd).toBeDefined();
    if (!projectCmd) return;
    const optionNames = projectCmd.options.map((o) => o.long);
    expect(optionNames).toContain("--kind");
    expect(optionNames).toContain("--anchor");
    expect(optionNames).toContain("--input");
    expect(optionNames).toContain("--dry-run");
    expect(optionNames).toContain("--db");
  });
});
