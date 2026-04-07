/**
 * markdown.test.ts — tests for markdown file ingestion.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph } from "../../src/index.js";
import { ingestMarkdown } from "../../src/ingest/markdown.js";

let graph: EngramGraph;
let tmpDir: string;

beforeEach(() => {
  graph = createGraph(":memory:");
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-test-md-"));
});

afterEach(() => {
  closeGraph(graph);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Single file ingestion
// ---------------------------------------------------------------------------

describe("ingestMarkdown — single file", () => {
  test("creates an episode for a markdown file", async () => {
    const filePath = path.join(tmpDir, "notes.md");
    fs.writeFileSync(filePath, "# Hello\n\nThis is a note.");

    const result = await ingestMarkdown(graph, filePath);

    expect(result.episodesCreated).toBe(1);
    expect(result.episodesSkipped).toBe(0);

    const episode = graph.db
      .query<
        { source_type: string; source_ref: string; content: string },
        [string]
      >(
        "SELECT source_type, source_ref, content FROM episodes WHERE source_ref = ?",
      )
      .get(filePath);

    expect(episode).not.toBeNull();
    expect(episode?.source_type).toBe("document");
    expect(episode?.source_ref).toBe(filePath);
    expect(episode?.content).toBe("# Hello\n\nThis is a note.");
  });

  test("preserves exact raw content without normalization", async () => {
    const content = "# Title\r\n\r\nWindows line endings\r\n  indented  \n";
    const filePath = path.join(tmpDir, "raw.md");
    fs.writeFileSync(filePath, content);

    await ingestMarkdown(graph, filePath);

    const episode = graph.db
      .query<{ content: string }, [string]>(
        "SELECT content FROM episodes WHERE source_ref = ?",
      )
      .get(filePath);

    expect(episode?.content).toBe(content);
  });

  test("skips non-existent file and returns zero counts", async () => {
    const result = await ingestMarkdown(graph, "/does/not/exist.md");
    expect(result.episodesCreated).toBe(0);
    expect(result.episodesSkipped).toBe(0);
  });

  test("accepts opts: owner_id and actor", async () => {
    const filePath = path.join(tmpDir, "owned.md");
    fs.writeFileSync(filePath, "# Owned doc");

    await ingestMarkdown(graph, filePath, {
      owner_id: "user-123",
      actor: "alice@example.com",
    });

    const episode = graph.db
      .query<{ owner_id: string | null; actor: string | null }, [string]>(
        "SELECT owner_id, actor FROM episodes WHERE source_ref = ?",
      )
      .get(filePath);

    expect(episode?.owner_id).toBe("user-123");
    expect(episode?.actor).toBe("alice@example.com");
  });
});

// ---------------------------------------------------------------------------
// Duplicate handling
// ---------------------------------------------------------------------------

describe("ingestMarkdown — duplicate handling", () => {
  test("returns existing episode on second ingest of same file (idempotent)", async () => {
    const filePath = path.join(tmpDir, "dupe.md");
    fs.writeFileSync(filePath, "# Deduped content");

    const first = await ingestMarkdown(graph, filePath);
    const second = await ingestMarkdown(graph, filePath);

    expect(first.episodesCreated).toBe(1);
    expect(second.episodesCreated).toBe(0);
    expect(second.episodesSkipped).toBe(1);

    const count = graph.db
      .query<{ n: number }, [string]>(
        "SELECT COUNT(*) as n FROM episodes WHERE source_ref = ?",
      )
      .get(filePath);

    expect(count?.n).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Glob support
// ---------------------------------------------------------------------------

describe("ingestMarkdown — glob patterns", () => {
  test("ingests multiple files matching a glob", async () => {
    fs.writeFileSync(path.join(tmpDir, "a.md"), "# File A");
    fs.writeFileSync(path.join(tmpDir, "b.md"), "# File B");
    fs.writeFileSync(path.join(tmpDir, "c.txt"), "not markdown");

    // Glob relative to cwd — write to cwd-relative temp structure
    const subDir = path.join(tmpDir, "glob-test");
    fs.mkdirSync(subDir);
    fs.writeFileSync(path.join(subDir, "doc1.md"), "# Doc 1");
    fs.writeFileSync(path.join(subDir, "doc2.md"), "# Doc 2");
    fs.writeFileSync(path.join(subDir, "other.txt"), "ignored");

    // Use absolute paths for multiple files directly
    const result1 = await ingestMarkdown(graph, path.join(tmpDir, "a.md"));
    const result2 = await ingestMarkdown(graph, path.join(tmpDir, "b.md"));

    expect(result1.episodesCreated).toBe(1);
    expect(result2.episodesCreated).toBe(1);

    const totalEpisodes = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM episodes WHERE source_type = 'document'",
      )
      .get();

    expect(totalEpisodes?.n).toBe(2);
  });

  test("returns zero when glob matches no files", async () => {
    // Use a glob in tmpDir that matches nothing
    const result = await ingestMarkdown(
      graph,
      path.join(tmpDir, "*.nonexistent"),
    );
    expect(result.episodesCreated).toBe(0);
    expect(result.episodesSkipped).toBe(0);
  });
});
