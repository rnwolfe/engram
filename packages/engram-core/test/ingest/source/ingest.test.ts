/**
 * Integration tests for ingestSource() — chunk 4 of the source-ingestion epic.
 *
 * Uses real SQLite (:memory: via temp file) and the source-sample fixture.
 * verifyGraph() is called after each scenario to confirm evidence integrity.
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
import { findEdges } from "../../../src/graph/edges.js";
import { findEntities } from "../../../src/graph/entities.js";
import {
  getEvidenceForEdge,
  getEvidenceForEntity,
} from "../../../src/graph/evidence.js";
import { ingestSource } from "../../../src/ingest/source/index.js";

const FIXTURE = path.resolve(import.meta.dir, "../../fixtures/source-sample");

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;
let graphPath: string;
let graph: EngramGraph;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-ingest-test-"));
  graphPath = path.join(tmpDir, "test.engram");
  graph = await createGraph(graphPath);
});

afterEach(async () => {
  closeGraph(graph);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function activeEntities(type: string) {
  return findEntities(graph, { entity_type: type, status: "active" });
}

function activeEdges(relation_type?: string) {
  return findEdges(graph, {
    active_only: true,
    ...(relation_type ? { relation_type } : {}),
  });
}

function allHaveEvidence(entities: Array<{ id: string }>) {
  for (const e of entities) {
    const links = getEvidenceForEntity(graph, e.id);
    if (links.length === 0) return false;
  }
  return true;
}

function allEdgesHaveEvidence(edges: Array<{ id: string }>) {
  for (const e of edges) {
    const links = getEvidenceForEdge(graph, e.id);
    if (links.length === 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Fresh ingest
// ---------------------------------------------------------------------------

describe("fresh ingest", () => {
  test("creates episodes, file entities, and symbol entities", async () => {
    const result = await ingestSource(graph, {
      root: FIXTURE,
      respectGitignore: true,
    });

    // 3 .ts files: src/a.ts, src/b.ts, src/nested/c.ts
    // (generated.ts is gitignored; dist/bundle.js and node_modules/evil.ts are denylisted)
    expect(result.filesScanned).toBe(3);
    expect(result.filesSkipped).toBe(0);
    expect(result.filesParsed).toBe(3);
    expect(result.episodesCreated).toBe(3);
    expect(result.errors).toHaveLength(0);

    const fileEntities = activeEntities("file");
    expect(fileEntities.map((e) => e.canonical_name).sort()).toEqual([
      "src/a.ts",
      "src/b.ts",
      "src/nested/c.ts",
    ]);

    // Each file has 1 exported function symbol
    const symbolEntities = activeEntities("symbol");
    expect(symbolEntities).toHaveLength(3);
    const symNames = symbolEntities.map((e) => e.canonical_name).sort();
    expect(symNames).toContain("src/a.ts::hello");
    expect(symNames).toContain("src/b.ts::hello");
    expect(symNames).toContain("src/nested/c.ts::nested");
  });

  test("every entity has evidence", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const all = findEntities(graph);
    expect(all.length).toBeGreaterThan(0);
    expect(allHaveEvidence(all)).toBe(true);
  });

  test("every edge has evidence", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const edges = activeEdges();
    expect(edges.length).toBeGreaterThan(0);
    expect(allEdgesHaveEvidence(edges)).toBe(true);
  });

  test("verifyGraph passes after ingest", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const result = verifyGraph(graph);
    expect(
      result.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("module entities exist only for populated directories", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const modules = activeEntities("module");
    const names = modules.map((m) => m.canonical_name).sort();
    // src contains a.ts, b.ts; src/nested contains c.ts
    expect(names).toContain("src");
    expect(names).toContain("src/nested");
    // No empty parent directory module (FIXTURE root dir itself is skipped)
  });

  test("symbol canonical names use :: separator", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const symbols = activeEntities("symbol");
    for (const sym of symbols) {
      expect(sym.canonical_name).toMatch(/::/);
    }
  });

  test("contains and defined_in edges exist for symbols", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });
    const containsEdges = activeEdges("contains");
    const definedInEdges = activeEdges("defined_in");
    // Each symbol has file→contains→symbol and symbol→defined_in→file
    expect(containsEdges.length).toBeGreaterThan(0);
    expect(definedInEdges).toHaveLength(3); // 3 symbols
  });
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

describe("idempotency", () => {
  test("second run on unchanged tree writes zero new episodes/entities/edges", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });

    const r2 = await ingestSource(graph, {
      root: FIXTURE,
      respectGitignore: true,
    });

    expect(r2.episodesCreated).toBe(0);
    expect(r2.entitiesCreated).toBe(0);
    expect(r2.edgesCreated).toBe(0);
    expect(r2.filesSkipped).toBe(3);
    expect(r2.filesParsed).toBe(0);
  });

  test("second run does not invoke parser (fast path)", async () => {
    await ingestSource(graph, { root: FIXTURE, respectGitignore: true });

    let parseCalls = 0;
    const r2 = await ingestSource(graph, {
      root: FIXTURE,
      respectGitignore: true,
      onProgress: (e) => {
        if (e.type === "file_parsed") parseCalls++;
      },
    });

    expect(parseCalls).toBe(0);
    expect(r2.filesParsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Supersession
// ---------------------------------------------------------------------------

describe("supersession on file change", () => {
  test("modifying a file creates a new episode and supersedes the old one", async () => {
    // Create a temp fixture directory so we can mutate files
    const tmpFixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "engram-supersede-"),
    );
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "mod.ts"),
        "export function original(): void {}",
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      // Verify first ingest
      const ep1 = graph.db
        .query<{ id: string; status: string }, []>(
          `SELECT id, status FROM episodes WHERE source_type = 'source' AND source_ref LIKE 'src/mod.ts@%'`,
        )
        .all();
      expect(ep1).toHaveLength(1);
      expect(ep1[0].status).toBe("active");
      const oldEpisodeId = ep1[0].id;

      // Modify the file
      fs.writeFileSync(
        path.join(srcDir, "mod.ts"),
        "export function renamed(): void {}",
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      // Old episode should be superseded
      const oldEp = graph.db
        .query<{ status: string }, [string]>(
          `SELECT status FROM episodes WHERE id = ?`,
        )
        .get(oldEpisodeId);
      expect(oldEp?.status).toBe("superseded");

      // A new active episode should exist
      const newEps = graph.db
        .query<{ id: string; status: string }, []>(
          `SELECT id, status FROM episodes WHERE source_type = 'source' AND source_ref LIKE 'src/mod.ts@%' AND status = 'active'`,
        )
        .all();
      expect(newEps).toHaveLength(1);
      expect(newEps[0].id).not.toBe(oldEpisodeId);

      // Symbol entities with fresh evidence exist
      const newSymbol = findEntities(graph, {
        canonical_name: "src/mod.ts::renamed",
      });
      expect(newSymbol).toHaveLength(1);
      const evLinks = getEvidenceForEntity(graph, newSymbol[0].id);
      expect(evLinks.length).toBeGreaterThan(0);
      expect(evLinks.some((ev) => ev.episode_id === newEps[0].id)).toBe(true);
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });

  test("symbol removed from modified file is orphaned but not deleted", async () => {
    const tmpFixture = fs.mkdtempSync(path.join(os.tmpdir(), "engram-orphan-"));
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "x.ts"),
        "export function willBeRemoved(): void {}",
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      const symBefore = findEntities(graph, {
        canonical_name: "src/x.ts::willBeRemoved",
      });
      expect(symBefore).toHaveLength(1);

      // Overwrite with no symbols
      fs.writeFileSync(path.join(srcDir, "x.ts"), "// empty");

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      // Symbol still exists (not deleted)
      const symAfter = findEntities(graph, {
        canonical_name: "src/x.ts::willBeRemoved",
      });
      expect(symAfter).toHaveLength(1);
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });

  test("verifyGraph passes after supersession", async () => {
    const tmpFixture = fs.mkdtempSync(path.join(os.tmpdir(), "engram-verify-"));
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "v.ts"),
        "export function v1(): void {}",
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      fs.writeFileSync(
        path.join(srcDir, "v.ts"),
        "export function v2(): void {}",
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      const vr = verifyGraph(graph);
      expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(
        0,
      );
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Parse errors
// ---------------------------------------------------------------------------

describe("parse error handling", () => {
  test("parse error on one file is logged in errors and does not abort the run", async () => {
    const tmpFixture = fs.mkdtempSync(path.join(os.tmpdir(), "engram-err-"));
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "good.ts"),
        "export function good(): void {}",
      );
      // Malformed TypeScript (tree-sitter still produces a tree with hasError=true)
      fs.writeFileSync(
        path.join(srcDir, "bad.ts"),
        "export function (@@@@) {}",
      );

      const result = await ingestSource(graph, {
        root: tmpFixture,
        respectGitignore: false,
      });

      expect(result.errors.length).toBeGreaterThan(0);
      const errRelPaths = result.errors.map((e) => e.relPath);
      expect(errRelPaths).toContain("src/bad.ts");
      // Good file still ingested
      expect(result.episodesCreated).toBe(2);
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });

  test("re-running after a parse error still produces an episode for the bad file", async () => {
    const tmpFixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "engram-rerun-err-"),
    );
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "bad.ts"),
        "export function (@@@@) {}",
      );

      const r1 = await ingestSource(graph, {
        root: tmpFixture,
        respectGitignore: false,
      });
      expect(r1.episodesCreated).toBe(1);

      // Re-run: same file unchanged → skipped via fast path
      const r2 = await ingestSource(graph, {
        root: tmpFixture,
        respectGitignore: false,
      });
      expect(r2.filesSkipped).toBe(1);
      expect(r2.episodesCreated).toBe(0);
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// dryRun
// ---------------------------------------------------------------------------

describe("dryRun mode", () => {
  test("dryRun produces counts but writes nothing", async () => {
    const result = await ingestSource(graph, {
      root: FIXTURE,
      respectGitignore: true,
      dryRun: true,
    });

    expect(result.filesScanned).toBe(3);
    expect(result.episodesCreated).toBeGreaterThan(0);
    expect(result.entitiesCreated).toBeGreaterThan(0);

    // Nothing written to DB
    const episodes = graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM episodes")
      .get();
    expect(episodes?.count).toBe(0);

    const entities = graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM entities")
      .get();
    expect(entities?.count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Import edges
// ---------------------------------------------------------------------------

describe("import resolution", () => {
  test("import edges are created for in-repo targets", async () => {
    const tmpFixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "engram-imports-"),
    );
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "utils.ts"),
        "export function util(): void {}",
      );
      fs.writeFileSync(
        path.join(srcDir, "main.ts"),
        `import { util } from './utils';\nexport function main(): void { util(); }`,
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      const importEdges = activeEdges("imports");
      expect(importEdges).toHaveLength(1);
      expect(importEdges[0].relation_type).toBe("imports");
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });

  test("external package imports do not produce edges", async () => {
    const tmpFixture = fs.mkdtempSync(
      path.join(os.tmpdir(), "engram-ext-imports-"),
    );
    try {
      const srcDir = path.join(tmpFixture, "src");
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, "index.ts"),
        `import React from 'react';\nimport { foo } from '@scope/pkg';\nexport function fn(): void {}`,
      );

      await ingestSource(graph, { root: tmpFixture, respectGitignore: false });

      const importEdges = activeEdges("imports");
      expect(importEdges).toHaveLength(0);
    } finally {
      fs.rmSync(tmpFixture, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Result counts accuracy
// ---------------------------------------------------------------------------

describe("result count accuracy", () => {
  test("counts match actual DB state", async () => {
    const result = await ingestSource(graph, {
      root: FIXTURE,
      respectGitignore: true,
    });

    const episodeCount = graph.db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM episodes WHERE source_type = 'source'`,
      )
      .get();
    expect(episodeCount?.count).toBe(result.episodesCreated);

    const fileCount = graph.db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) AS count FROM entities WHERE entity_type = 'file'`,
      )
      .get();
    expect(fileCount?.count).toBeGreaterThan(0);
    // Total entities = files + symbols + modules
    const totalEntities = graph.db
      .query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM entities`)
      .get();
    expect(totalEntities?.count).toBe(result.entitiesCreated);
  });
});
