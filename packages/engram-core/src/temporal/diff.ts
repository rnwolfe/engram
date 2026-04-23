/**
 * diff.ts — temporal diff of the knowledge graph between two ref timestamps.
 *
 * Computes what changed in edges and projections between snapshot A and snapshot B.
 * Edges: added (active at B, not A), invalidated (active at A, not B), superseded,
 * unchanged, and transient (net-zero).
 * Projections: created, superseded, invalidated, unchanged.
 * Ownership shifts: entities whose top-weight `likely_owner_of` edge changed.
 * Decision reversals: `decision_page` projections superseded between A and B.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge } from "../graph/edges.js";
import { findEdges } from "../graph/edges.js";
import type { Projection } from "../graph/projections-types.js";
import { RELATION_TYPES } from "../vocab/relation-types.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiffEdgeEntry {
  edge: Edge;
  /** For superseded entries, the id of the edge that replaced this one. */
  superseded_by?: string;
}

export interface DiffEdges {
  added: DiffEdgeEntry[];
  invalidated: DiffEdgeEntry[];
  superseded: DiffEdgeEntry[];
  unchanged: DiffEdgeEntry[];
  /** Net-zero edges: added and invalidated between A and B. Hidden by default. */
  transient: DiffEdgeEntry[];
}

export interface DiffProjectionEntry {
  projection: Projection;
  superseded_by?: string;
}

export interface DiffProjections {
  created: DiffProjectionEntry[];
  superseded: DiffProjectionEntry[];
  invalidated: DiffProjectionEntry[];
  unchanged: DiffProjectionEntry[];
}

export interface OwnershipShift {
  entity_id: string;
  entity_name: string;
  /** null when the entity was previously unowned */
  from_owner_id: string | null;
  from_owner_name: string | null;
  /** null when ownership was removed */
  to_owner_id: string | null;
  to_owner_name: string | null;
  from_edge_id: string | null;
  to_edge_id: string | null;
}

export interface DecisionReversal {
  projection_id: string;
  title: string;
  superseded_by_id: string | null;
  superseded_at: string | null;
}

export interface GraphDiff {
  refA: string;
  refB: string;
  edges: DiffEdges;
  projections: DiffProjections;
  ownership_shifts: OwnershipShift[];
  decision_reversals: DecisionReversal[];
}

