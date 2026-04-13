/**
 * projections-list.ts — listActiveProjections() and searchProjections() with
 * batched staleness computation.
 *
 * Split from projections.ts to keep file sizes under the 500-line limit.
 * Types live in projections-types.ts; core write operations live in projections.ts.
 */

import { createHash } from "node:crypto";
import type { EngramGraph } from "../format/index.js";
import type {
  AnchorType,
  GetProjectionResult,
  Projection,
  ProjectionEvidenceRow,
} from "./projections-types.js";

// ─── Filter options ───────────────────────────────────────────────────────────

export interface ListProjectionsOpts {
  kind?: string;
  anchor_type?: AnchorType;
  anchor_id?: string;
  /** Include invalidated (superseded) projections. Default: false. */
  include_superseded?: boolean;
}

// ─── Batched staleness helper ─────────────────────────────────────────────────

/**
 * Computes staleness for a batch of projections in bulk.
 *
 * Algorithm:
 * 1. Fetch all projection_evidence rows for the given projection IDs in one query.
 * 2. For each substrate table (episodes, entities, edges, projections), fetch
 *    current content hashes in a single SELECT-IN query.
 * 3. Recompute each projection's current fingerprint and compare against the
 *    stored input_fingerprint.
 *
 * Returns a Map<projectionId, { stale: boolean; stale_reason? }>.
 */
export function computeBatchedStaleness(
  graph: EngramGraph,
  projections: Projection[],
): Map<
  string,
  { stale: boolean; stale_reason?: "input_content_changed" | "input_deleted" }
> {
  const result = new Map<
    string,
    { stale: boolean; stale_reason?: "input_content_changed" | "input_deleted" }
  >();

  if (projections.length === 0) return result;

  const projIds = projections.map((p) => p.id);
  const placeholders = projIds.map(() => "?").join(", ");

  // Step 1: Fetch all evidence rows for all projections in one query
  const allEvidence = graph.db
    .query<ProjectionEvidenceRow, string[]>(
      `SELECT * FROM projection_evidence
        WHERE projection_id IN (${placeholders})
          AND role = 'input'`,
    )
    .all(...projIds);

  // Group evidence by projection_id
  const evidenceByProjection = new Map<string, ProjectionEvidenceRow[]>();
  for (const row of allEvidence) {
    const rows = evidenceByProjection.get(row.projection_id) ?? [];
    rows.push(row);
    evidenceByProjection.set(row.projection_id, rows);
  }

  // Collect target IDs per substrate table
  const episodeIds: string[] = [];
  const entityIds: string[] = [];
  const edgeIds: string[] = [];
  const projectionIds: string[] = [];

  for (const row of allEvidence) {
    switch (row.target_type) {
      case "episode":
        episodeIds.push(row.target_id);
        break;
      case "entity":
        entityIds.push(row.target_id);
        break;
      case "edge":
        edgeIds.push(row.target_id);
        break;
      case "projection":
        projectionIds.push(row.target_id);
        break;
    }
  }

  // Step 2: Fetch current content for each substrate table in one SELECT-IN per table

  // Episodes: hash is stored directly
  const episodeHashMap = new Map<
    string,
    { hash: string | null; deleted: boolean }
  >();
  if (episodeIds.length > 0) {
    const eps = graph.db
      .query<{ id: string; content_hash: string; status: string }, string[]>(
        `SELECT id, content_hash, status FROM episodes
          WHERE id IN (${episodeIds.map(() => "?").join(", ")})`,
      )
      .all(...episodeIds);
    for (const ep of eps) {
      episodeHashMap.set(ep.id, {
        hash: ep.status !== "redacted" ? ep.content_hash : null,
        deleted: ep.status === "redacted",
      });
    }
    // IDs not found in result are deleted
    for (const id of episodeIds) {
      if (!episodeHashMap.has(id)) {
        episodeHashMap.set(id, { hash: null, deleted: true });
      }
    }
  }

  // Entities: hash is computed from canonical_name + summary
  const entityHashMap = new Map<
    string,
    { hash: string | null; deleted: boolean }
  >();
  if (entityIds.length > 0) {
    const ents = graph.db
      .query<
        { id: string; canonical_name: string; summary: string | null },
        string[]
      >(
        `SELECT id, canonical_name, summary FROM entities
          WHERE id IN (${entityIds.map(() => "?").join(", ")})`,
      )
      .all(...entityIds);
    for (const ent of ents) {
      const c = `${ent.canonical_name}${ent.summary ? `: ${ent.summary}` : ""}`;
      entityHashMap.set(ent.id, {
        hash: createHash("sha256").update(c).digest("hex"),
        deleted: false,
      });
    }
    for (const id of entityIds) {
      if (!entityHashMap.has(id)) {
        entityHashMap.set(id, { hash: null, deleted: true });
      }
    }
  }

  // Edges: hash is computed from fact; invalidated_at signals deletion
  const edgeHashMap = new Map<
    string,
    { hash: string | null; deleted: boolean }
  >();
  if (edgeIds.length > 0) {
    const edges = graph.db
      .query<
        { id: string; fact: string; invalidated_at: string | null },
        string[]
      >(
        `SELECT id, fact, invalidated_at FROM edges
          WHERE id IN (${edgeIds.map(() => "?").join(", ")})`,
      )
      .all(...edgeIds);
    for (const edge of edges) {
      const deleted = edge.invalidated_at !== null;
      edgeHashMap.set(edge.id, {
        hash: deleted
          ? null
          : createHash("sha256").update(edge.fact).digest("hex"),
        deleted,
      });
    }
    for (const id of edgeIds) {
      if (!edgeHashMap.has(id)) {
        edgeHashMap.set(id, { hash: null, deleted: true });
      }
    }
  }

  // Projection inputs: hash is computed from body; invalidated_at signals deletion
  const projectionHashMap = new Map<
    string,
    { hash: string | null; deleted: boolean }
  >();
  if (projectionIds.length > 0) {
    const projs = graph.db
      .query<
        { id: string; body: string; invalidated_at: string | null },
        string[]
      >(
        `SELECT id, body, invalidated_at FROM projections
          WHERE id IN (${projectionIds.map(() => "?").join(", ")})`,
      )
      .all(...projectionIds);
    for (const proj of projs) {
      const deleted = proj.invalidated_at !== null;
      projectionHashMap.set(proj.id, {
        hash: deleted
          ? null
          : createHash("sha256").update(proj.body).digest("hex"),
        deleted,
      });
    }
    for (const id of projectionIds) {
      if (!projectionHashMap.has(id)) {
        projectionHashMap.set(id, { hash: null, deleted: true });
      }
    }
  }

  // Step 3: Recompute fingerprint for each projection and compare
  for (const projection of projections) {
    const evidenceRows = evidenceByProjection.get(projection.id) ?? [];

    let hasDeleted = false;
    const entries: string[] = [];

    for (const row of evidenceRows) {
      let current: { hash: string | null; deleted: boolean } | undefined;

      switch (row.target_type) {
        case "episode":
          current = episodeHashMap.get(row.target_id);
          break;
        case "entity":
          current = entityHashMap.get(row.target_id);
          break;
        case "edge":
          current = edgeHashMap.get(row.target_id);
          break;
        case "projection":
          current = projectionHashMap.get(row.target_id);
          break;
      }

      if (current?.deleted) hasDeleted = true;
      const currentHash = current?.hash ?? null;
      entries.push(`${row.target_type}:${row.target_id}:${currentHash ?? ""}`);
    }

    entries.sort();
    const currentFingerprint = createHash("sha256")
      .update(entries.join("\n"))
      .digest("hex");

    const stale = currentFingerprint !== projection.input_fingerprint;
    if (!stale) {
      result.set(projection.id, { stale: false });
    } else {
      result.set(projection.id, {
        stale: true,
        stale_reason: hasDeleted ? "input_deleted" : "input_content_changed",
      });
    }
  }

  return result;
}

