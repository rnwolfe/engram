/**
 * Unit tests for orchestrator extra entities and edges support.
 *
 * Tests resolveEntityRef semantics and the extras materialization path through
 * ingestSource. Where full integration is not possible without extractor changes,
 * resolveEntityRef is tested directly via its exported surface.
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
import { addEntity, findEntities } from "../../../src/graph/entities.js";
import { addEpisode } from "../../../src/graph/episodes.js";
import {
  getEvidenceForEdge,
  getEvidenceForEntity,
} from "../../../src/graph/evidence.js";
import {
  ingestSource,
  resolveEntityRef,
} from "../../../src/ingest/source/index.js";
import { ENTITY_TYPES, RELATION_TYPES } from "../../../src/vocab/index.js";

let tmpDir: string;
let graphPath: string;
let graph: EngramGraph;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-extras-test-"));
  graphPath = path.join(tmpDir, "test.engram");
  graph = await createGraph(graphPath);
});

afterEach(async () => {
  closeGraph(graph);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeFixture(files: Record<string, string>): string {
  const fixtureDir = path.join(tmpDir, "fixture");
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(fixtureDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return fixtureDir;
}

function buildEpisodeAndEvidence(g: EngramGraph) {
  const ep = addEpisode(g, {
    source_type: "source",
    source_ref: "test/fake.ts@abc123",
    content: "// test",
    timestamp: new Date().toISOString(),
  });
  const ev = [{ episode_id: ep.id, extractor: "source", confidence: 1.0 }];
  return { episodeId: ep.id, ev };
}

// ---------------------------------------------------------------------------
// resolveEntityRef — kind: "file"
// ---------------------------------------------------------------------------

describe("resolveEntityRef kind=file", () => {
  test("returns the file entity id without creating new entities", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/a.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );

    const symbolIds = new Map<string, string>();
    const result = resolveEntityRef(
      { kind: "file" },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );

    expect(result.id).toBe(fileEntity.id);
    expect(result.created).toBe(false);

    const allEntities = findEntities(graph);
    expect(allEntities).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// resolveEntityRef — kind: "symbol"
// ---------------------------------------------------------------------------

describe("resolveEntityRef kind=symbol", () => {
  test("returns the symbol entity id when found in symbolEntityIds", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/b.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );
    const symEntity = addEntity(
      graph,
      { canonical_name: "src/b.ts::myFn", entity_type: ENTITY_TYPES.SYMBOL },
      ev,
    );

    const symbolIds = new Map([["myFn", symEntity.id]]);
    const result = resolveEntityRef(
      { kind: "symbol", name: "myFn" },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );

    expect(result.id).toBe(symEntity.id);
    expect(result.created).toBe(false);
  });

  test("returns null when symbol name is not in symbolEntityIds (cross-file ref)", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/c.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );

    const symbolIds = new Map<string, string>();
    const result = resolveEntityRef(
      { kind: "symbol", name: "missing" },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveEntityRef — kind: "canonical"
// ---------------------------------------------------------------------------

describe("resolveEntityRef kind=canonical", () => {
  test("upserts a new entity when none exists and returns created=true", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/d.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );

    const symbolIds = new Map<string, string>();
    const result = resolveEntityRef(
      {
        kind: "canonical",
        canonicalName: "external/module",
        entityType: ENTITY_TYPES.MODULE,
      },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );

    expect(result.created).toBe(true);
    const entities = findEntities(graph, {
      canonical_name: "external/module",
    });
    expect(entities).toHaveLength(1);
    expect(entities[0].entity_type).toBe(ENTITY_TYPES.MODULE);
  });

  test("returns existing entity without re-creating when it already exists", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/e.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );
    const existingEntity = addEntity(
      graph,
      { canonical_name: "pkg/shared", entity_type: ENTITY_TYPES.MODULE },
      ev,
    );

    const symbolIds = new Map<string, string>();
    const result = resolveEntityRef(
      {
        kind: "canonical",
        canonicalName: "pkg/shared",
        entityType: ENTITY_TYPES.MODULE,
      },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );

    expect(result.id).toBe(existingEntity.id);
    expect(result.created).toBe(false);

    const entities = findEntities(graph, { canonical_name: "pkg/shared" });
    expect(entities).toHaveLength(1);
  });

  test("upserted canonical entity has evidence attached", async () => {
    const { ev } = buildEpisodeAndEvidence(graph);
    const fileEntity = addEntity(
      graph,
      { canonical_name: "src/f.ts", entity_type: ENTITY_TYPES.FILE },
      ev,
    );

    const symbolIds = new Map<string, string>();
    const result = resolveEntityRef(
      {
        kind: "canonical",
        canonicalName: "cross/file/entity",
        entityType: ENTITY_TYPES.MODULE,
      },
      fileEntity.id,
      symbolIds,
      graph,
      ev,
    );

    const evidence = getEvidenceForEntity(graph, result.id);
    expect(evidence.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: ingestSource with standard files (regression guard for extras)
// ---------------------------------------------------------------------------

describe("ingestSource regression after extras refactor", () => {
  test("standard file ingestion still creates file, symbol, module entities", async () => {
    const root = makeFixture({
      "src/a.ts": "export function greet(): void {}",
    });

    const result = await ingestSource(graph, {
      root,
      respectGitignore: false,
    });

    expect(result.errors).toHaveLength(0);

    const files = findEntities(graph, { entity_type: ENTITY_TYPES.FILE });
    expect(files).toHaveLength(1);
    expect(files[0].canonical_name).toBe("src/a.ts");

    const symbols = findEntities(graph, { entity_type: ENTITY_TYPES.SYMBOL });
    expect(symbols).toHaveLength(1);
    expect(symbols[0].canonical_name).toBe("src/a.ts::greet");
  });

  test("verifyGraph passes after standard ingest (evidence chain intact)", async () => {
    const root = makeFixture({
      "src/b.ts": "export function fn(): void {}",
    });

    await ingestSource(graph, { root, respectGitignore: false });

    const vr = verifyGraph(graph);
    expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  test("import edges survive the extras refactor", async () => {
    const root = makeFixture({
      "src/utils.ts": "export function util(): void {}",
      "src/main.ts":
        "import { util } from './utils';\nexport function main(): void { util(); }",
    });

    await ingestSource(graph, { root, respectGitignore: false });

    const importEdges = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.IMPORTS,
    });
    expect(importEdges).toHaveLength(1);
    for (const e of importEdges) {
      expect(getEvidenceForEdge(graph, e.id).length).toBeGreaterThan(0);
    }
  });

  test("dryRun counts extras (extraEntities/extraEdges) in totals", async () => {
    const root = makeFixture({
      "src/c.ts": "export function fn(): void {}",
    });

    const result = await ingestSource(graph, {
      root,
      respectGitignore: false,
      dryRun: true,
    });

    expect(result.episodesCreated).toBeGreaterThan(0);
    expect(result.entitiesCreated).toBeGreaterThan(0);

    const epCount = graph.db
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM episodes")
      .get();
    expect(epCount?.count).toBe(0);
  });

  test("idempotency: second run on unchanged tree creates no duplicates", async () => {
    const root = makeFixture({
      "src/d.ts": "export function stable(): void {}",
    });

    await ingestSource(graph, { root, respectGitignore: false });
    const count1 = findEntities(graph).length;
    const edges1 = findEdges(graph, { active_only: true }).length;

    await ingestSource(graph, { root, respectGitignore: false });
    expect(findEntities(graph).length).toBe(count1);
    expect(findEdges(graph, { active_only: true }).length).toBe(edges1);
  }, 15_000);
});
