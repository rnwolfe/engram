/**
 * text.test.ts — tests for plain text ingestion.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph } from "../../src/index.js";
import { ingestText } from "../../src/ingest/text.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Basic ingestion
// ---------------------------------------------------------------------------

describe("ingestText — basic", () => {
  test("creates an episode with source_type='manual'", async () => {
    const result = await ingestText(graph, "Hello world");

    expect(result.episodesCreated).toBe(1);
    expect(result.episodesSkipped).toBe(0);

    const episode = graph.db
      .query<{ source_type: string; content: string }, []>(
        "SELECT source_type, content FROM episodes LIMIT 1",
      )
      .get();

    expect(episode?.source_type).toBe("manual");
    expect(episode?.content).toBe("Hello world");
  });

  test("preserves exact raw content without normalization", async () => {
    const content = "  leading spaces\nand\r\nnewlines\t\ttabs  ";
    const result = await ingestText(graph, content);

    expect(result.episodesCreated).toBe(1);

    const episode = graph.db
      .query<{ content: string }, []>("SELECT content FROM episodes LIMIT 1")
      .get();

    expect(episode?.content).toBe(content);
  });

  test("uses provided timestamp", async () => {
    const ts = "2024-01-15T10:00:00.000Z";
    await ingestText(graph, "timestamped content", { timestamp: ts });

    const episode = graph.db
      .query<{ timestamp: string }, []>(
        "SELECT timestamp FROM episodes LIMIT 1",
      )
      .get();

    expect(episode?.timestamp).toBe(ts);
  });

  test("defaults timestamp to now when not provided", async () => {
    const before = new Date().toISOString();
    await ingestText(graph, "auto timestamp");
    const after = new Date().toISOString();

    const episode = graph.db
      .query<{ timestamp: string }, []>(
        "SELECT timestamp FROM episodes LIMIT 1",
      )
      .get();

    // ISO8601 strings are lexicographically comparable
    expect(episode?.timestamp >= before).toBe(true);
    expect(episode?.timestamp <= after).toBe(true);
  });

  test("accepts opts: owner_id, actor", async () => {
    await ingestText(graph, "owned text", {
      owner_id: "user-abc",
      actor: "bob@example.com",
    });

    const episode = graph.db
      .query<{ owner_id: string | null; actor: string | null }, []>(
        "SELECT owner_id, actor FROM episodes LIMIT 1",
      )
      .get();

    expect(episode?.owner_id).toBe("user-abc");
    expect(episode?.actor).toBe("bob@example.com");
  });
});

// ---------------------------------------------------------------------------
// source_ref dedup
// ---------------------------------------------------------------------------

describe("ingestText — with source_ref", () => {
  test("deduplicates by source_ref (same ref = skip)", async () => {
    const first = await ingestText(graph, "original content", {
      source_ref: "note://my-note",
    });
    const second = await ingestText(graph, "different content", {
      source_ref: "note://my-note",
    });

    expect(first.episodesCreated).toBe(1);
    expect(second.episodesCreated).toBe(0);
    expect(second.episodesSkipped).toBe(1);

    const count = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM episodes WHERE source_type = 'manual'",
      )
      .get();

    expect(count?.n).toBe(1);

    // Verify original content is preserved
    const episode = graph.db
      .query<{ content: string }, []>(
        "SELECT content FROM episodes WHERE source_type = 'manual' LIMIT 1",
      )
      .get();
    expect(episode?.content).toBe("original content");
  });

  test("different source_refs create separate episodes", async () => {
    await ingestText(graph, "note A", { source_ref: "note://a" });
    await ingestText(graph, "note B", { source_ref: "note://b" });

    const count = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM episodes WHERE source_type = 'manual'",
      )
      .get();

    expect(count?.n).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Without source_ref (advisory dedup)
// ---------------------------------------------------------------------------

describe("ingestText — without source_ref", () => {
  test("creates episode even when content hash matches existing", async () => {
    const content = "duplicate text content";
    const first = await ingestText(graph, content);
    // Second call without source_ref — advisory warning but still creates
    const second = await ingestText(graph, content);

    expect(first.episodesCreated).toBe(1);
    expect(second.episodesCreated).toBe(1); // Creates new episode (advisory only)

    const count = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) as n FROM episodes WHERE source_type = 'manual'",
      )
      .get();

    expect(count?.n).toBe(2);
  });

  test("source_ref=null episodes have null source_ref in DB", async () => {
    await ingestText(graph, "no ref content");

    const episode = graph.db
      .query<{ source_ref: string | null }, []>(
        "SELECT source_ref FROM episodes WHERE source_type = 'manual' LIMIT 1",
      )
      .get();

    expect(episode?.source_ref).toBeNull();
  });
});