export interface DiffOpts {
  /** Filter edges by relation_type (comma-separated or array). */
  kinds?: string[];
  /** Filter projections by kind. */
  projectionKind?: string;
  /** Scope diff to a single entity (as source or target of edges). */
  entityId?: string;
  /** Include transient (net-zero) edges in result. Default: false. */
  includeTransient?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Return edges whose validity window covers a given domain timestamp.
 *
 * Uses `valid_at` (half-open interval) with `include_invalidated: true` so
 * that superseded edges (which have `valid_until` set by the supersession)
 * are returned for the snapshot at which they were still valid.
 *
 * Edges with NULL valid_from and NULL valid_until (open-ended) are always
 * included, which is correct: they represent currently-active facts with no
 * known start or end.
 */
function activeEdgesAt(graph: EngramGraph, at: string): Map<string, Edge> {
  const edges = findEdges(graph, { valid_at: at, include_invalidated: true });
  const map = new Map<string, Edge>();
  for (const e of edges) {
    map.set(e.id, e);
  }
  return map;
}

/**
 * Return projections whose validity window covers the given domain timestamp.
 * Uses the same half-open interval logic as edges: [valid_from, valid_until).
 * Includes invalidated projections (those with valid_until set by supersession).
 */
function projectionsAt(
  graph: EngramGraph,
  at: string,
): Map<string, Projection> {
  const rows = graph.db
    .query<Projection, [string, string, string]>(
      `SELECT * FROM projections
        WHERE valid_from <= ?
          AND (valid_until IS NULL OR valid_until > ?)
          AND (invalidated_at IS NULL OR invalidated_at >= ?)`,
    )
    .all(at, at, at);

  const map = new Map<string, Projection>();
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/**
 * Derive the dominant owner for an entity from a set of edges (by weight).
 * Returns null when the entity has no `likely_owner_of` edges targeting it.
 */
function dominantOwner(
  edges: Edge[],
  entityId: string,
): { owner_id: string; edge_id: string } | null {
  const ownerEdges = edges.filter(
    (e) =>
      e.relation_type === RELATION_TYPES.LIKELY_OWNER_OF &&
      e.target_id === entityId,
  );
  if (ownerEdges.length === 0) return null;
  ownerEdges.sort((a, b) => b.weight - a.weight);
  return { owner_id: ownerEdges[0].source_id, edge_id: ownerEdges[0].id };
}

// ─── diffGraph ────────────────────────────────────────────────────────────────

/**
 * Compute the temporal diff of the knowledge graph between two ISO8601 timestamps.
 *
 * Both timestamps must be UTC ISO8601. The caller is responsible for resolving
 * git refs or relative durations to ISO strings before calling this function.
 *
 * Returns a GraphDiff with edge and projection buckets. Transient entries are
 * always computed and placed in `edges.transient`.
 */
export function diffGraph(
  graph: EngramGraph,
  refA: string,
  refB: string,
  opts: DiffOpts = {},
): GraphDiff {
  // ── Snapshot edges using learn-time filter ─────────────────────────────────
  const edgesAtA = activeEdgesAt(graph, refA);
  const edgesAtB = activeEdgesAt(graph, refB);

  // Fetch edges that existed entirely within the A→B window (transient candidates).
  // A transient edge: valid_from > refA AND valid_until <= refB
  // These edges were not in either snapshot but existed in between.
  const edgesTransientCandidates = graph.db
    .query<Edge, [string, string]>(
      `SELECT * FROM edges
        WHERE valid_from > ?
          AND valid_until IS NOT NULL
          AND valid_until <= ?`,
    )
    .all(refA, refB);

  const edgesTransientMap = new Map<string, Edge>();
  for (const e of edgesTransientCandidates) {
    edgesTransientMap.set(e.id, e);
  }

  // ── Classify edges ──────────────────────────────────────────────────────────
  const added: DiffEdgeEntry[] = [];
  const invalidated: DiffEdgeEntry[] = [];
  const superseded: DiffEdgeEntry[] = [];
  const unchanged: DiffEdgeEntry[] = [];
  const transient: DiffEdgeEntry[] = [];

  // Edges active at A: check if still active at B, or gone
  for (const [id, edgeA] of edgesAtA) {
    if (edgesAtB.has(id)) {
      unchanged.push({ edge: edgeA });
    } else if (edgeA.superseded_by) {
      superseded.push({ edge: edgeA, superseded_by: edgeA.superseded_by });
    } else {
      invalidated.push({ edge: edgeA });
    }
  }

  // Edges active at B but not at A
  for (const [id, edgeB] of edgesAtB) {
    if (!edgesAtA.has(id)) {
      added.push({ edge: edgeB });
    }
  }

  // Transient edges: valid in the A→B window but not at either endpoint.
  // These edges have valid_from > refA AND valid_until <= refB, so they
  // appear in neither edgesAtA nor edgesAtB.
  for (const [id, edge] of edgesTransientMap) {
    if (!edgesAtA.has(id) && !edgesAtB.has(id)) {
      transient.push({ edge, superseded_by: edge.superseded_by ?? undefined });
    }
  }

  // Apply filters
  const applyEdgeFilters = (entries: DiffEdgeEntry[]): DiffEdgeEntry[] => {
    let result = entries;
    if (opts.kinds && opts.kinds.length > 0) {
      result = result.filter((e) => opts.kinds?.includes(e.edge.relation_type));
    }
    if (opts.entityId) {
      result = result.filter(
        (e) =>
          e.edge.source_id === opts.entityId ||
          e.edge.target_id === opts.entityId,
      );
    }
    return result;
  };

  // ── Classify projections ────────────────────────────────────────────────────
  const projAtA = projectionsAt(graph, refA);
  const projAtB = projectionsAt(graph, refB);

  const projCreated: DiffProjectionEntry[] = [];
  const projSuperseded: DiffProjectionEntry[] = [];
  const projInvalidated: DiffProjectionEntry[] = [];
  const projUnchanged: DiffProjectionEntry[] = [];

  for (const [id, pA] of projAtA) {
    if (projAtB.has(id)) {
      projUnchanged.push({ projection: pA });
    } else if (pA.superseded_by) {
      projSuperseded.push({ projection: pA, superseded_by: pA.superseded_by });
    } else {
      projInvalidated.push({ projection: pA });
    }
  }

  for (const [id, pB] of projAtB) {
    if (!projAtA.has(id)) {
      projCreated.push({ projection: pB });
    }
  }

  // Apply projection kind filter
  const filterProjections = (
    entries: DiffProjectionEntry[],
  ): DiffProjectionEntry[] => {
    if (!opts.projectionKind) return entries;
    return entries.filter((e) => e.projection.kind === opts.projectionKind);
  };

  // ── Ownership shifts ────────────────────────────────────────────────────────
  const ownershipShifts: OwnershipShift[] = [];
  const allEdgesA = [...edgesAtA.values()];
  const allEdgesB = [...edgesAtB.values()];

  // Collect all entity IDs that appear in ownership edges at either snapshot
  const ownershipEntityIds = new Set<string>();
  for (const e of [...allEdgesA, ...allEdgesB]) {
    if (e.relation_type === RELATION_TYPES.LIKELY_OWNER_OF) {
      ownershipEntityIds.add(e.target_id);
    }
  }

  for (const entityId of ownershipEntityIds) {
    const ownerA = dominantOwner(allEdgesA, entityId);
    const ownerB = dominantOwner(allEdgesB, entityId);

    const ownerIdA = ownerA?.owner_id ?? null;
    const ownerIdB = ownerB?.owner_id ?? null;

    if (ownerIdA !== ownerIdB) {
      const entityRow = graph.db
        .query<{ canonical_name: string }, [string]>(
          "SELECT canonical_name FROM entities WHERE id = ?",
        )
        .get(entityId);
      const entityName = entityRow?.canonical_name ?? entityId;

      const resolveOwnerName = (ownerId: string | null): string | null => {
        if (!ownerId) return null;
        const row = graph.db
          .query<{ canonical_name: string }, [string]>(
            "SELECT canonical_name FROM entities WHERE id = ?",
          )
          .get(ownerId);
        return row?.canonical_name ?? ownerId;
      };

      ownershipShifts.push({
        entity_id: entityId,
        entity_name: entityName,
        from_owner_id: ownerIdA,
        from_owner_name: resolveOwnerName(ownerIdA),
        to_owner_id: ownerIdB,
        to_owner_name: resolveOwnerName(ownerIdB),
        from_edge_id: ownerA?.edge_id ?? null,
        to_edge_id: ownerB?.edge_id ?? null,
      });
    }
  }

  // ── Decision reversals ──────────────────────────────────────────────────────
  const decisionReversals: DecisionReversal[] = [];

  for (const entry of projSuperseded) {
    if (entry.projection.kind === "decision_page") {
      decisionReversals.push({
        projection_id: entry.projection.id,
        title: entry.projection.title,
        superseded_by_id: entry.superseded_by ?? null,
        superseded_at: entry.projection.invalidated_at ?? null,
      });
    }
  }

  return {
    refA,
    refB,
    edges: {
      added: applyEdgeFilters(added),
      invalidated: applyEdgeFilters(invalidated),
      superseded: applyEdgeFilters(superseded),
      unchanged: applyEdgeFilters(unchanged),
      transient: applyEdgeFilters(transient),
    },
    projections: {
      created: filterProjections(projCreated),
      superseded: filterProjections(projSuperseded),
      invalidated: filterProjections(projInvalidated),
      unchanged: filterProjections(projUnchanged),
    },
    ownership_shifts: ownershipShifts,
    decision_reversals: decisionReversals,
  };
}
