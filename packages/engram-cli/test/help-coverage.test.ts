// help-coverage.test.ts — asserts that Phase 1 commands have non-empty Examples blocks.
import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import * as path from "node:path";

const CLI = path.resolve(__dirname, "../src/cli.ts");

function helpOutput(args: string[]): string {
  return execFileSync("bun", [CLI, ...args, "--help"], {
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
}

function hasExamples(help: string): boolean {
  const idx = help.search(/Examples:/i);
  if (idx === -1) return false;
  const afterExamples = help.slice(idx);
  return /#\s+\S/.test(afterExamples);
}

describe("help-coverage: Phase 3 commands have Examples blocks", () => {
  it("engram add --help has Examples", () => {
    expect(hasExamples(helpOutput(["add"]))).toBe(true);
  });
  it("engram decay --help has Examples", () => {
    expect(hasExamples(helpOutput(["decay"]))).toBe(true);
  });
  it("engram embed --help has Examples", () => {
    expect(hasExamples(helpOutput(["embed"]))).toBe(true);
  });
  it("engram export --help has Examples", () => {
    expect(hasExamples(helpOutput(["export"]))).toBe(true);
  });
  it("engram project --help has Examples", () => {
    expect(hasExamples(helpOutput(["project"]))).toBe(true);
  });
  it("engram reconcile --help has Examples", () => {
    expect(hasExamples(helpOutput(["reconcile"]))).toBe(true);
  });
  it("engram verify --help has Examples", () => {
    expect(hasExamples(helpOutput(["verify"]))).toBe(true);
  });
  it("engram rebuild-index --help has Examples", () => {
    expect(hasExamples(helpOutput(["rebuild-index"]))).toBe(true);
  });
  it("engram embed description mentions rebuild-index", () => {
    expect(helpOutput(["embed"])).toContain("rebuild-index");
  });
  it("engram rebuild-index description mentions embed --reindex", () => {
    const out = helpOutput(["rebuild-index"]);
    expect(out).toContain("embed");
    expect(out).toContain("--reindex");
  });
});

describe("help-coverage: Phase 1 commands have Examples blocks", () => {
  it("engram --help shows Typical lifecycle", () => {
    const out = helpOutput([]);
    expect(out).toContain("Typical lifecycle");
    expect(out).toContain("engram init");
  });

  it("engram init --help has Examples", () => {
    expect(hasExamples(helpOutput(["init"]))).toBe(true);
  });

  it("engram ingest git --help has Examples", () => {
    expect(hasExamples(helpOutput(["ingest", "git"]))).toBe(true);
  });

  it("engram ingest enrich github --help has Examples", () => {
    expect(hasExamples(helpOutput(["ingest", "enrich", "github"]))).toBe(true);
  });

  it("engram ingest source --help has Examples", () => {
    expect(hasExamples(helpOutput(["ingest", "source"]))).toBe(true);
  });

  it("engram ingest md --help has Examples", () => {
    expect(hasExamples(helpOutput(["ingest", "md"]))).toBe(true);
  });

  it("engram companion --help has Examples", () => {
    expect(hasExamples(helpOutput(["companion"]))).toBe(true);
  });

  it("No command help references MCP or engramark", () => {
    const commands = [
      [],
      ["init"],
      ["ingest", "git"],
      ["ingest", "enrich", "github"],
      ["ingest", "source"],
      ["ingest", "md"],
      ["companion"],
    ];
    for (const args of commands) {
      const out = helpOutput(args);
      expect(out).not.toContain("engramark");
      expect(out.toLowerCase()).not.toContain("mcp");
    }
  });
});

describe("help-coverage: Phase 2 commands have Examples blocks", () => {
  it("engram search --help has Examples", () => {
    expect(hasExamples(helpOutput(["search"]))).toBe(true);
  });
  it("engram show --help has Examples", () => {
    expect(hasExamples(helpOutput(["show"]))).toBe(true);
  });
  it("engram history --help has Examples", () => {
    expect(hasExamples(helpOutput(["history"]))).toBe(true);
  });
  it("engram ownership --help has Examples", () => {
    expect(hasExamples(helpOutput(["ownership"]))).toBe(true);
  });
  it("engram stats --help has Examples", () => {
    expect(hasExamples(helpOutput(["stats"]))).toBe(true);
  });
  it("engram status --help has Examples", () => {
    expect(hasExamples(helpOutput(["status"]))).toBe(true);
  });
  it("engram visualize --help has Examples", () => {
    expect(hasExamples(helpOutput(["visualize"]))).toBe(true);
  });
  it("engram stats description mentions engram status", () => {
    expect(helpOutput(["stats"])).toContain("engram status");
  });
  it("engram status description mentions engram stats", () => {
    expect(helpOutput(["status"])).toContain("engram stats");
  });
});
