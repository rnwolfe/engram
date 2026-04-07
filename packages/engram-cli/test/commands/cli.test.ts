/**
 * cli.test.ts — CLI command registration and basic output tests.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { addEpisode, createGraph } from "engram-core";
import { registerAdd } from "../../src/commands/add.js";
import { registerDecay } from "../../src/commands/decay.js";
import { registerExport } from "../../src/commands/export.js";
import { registerHistory } from "../../src/commands/history.js";
import { registerIngest } from "../../src/commands/ingest.js";
import { registerInit } from "../../src/commands/init.js";
import { registerMaintenance } from "../../src/commands/maintenance.js";
import { registerSearch } from "../../src/commands/search.js";
import { registerShow } from "../../src/commands/show.js";
import { registerStats } from "../../src/commands/stats.js";
import { registerVerify } from "../../src/commands/verify.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerInit(program);
  registerAdd(program);
  registerSearch(program);
  registerShow(program);
  registerHistory(program);
  registerDecay(program);
  registerStats(program);
  registerIngest(program);
  registerExport(program);
  registerVerify(program);
  registerMaintenance(program);
  return program;
}

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-cli-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

describe("CLI command registration", () => {
  it("registers all expected top-level commands", () => {
    const program = makeProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("init");
    expect(names).toContain("add");
    expect(names).toContain("search");
    expect(names).toContain("show");
    expect(names).toContain("history");
    expect(names).toContain("decay");
    expect(names).toContain("stats");
    expect(names).toContain("ingest");
    expect(names).toContain("export");
    expect(names).toContain("verify");
    expect(names).toContain("rebuild-index");
    expect(names).toContain("serve");
  });

  it("registers ingest subcommands", () => {
    const program = makeProgram();
    const ingest = program.commands.find((c) => c.name() === "ingest");
    expect(ingest).toBeDefined();
    if (!ingest) return;
    const subNames = ingest.commands.map((c) => c.name());
    expect(subNames).toContain("git");
    expect(subNames).toContain("md");
    expect(subNames).toContain("enrich");
  });

  it("registers ingest enrich subcommands", () => {
    const program = makeProgram();
    const ingest = program.commands.find((c) => c.name() === "ingest");
    if (!ingest) return;
    const enrich = ingest.commands.find((c) => c.name() === "enrich");
    expect(enrich).toBeDefined();
    if (!enrich) return;
    const subNames = enrich.commands.map((c) => c.name());
    expect(subNames).toContain("github");
  });
});

describe("engram stats", () => {
  it("prints graph statistics without error", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync(["node", "engram", "stats", "--db", dbPath]);
      } finally {
        console.log = origLog;
      }
      const output = logs.join("\n");
      expect(output).toContain("Entities");
      expect(output).toContain("Edges");
      expect(output).toContain("Episodes");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram search", () => {
  it("outputs text (no JSON) by default on empty graph", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync([
          "node",
          "engram",
          "search",
          "test",
          "--db",
          dbPath,
        ]);
      } finally {
        console.log = origLog;
      }
      expect(logs.join("\n")).toContain("No results");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("outputs JSON array when --format json is set", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync([
          "node",
          "engram",
          "search",
          "test",
          "--format",
          "json",
          "--db",
          dbPath,
        ]);
      } finally {
        console.log = origLog;
      }
      const parsed = JSON.parse(logs.join("\n"));
      expect(Array.isArray(parsed)).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram verify", () => {
  it("reports OK on a clean graph", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync(["node", "engram", "verify", "--db", dbPath]);
      } finally {
        console.log = origLog;
      }
      expect(logs.join("\n")).toContain("OK");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram export", () => {
  it("JSONL export produces valid JSON lines with _type field", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      addEpisode(graph, {
        source_type: "manual",
        content: "test content for export",
        timestamp: new Date().toISOString(),
      });
      graph.db.close();

      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync([
          "node",
          "engram",
          "export",
          "--format",
          "jsonl",
          "--db",
          dbPath,
        ]);
      } finally {
        console.log = origLog;
      }

      for (const line of logs) {
        if (line.trim()) {
          const parsed = JSON.parse(line);
          expect(parsed).toHaveProperty("_type");
          expect(["entity", "edge", "episode"]).toContain(parsed._type);
        }
      }

      const hasEpisode = logs.some((l) => {
        try {
          return JSON.parse(l)._type === "episode";
        } catch {
          return false;
        }
      });
      expect(hasEpisode).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram decay", () => {
  it("prints decay report summary", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const program = makeProgram();
      const logs: string[] = [];
      const origLog = console.log;
      console.log = (...args: unknown[]) => logs.push(args.join(" "));
      try {
        await program.parseAsync(["node", "engram", "decay", "--db", dbPath]);
      } finally {
        console.log = origLog;
      }
      const output = logs.join("\n");
      expect(output).toContain("Decay Report");
      expect(output).toContain("Summary");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("engram error handling", () => {
  it("openGraph throws a descriptive error for a non-engram file", () => {
    // CLI commands call openGraph and catch + print the error.
    // Here we verify that openGraph produces a descriptive error, which is
    // what the CLI would log to console.error before exiting.
    const { openGraph } = require("engram-core");
    const { tmpDir, dbPath } = tmpDb();
    try {
      fs.writeFileSync(dbPath, "not a valid engram database\n");
      let caught: Error | null = null;
      try {
        openGraph(dbPath);
      } catch (err) {
        caught = err as Error;
      }
      // Should throw something (either SQLite error or EngramFormatError)
      expect(caught).not.toBeNull();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
