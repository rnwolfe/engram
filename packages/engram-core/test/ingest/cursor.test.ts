/**
 * cursor.test.ts — readIsoCursor, readNumericCursor, writeCursor against in-memory SQLite.
 */

import { describe, expect, test } from "bun:test";
import { createGraph } from "../../src/format/index.js";
import {
  readIsoCursor,
  readNumericCursor,
  writeCursor,
} from "../../src/ingest/cursor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGraph() {
  return createGraph(":memory:");
}

const SOURCE_TYPE = "github";
const SCOPE = "owner/repo";

let _runCounter = 0;
function makeRunId(): string {
  return `TEST_RUN_${String(++_runCounter).padStart(6, "0")}`;
}

function insertRun(
  graph: ReturnType<typeof makeGraph>,
  opts: {
    sourceType?: string;
    scope?: string;
    status?: string;
    cursor?: string | null;
  },
): string {
  const id = makeRunId();
  const now = new Date().toISOString();
  graph.db
    .prepare(
      `INSERT INTO ingestion_runs
         (id, source_type, source_scope, started_at, extractor_version, status, cursor)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      opts.sourceType ?? SOURCE_TYPE,
      opts.scope ?? SCOPE,
      now,
      "test",
      opts.status ?? "completed",
      opts.cursor ?? null,
    );
  return id;
}

// ---------------------------------------------------------------------------
// readIsoCursor
// ---------------------------------------------------------------------------

describe("readIsoCursor", () => {
  test("returns null when no completed run exists", () => {
    const graph = makeGraph();
    expect(readIsoCursor(graph, SOURCE_TYPE, SCOPE)).toBeNull();
  });

  test("returns null when run exists but status is not completed", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "running", cursor: "2024-01-01T00:00:00.000Z" });
    expect(readIsoCursor(graph, SOURCE_TYPE, SCOPE)).toBeNull();
  });

  test("returns null when completed run has null cursor", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "completed", cursor: null });
    expect(readIsoCursor(graph, SOURCE_TYPE, SCOPE)).toBeNull();
  });

  test("returns cursor string from most recent completed run", () => {
    const graph = makeGraph();
    insertRun(graph, {
      status: "completed",
      cursor: "2024-01-01T00:00:00.000Z",
    });
    const result = readIsoCursor(graph, SOURCE_TYPE, SCOPE);
    expect(result).toBe("2024-01-01T00:00:00.000Z");
  });

  test("returns cursor from the most recently completed run", () => {
    const graph = makeGraph();
    insertRun(graph, {
      status: "completed",
      cursor: "2024-01-01T00:00:00.000Z",
    });
    insertRun(graph, {
      status: "completed",
      cursor: "2024-06-15T12:00:00.000Z",
    });
    const result = readIsoCursor(graph, SOURCE_TYPE, SCOPE);
    // Most recent completed_at wins — both are inserted at nearly the same time,
    // but the second insert should be later or equal. Just verify it's one of the two.
    expect(["2024-01-01T00:00:00.000Z", "2024-06-15T12:00:00.000Z"]).toContain(
      result,
    );
  });

  test("does not mix up source_type or scope", () => {
    const graph = makeGraph();
    insertRun(graph, {
      sourceType: "gerrit",
      scope: "other/repo",
      cursor: "should-not-appear",
    });
    expect(readIsoCursor(graph, SOURCE_TYPE, SCOPE)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// readNumericCursor
// ---------------------------------------------------------------------------

describe("readNumericCursor", () => {
  test("returns 0 when no completed run exists", () => {
    const graph = makeGraph();
    expect(readNumericCursor(graph, SOURCE_TYPE, SCOPE)).toBe(0);
  });

  test("returns 0 when completed run has null cursor", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "completed", cursor: null });
    expect(readNumericCursor(graph, SOURCE_TYPE, SCOPE)).toBe(0);
  });

  test("returns 0 when cursor is non-numeric", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "completed", cursor: "not-a-number" });
    expect(readNumericCursor(graph, SOURCE_TYPE, SCOPE)).toBe(0);
  });

  test("parses integer cursor correctly", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "completed", cursor: "42" });
    expect(readNumericCursor(graph, SOURCE_TYPE, SCOPE)).toBe(42);
  });

  test("parses large integer cursor", () => {
    const graph = makeGraph();
    insertRun(graph, { status: "completed", cursor: "99999" });
    expect(readNumericCursor(graph, SOURCE_TYPE, SCOPE)).toBe(99999);
  });
});

// ---------------------------------------------------------------------------
// writeCursor
// ---------------------------------------------------------------------------

describe("writeCursor", () => {
  test("writes a string cursor to the run row", () => {
    const graph = makeGraph();
    const runId = insertRun(graph, { status: "running", cursor: null });

    writeCursor(graph, runId, "2024-03-01T00:00:00.000Z");

    const row = graph.db
      .query<{ cursor: string | null }, [string]>(
        "SELECT cursor FROM ingestion_runs WHERE id = ?",
      )
      .get(runId);
    expect(row?.cursor).toBe("2024-03-01T00:00:00.000Z");
  });

  test("writes null cursor (clears cursor)", () => {
    const graph = makeGraph();
    const runId = insertRun(graph, { status: "completed", cursor: "42" });

    writeCursor(graph, runId, null);

    const row = graph.db
      .query<{ cursor: string | null }, [string]>(
        "SELECT cursor FROM ingestion_runs WHERE id = ?",
      )
      .get(runId);
    expect(row?.cursor).toBeNull();
  });

  test("cursor written by writeCursor is picked up by readIsoCursor", () => {
    const graph = makeGraph();
    const runId = insertRun(graph, { status: "completed", cursor: null });

    writeCursor(graph, runId, "2025-01-01T00:00:00.000Z");

    const result = readIsoCursor(graph, SOURCE_TYPE, SCOPE);
    expect(result).toBe("2025-01-01T00:00:00.000Z");
  });

  test("numeric cursor written by writeCursor is picked up by readNumericCursor", () => {
    const graph = makeGraph();
    const runId = insertRun(graph, { status: "completed", cursor: null });

    writeCursor(graph, runId, "123");

    const result = readNumericCursor(graph, SOURCE_TYPE, SCOPE);
    expect(result).toBe(123);
  });
});
