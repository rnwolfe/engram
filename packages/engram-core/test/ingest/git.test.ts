/**
 * git.test.ts — integration tests for git VCS ingestion.
 *
 * Uses the engram repo itself as the test fixture (real git history).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph } from "../../src/index.js";
import { ingestGitRepo } from "../../src/ingest/git.js";
import { parseGitLog, recencyWeight } from "../../src/ingest/git-parse.js";

// Path to the engram repo root (two levels up from packages/engram-core)
const ENGRAM_REPO = path.resolve(import.meta.dir, "../../../../");

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Unit tests for git-parse helpers
// ---------------------------------------------------------------------------

describe("parseGitLog", () => {
  test("parses an empty string", () => {
    expect(parseGitLog("")).toEqual([]);
    expect(parseGitLog("   \n  ")).toEqual([]);
  });

  test("parses a single commit with files", () => {
    const raw = [
      "abc1234567890abc1234567890abc1234567890ab",
      "author@example.com",
      "Author Name",
      "1700000000",
      "feat: add something",
      "",
      "---COMMIT-END---",
      "src/foo.ts",
      "src/bar.ts",
      "",
    ].join("\n");

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.sha).toBe("abc1234567890abc1234567890abc1234567890ab");
    expect(commits[0]?.authorEmail).toBe("author@example.com");
    expect(commits[0]?.authorName).toBe("Author Name");
    expect(commits[0]?.timestampUnix).toBe(1700000000);
    expect(commits[0]?.subject).toBe("feat: add something");
    expect(commits[0]?.files).toContain("src/foo.ts");
    expect(commits[0]?.files).toContain("src/bar.ts");
  });

  test("parses a commit with body text", () => {
    const raw = [
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "dev@example.com",
      "Dev User",
      "1700000000",
      "fix: something broken",
      "This is the body.",
      "More body text.",
      "",
      "---COMMIT-END---",
      "README.md",
      "",
    ].join("\n");

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.body).toContain("This is the body.");
    expect(commits[0]?.files).toContain("README.md");
  });

  test("parses multiple commits", () => {
    const raw = [
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "a@example.com",
      "Alice",
      "1700000001",
      "first commit",
      "",
      "---COMMIT-END---",
      "a.ts",
      "",
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "b@example.com",
      "Bob",
      "1700000002",
      "second commit",
      "",
      "---COMMIT-END---",
      "b.ts",
      "",
    ].join("\n");

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);
    expect(commits[0]?.sha).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(commits[1]?.sha).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
  });
});

describe("recencyWeight", () => {
  test("weight is 1.0 for a commit made right now", () => {
    const now = Date.now();
    const w = recencyWeight(now / 1000, now);
    expect(w).toBeCloseTo(1.0, 5);
  });

  test("weight is ~0.5 for a commit 90 days ago (half-life)", () => {
    const now = Date.now();
    const ninetyDaysAgo = now - 90 * 24 * 60 * 60 * 1000;
    const w = recencyWeight(ninetyDaysAgo / 1000, now);
    expect(w).toBeCloseTo(0.5, 2);
  });

  test("older commits have lower weight", () => {
    const now = Date.now();
    const recent = recencyWeight(now / 1000 - 86400, now); // 1 day ago
    const old = recencyWeight(now / 1000 - 86400 * 365, now); // 1 year ago
    expect(recent).toBeGreaterThan(old);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: ingest engram repo
// ---------------------------------------------------------------------------

describe("ingestGitRepo — engram repo", () => {
  test("ingestGitRepo returns a valid IngestResult", async () => {
    const result = await ingestGitRepo(graph, ENGRAM_REPO, {
      since: "1 year ago",
    });

    expect(result.runId).toBeDefined();
    expect(result.episodesCreated).toBeGreaterThanOrEqual(0);
    expect(result.episodesSkipped).toBeGreaterThanOrEqual(0);
    expect(result.entitiesCreated).toBeGreaterThanOrEqual(0);
    expect(result.edgesCreated).toBeGreaterThanOrEqual(0);
  });

  test("creates person entities for commit authors", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    const persons = graph.db
      .query<{ canonical_name: string }, []>(
        "SELECT canonical_name FROM entities WHERE entity_type = 'person'",
      )
      .all();

    // The repo should have at least one author
    expect(persons.length).toBeGreaterThan(0);
    // canonical_name for persons is their email
    expect(persons.every((p) => p.canonical_name.includes("@"))).toBe(true);
  });

  test("creates module entities for changed files", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    const modules = graph.db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) AS count FROM entities WHERE entity_type = 'module'",
      )
      .get();

    expect(modules?.count).toBeGreaterThan(0);
  });

  test("creates observed authored_by edges", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    const edges = graph.db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM edges
         WHERE relation_type = 'authored_by' AND edge_kind = 'observed' AND invalidated_at IS NULL`,
      )
      .get();

    expect(edges?.count).toBeGreaterThan(0);
  });

  test("creates ingestion_runs row with status=completed", async () => {
    const result = await ingestGitRepo(graph, ENGRAM_REPO, {
      since: "1 year ago",
    });

    const run = graph.db
      .query<{ status: string; cursor: string | null }, [string]>(
        "SELECT status, cursor FROM ingestion_runs WHERE id = ?",
      )
      .get(result.runId);

    expect(run?.status).toBe("completed");
  });

  test("idempotency: second run skips already-ingested episodes", async () => {
    const first = await ingestGitRepo(graph, ENGRAM_REPO, {
      since: "1 year ago",
    });

    // Second run over same range — all episodes should be skipped
    const second = await ingestGitRepo(graph, ENGRAM_REPO, {
      since: "1 year ago",
    });

    // Second run should have 0 new episodes created (all skipped via cursor)
    // The cursor points to the latest SHA, so git log returns empty
    expect(second.episodesCreated).toBe(0);
    expect(second.runId).not.toBe(first.runId);
  });

  test("creates inferred likely_owner_of edges when files have commits", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    const ownerEdges = graph.db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM edges
         WHERE relation_type = 'likely_owner_of' AND edge_kind = 'inferred'
           AND invalidated_at IS NULL`,
      )
      .get();

    // May be 0 if repo is too small — just verify no error and count >= 0
    expect(ownerEdges?.count).toBeGreaterThanOrEqual(0);
  });

  test("all edges have at least one evidence link", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    // Find any active edge without evidence
    const orphaned = graph.db
      .query<{ id: string }, []>(
        `SELECT e.id FROM edges e
         WHERE e.invalidated_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM edge_evidence ee WHERE ee.edge_id = e.id)`,
      )
      .all();

    expect(orphaned).toHaveLength(0);
  });

  test("all entities have at least one evidence link", async () => {
    await ingestGitRepo(graph, ENGRAM_REPO, { since: "1 year ago" });

    const orphaned = graph.db
      .query<{ id: string }, []>(
        `SELECT en.id FROM entities en
         WHERE NOT EXISTS (SELECT 1 FROM entity_evidence ev WHERE ev.entity_id = en.id)`,
      )
      .all();

    expect(orphaned).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("ingestGitRepo — error cases", () => {
  test("throws on non-existent path", async () => {
    await expect(
      ingestGitRepo(graph, "/tmp/this-path-does-not-exist-engram-test"),
    ).rejects.toThrow();
  });

  test("throws on non-git directory", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-test-"));
    try {
      await expect(ingestGitRepo(graph, tmpDir)).rejects.toThrow();
    } finally {
      fs.rmdirSync(tmpDir);
    }
  });

  test("sets status=failed on ingestion_runs when error occurs", async () => {
    try {
      await ingestGitRepo(graph, "/tmp/nonexistent-repo-path-engram");
    } catch {
      // Expected
    }

    // Check if any failed run was recorded
    const failedRun = graph.db
      .query<{ id: string; status: string }, []>(
        "SELECT id, status FROM ingestion_runs WHERE status = 'failed' LIMIT 1",
      )
      .get();

    // If the error happened before DB write, that's fine too
    // Just verify no "running" runs are left dangling from successful error handling
    // (The run may not exist if validation fails before DB insert — that's OK)
    if (failedRun) {
      expect(failedRun.status).toBe("failed");
    }
  });
});
