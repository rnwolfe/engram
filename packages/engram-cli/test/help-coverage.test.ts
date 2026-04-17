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
  return /Examples:/i.test(help) && /#\s+\S/.test(help);
}

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
