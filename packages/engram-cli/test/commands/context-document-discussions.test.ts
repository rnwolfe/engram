/**
 * context-document-discussions.test.ts
 *
 * Regression for the wow-moment retrieval fixes (2026-06-29): design-doc
 * (`source_type='document'`) episodes must surface in the "Possibly relevant
 * discussions" section, and a query that matches a deep section of a long doc
 * must excerpt THAT section (query-windowed), not the file head.
 *
 * Before the fix: `searchEpisodesDirectly` filtered to PR/issue/commit, so docs
 * never appeared; and excerpts were `slice(0, limit)`, so only the file head
 * showed. A current decision buried deep in a decision record was unreachable.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { addEpisode, closeGraph, createGraph } from "engram-core";
import { registerContext } from "../../src/commands/context.js";

async function runContextStdout(
  dbPath: string,
  query: string,
): Promise<string> {
  const program = new Command().exitOverride();
  registerContext(program);

  const writes: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    writes.push(args.map((a) => String(a)).join(" "));
  };
  try {
    await program.parseAsync(
      ["node", "engram", "context", query, "--db", dbPath],
      { from: "node" },
    );
  } finally {
    console.log = origLog;
  }
  return writes.join("\n");
}

describe("context — document discussions + query windowing", () => {
  it("surfaces a deep doc section that matches the query, not the file head", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-ctx-doc-"));
    const dbPath = path.join(tmpDir, "test.engram");
    try {
      const graph = createGraph(dbPath);

      // A long decision record. The query-relevant content (zorptulate) is in
      // a deep section; the file head is about an unrelated topic.
      const padding = "Filler sentence about unrelated background. ".repeat(40);
      const doc = [
        "# Decision Record",
        "",
        "## ADR-001 early decision about widgets",
        "",
        padding,
        "We chose widgets over gadgets for the frobnicator subsystem.",
        padding,
        "",
        "## ADR-009 the zorptulate reversal",
        "",
        "Decision: reverse the earlier ban and adopt zorptulate as the current",
        "approach. This supersedes the widget decision.",
        padding,
        "",
      ].join("\n");
      // One whole-file `document` episode (the windowing case): the excerpt
      // must window onto the deep matching section, not the file head.
      addEpisode(graph, {
        source_type: "document",
        source_ref: path.join(tmpDir, "DECISIONS.md"),
        content: doc,
        timestamp: "2026-06-29T00:00:00.000Z",
      });
      // A second, unrelated doc so FTS rank normalization has a range.
      addEpisode(graph, {
        source_type: "document",
        source_ref: path.join(tmpDir, "OTHER.md"),
        content:
          "# Other\n\n## Unrelated\n\nA note about quokkas and platypuses.",
        timestamp: "2026-06-28T00:00:00.000Z",
      });
      closeGraph(graph);

      const out = await runContextStdout(dbPath, "zorptulate reversal");

      // The doc surfaces as a discussion...
      expect(out).toContain("Possibly relevant discussions");
      expect(out).toContain("document");
      // ...and the excerpt is the matching (deep) section, carrying the answer.
      expect(out.toLowerCase()).toContain("zorptulate");
      expect(out).toContain("reverse the earlier ban");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