// ─── listActiveProjections() ──────────────────────────────────────────────────

/**
 * Returns all non-invalidated projections, each with the staleness flag computed.
 * Uses batched fingerprint computation for efficiency.
 */
export function listActiveProjections(
  graph: EngramGraph,
  opts?: ListProjectionsOpts,
): GetProjectionResult[] {
  const conditions: string[] = [];
  const params: string[] = [];

  if (!opts?.include_superseded) {
    conditions.push("invalidated_at IS NULL");
  }

  if (opts?.kind !== undefined) {
    conditions.push("kind = ?");
    params.push(opts.kind);
  }
  if (opts?.anchor_type !== undefined) {
    conditions.push("anchor_type = ?");
    params.push(opts.anchor_type);
  }
  if (opts?.anchor_id !== undefined) {
    conditions.push("anchor_id = ?");
    params.push(opts.anchor_id);
  }

  const whereClause = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  const projections = graph.db
    .query<Projection, string[]>(
      `SELECT * FROM projections WHERE ${whereClause} ORDER BY created_at DESC`,
    )
    .all(...params);

  const stalenessMap = computeBatchedStaleness(graph, projections);

  return projections.map((projection) => {
    const s = stalenessMap.get(projection.id) ?? { stale: false };
    return {
      projection,
      stale: s.stale,
      stale_reason: s.stale_reason,
      last_assessed_at: projection.last_assessed_at,
    };
  });
}

// ─── searchProjections() ──────────────────────────────────────────────────────

/**
 * FTS5 search over projections_fts. Returns matching active projections with
 * staleness computed via the batched helper.
 */
export function searchProjections(
  graph: EngramGraph,
  query: string,
  opts?: ListProjectionsOpts,
): GetProjectionResult[] {
  const conditions: string[] = ["projections_fts MATCH ?"];
  const params: string[] = [query];

  if (!opts?.include_superseded) {
    conditions.push("p.invalidated_at IS NULL");
  }

  if (opts?.kind !== undefined) {
    conditions.push("p.kind = ?");
    params.push(opts.kind);
  }
  if (opts?.anchor_type !== undefined) {
    conditions.push("p.anchor_type = ?");
    params.push(opts.anchor_type);
  }
  if (opts?.anchor_id !== undefined) {
    conditions.push("p.anchor_id = ?");
    params.push(opts.anchor_id);
  }

  const whereClause = conditions.join(" AND ");
  const projections = graph.db
    .query<Projection, string[]>(
      `SELECT p.* FROM projections p
         JOIN projections_fts ON projections_fts.rowid = p._rowid
        WHERE ${whereClause}
        ORDER BY rank`,
    )
    .all(...params);

  const stalenessMap = computeBatchedStaleness(graph, projections);

  return projections.map((projection) => {
    const s = stalenessMap.get(projection.id) ?? { stale: false };
    return {
      projection,
      stale: s.stale,
      stale_reason: s.stale_reason,
      last_assessed_at: projection.last_assessed_at,
    };
  });
}
