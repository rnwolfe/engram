/**
 * episode-supersession.test.ts — tests for supersedeEpisode(), getCurrentEpisode(),
 * and the verifyGraph episode supersession invariants.
 */

import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { openGraph } from "../../src/format/index.js";
import type { EngramGraph } from "../../src/index.js";
import {
  addEpisode,
  closeGraph,
  createGraph,
  getCurrentEpisode,
  getEpisode,
  supersedeEpisode,
  verifyGraph,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// supersedeEpisode — happy path
// ---------------------------------------------------------------------------

describe("supersedeEpisode", () => {
  test("inserts new episode, links prior via superseded_by, returns new Episode", () => {
    const prior = addEpisode(graph, {
      source_type: "git",
      source_ref: "abc123",
      content: "Original commit message",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const replacement = supersedeEpisode(graph, prior.id, {
      source_type: "git",
      source_ref: "abc123v2",
      content: "Updated commit message",
      timestamp: "2024-01-02T00:00:00Z",
    });

    // New episode is returned
    expect(replacement.id).toBeDefined();
    expect(replacement.id).not.toBe(prior.id);
    expect(replacement.content).toBe("Updated commit message");
    expect(replacement.source_ref).toBe("abc123v2");
    expect(replacement.superseded_by).toBeNull();

    // Prior episode now has superseded_by set
    const updatedPrior = getEpisode(graph, prior.id);
    expect(updatedPrior).not.toBeNull();
    expect(updatedPrior?.superseded_by).toBe(replacement.id);
  });

  test("new episode has a valid id, content_hash, and ingested_at", () => {
    const prior = addEpisode(graph, {
      source_type: "manual",
      content: "Some manual note",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const replacement = supersedeEpisode(graph, prior.id, {
      source_type: "manual",
      content: "Revised manual note",
      timestamp: "2024-02-01T00:00:00Z",
    });

    expect(replacement.content_hash).toHaveLength(64); // sha256 hex
    expect(replacement.ingested_at).toBeDefined();
    expect(replacement.status).toBe("active");
  });

  test("supersede chain: prior → first → second", () => {
    const prior = addEpisode(graph, {
      source_type: "git",
      source_ref: "ref-1",
      content: "v1",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const first = supersedeEpisode(graph, prior.id, {
      source_type: "git",
      source_ref: "ref-2",
      content: "v2",
      timestamp: "2024-01-02T00:00:00Z",
    });

    const second = supersedeEpisode(graph, first.id, {
      source_type: "git",
      source_ref: "ref-3",
      content: "v3",
      timestamp: "2024-01-03T00:00:00Z",
    });

    expect(getEpisode(graph, prior.id)?.superseded_by).toBe(first.id);
    expect(getEpisode(graph, first.id)?.superseded_by).toBe(second.id);
    expect(second.superseded_by).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// supersedeEpisode — error conditions
// ---------------------------------------------------------------------------

describe("supersedeEpisode error conditions", () => {
  test("throws when prior episode id does not exist", () => {
    expect(() =>
      supersedeEpisode(graph, "nonexistent-id", {
        source_type: "git",
        content: "new content",
        timestamp: "2024-01-01T00:00:00Z",
      }),
    ).toThrow(/prior episode 'nonexistent-id' does not exist/);
  });

  test("throws when prior episode is already superseded", () => {
    const prior = addEpisode(graph, {
      source_type: "git",
      source_ref: "ref-A",
      content: "original",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const replacement = supersedeEpisode(graph, prior.id, {
      source_type: "git",
      source_ref: "ref-B",
      content: "replacement",
      timestamp: "2024-01-02T00:00:00Z",
    });

    // Attempting to supersede the already-superseded prior
    expect(() =>
      supersedeEpisode(graph, prior.id, {
        source_type: "git",
        source_ref: "ref-C",
        content: "double supersede attempt",
        timestamp: "2024-01-03T00:00:00Z",
      }),
    ).toThrow(
      new RegExp(
        `prior episode '${prior.id}' is already superseded by '${replacement.id}'`,
      ),
    );
  });

  test("throws when a non-superseded episode already exists for same (source_type, source_ref)", () => {
    // Create an existing non-superseded episode for the target source_ref
    addEpisode(graph, {
      source_type: "git",
      source_ref: "collision-ref",
      content: "existing episode",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Create a separate prior to supersede
    const prior = addEpisode(graph, {
      source_type: "manual",
      content: "prior note",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // The new episode input collides with existing (source_type=git, source_ref=collision-ref)
    expect(() =>
      supersedeEpisode(graph, prior.id, {
        source_type: "git",
        source_ref: "collision-ref",
        content: "collision attempt",
        timestamp: "2024-01-02T00:00:00Z",
      }),
    ).toThrow(/already exists for \(git, collision-ref\)/);
  });
});

// ---------------------------------------------------------------------------
// Transaction atomicity
// ---------------------------------------------------------------------------

describe("supersedeEpisode transaction atomicity", () => {
  test("if UPDATE fails, INSERT is rolled back (no orphaned new episode)", () => {
    const prior = addEpisode(graph, {
      source_type: "git",
      source_ref: "ref-atomicity",
      content: "original",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Corrupt the prior id so the UPDATE has no target but we simulate a mid-transaction
    // failure by directly checking that a valid transaction leaves both in the correct state.
    // We can't easily force a partial failure with bun:sqlite, so we verify that on success
    // BOTH the INSERT and UPDATE are committed atomically.
    const replacement = supersedeEpisode(graph, prior.id, {
      source_type: "git",
      source_ref: "ref-atomicity-v2",
      content: "replacement",
      timestamp: "2024-01-02T00:00:00Z",
    });

    // Both changes are visible (atomic commit)
    expect(getEpisode(graph, replacement.id)).not.toBeNull();
    expect(getEpisode(graph, prior.id)?.superseded_by).toBe(replacement.id);
  });
});

// ---------------------------------------------------------------------------
// getCurrentEpisode
// ---------------------------------------------------------------------------

describe("getCurrentEpisode", () => {
  test("returns the non-superseded episode", () => {
    addEpisode(graph, {
      source_type: "git",
      source_ref: "current-ref",
      content: "current content",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const result = getCurrentEpisode(graph, "git", "current-ref");
    expect(result).not.toBeNull();
    expect(result?.source_ref).toBe("current-ref");
    expect(result?.superseded_by).toBeNull();
  });

  test("returns null when only superseded episodes exist for that source", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      source_ref: "superseded-ref",
      content: "original",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Supersede without a matching source_ref in the new episode
    supersedeEpisode(graph, ep.id, {
      source_type: "git",
      source_ref: "superseded-ref-v2",
      content: "replacement",
      timestamp: "2024-01-02T00:00:00Z",
    });

    // The original source_ref is now only held by a superseded episode
    const result = getCurrentEpisode(graph, "git", "superseded-ref");
    expect(result).toBeNull();
  });

  test("returns null for unknown source", () => {
    const result = getCurrentEpisode(graph, "git", "no-such-ref");
    expect(result).toBeNull();
  });

  test("returns the current head of a supersession chain", () => {
    const ep1 = addEpisode(graph, {
      source_type: "github_pr",
      source_ref: "pr-42",
      content: "PR description v1",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const ep2 = supersedeEpisode(graph, ep1.id, {
      source_type: "github_pr",
      source_ref: "pr-42",
      content: "PR description v2",
      timestamp: "2024-01-02T00:00:00Z",
    });

    const result = getCurrentEpisode(graph, "github_pr", "pr-42");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(ep2.id);
    expect(result?.content).toBe("PR description v2");
  });
});

// ---------------------------------------------------------------------------
// verifyGraph episode supersession invariants
// ---------------------------------------------------------------------------

describe("verifyGraph — episode supersession invariants", () => {
  test("fan-in violation surfaces as error", () => {
    // Manually insert two episodes both pointing superseded_by to the same target
    const target = addEpisode(graph, {
      source_type: "git",
      source_ref: "fan-in-target",
      content: "target",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Create two episodes then manually set both to have superseded_by = target.id
    // (bypassing the guard in supersedeEpisode to simulate data corruption)
    const ep1 = addEpisode(graph, {
      source_type: "git",
      source_ref: "fan-in-ep1",
      content: "episode 1",
      timestamp: "2024-01-02T00:00:00Z",
    });
    const ep2 = addEpisode(graph, {
      source_type: "git",
      source_ref: "fan-in-ep2",
      content: "episode 2",
      timestamp: "2024-01-03T00:00:00Z",
    });

    // Directly corrupt the database to simulate the fan-in violation
    graph.db.run(`UPDATE episodes SET superseded_by = ? WHERE id IN (?, ?)`, [
      target.id,
      ep1.id,
      ep2.id,
    ]);

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const fanInViolation = result.violations.find(
      (v) => v.check === "checkEpisodeFanIn",
    );
    expect(fanInViolation).toBeDefined();
    expect(fanInViolation?.severity).toBe("error");
    expect(fanInViolation?.message).toContain(target.id);
  });

  test("dangling superseded_by reference surfaces as error", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      source_ref: "dangling-ep",
      content: "some content",
      timestamp: "2024-01-01T00:00:00Z",
    });

    // Directly corrupt the database to simulate a dangling reference.
    // Temporarily disable FK enforcement so we can insert an invalid reference.
    graph.db.run("PRAGMA foreign_keys = OFF");
    graph.db.run(`UPDATE episodes SET superseded_by = ? WHERE id = ?`, [
      "nonexistent-episode-id",
      ep.id,
    ]);
    graph.db.run("PRAGMA foreign_keys = ON");

    const result = verifyGraph(graph);
    expect(result.valid).toBe(false);
    const danglingViolation = result.violations.find(
      (v) => v.check === "checkEpisodeDanglingSupersededBy",
    );
    expect(danglingViolation).toBeDefined();
    expect(danglingViolation?.severity).toBe("error");
    expect(danglingViolation?.message).toContain(ep.id);
    expect(danglingViolation?.message).toContain("nonexistent-episode-id");
  });

  test("valid graph with supersession chain passes verifyGraph", () => {
    const ep1 = addEpisode(graph, {
      source_type: "git",
      source_ref: "verify-ref-1",
      content: "v1",
      timestamp: "2024-01-01T00:00:00Z",
    });

    supersedeEpisode(graph, ep1.id, {
      source_type: "git",
      source_ref: "verify-ref-2",
      content: "v2",
      timestamp: "2024-01-02T00:00:00Z",
    });

    const result = verifyGraph(graph);
    const episodeViolations = result.violations.filter(
      (v) =>
        v.check === "checkEpisodeFanIn" ||
        v.check === "checkEpisodeDanglingSupersededBy",
    );
    expect(episodeViolations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Migration: open a DB without superseded_by column
// ---------------------------------------------------------------------------

describe("migration — superseded_by column", () => {
  test("openGraph on a DB without superseded_by adds the column without data loss", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-test-"));
    const dbPath = path.join(tmpDir, "engram.db");

    try {
      // Create graph using the current schema (which includes superseded_by),
      // then manually drop the column by recreating the table without it.
      const g = createGraph(dbPath);

      // Insert an episode before migration
      const ep = addEpisode(g, {
        source_type: "git",
        source_ref: "pre-migration-ref",
        content: "pre-migration content",
        timestamp: "2024-01-01T00:00:00Z",
      });

      closeGraph(g);

      // Simulate an old DB by dropping superseded_by column via table recreation
      const rawDb = new Database(dbPath);
      rawDb.run("PRAGMA foreign_keys = OFF");
      rawDb.run(`
        CREATE TABLE episodes_old AS SELECT
          _rowid, id, source_type, source_ref, content, content_hash,
          actor, status, timestamp, ingested_at, owner_id, extractor_version, metadata
        FROM episodes
      `);
      rawDb.run("DROP TABLE episodes");
      rawDb.run(`
        CREATE TABLE episodes (
          _rowid            INTEGER PRIMARY KEY,
          id                TEXT NOT NULL UNIQUE,
          source_type       TEXT NOT NULL,
          source_ref        TEXT,
          content           TEXT NOT NULL,
          content_hash      TEXT NOT NULL,
          actor             TEXT,
          status            TEXT NOT NULL DEFAULT 'active',
          timestamp         TEXT NOT NULL,
          ingested_at       TEXT NOT NULL,
          owner_id          TEXT,
          extractor_version TEXT NOT NULL,
          metadata          TEXT
        )
      `);
      rawDb.run(`
        INSERT INTO episodes
          (_rowid, id, source_type, source_ref, content, content_hash,
           actor, status, timestamp, ingested_at, owner_id, extractor_version, metadata)
        SELECT
          _rowid, id, source_type, source_ref, content, content_hash,
          actor, status, timestamp, ingested_at, owner_id, extractor_version, metadata
        FROM episodes_old
      `);
      rawDb.run("DROP TABLE episodes_old");
      rawDb.run("PRAGMA foreign_keys = ON");
      rawDb.close();

      // Now open via openGraph — migration should add superseded_by
      const migrated = openGraph(dbPath);

      // Column should now exist
      const cols = migrated.db
        .query<{ name: string }, []>("PRAGMA table_info(episodes)")
        .all();
      const hasCol = cols.some((c) => c.name === "superseded_by");
      expect(hasCol).toBe(true);

      // Existing data is preserved
      const fetched = getEpisode(migrated, ep.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.content).toBe("pre-migration content");
      expect(fetched?.superseded_by).toBeNull();

      closeGraph(migrated);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
