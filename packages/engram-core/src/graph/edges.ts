/**
 * edges.ts — edge CRUD operations.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import type { EvidenceInput } from "./entities.js";
import { EvidenceRequiredError } from "./errors.js";

export interface EdgeInput {
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  weight?: number;
  valid_from?: string;
  valid_until?: string;
  confidence?: number;
  owner_id?: string;
}

export interface Edge {
  id: string;
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  weight: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  invalidated_at: string | null;
  superseded_by: string | null;
  confidence: number;
  owner_id: string | null;
}

export interface FindEdgesQuery {
  source_id?: string;
  target_id?: string;
  relation_type?: string;
  edge_kind?: string;
  active_only?: boolean;
  /** ISO8601 UTC timestamp. If provided, only returns edges valid at that point in time. */
  valid_at?: string;
  /** If false (default), only active edges (invalidated_at IS NULL) are returned. */
  include_invalidated?: boolean;
  /**
   * ISO8601 UTC timestamp for learn-time filtering (as-of queries).
   * When set, applies: created_at <= T AND (invalidated_at IS NULL OR invalidated_at > T)
   * This reflects what the graph knew at that point in time.
   * The validity window (valid_from/valid_until) is NOT filtered — only surfaced in output.
   */
  asOf?: string;
}

/**
 * Creates an edge and its evidence links in a single transaction.
 * Throws EvidenceRequiredError if evidence array is empty or not provided.
 */
export function addEdge(
  graph: EngramGraph,
  edge: EdgeInput,
  evidence: EvidenceInput[],
): Edge {
  if (!evidence || evidence.length === 0) {
    throw new EvidenceRequiredError("addEdge");
  }

  const id = ulid();
  const now = new Date().toISOString();

  const insertEdge = graph.db.prepare<
    void,
    [
      string,
      string,
      string,
      string,
      string,
      string,
      number,
      string | null,
      string | null,
      string,
      number,
      string | null,
    ]
  >(
    `INSERT INTO edges
       (id, source_id, target_id, relation_type, edge_kind, fact, weight, valid_from, valid_until, created_at, confidence, owner_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertEvidence = graph.db.prepare<
    void,
    [string, string, string, number, string]
  >(
    `INSERT INTO edge_evidence (edge_id, episode_id, extractor, confidence, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  graph.db.transaction(() => {
    insertEdge.run(
      id,
      edge.source_id,
      edge.target_id,
      edge.relation_type,
      edge.edge_kind,
      edge.fact,
      edge.weight ?? 1.0,
      edge.valid_from ?? null,
      edge.valid_until ?? null,
      now,
      edge.confidence ?? 1.0,
      edge.owner_id ?? null,
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
    .query<Edge, [string]>("SELECT * FROM edges WHERE id = ?")
    .get(id);

  if (!row) {
    throw new Error(`addEdge: failed to retrieve inserted edge ${id}`);
  }

  return row;
}

/**
 * Returns an edge by ID, or null if not found.
 */
export function getEdge(graph: EngramGraph, id: string): Edge | null {
  return (
    graph.db
      .query<Edge, [string]>("SELECT * FROM edges WHERE id = ?")
      .get(id) ?? null
  );
}

/**
 * Finds edges matching the given query filters.
 * All filters are ANDed together. Omitting a field means no filter on that field.
 * When `active_only` is true, only edges with `invalidated_at IS NULL` are returned.
 */
export function findEdges(
  graph: EngramGraph,
  query: FindEdgesQuery = {},
): Edge[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.source_id !== undefined) {
    conditions.push("source_id = ?");
    params.push(query.source_id);
  }

  if (query.target_id !== undefined) {
    conditions.push("target_id = ?");
    params.push(query.target_id);
  }

  if (query.relation_type !== undefined) {
    conditions.push("relation_type = ?");
    params.push(query.relation_type);
  }

  if (query.edge_kind !== undefined) {
    conditions.push("edge_kind = ?");
    params.push(query.edge_kind);
  }

  if (query.asOf !== undefined) {
    // Learn-time filter: show edges the graph knew about at time T.
    // An edge was known at T if it was created at or before T AND
    // it had not yet been invalidated at T (or is still active).
    conditions.push("created_at <= ?");
    params.push(query.asOf);
    conditions.push("(invalidated_at IS NULL OR invalidated_at > ?)");
    params.push(query.asOf);
  } else {
    // Exclude invalidated edges unless include_invalidated is explicitly true.
    // active_only is a legacy alias for the same behaviour.
    if (query.active_only || !query.include_invalidated) {
      conditions.push("invalidated_at IS NULL");
    }
  }

  if (query.valid_at !== undefined) {
    // Half-open interval: valid_from <= valid_at < valid_until
    // NULL valid_from = -∞ (treat as always started), NULL valid_until = +∞ (treat as still current)
    conditions.push(
      "(valid_from IS NULL OR valid_from <= ?) AND (valid_until IS NULL OR valid_until > ?)",
    );
    params.push(query.valid_at, query.valid_at);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT * FROM edges ${where} ORDER BY created_at ASC`;

  return graph.db.query<Edge, unknown[]>(sql).all(...params);
}
