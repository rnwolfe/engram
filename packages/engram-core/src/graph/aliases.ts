/**
 * aliases.ts — entity alias management and resolution.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import type { Entity } from "./entities.js";
import { EntityNotFoundError } from "./errors.js";

export interface AliasInput {
  alias: string;
  entity_id: string;
  valid_from?: string; // ISO8601 UTC
  valid_until?: string; // ISO8601 UTC
  episode_id?: string; // FK to episodes.id — evidence of the rename
}

export interface Alias {
  id: string;
  entity_id: string;
  alias: string;
  valid_from: string | null;
  valid_until: string | null;
  episode_id: string | null;
  created_at: string;
}

/**
 * Resolves an entity by exact canonical_name match or by active alias.
 * Active aliases are those where valid_until IS NULL or valid_until > now.
 * If `type` is provided, narrows results to that entity_type.
 * Returns the first match or null — never auto-creates.
 */
export function resolveEntity(
  graph: EngramGraph,
  name: string,
  type?: string,
): Entity | null {
  // Step 1: Try exact canonical_name match
  if (type !== undefined) {
    const row = graph.db
      .query<Entity, [string, string]>(
        "SELECT * FROM entities WHERE canonical_name = ? AND entity_type = ? ORDER BY created_at ASC LIMIT 1",
      )
      .get(name, type);
    if (row) return row;
  } else {
    const row = graph.db
      .query<Entity, [string]>(
        "SELECT * FROM entities WHERE canonical_name = ? ORDER BY created_at ASC LIMIT 1",
      )
      .get(name);
    if (row) return row;
  }

  // Step 2: Try active alias match
  const now = new Date().toISOString();

  if (type !== undefined) {
    const row = graph.db
      .query<Entity, [string, string, string, string]>(
        `SELECT e.* FROM entities e
         JOIN entity_aliases a ON a.entity_id = e.id
         WHERE a.alias = ?
           AND (a.valid_from IS NULL OR a.valid_from <= ?)
           AND (a.valid_until IS NULL OR a.valid_until > ?)
           AND e.entity_type = ?
         ORDER BY a.created_at DESC, e.created_at ASC
         LIMIT 1`,
      )
      .get(name, now, now, type);
    return row ?? null;
  } else {
    const row = graph.db
      .query<Entity, [string, string, string]>(
        `SELECT e.* FROM entities e
         JOIN entity_aliases a ON a.entity_id = e.id
         WHERE a.alias = ?
           AND (a.valid_from IS NULL OR a.valid_from <= ?)
           AND (a.valid_until IS NULL OR a.valid_until > ?)
         ORDER BY a.created_at DESC, e.created_at ASC
         LIMIT 1`,
      )
      .get(name, now, now);
    return row ?? null;
  }
}

/**
 * Creates an alias for an existing entity.
 * Throws EntityNotFoundError if the entity_id does not exist.
 */
export function addEntityAlias(graph: EngramGraph, input: AliasInput): Alias {
  // Verify the entity exists
  const entity = graph.db
    .query<{ id: string }, [string]>(
      "SELECT id FROM entities WHERE id = ? LIMIT 1",
    )
    .get(input.entity_id);

  if (!entity) {
    throw new EntityNotFoundError(input.entity_id);
  }

  const id = ulid();
  const now = new Date().toISOString();

  const insertStmt = graph.db.prepare<
    void,
    [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string,
    ]
  >(
    `INSERT INTO entity_aliases (id, entity_id, alias, valid_from, valid_until, episode_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  let row: Alias | null = null;

  graph.db.transaction(() => {
    insertStmt.run(
      id,
      input.entity_id,
      input.alias,
      input.valid_from ?? null,
      input.valid_until ?? null,
      input.episode_id ?? null,
      now,
    );

    row =
      graph.db
        .query<Alias, [string]>("SELECT * FROM entity_aliases WHERE id = ?")
        .get(id) ?? null;
  })();

  if (!row) {
    throw new Error(`addEntityAlias: failed to retrieve inserted alias ${id}`);
  }

  return row;
}
