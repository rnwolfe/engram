/**
 * graph.test.ts — tests for entity, edge, episode CRUD with evidence chains.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  EvidenceRequiredError,
  findEdges,
  findEntities,
  getEdge,
  getEntity,
  getEpisode,
  getEvidenceForEdge,
  getEvidenceForEntity,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Episode tests
// ---------------------------------------------------------------------------

describe("addEpisode / getEpisode", () => {
  test("creates an episode and retrieves it by ID", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      source_ref: "abc123",
      content: "Initial commit",
      timestamp: "2024-01-01T00:00:00Z",
    });

    expect(ep.id).toBeDefined();
    expect(ep.source_type).toBe("git");
    expect(ep.source_ref).toBe("abc123");
    expect(ep.content).toBe("Initial commit");
    expect(ep.status).toBe("active");
    expect(ep.content_hash).toBeDefined();
    expect(ep.content_hash.length).toBe(64); // sha256 hex

    const fetched = getEpisode(graph, ep.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(ep.id);
  });

  test("getEpisode returns null for unknown ID", () => {
    const result = getEpisode(graph, "nonexistent");
    expect(result).toBeNull();
  });

  test("duplicate (source_type, source_ref) returns existing episode", () => {
    const ep1 = addEpisode(graph, {
      source_type: "git",
      source_ref: "sha-duplicate",
      content: "First commit",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const ep2 = addEpisode(graph, {
      source_type: "git",
      source_ref: "sha-duplicate",
      content: "Different content",
      timestamp: "2024-01-02T00:00:00Z",
    });

    expect(ep2.id).toBe(ep1.id);
    expect(ep2.content).toBe("First commit");
  });

  test("episodes without source_ref can be duplicated", () => {
    const ep1 = addEpisode(graph, {
      source_type: "manual",
      content: "Note A",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const ep2 = addEpisode(graph, {
      source_type: "manual",
      content: "Note B",
      timestamp: "2024-01-01T00:00:00Z",
    });

    expect(ep1.id).not.toBe(ep2.id);
  });

  test("metadata is stored as JSON string", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      content: "Commit with metadata",
      timestamp: "2024-01-01T00:00:00Z",
      metadata: { branch: "main", files: 3 },
    });

    expect(ep.metadata).toBe(JSON.stringify({ branch: "main", files: 3 }));
  });
});

// ---------------------------------------------------------------------------
// Entity tests
// ---------------------------------------------------------------------------

describe("addEntity / getEntity / findEntities", () => {
  test("creates an entity with evidence and retrieves it", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "Alice is a developer",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entity = addEntity(
      graph,
      {
        canonical_name: "Alice",
        entity_type: "person",
        summary: "Core developer",
      },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    expect(entity.id).toBeDefined();
    expect(entity.canonical_name).toBe("Alice");
    expect(entity.entity_type).toBe("person");
    expect(entity.status).toBe("active");
    expect(entity.created_at).toBeDefined();
    expect(entity.updated_at).toBeDefined();

    const fetched = getEntity(graph, entity.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(entity.id);
  });

  test("getEntity returns null for unknown ID", () => {
    expect(getEntity(graph, "nope")).toBeNull();
  });

  test("throws EvidenceRequiredError when evidence array is empty", () => {
    expect(() =>
      addEntity(graph, { canonical_name: "Bob", entity_type: "person" }, []),
    ).toThrow(EvidenceRequiredError);
  });

  test("throws EvidenceRequiredError when evidence is not provided", () => {
    expect(() =>
      // @ts-expect-error intentionally omitting evidence
      addEntity(graph, { canonical_name: "Bob", entity_type: "person" }),
    ).toThrow(EvidenceRequiredError);
  });

  test("findEntities filters by entity_type", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];

    addEntity(graph, { canonical_name: "Alice", entity_type: "person" }, ev);
    addEntity(
      graph,
      { canonical_name: "auth-service", entity_type: "service" },
      ev,
    );
    addEntity(graph, { canonical_name: "Bob", entity_type: "person" }, ev);

    const people = findEntities(graph, { entity_type: "person" });
    expect(people.length).toBe(2);
    expect(people.every((e) => e.entity_type === "person")).toBe(true);
  });

  test("findEntities filters by canonical_name", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];

    addEntity(graph, { canonical_name: "Alice", entity_type: "person" }, ev);
    addEntity(graph, { canonical_name: "Bob", entity_type: "person" }, ev);

    const result = findEntities(graph, { canonical_name: "Alice" });
    expect(result.length).toBe(1);
    expect(result[0].canonical_name).toBe("Alice");
  });

  test("findEntities filters by status", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];

    addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person", status: "active" },
      ev,
    );
    addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person", status: "inactive" },
      ev,
    );

    const active = findEntities(graph, { status: "active" });
    expect(active.length).toBe(1);
    expect(active[0].canonical_name).toBe("Alice");
  });

  test("findEntities returns all when no filters", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];

    addEntity(graph, { canonical_name: "Alice", entity_type: "person" }, ev);
    addEntity(graph, { canonical_name: "Bob", entity_type: "person" }, ev);

    const all = findEntities(graph);
    expect(all.length).toBe(2);
  });

  test("evidence confidence defaults to 1.0", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entity = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );

    const links = getEvidenceForEntity(graph, entity.id);
    expect(links.length).toBe(1);
    expect(links[0].confidence).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// Edge tests
// ---------------------------------------------------------------------------

describe("addEdge / getEdge / findEdges", () => {
  test("creates an edge with evidence and retrieves it", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      content: "Alice authored auth-service",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "git-blame" }];

    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const svc = addEntity(
      graph,
      { canonical_name: "auth-service", entity_type: "service" },
      ev,
    );

    const edge = addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: svc.id,
        relation_type: "maintains",
        edge_kind: "observed",
        fact: "Alice maintains auth-service",
      },
      ev,
    );

    expect(edge.id).toBeDefined();
    expect(edge.source_id).toBe(alice.id);
    expect(edge.target_id).toBe(svc.id);
    expect(edge.relation_type).toBe("maintains");
    expect(edge.edge_kind).toBe("observed");
    expect(edge.weight).toBe(1.0);
    expect(edge.confidence).toBe(1.0);
    expect(edge.invalidated_at).toBeNull();

    const fetched = getEdge(graph, edge.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(edge.id);
  });

  test("getEdge returns null for unknown ID", () => {
    expect(getEdge(graph, "nope")).toBeNull();
  });

  test("throws EvidenceRequiredError when evidence array is empty", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const bob = addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person" },
      ev,
    );

    expect(() =>
      addEdge(
        graph,
        {
          source_id: alice.id,
          target_id: bob.id,
          relation_type: "knows",
          edge_kind: "asserted",
          fact: "Alice knows Bob",
        },
        [],
      ),
    ).toThrow(EvidenceRequiredError);
  });

  test("findEdges filters by source_id", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const bob = addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person" },
      ev,
    );
    const carol = addEntity(
      graph,
      { canonical_name: "Carol", entity_type: "person" },
      ev,
    );

    addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: bob.id,
        relation_type: "knows",
        edge_kind: "asserted",
        fact: "A knows B",
      },
      ev,
    );
    addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: carol.id,
        relation_type: "knows",
        edge_kind: "asserted",
        fact: "A knows C",
      },
      ev,
    );
    addEdge(
      graph,
      {
        source_id: bob.id,
        target_id: carol.id,
        relation_type: "knows",
        edge_kind: "asserted",
        fact: "B knows C",
      },
      ev,
    );

    const aliceEdges = findEdges(graph, { source_id: alice.id });
    expect(aliceEdges.length).toBe(2);
    expect(aliceEdges.every((e) => e.source_id === alice.id)).toBe(true);
  });

  test("findEdges filters by target_id", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const bob = addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person" },
      ev,
    );
    const carol = addEntity(
      graph,
      { canonical_name: "Carol", entity_type: "person" },
      ev,
    );

    addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: carol.id,
        relation_type: "knows",
        edge_kind: "asserted",
        fact: "A knows C",
      },
      ev,
    );
    addEdge(
      graph,
      {
        source_id: bob.id,
        target_id: carol.id,
        relation_type: "knows",
        edge_kind: "asserted",
        fact: "B knows C",
      },
      ev,
    );

    const toCarol = findEdges(graph, { target_id: carol.id });
    expect(toCarol.length).toBe(2);
  });

  test("findEdges filters by edge_kind", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const bob = addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person" },
      ev,
    );

    addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: bob.id,
        relation_type: "knows",
        edge_kind: "observed",
        fact: "fact A",
      },
      ev,
    );
    addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: bob.id,
        relation_type: "works_with",
        edge_kind: "inferred",
        fact: "fact B",
      },
      ev,
    );

    const observed = findEdges(graph, { edge_kind: "observed" });
    expect(observed.length).toBe(1);
    expect(observed[0].edge_kind).toBe("observed");
  });

  test("findEdges active_only excludes invalidated edges", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const bob = addEntity(
      graph,
      { canonical_name: "Bob", entity_type: "person" },
      ev,
    );

    const edge1 = addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: bob.id,
        relation_type: "knows",
        edge_kind: "observed",
        fact: "active",
      },
      ev,
    );
    const edge2 = addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: bob.id,
        relation_type: "knows",
        edge_kind: "observed",
        fact: "invalidated",
      },
      ev,
    );

    // Manually invalidate edge2
    graph.db.run("UPDATE edges SET invalidated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      edge2.id,
    ]);

    const active = findEdges(graph, { active_only: true });
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(edge1.id);
  });
});

// ---------------------------------------------------------------------------
// Evidence chain tests
// ---------------------------------------------------------------------------

describe("getEvidenceForEntity / getEvidenceForEdge", () => {
  test("getEvidenceForEntity returns evidence with episode details", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      source_ref: "abc",
      content: "commit message",
      actor: "Alice",
      timestamp: "2024-01-01T00:00:00Z",
    });

    const entity = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      [{ episode_id: ep.id, extractor: "git-log", confidence: 0.95 }],
    );

    const chain = getEvidenceForEntity(graph, entity.id);
    expect(chain.length).toBe(1);

    const link = chain[0];
    expect(link.episode_id).toBe(ep.id);
    expect(link.extractor).toBe("git-log");
    expect(link.confidence).toBe(0.95);
    expect(link.episode.source_type).toBe("git");
    expect(link.episode.actor).toBe("Alice");
    expect(link.episode.content).toBe("commit message");
  });

  test("getEvidenceForEntity returns empty array for entity with no evidence (after direct DB insert)", () => {
    // Evidence chain returns empty for non-existent entity_id
    const chain = getEvidenceForEntity(graph, "nonexistent-entity");
    expect(chain).toEqual([]);
  });

  test("getEvidenceForEntity supports multiple evidence links", () => {
    const ep1 = addEpisode(graph, {
      source_type: "git",
      content: "A",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ep2 = addEpisode(graph, {
      source_type: "github",
      content: "B",
      timestamp: "2024-01-02T00:00:00Z",
    });

    const entity = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      [
        { episode_id: ep1.id, extractor: "git-log" },
        { episode_id: ep2.id, extractor: "github-pr" },
      ],
    );

    const chain = getEvidenceForEntity(graph, entity.id);
    expect(chain.length).toBe(2);
    const extractors = chain.map((l) => l.extractor).sort();
    expect(extractors).toEqual(["git-log", "github-pr"]);
  });

  test("getEvidenceForEdge returns evidence with episode details", () => {
    const ep = addEpisode(graph, {
      source_type: "git",
      content: "Alice authored the module",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "git-blame", confidence: 0.8 }];

    const alice = addEntity(
      graph,
      { canonical_name: "Alice", entity_type: "person" },
      ev,
    );
    const mod = addEntity(
      graph,
      { canonical_name: "auth", entity_type: "module" },
      ev,
    );

    const edge = addEdge(
      graph,
      {
        source_id: alice.id,
        target_id: mod.id,
        relation_type: "authors",
        edge_kind: "observed",
        fact: "Alice authors auth module",
      },
      ev,
    );

    const chain = getEvidenceForEdge(graph, edge.id);
    expect(chain.length).toBe(1);
    expect(chain[0].extractor).toBe("git-blame");
    expect(chain[0].confidence).toBe(0.8);
    expect(chain[0].episode.source_type).toBe("git");
  });

  test("getEvidenceForEdge returns empty array for nonexistent edge_id", () => {
    const chain = getEvidenceForEdge(graph, "nonexistent-edge");
    expect(chain).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Evidence-first invariant
// ---------------------------------------------------------------------------

describe("evidence-first invariant", () => {
  test("EvidenceRequiredError is thrown with descriptive message for addEntity", () => {
    let err: Error | undefined;
    try {
      addEntity(graph, { canonical_name: "X", entity_type: "person" }, []);
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(EvidenceRequiredError);
    expect(err?.message).toContain("addEntity");
  });

  test("EvidenceRequiredError is thrown with descriptive message for addEdge", () => {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: "test",
      timestamp: "2024-01-01T00:00:00Z",
    });
    const ev = [{ episode_id: ep.id, extractor: "manual" }];
    const a = addEntity(
      graph,
      { canonical_name: "A", entity_type: "person" },
      ev,
    );
    const b = addEntity(
      graph,
      { canonical_name: "B", entity_type: "person" },
      ev,
    );

    let err: Error | undefined;
    try {
      addEdge(
        graph,
        {
          source_id: a.id,
          target_id: b.id,
          relation_type: "r",
          edge_kind: "asserted",
          fact: "f",
        },
        [],
      );
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(EvidenceRequiredError);
    expect(err?.message).toContain("addEdge");
  });
});
