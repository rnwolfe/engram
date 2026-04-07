/**
 * entities.ts — entity CRUD operations.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import { EvidenceRequiredError } from "./errors.js";

export interface EvidenceInput {
  episode_id: string;
  extractor: string;
  confidence?: number;
}

export interface EntityInput {
  canonical_name: string;
  entity_type: string;
  summary?: string;
  status?: string;
  owner_id?: string;
}

export interface Entity {
  id: string;
  canonical_name: string;
  entity_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  owner_id: string | null;
}

export interface FindEntitiesQuery {
  entity_type?: string;
  canonical_name?: string;
  status?: string;
}

/**
 * Creates an entity and its evidence links in a single transaction.
 * Throws EvidenceRequiredError if evidence array is empty or not provided.
 */
export function addEntity(
  graph: EngramGraph,
  entity: EntityInput,
  evidence: EvidenceInput[],
): Entity {
  if (!evidence || evidence.length === 0) {
    throw new EvidenceRequiredError("addEntity");
  }

  const id = ulid();
  const now = new Date().toISOString();

  const insertEntity = graph.db.prepare<
    void,
    [
      string,
      string,
      string,
      string | null,
      string,
      string,
      string,
      string | null,
    ]
  >(
    `INSERT INTO entities (id, canonical_name, entity_type, summary, status, created_at, updated_at, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertEvidence = graph.db.prepare<
    void,
    [string, string, string, number, string]
  >(
    `INSERT INTO entity_evidence (entity_id, episode_id, extractor, confidence, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  graph.db.transaction(() => {
    insertEntity.run(
      id,
      entity.canonical_name,
      entity.entity_type,
      entity.summary ?? null,
      entity.status ?? "active",
      now,
      now,
      entity.owner_id ?? null,
    );

    for (const ev of evidence) {
      insertEvidence.run(
        id,
        ev.episode_id,
        ev.extractor,
        ev.confidence ?? 1.0,
        now,
      );
    }
  })();

  const row = graph.db
    .query<Entity, [string]>("SELECT * FROM entities WHERE id = ?")
    .get(id);

  if (!row) {
    throw new Error(`addEntity: failed to retrieve inserted entity ${id}`);
  }

  return row;
}

/**
 * Returns an entity by ID, or null if not found.
 */
export function getEntity(graph: EngramGraph, id: string): Entity | null {
  return (
    graph.db
      .query<Entity, [string]>("SELECT * FROM entities WHERE id = ?")
      .get(id) ?? null
  );
}

/**
 * Finds entities matching the given query filters.
 * All filters are ANDed together. Omitting a field means no filter on that field.
 */
export function findEntities(
  graph: EngramGraph,
  query: FindEntitiesQuery = {},
): Entity[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.entity_type !== undefined) {
    conditions.push("entity_type = ?");
    params.push(query.entity_type);
  }

  if (query.canonical_name !== undefined) {
    conditions.push("canonical_name = ?");
    params.push(query.canonical_name);
  }

  if (query.status !== undefined) {
    conditions.push("status = ?");
    params.push(query.status);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM entities ${where} ORDER BY created_at ASC`;

  return graph.db.query<Entity, unknown[]>(sql).all(...params);
}
