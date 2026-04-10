/**
 * project.test.ts — Integration and unit tests for the `engram project` command.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  addEpisode,
  closeGraph,
  createGraph,
  listActiveProjections,
  openGraph,
} from "engram-core";
import { registerProject } from "../../src/commands/project.js";

// ─── Mock generator (recording mode) ─────────────────────────────────────────

// ─── Test helpers ─────────────────────────────────────────────────────────────

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-project-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
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

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "invalidanchor",
        "--db",
        dbPath,
      ]);
    } catch {
      // expected
    } finally {
      console.error = origErr;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
    }

    expect(exitCode).toBe(2);
    expect(errs.join(" ")).toContain("Invalid --anchor");
  });

  it("exits 2 on invalid --anchor type", async () => {
    const program = new Command().exitOverride();
    registerProject(program);

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "badtype:01HXABC123",
        "--db",
        dbPath,
      ]);
    } catch {
      // expected
    } finally {
      console.error = origErr;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
    }

    expect(exitCode).toBe(2);
    expect(errs.join(" ")).toContain("Invalid --anchor type");
  });

  it("exits 2 on invalid --input format (no colon)", async () => {
    const program = new Command().exitOverride();
    registerProject(program);

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
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
      ]);
    } catch {
      // expected
    } finally {
      console.error = origErr;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
    }

    expect(exitCode).toBe(2);
    expect(errs.join(" ")).toContain("Invalid --input");
  });

  it("exits 2 on invalid --input type", async () => {
    const program = new Command().exitOverride();
    registerProject(program);

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
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
      ]);
    } catch {
      // expected
    } finally {
      console.error = origErr;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
    }

    expect(exitCode).toBe(2);
    expect(errs.join(" ")).toContain("Invalid --input type");
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

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
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
      ]);
    } catch {
      // process.exit throws
    } finally {
      console.log = origLog;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
    }

    const output = logs.join("\n");
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
    closeGraph(createGraph(dbPath));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits 1 with a friendly error when no AI provider is configured", async () => {
    // Default env has no ENGRAM_AI_PROVIDER or it's 'null'
    const savedEnv = process.env.ENGRAM_AI_PROVIDER;
    delete process.env.ENGRAM_AI_PROVIDER;

    const program = new Command().exitOverride();
    registerProject(program);

    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...args: unknown[]) => errs.push(args.join(" "));

    let exitCode: number | null = null;
    const origExit = process.exit;
    // biome-ignore lint/suspicious/noExplicitAny: test override
    (process as any).exit = (code: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    };

    try {
      await program.parseAsync([
        "node",
        "engram",
        "project",
        "--kind",
        "entity_summary",
        "--anchor",
        "none",
        "--input",
        "episode:fakeid",
        "--db",
        dbPath,
      ]);
    } catch {
      // expected
    } finally {
      console.error = origErr;
      // biome-ignore lint/suspicious/noExplicitAny: test override
      (process as any).exit = origExit;
      if (savedEnv !== undefined) {
        process.env.ENGRAM_AI_PROVIDER = savedEnv;
      }
    }

    expect(exitCode).toBe(1);
    expect(errs.join(" ")).toContain("no AI provider configured");
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

    // AnthropicGenerator is the stub that returns valid output
    process.env.ENGRAM_AI_PROVIDER = "anthropic";

    const program = new Command().exitOverride();
    registerProject(program);

    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: unknown[]) => logs.push(args.join(" "));

    try {
      await program.parseAsync([
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
      ]);
    } finally {
      console.log = origLog;
      delete process.env.ENGRAM_AI_PROVIDER;
    }

    const output = logs.join("\n");
    expect(output).toContain("authored");
    expect(output).toContain("entity_summary");
    expect(output).toContain("id:");

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

    const origLog = console.log;
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

    // First run
    const logs1: string[] = [];
    console.log = (...args: unknown[]) => logs1.push(args.join(" "));
    try {
      await makeCmd().parseAsync(args);
    } finally {
      console.log = origLog;
    }

    // The first run should report "authored"
    expect(logs1.join("\n")).toContain("authored");

    // Wait a brief moment so the second run timestamp is clearly after valid_from
    await new Promise((r) => setTimeout(r, 600));

    // Second run with same inputs
    const logs2: string[] = [];
    console.log = (...args: unknown[]) => logs2.push(args.join(" "));
    try {
      await makeCmd().parseAsync(args);
    } finally {
      console.log = origLog;
      delete process.env.ENGRAM_AI_PROVIDER;
    }

    // Second run should report idempotent
    const output2 = logs2.join("\n");
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
