/**
 * aliases.test.ts — tests for entity resolution and alias management.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEntity,
  addEntityAlias,
  addEpisode,
  closeGraph,
  createGraph,
  EntityNotFoundError,
  resolveEntity,
} from "../../src/index.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeEpisode() {
  return addEpisode(graph, {
    source_type: "manual",
    content: "test evidence",
    timestamp: "2024-01-01T00:00:00Z",
  });
}

function makeEntity(
  canonical_name: string,
  entity_type: string,
  ep_id?: string,
) {
  const ep_id_ = ep_id ?? makeEpisode().id;
  return addEntity(graph, { canonical_name, entity_type }, [
    { episode_id: ep_id_, extractor: "manual" },
  ]);
}

// ---------------------------------------------------------------------------
// resolveEntity — exact canonical_name match
// ---------------------------------------------------------------------------

describe("resolveEntity — exact canonical_name match", () => {
  test("returns entity by exact canonical_name", () => {
    const entity = makeEntity("Alice", "person");
    const result = resolveEntity(graph, "Alice");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(entity.id);
    expect(result?.canonical_name).toBe("Alice");
  });

  test("returns null when no entity matches", () => {
    makeEntity("Alice", "person");
    const result = resolveEntity(graph, "Bob");
    expect(result).toBeNull();
  });

  test("returns null on empty graph", () => {
    expect(resolveEntity(graph, "Alice")).toBeNull();
  });

  test("type filter narrows exact match — matching type", () => {
    makeEntity("Alice", "person");
    const result = resolveEntity(graph, "Alice", "person");
    expect(result).not.toBeNull();
    expect(result?.entity_type).toBe("person");
  });

  test("type filter narrows exact match — wrong type returns null", () => {
    makeEntity("Alice", "person");
    const result = resolveEntity(graph, "Alice", "service");
    expect(result).toBeNull();
  });

  test("resolves the correct entity when multiple entities exist", () => {
    makeEntity("Alice", "person");
    const bob = makeEntity("Bob", "person");
    const result = resolveEntity(graph, "Bob");
    expect(result?.id).toBe(bob.id);
  });
});

// ---------------------------------------------------------------------------
// addEntityAlias
// ---------------------------------------------------------------------------

describe("addEntityAlias", () => {
  test("creates an alias for an existing entity", () => {
    const entity = makeEntity("Alice", "person");
    const alias = addEntityAlias(graph, {
      alias: "Al",
      entity_id: entity.id,
    });

    expect(alias.id).toBeDefined();
    expect(alias.entity_id).toBe(entity.id);
    expect(alias.alias).toBe("Al");
    expect(alias.valid_from).toBeNull();
    expect(alias.valid_until).toBeNull();
    expect(alias.episode_id).toBeNull();
    expect(alias.created_at).toBeDefined();
  });

  test("creates an alias with valid_from and valid_until", () => {
    const entity = makeEntity("Alice", "person");
    const alias = addEntityAlias(graph, {
      alias: "Alicia",
      entity_id: entity.id,
      valid_from: "2024-01-01T00:00:00Z",
      valid_until: "2024-06-01T00:00:00Z",
    });

    expect(alias.valid_from).toBe("2024-01-01T00:00:00Z");
    expect(alias.valid_until).toBe("2024-06-01T00:00:00Z");
  });

  test("creates an alias with episode_id as evidence of rename", () => {
    const ep = makeEpisode();
    const entity = makeEntity("Alice", "person");
    const alias = addEntityAlias(graph, {
      alias: "Alicia",
      entity_id: entity.id,
      episode_id: ep.id,
    });

    expect(alias.episode_id).toBe(ep.id);
  });

  test("throws EntityNotFoundError when entity_id does not exist", () => {
    expect(() =>
      addEntityAlias(graph, {
        alias: "Ghost",
        entity_id: "nonexistent-id",
      }),
    ).toThrow(EntityNotFoundError);
  });

  test("EntityNotFoundError message contains the unknown id", () => {
    let err: Error | undefined;
    try {
      addEntityAlias(graph, { alias: "Ghost", entity_id: "bad-id" });
    } catch (e) {
      err = e as Error;
    }
    expect(err).toBeInstanceOf(EntityNotFoundError);
    expect(err?.message).toContain("bad-id");
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — alias match
// ---------------------------------------------------------------------------

describe("resolveEntity — alias match", () => {
  test("resolves entity by active alias (no temporal bounds)", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, { alias: "Al", entity_id: entity.id });

    const result = resolveEntity(graph, "Al");
    expect(result).not.toBeNull();
    expect(result?.id).toBe(entity.id);
  });

  test("resolves entity by alias when canonical_name does not match", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, { alias: "Alicia", entity_id: entity.id });

    expect(resolveEntity(graph, "Alicia")?.id).toBe(entity.id);
    expect(resolveEntity(graph, "Alice")?.id).toBe(entity.id);
  });

  test("type filter works with alias match", () => {
    const person = makeEntity("Alice", "person");
    addEntityAlias(graph, { alias: "Al", entity_id: person.id });

    const result = resolveEntity(graph, "Al", "person");
    expect(result?.id).toBe(person.id);
  });

  test("type filter excludes alias match of wrong type", () => {
    const person = makeEntity("Alice", "person");
    addEntityAlias(graph, { alias: "Al", entity_id: person.id });

    const result = resolveEntity(graph, "Al", "service");
    expect(result).toBeNull();
  });

  test("returns null when alias does not exist", () => {
    makeEntity("Alice", "person");
    expect(resolveEntity(graph, "unknown-alias")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveEntity — temporal alias windows
// ---------------------------------------------------------------------------

describe("resolveEntity — temporal alias windows", () => {
  test("active alias with valid_until = NULL is returned", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, {
      alias: "Al",
      entity_id: entity.id,
      valid_from: "2020-01-01T00:00:00Z",
      valid_until: undefined, // still active
    });

    expect(resolveEntity(graph, "Al")?.id).toBe(entity.id);
  });

  test("alias with valid_until in the future is returned", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, {
      alias: "Al",
      entity_id: entity.id,
      valid_until: "2099-12-31T23:59:59Z",
    });

    expect(resolveEntity(graph, "Al")?.id).toBe(entity.id);
  });

  test("alias with valid_until in the past is not returned", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, {
      alias: "Al",
      entity_id: entity.id,
      valid_until: "2000-01-01T00:00:00Z", // already expired
    });

    expect(resolveEntity(graph, "Al")).toBeNull();
  });

  test("expired alias does not shadow canonical_name resolution", () => {
    // A different entity has the alias "Al" but it has expired
    const entity1 = makeEntity("Alice", "person");
    const entity2 = makeEntity("Al", "person");
    addEntityAlias(graph, {
      alias: "Al",
      entity_id: entity1.id,
      valid_until: "2000-01-01T00:00:00Z", // expired
    });

    // Canonical match on entity2 should win
    const result = resolveEntity(graph, "Al");
    expect(result?.id).toBe(entity2.id);
  });

  test("multiple aliases: only active alias is returned", () => {
    const entity = makeEntity("Alice", "person");
    addEntityAlias(graph, {
      alias: "OldAlias",
      entity_id: entity.id,
      valid_until: "2000-01-01T00:00:00Z", // expired
    });
    addEntityAlias(graph, {
      alias: "NewAlias",
      entity_id: entity.id,
      // no valid_until — still active
    });

    expect(resolveEntity(graph, "OldAlias")).toBeNull();
    expect(resolveEntity(graph, "NewAlias")?.id).toBe(entity.id);
  });
});
