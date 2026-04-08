/**
 * graph-search.test.ts — tests for graph-aware retrieval via edge traversal.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Edge, EngramGraph, Entity, Episode } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  search,
} from "../../src/index.js";
import { graphSearch } from "../../src/retrieval/graph-search.js";

let graph: EngramGraph;

interface GraphFixture {
  ep1: Episode;
  ep2: Episode;
  person: Entity;
  fileA: Entity;
  fileB: Entity;
  fileC: Entity;
  unrelated: Entity;
  ownsA: Edge;
  ownsB: Edge;
  cochangeAC: Edge;
}

/**
 * Build a small graph that mirrors the Fastify benchmark pattern:
 *   fileA  --likely_owner_of--> person
 *   fileB  --likely_owner_of--> person
 *   fileA  --co_changes_with--> fileC
 *   unrelated (no edges to person)
 *
 * Note: in production, ingestGitRepo creates likely_owner_of edges with
 * source_id = file, target_id = owner. The fixture uses person→file for
 * simplicity; graphSearch traverses both directions so the result is the same.
 */
function seedGraphFixture(g: EngramGraph): GraphFixture {
  const ep1 = addEpisode(g, {
    source_type: "git",
    source_ref: "commit-001",
    content: "feat: person@example.com added fileA and fileB",
    timestamp: "2024-06-01T00:00:00Z",
  });

  const ep2 = addEpisode(g, {
    source_type: "git",
    source_ref: "commit-002",
    content: "refactor: fileC co-changes with fileA",
    timestamp: "2024-07-01T00:00:00Z",
  });

  const person = addEntity(
    g,
    { canonical_name: "person@example.com", entity_type: "person" },
    [{ episode_id: ep1.id, extractor: "git" }],
  );

  const fileA = addEntity(
    g,
    { canonical_name: "lib/fileA.js", entity_type: "module" },
    [{ episode_id: ep1.id, extractor: "git" }],
  );

  const fileB = addEntity(
    g,
    { canonical_name: "lib/fileB.js", entity_type: "module" },
    [{ episode_id: ep1.id, extractor: "git" }],
  );

  const fileC = addEntity(
    g,
    { canonical_name: "lib/fileC.js", entity_type: "module" },
    [{ episode_id: ep2.id, extractor: "git" }],
  );

  const unrelated = addEntity(
    g,
    { canonical_name: "lib/unrelated.js", entity_type: "module" },
    [{ episode_id: ep2.id, extractor: "git" }],
  );

  const ownsA = addEdge(
    g,
    {
      source_id: person.id,
      target_id: fileA.id,
      relation_type: "likely_owner_of",
      edge_kind: "inferred",
      fact: "person@example.com likely owns lib/fileA.js",
      confidence: 0.9,
    },
    [{ episode_id: ep1.id, extractor: "git" }],
  );

  const ownsB = addEdge(
    g,
    {
      source_id: person.id,
      target_id: fileB.id,
      relation_type: "likely_owner_of",
      edge_kind: "inferred",
      fact: "person@example.com likely owns lib/fileB.js",
      confidence: 0.7,
    },
    [{ episode_id: ep1.id, extractor: "git" }],
  );

  const cochangeAC = addEdge(
    g,
    {
      source_id: fileA.id,
      target_id: fileC.id,
      relation_type: "co_changes_with",
      edge_kind: "inferred",
      fact: "lib/fileA.js co-changes with lib/fileC.js",
      confidence: 0.8,
    },
    [{ episode_id: ep2.id, extractor: "git" }],
  );

  return {
    ep1,
    ep2,
    person,
    fileA,
    fileB,
    fileC,
    unrelated,
    ownsA,
    ownsB,
    cochangeAC,
  };
}

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// graphSearch() unit tests
// ---------------------------------------------------------------------------

