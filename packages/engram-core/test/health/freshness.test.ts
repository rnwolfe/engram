import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  closeGraph,
  computeFreshness,
  createGraph,
  type EngramGraph,
} from "../../src/index.js";

function tmpDbPath(name: string): string {
  return join(tmpdir(), `engram-freshness-${name}-${crypto.randomUUID()}.db`);
}

function cleanupFiles(paths: string[]): void {
  for (const p of paths) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const full = p + suffix;
      if (existsSync(full)) {
        try {
          unlinkSync(full);
        } catch {
          /* ignore */
        }
      }
    }
  }
}

function insertRun(
  graph: EngramGraph,
  fields: {
    id: string;
    sourceType: string;
    sourceScope: string;
    completedAt: string | null;
    cursor: string | null;
    status?: string;
  },
): void {
  graph.db
    .prepare(
      `INSERT INTO ingestion_runs
         (id, source_type, source_scope, started_at, completed_at, cursor,
          extractor_version, episodes_created, entities_created, edges_created, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?)`,
    )
    .run(
      fields.id,
      fields.sourceType,
      fields.sourceScope,
      fields.completedAt ?? "2026-01-01T00:00:00.000Z",
      fields.completedAt,
      fields.cursor,
      "0.2.0",
      fields.status ?? "completed",
    );
}

describe("computeFreshness — non-git sources (time-based only)", () => {
  const paths: string[] = [];
  let graph: EngramGraph;

  beforeEach(() => {
    const p = tmpDbPath("time");
    paths.push(p);
    graph = createGraph(p);
  });

  afterEach(() => {
    if (graph) closeGraph(graph);
    cleanupFiles(paths);
    paths.length = 0;
  });

  it("reports fresh when the only run is recent", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "github",
      sourceScope: "org/repo",
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: "42",
    });

    const report = computeFreshness(graph, { now });
    expect(report.overall).toBe("fresh");
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0].sourceType).toBe("github");
    expect(report.sources[0].daysSince).toBe(1);
    expect(report.sources[0].commitsBehind).toBeNull();
    expect(report.sources[0].severity).toBe("fresh");
  });

  it("escalates to warn past warnDays, stale past staleDays", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r-warn",
      sourceType: "github",
      sourceScope: "org/a",
      completedAt: "2026-04-13T12:00:00.000Z", // 10 days
      cursor: null,
    });
    insertRun(graph, {
      id: "r-stale",
      sourceType: "source",
      sourceScope: "/tmp/src",
      completedAt: "2026-03-01T12:00:00.000Z", // 53 days
      cursor: null,
    });

    const report = computeFreshness(graph, { now });
    expect(report.overall).toBe("stale");
    const gh = report.sources.find((s) => s.sourceType === "github");
    const src = report.sources.find((s) => s.sourceType === "source");
    expect(gh?.severity).toBe("warn");
    expect(src?.severity).toBe("stale");
  });

  it("keeps only the newest run per (source_type, source_scope)", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "old",
      sourceType: "github",
      sourceScope: "org/a",
      completedAt: "2026-01-01T00:00:00.000Z",
      cursor: "1",
    });
    insertRun(graph, {
      id: "new",
      sourceType: "github",
      sourceScope: "org/a",
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: "42",
    });

    const report = computeFreshness(graph, { now });
    expect(report.sources).toHaveLength(1);
    expect(report.sources[0].daysSince).toBe(1);
  });

  it("ignores failed runs", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "failed",
      sourceType: "github",
      sourceScope: "org/a",
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: null,
      status: "failed",
    });

    const report = computeFreshness(graph, { now });
    expect(report.sources).toHaveLength(0);
    expect(report.overall).toBe("fresh");
  });

  it("respects custom thresholds", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "github",
      sourceScope: "org/a",
      completedAt: "2026-04-21T12:00:00.000Z", // 2 days
      cursor: null,
    });

    const aggressive = computeFreshness(graph, {
      now,
      thresholds: {
        warnDays: 1,
        staleDays: 30,
        warnCommits: 20,
        staleCommits: 100,
      },
    });
    expect(aggressive.sources[0].severity).toBe("warn");
  });
});

describe("computeFreshness — git source (commits-behind)", () => {
  const paths: string[] = [];
  let graph: EngramGraph;
  let repoPath: string;
  let firstSha: string;
  let latestSha: string;

  beforeEach(() => {
    const p = tmpDbPath("git");
    paths.push(p);
    graph = createGraph(p);

    repoPath = mkdtempSync(join(tmpdir(), "engram-freshness-repo-"));
    paths.push(repoPath); // cleanup via cleanupFiles won't handle dirs; track separately below

    const sh = (cmd: string[]) =>
      execFileSync(cmd[0], cmd.slice(1), { cwd: repoPath, stdio: "ignore" });
    sh(["git", "init", "-q", "-b", "main"]);
    sh(["git", "config", "user.email", "test@example.com"]);
    sh(["git", "config", "user.name", "Test"]);
    sh(["git", "commit", "-q", "--allow-empty", "-m", "first"]);
    firstSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    for (let i = 0; i < 3; i++) {
      sh(["git", "commit", "-q", "--allow-empty", "-m", `c${i}`]);
    }
    latestSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
  });

  afterEach(() => {
    if (graph) closeGraph(graph);
    cleanupFiles(paths);
    try {
      rmSync(repoPath, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    paths.length = 0;
  });

  it("returns 0 commits-behind when cursor matches HEAD", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "git",
      sourceScope: `${repoPath}::branch=main`,
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: latestSha,
    });

    const report = computeFreshness(graph, { now });
    expect(report.sources[0].commitsBehind).toBe(0);
    expect(report.sources[0].cursorLost).toBe(false);
    expect(report.sources[0].severity).toBe("fresh");
  });

  it("computes commits-behind when cursor is an older SHA", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "git",
      sourceScope: `${repoPath}::branch=main`,
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: firstSha,
    });

    const report = computeFreshness(graph, { now });
    expect(report.sources[0].commitsBehind).toBe(3);
    expect(report.sources[0].cursorLost).toBe(false);
  });

  it("escalates severity when commit-count exceeds the warn threshold even if days are low", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "git",
      sourceScope: `${repoPath}::branch=main`,
      completedAt: now.toISOString(), // 0 days ago
      cursor: firstSha, // 3 commits behind
    });

    const report = computeFreshness(graph, {
      now,
      thresholds: {
        warnDays: 7,
        staleDays: 30,
        warnCommits: 2,
        staleCommits: 10,
      },
    });
    expect(report.sources[0].severity).toBe("warn");
  });

  it("marks cursorLost when the stored SHA is not in the repo", () => {
    const now = new Date("2026-04-23T12:00:00.000Z");
    insertRun(graph, {
      id: "r1",
      sourceType: "git",
      sourceScope: `${repoPath}::branch=main`,
      completedAt: "2026-04-22T12:00:00.000Z",
      cursor: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });

    const report = computeFreshness(graph, { now });
    expect(report.sources[0].cursorLost).toBe(true);
    expect(report.sources[0].commitsBehind).toBeNull();
    expect(report.sources[0].severity).toBe("stale");
    expect(report.sources[0].reason).toContain("history rewritten");
  });
});
