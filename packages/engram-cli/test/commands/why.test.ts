/**
 * why.test.ts — unit and integration tests for the `engram why` command.
 *
 * Tests:
 *   - Target resolution (path, symbol, path:line)
 *   - Structured output format (--no-ai, --format json)
 *   - Token budget capping
 *   - Ambiguous / not-found error paths
 *   - Command registration
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { addEdge, addEntity, addEpisode, createGraph } from "engram-core";
import {
  citationText,
  renderJson,
  renderText,
} from "../../src/commands/_render.js";
import { parseTarget } from "../../src/commands/_retrieval.js";
import { registerWhy } from "../../src/commands/why.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerWhy(program);
  return program;
}

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-why-test-"));
  const dbPath = path.join(tmpDir, "test.engram");
  return { tmpDir, dbPath };
}

/**
 * Capture stdout output from running engram why with given args.
 * Returns { stdout, exitCode }.
 */
async function runWhy(
  dbPath: string,
  target: string,
  extraArgs: string[] = [],
): Promise<{ stdout: string; exitCode: number }> {
  const program = makeProgram();
  const lines: string[] = [];

  const origLog = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };

  let exitCode = 0;
  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process as any).exit = (code?: number) => {
    exitCode = code ?? 0;
    throw new Error(`process.exit(${code})`);
  };

  try {
    await program.parseAsync([
      "node",
      "engram",
      "why",
      target,
      "--db",
      dbPath,
      "--no-ai",
      ...extraArgs,
    ]);
  } catch {
    // expected — process.exit throws
  } finally {
    console.log = origLog;
    process.exit = origExit;
  }

  return { stdout: lines.join("\n"), exitCode };
}

// ---------------------------------------------------------------------------
// parseTarget unit tests
// ---------------------------------------------------------------------------

describe("parseTarget()", () => {
  it("parses a plain path", () => {
    const t = parseTarget("packages/engram-core/src/graph/edges.ts");
    expect(t.kind).toBe("path");
    expect(t.path).toBe("packages/engram-core/src/graph/edges.ts");
  });

  it("parses a path:line target", () => {
    const t = parseTarget("packages/engram-core/src/graph/edges.ts:42");
    expect(t.kind).toBe("path_line");
    expect(t.path).toBe("packages/engram-core/src/graph/edges.ts");
    expect(t.line).toBe(42);
  });

  it("parses a symbol (no path separator, no extension)", () => {
    const t = parseTarget("addEdge");
    expect(t.kind).toBe("symbol");
    expect(t.symbol).toBe("addEdge");
  });

  it("treats a bare filename with extension as path", () => {
    const t = parseTarget("edges.ts");
    expect(t.kind).toBe("path");
    expect(t.path).toBe("edges.ts");
  });

  it("does not parse path:N when N is not a positive integer", () => {
    const t = parseTarget("edges.ts:abc");
    expect(t.kind).toBe("path");
  });

  it("does not parse N=0 as line number", () => {
    const t = parseTarget("edges.ts:0");
    expect(t.kind).toBe("path");
  });
});

// ---------------------------------------------------------------------------
// Citation renderer unit tests
// ---------------------------------------------------------------------------

describe("citationText()", () => {
  it("renders [E:<ulid>]", () => {
    expect(citationText("01J9V0ABCDE")).toBe("[E:01J9V0ABCDE]");
  });
});

describe("renderJson()", () => {
  it("produces target, evidence, citations, truncated fields", () => {
    const digest = {
      target: "edges.ts",
      introducing_episode: {
        episode_id: "EP001",
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-01T00:00:00Z",
        excerpt: "Initial edges implementation",
      },
      co_change_neighbors: [
        { canonical_name: "episodes.ts", weight: 10 },
        { canonical_name: "evidence.ts", weight: 5 },
      ],
      ownership: [
        { fact: "Alice owns edges.ts", valid_from: "2026-01-01T00:00:00Z" },
      ],
      recent_prs: [
        {
          episode_id: "EP002",
          source_type: "github_pr",
          source_ref: "15",
          actor: "Alice",
          timestamp: "2026-02-01T00:00:00Z",
          excerpt: "Add edge supersession",
        },
      ],
      projections: [],
      truncated: false,
      token_budget_used: 100,
    };

    const json = renderJson(digest);
    expect(json.target).toBe("edges.ts");
    expect(json.truncated).toBe(false);
    expect(json.evidence.episodes.length).toBe(2);
    expect(json.evidence.episodes[0].role).toBe("introducing");
    expect(json.evidence.episodes[1].role).toBe("pr");
    expect(json.citations.length).toBe(2);
    expect(json.evidence.edges.length).toBe(3); // 2 co-change + 1 ownership
  });

  it("includes narrative when provided", () => {
    const digest = {
      target: "edges.ts",
      introducing_episode: null,
      co_change_neighbors: [],
      ownership: [],
      recent_prs: [],
      projections: [],
      truncated: false,
      token_budget_used: 0,
    };
    const json = renderJson(digest, undefined, "This is a narrative.");
    expect(json.narrative).toBe("This is a narrative.");
  });
});

// ---------------------------------------------------------------------------
// renderText unit tests
// ---------------------------------------------------------------------------

