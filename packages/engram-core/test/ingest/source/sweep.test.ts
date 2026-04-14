/**
 * Integration tests for the sweep phase of ingestSource() — issue #101.
 *
 * Verifies that episodes for files deleted from the walk root are archived,
 * that scope enforcement prevents cross-root archiving, and that re-adding
 * a deleted file creates a fresh episode while the archived one stays put.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/format/index.js";
import {
  closeGraph,
  createGraph,
  verifyGraph,
} from "../../../src/format/index.js";
import { ingestSource } from "../../../src/ingest/source/index.js";

// ---------------------------------------------------------------------------
// Test lifecycle — uses a mutable temp fixture (not the shared source-sample)
// ---------------------------------------------------------------------------

let tmpDir: string;
let graphPath: string;
let graph: EngramGraph;
let fixtureDir: string;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-sweep-test-"));
  graphPath = path.join(tmpDir, "test.engram");
  graph = await createGraph(graphPath);
  // Create a mutable fixture directory inside tmpDir
  fixtureDir = path.join(tmpDir, "src");
  fs.mkdirSync(fixtureDir, { recursive: true });
});

afterEach(async () => {
  closeGraph(graph);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeFile(relPath: string, content: string) {
  const abs = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

function deleteFile(relPath: string) {
  fs.rmSync(path.join(tmpDir, relPath), { force: true });
}

function activeEpisodes(graph: EngramGraph) {
  return graph.db
    .query<{ id: string; source_ref: string }, []>(
      `SELECT id, source_ref FROM episodes WHERE source_type = 'source' AND status = 'active'`,
    )
    .all();
}

function archivedEpisodes(graph: EngramGraph) {
  return graph.db
    .query<{ id: string; source_ref: string }, []>(
      `SELECT id, source_ref FROM episodes WHERE source_type = 'source' AND status = 'archived'`,
    )
    .all();
}

// ---------------------------------------------------------------------------
// Sweep tests
// ---------------------------------------------------------------------------

describe("sweep phase — deleted file archiving", () => {
  test("removing a file from the fixture archives its episode on re-ingest", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/b.ts", "export const b = 2;");

    // First ingest — both files get active episodes
    await ingestSource(graph, { root: tmpDir });
    expect(activeEpisodes(graph).length).toBe(2);
    expect(archivedEpisodes(graph).length).toBe(0);

    // Delete one file
    deleteFile("src/b.ts");

    // Re-ingest — a.ts is fast-pathed (unchanged), b.ts gets archived
    const result = await ingestSource(graph, { root: tmpDir });
    expect(result.deletedArchived).toBe(1);

    const active = activeEpisodes(graph);
    const archived = archivedEpisodes(graph);
    expect(active.length).toBe(1);
    expect(active[0].source_ref).toMatch(/^src\/a\.ts@/);
    expect(archived.length).toBe(1);
    expect(archived[0].source_ref).toMatch(/^src\/b\.ts@/);
  }, 15_000);

  test("deletedArchived count matches number of deleted files", async () => {
    writeFile("src/x.ts", "export const x = 1;");
    writeFile("src/y.ts", "export const y = 2;");
    writeFile("src/z.ts", "export const z = 3;");

    await ingestSource(graph, { root: tmpDir });

    deleteFile("src/x.ts");
    deleteFile("src/y.ts");

    const result = await ingestSource(graph, { root: tmpDir });
    expect(result.deletedArchived).toBe(2);
    expect(archivedEpisodes(graph).length).toBe(2);
    expect(activeEpisodes(graph).length).toBe(1);
  }, 15_000);

  test("scope enforcement: episodes from a different walk_root are not archived", async () => {
    // Two separate roots — each has one file
    const rootA = path.join(tmpDir, "rootA");
    const rootB = path.join(tmpDir, "rootB");
    fs.mkdirSync(rootA);
    fs.mkdirSync(rootB);
    fs.writeFileSync(path.join(rootA, "a.ts"), "export const a = 1;");
    fs.writeFileSync(path.join(rootB, "b.ts"), "export const b = 2;");

    // Ingest both roots independently
    await ingestSource(graph, { root: rootA });
    await ingestSource(graph, { root: rootB });
    expect(activeEpisodes(graph).length).toBe(2);

    // Re-ingest rootA only — rootB's episode must NOT be archived
    const result = await ingestSource(graph, { root: rootA });
    expect(result.deletedArchived).toBe(0);
    expect(archivedEpisodes(graph).length).toBe(0);
    expect(activeEpisodes(graph).length).toBe(2);
  }, 15_000);

  test("re-adding a deleted file creates a new episode; archived episode stays archived", async () => {
    writeFile("src/a.ts", "export const a = 1;");

    await ingestSource(graph, { root: tmpDir });
    const firstEps = activeEpisodes(graph);
    expect(firstEps.length).toBe(1);
    const firstEpId = firstEps[0].id;

    // Delete then re-ingest to archive
    deleteFile("src/a.ts");
    await ingestSource(graph, { root: tmpDir });
    expect(archivedEpisodes(graph).length).toBe(1);
    expect(archivedEpisodes(graph)[0].id).toBe(firstEpId);

    // Re-add the file with different content
    writeFile("src/a.ts", "export const a = 42; // changed");
    const result = await ingestSource(graph, { root: tmpDir });

    // A brand-new active episode; the archived one is unchanged
    expect(result.episodesCreated).toBe(1);
    const active = activeEpisodes(graph);
    expect(active.length).toBe(1);
    expect(active[0].id).not.toBe(firstEpId);
    expect(archivedEpisodes(graph).length).toBe(1);
    expect(archivedEpisodes(graph)[0].id).toBe(firstEpId);
  }, 15_000);

  test("verifyGraph passes after sweep", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/b.ts", "export const b = 2;");

    await ingestSource(graph, { root: tmpDir });

    deleteFile("src/b.ts");
    await ingestSource(graph, { root: tmpDir });

    const { valid, violations } = verifyGraph(graph);
    expect(valid).toBe(true);
    expect(violations).toEqual([]);
  }, 15_000);

  test("dryRun reports deletedArchived count without writing", async () => {
    writeFile("src/a.ts", "export const a = 1;");
    writeFile("src/b.ts", "export const b = 2;");

    await ingestSource(graph, { root: tmpDir });
    deleteFile("src/b.ts");

    const result = await ingestSource(graph, { root: tmpDir, dryRun: true });
    expect(result.deletedArchived).toBe(1);

    // No actual archiving should have occurred
    expect(archivedEpisodes(graph).length).toBe(0);
    expect(activeEpisodes(graph).length).toBe(2);
  }, 15_000);
});