describe("graphSearch", () => {
  test("returns empty for empty seeds", () => {
    seedGraphFixture(graph);
    const results = graphSearch(graph, [], { maxHops: 2 });
    expect(results).toEqual([]);
  });

  test("returns empty when maxHops is 0", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 0 });
    expect(results).toEqual([]);
  });

  test("1-hop from person finds owned files", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 1 });

    const names = results.map((r) => r.canonicalName).sort();
    expect(names).toContain("lib/fileA.js");
    expect(names).toContain("lib/fileB.js");
    // Should NOT include fileC (2 hops away) or unrelated
    expect(names).not.toContain("lib/fileC.js");
    expect(names).not.toContain("lib/unrelated.js");
  });

  test("2-hop from person finds transitive co-change partners", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 2 });

    const names = results.map((r) => r.canonicalName).sort();
    expect(names).toContain("lib/fileA.js"); // 1-hop
    expect(names).toContain("lib/fileB.js"); // 1-hop
    expect(names).toContain("lib/fileC.js"); // 2-hop via fileA
    expect(names).not.toContain("lib/unrelated.js"); // no path
  });

  test("does not include seed entities in results", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 2 });

    const ids = results.map((r) => r.entityId);
    expect(ids).not.toContain(person.id);
  });

  test("tracks hop distance correctly", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 2 });

    const fileA = results.find((r) => r.canonicalName === "lib/fileA.js");
    const fileC = results.find((r) => r.canonicalName === "lib/fileC.js");

    expect(fileA?.hops).toBe(1);
    expect(fileC?.hops).toBe(2);
  });

  test("tracks edge confidence along path", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 1.0]], { maxHops: 2 });

    const fileA = results.find((r) => r.canonicalName === "lib/fileA.js");
    const fileC = results.find((r) => r.canonicalName === "lib/fileC.js");

    // fileA: direct edge confidence 0.9
    expect(fileA?.minPathConfidence).toBe(0.9);
    // fileC: path is person->fileA(0.9)->fileC(0.8), min = 0.8
    expect(fileC?.minPathConfidence).toBe(0.8);
  });

  test("propagates seed FTS score", () => {
    const { person } = seedGraphFixture(graph);
    const results = graphSearch(graph, [[person.id, 0.75]], { maxHops: 1 });

    for (const r of results) {
      expect(r.seedFtsScore).toBe(0.75);
      expect(r.seedEntityId).toBe(person.id);
    }
  });

  test("respects validAt — excludes expired edges from traversal", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      source_ref: "commit-temporal",
      content: "temporal edge test",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entityA = addEntity(
      graph,
      { canonical_name: "TemporalA", entity_type: "module" },
      [{ episode_id: ep.id, extractor: "git" }],
    );

    const entityB = addEntity(
      graph,
      { canonical_name: "TemporalB", entity_type: "module" },
      [{ episode_id: ep.id, extractor: "git" }],
    );

    // Edge valid only in Q1 2024
    addEdge(
      graph,
      {
        source_id: entityA.id,
        target_id: entityB.id,
        relation_type: "co_changes_with",
        edge_kind: "inferred",
        fact: "TemporalA co-changes with TemporalB",
        confidence: 0.9,
        valid_from: "2024-01-01T00:00:00Z",
        valid_until: "2024-04-01T00:00:00Z",
      },
      [{ episode_id: ep.id, extractor: "git" }],
    );

    // Within validity window: should find TemporalB
    const inWindow = graphSearch(graph, [[entityA.id, 1.0]], {
      maxHops: 1,
      valid_at: "2024-02-15T00:00:00Z",
    });
    expect(inWindow.map((r) => r.canonicalName)).toContain("TemporalB");

    // Outside validity window: should NOT find TemporalB
    const outsideWindow = graphSearch(graph, [[entityA.id, 1.0]], {
      maxHops: 1,
      valid_at: "2024-06-01T00:00:00Z",
    });
    expect(outsideWindow.map((r) => r.canonicalName)).not.toContain(
      "TemporalB",
    );
  });

  test("filters by relation_types — only follows specified edge types", () => {
    const { person } = seedGraphFixture(graph);

    // Only follow co_changes_with — person has no co_changes_with edges directly
    const cochangeOnly = graphSearch(graph, [[person.id, 1.0]], {
      maxHops: 1,
      relation_types: ["co_changes_with"],
    });
    expect(cochangeOnly).toHaveLength(0);

    // Only follow likely_owner_of — should find fileA and fileB
    const ownerOnly = graphSearch(graph, [[person.id, 1.0]], {
      maxHops: 1,
      relation_types: ["likely_owner_of"],
    });
    const names = ownerOnly.map((r) => r.canonicalName).sort();
    expect(names).toContain("lib/fileA.js");
    expect(names).toContain("lib/fileB.js");
  });

  test("handles multiple seeds", () => {
    const { person, fileC } = seedGraphFixture(graph);
    // Seed both person and fileC; fileA reachable from both
    const results = graphSearch(
      graph,
      [
        [person.id, 1.0],
        [fileC.id, 0.5],
      ],
      { maxHops: 1 },
    );

    const fileAResult = results.find((r) => r.canonicalName === "lib/fileA.js");
    expect(fileAResult).toBeDefined();
    // fileA is 1-hop from person (score 1.0) — should prefer this path
    expect(fileAResult?.seedFtsScore).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// search() integration tests — graph traversal
// ---------------------------------------------------------------------------

describe("search with graph traversal", () => {
  test("search for person returns owned files via graph traversal", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "person@example.com", { limit: 20 });
    const entityNames = results
      .filter((r) => r.type === "entity")
      .map((r) => r.content);

    // Direct FTS hit: person@example.com
    expect(entityNames).toContain("person@example.com");
    // Graph-traversed: owned files
    expect(entityNames).toContain("lib/fileA.js");
    expect(entityNames).toContain("lib/fileB.js");
  });

  test("search for file returns co-change partners and owner via traversal", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "lib/fileA.js", { limit: 20 });
    const entityNames = results
      .filter((r) => r.type === "entity")
      .map((r) => r.content);

    // Direct FTS hit
    expect(entityNames).toContain("lib/fileA.js");
    // Traversed: person (via likely_owner_of inbound) and fileC (via co_changes_with)
    expect(entityNames).toContain("person@example.com");
    expect(entityNames).toContain("lib/fileC.js");
  });

  test("graph traversal disabled when maxHops=0", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "person@example.com", {
      limit: 20,
      maxHops: 0,
    });
    const entityNames = results
      .filter((r) => r.type === "entity")
      .map((r) => r.content);

    // Only direct FTS hit, no traversal
    expect(entityNames).toContain("person@example.com");
    expect(entityNames).not.toContain("lib/fileA.js");
    expect(entityNames).not.toContain("lib/fileB.js");
  });

  test("no FTS results means no graph traversal (no crash)", async () => {
    seedGraphFixture(graph);
    const results = await search(graph, "xyznonexistent999");
    expect(results).toEqual([]);
  });

  test("graph-traversed entities are scored lower than direct FTS hits", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "person@example.com", { limit: 20 });
    const personResult = results.find(
      (r) => r.type === "entity" && r.content === "person@example.com",
    );
    const traversedResults = results.filter(
      (r) =>
        r.type === "entity" &&
        r.content !== "person@example.com" &&
        (r.content === "lib/fileA.js" || r.content === "lib/fileB.js"),
    );

    expect(personResult).toBeDefined();
    expect(traversedResults.length).toBeGreaterThan(0);

    for (const t of traversedResults) {
      expect(t.score).toBeLessThanOrEqual(personResult?.score ?? 0);
    }
  });

  test("1-hop entities score higher than 2-hop entities", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "person@example.com", { limit: 20 });
    const fileA = results.find(
      (r) => r.type === "entity" && r.content === "lib/fileA.js",
    );
    const fileC = results.find(
      (r) => r.type === "entity" && r.content === "lib/fileC.js",
    );

    expect(fileA).toBeDefined();
    expect(fileC).toBeDefined();
    // 1-hop fileA should score higher than 2-hop fileC
    expect(fileA?.score).toBeGreaterThan(fileC?.score ?? 0);
  });

  test("unrelated entities are not returned", async () => {
    seedGraphFixture(graph);

    const results = await search(graph, "person@example.com", { limit: 20 });
    const entityNames = results
      .filter((r) => r.type === "entity")
      .map((r) => r.content);

    expect(entityNames).not.toContain("lib/unrelated.js");
  });

  test("keyword-only queries still work (no regression)", async () => {
    seedGraphFixture(graph);

    // Searching for a term that appears in episode content
    const results = await search(graph, "refactor", { limit: 20 });
    expect(results.length).toBeGreaterThan(0);
  });
});