describe("renderText()", () => {
  it("renders introducing episode section", () => {
    const digest = {
      target: "packages/engram-core/src/graph/edges.ts",
      introducing_episode: {
        episode_id: "EP001",
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Ryan Wolfe",
        timestamp: "2026-01-14T00:00:00Z",
        excerpt: "feat: initial edges implementation",
      },
      co_change_neighbors: [],
      ownership: [],
      recent_prs: [],
      projections: [],
      truncated: false,
      token_budget_used: 50,
    };
    const text = renderText(digest, true);
    expect(text).toContain("edges.ts");
    expect(text).toContain("Introduced");
    expect(text).toContain("[E:EP001]");
  });

  it("renders co-change neighbors section", () => {
    const digest = {
      target: "edges.ts",
      introducing_episode: null,
      co_change_neighbors: [
        { canonical_name: "episodes.ts", weight: 18 },
        { canonical_name: "evidence.ts", weight: 12 },
      ],
      ownership: [],
      recent_prs: [],
      projections: [],
      truncated: false,
      token_budget_used: 30,
    };
    const text = renderText(digest, true);
    expect(text).toContain("co-change");
    expect(text).toContain("episodes.ts");
    expect(text).toContain("18×");
  });

  it("includes truncation note when truncated=true", () => {
    const digest = {
      target: "edges.ts",
      introducing_episode: null,
      co_change_neighbors: [],
      ownership: [],
      recent_prs: [],
      projections: [],
      truncated: true,
      token_budget_used: 4000,
    };
    const text = renderText(digest, true);
    expect(text).toContain("token budget");
  });
});

// ---------------------------------------------------------------------------
// Integration tests against a real in-memory graph
// ---------------------------------------------------------------------------

describe("engram why — integration (populated graph)", () => {
  it("resolves a file entity and returns introducing episode", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      // Build a graph with one file entity and a git_commit episode
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: initial edges implementation",
      });
      addEntity(
        graph,
        {
          canonical_name: "packages/engram-core/src/graph/edges.ts",
          entity_type: "file",
        },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      const { stdout, exitCode } = await runWhy(
        dbPath,
        "packages/engram-core/src/graph/edges.ts",
      );
      expect(exitCode).toBe(0);
      expect(stdout).toContain("edges.ts");
      expect(stdout).toContain("Introduced");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("resolves a symbol entity", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: add addEdge function",
      });
      addEntity(
        graph,
        {
          canonical_name: "packages/engram-core/src/graph/edges.ts::addEdge",
          entity_type: "function",
        },
        [{ episode_id: ep.id, extractor: "source_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      const { stdout, exitCode } = await runWhy(dbPath, "addEdge");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("addEdge");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits 1 with error when target not found", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      createGraph(dbPath).db.close();
      const { exitCode } = await runWhy(dbPath, "nonexistent/file.ts");
      expect(exitCode).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("exits 2 with disambiguation list for ambiguous symbol", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: add functions",
      });
      // Create two entities that both end with ::process
      addEntity(
        graph,
        {
          canonical_name: "pkg/foo.ts::process",
          entity_type: "function",
        },
        [{ episode_id: ep.id, extractor: "source_ingest", confidence: 1.0 }],
      );
      addEntity(
        graph,
        {
          canonical_name: "pkg/bar.ts::process",
          entity_type: "function",
        },
        [{ episode_id: ep.id, extractor: "source_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      const { exitCode } = await runWhy(dbPath, "process");
      expect(exitCode).toBe(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("--format json produces valid JSON with expected shape", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: initial file",
      });
      addEntity(
        graph,
        {
          canonical_name: "src/index.ts",
          entity_type: "file",
        },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      const { stdout, exitCode } = await runWhy(dbPath, "src/index.ts", [
        "--format",
        "json",
      ]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.target).toBe("src/index.ts");
      expect(parsed).toHaveProperty("evidence");
      expect(parsed).toHaveProperty("citations");
      expect(parsed).toHaveProperty("truncated");
      expect(parsed).toHaveProperty("token_budget_used");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("--token-budget 0 disables capping (no truncation)", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: initial file",
      });
      addEntity(
        graph,
        {
          canonical_name: "src/index.ts",
          entity_type: "file",
        },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      const { stdout, exitCode } = await runWhy(dbPath, "src/index.ts", [
        "--format",
        "json",
        "--token-budget",
        "0",
      ]);
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.truncated).toBe(false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("includes co-change neighbors when edges exist", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: add files",
      });
      const fileA = addEntity(
        graph,
        { canonical_name: "src/a.ts", entity_type: "file" },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      const fileB = addEntity(
        graph,
        { canonical_name: "src/b.ts", entity_type: "file" },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      addEdge(
        graph,
        {
          source_id: fileA.id,
          target_id: fileB.id,
          relation_type: "co_changes_with",
          edge_kind: "inferred",
          fact: "src/a.ts co_changes_with src/b.ts",
          weight: 7,
        },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 0.9 }],
      );
      graph.db.close();

      const { stdout, exitCode } = await runWhy(dbPath, "src/a.ts");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("co-change");
      expect(stdout).toContain("src/b.ts");
      expect(stdout).toContain("7×");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("path:line target resolves to file entity", async () => {
    const { tmpDir, dbPath } = tmpDb();
    try {
      const graph = createGraph(dbPath);
      const ep = addEpisode(graph, {
        source_type: "git_commit",
        source_ref: "abc1234",
        actor: "Alice",
        timestamp: "2026-01-14T00:00:00Z",
        content: "feat: initial file",
      });
      addEntity(
        graph,
        { canonical_name: "src/index.ts", entity_type: "file" },
        [{ episode_id: ep.id, extractor: "git_ingest", confidence: 1.0 }],
      );
      graph.db.close();

      // path:line is parsed as path_line → resolved to path entity
      const { stdout, exitCode } = await runWhy(dbPath, "src/index.ts:10");
      expect(exitCode).toBe(0);
      expect(stdout).toContain("index.ts");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Command registration test
// ---------------------------------------------------------------------------

describe("why command registration", () => {
  it("registers the 'why' command", () => {
    const program = makeProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("why");
  });
});
