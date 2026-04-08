/**
 * ownership.ts — Ownership risk report for the engram graph.
 *
 * Combines decay signals (concentrated-risk, dormant-owner, orphaned) with
 * likely_owner_of edge analysis to produce a ranked ownership risk report.
 *
 * Risk classification thresholds:
 *   critical  = dormant owner (>180 days) AND (concentrated-risk OR coupling >= 10)
 *   elevated  = concentrated-risk OR dormant owner OR coupling >= 10
 *   stable    = otherwise
 */

import type { EngramGraph } from "../format/index.js";
import { getDecayReport } from "./decay.js";

const DORMANT_DAYS_DEFAULT = 180;
const COUPLING_THRESHOLD = 10;

export type OwnershipRiskLevel = "critical" | "elevated" | "stable";

export interface OwnershipRiskEntry {
  entity_id: string;
  entity_name: string;
  risk_level: OwnershipRiskLevel;
  owner_id: string | null;
  owner_name: string | null;
  owner_confidence: number;
  days_since_owner_activity: number | null;
  decay_types: string[];
  coupling_count: number;
  evidence_ids: string[];
}

export interface OwnershipReport {
  generated_at: string;
  total_entities_analyzed: number;
  critical_count: number;
  elevated_count: number;
  stable_count: number;
  entries: OwnershipRiskEntry[];
}

export interface OwnershipReportOpts {
  module?: string;
  limit?: number;
  min_confidence?: number;
  valid_at?: string;
}

// ---------------------------------------------------------------------------
// Internal query helpers
// ---------------------------------------------------------------------------

interface OwnerEdgeRow {
  id: string;
  source_id: string;
  target_id: string;
  confidence: number;
  owner_name: string | null;
}

interface ActivityRow {
  last_ts: string;
}

interface EvidenceRow {
  episode_id: string;
}

interface EntityNameRow {
  id: string;
  canonical_name: string;
}

function findStrongestOwner(
  graph: EngramGraph,
  entityId: string,
  minConfidence: number,
  validAt: string | undefined,
): OwnerEdgeRow | null {
  const params: unknown[] = [entityId, minConfidence];

  let temporalClause = "";
  if (validAt) {
    temporalClause =
      " AND (ed.valid_from IS NULL OR ed.valid_from <= ?) AND (ed.valid_until IS NULL OR ed.valid_until > ?)";
    params.push(validAt, validAt);
  }

  const row = graph.db
    .query<OwnerEdgeRow, unknown[]>(
      `SELECT ed.id, ed.source_id, ed.target_id, ed.confidence,
              en.canonical_name AS owner_name
       FROM edges ed
       JOIN entities en ON en.id = ed.source_id
       WHERE ed.target_id = ?
         AND ed.relation_type = 'likely_owner_of'
         AND ed.invalidated_at IS NULL
         AND ed.confidence >= ?${temporalClause}
       ORDER BY ed.confidence DESC
       LIMIT 1`,
    )
    .get(...params);

  return row ?? null;
}

function daysSinceOwnerActivity(
  graph: EngramGraph,
  ownerId: string,
  nowMs: number,
  validAt: string | undefined,
): number | null {
  const params: unknown[] = [ownerId];
  let temporalClause = "";
  if (validAt) {
    temporalClause = " AND (ed.valid_from IS NULL OR ed.valid_from <= ?)";
    params.push(validAt);
  }

  // Find the most recent authored_by edge for this owner (capped at valid_at if provided)
  const row = graph.db
    .query<ActivityRow, unknown[]>(
      `SELECT MAX(ed.valid_from) AS last_ts
       FROM edges ed
       WHERE ed.source_id = ?
         AND ed.relation_type = 'authored_by'
         AND ed.invalidated_at IS NULL${temporalClause}`,
    )
    .get(...params);

  if (!row?.last_ts) {
    // Fallback: check episodes linked via entity evidence for the owner
    const fallback = graph.db
      .query<ActivityRow, [string]>(
        `SELECT MAX(ep.timestamp) AS last_ts
         FROM episodes ep
         JOIN entity_evidence ee ON ee.episode_id = ep.id
         WHERE ee.entity_id = ?
           AND ep.status != 'redacted'`,
      )
      .get(ownerId);

    if (!fallback?.last_ts) return null;
    const ms = nowMs - new Date(fallback.last_ts).getTime();
    return Math.round(ms / (24 * 60 * 60 * 1000));
  }

  const ms = nowMs - new Date(row.last_ts).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function countCouplingEdges(graph: EngramGraph, entityId: string): number {
  const row = graph.db
    .query<{ cnt: number }, [string, string]>(
      `SELECT COUNT(*) AS cnt
       FROM edges
       WHERE (source_id = ? OR target_id = ?)
         AND relation_type = 'co_changes_with'
         AND invalidated_at IS NULL`,
    )
    .get(entityId, entityId);

  return row?.cnt ?? 0;
}

function getEntityEvidenceIds(graph: EngramGraph, entityId: string): string[] {
  const rows = graph.db
    .query<EvidenceRow, [string]>(
      `SELECT DISTINCT episode_id FROM entity_evidence WHERE entity_id = ? LIMIT 10`,
    )
    .all(entityId);

  return rows.map((r) => r.episode_id);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute an ownership risk report by combining decay signals with owner edge analysis.
 */
export function getOwnershipReport(
  graph: EngramGraph,
  opts?: OwnershipReportOpts,
): OwnershipReport {
  const limit = opts?.limit ?? 20;
  const minConfidence = opts?.min_confidence ?? 0.1;
  const modulePrefix = opts?.module;
  const validAt = opts?.valid_at;
  const dormantDays = DORMANT_DAYS_DEFAULT;

  const generated_at = new Date().toISOString();
  // Bug 4 fix: anchor dormancy calculation at valid_at (not wall-clock) for historical snapshots
  const nowMs = validAt ? new Date(validAt).getTime() : Date.now();

  // Step 1: Get decay candidates
  // Note: we do not pass dormant_days here because dormancy is computed below
  // via daysSinceOwnerActivity() using the owner's authored_by edges, anchored
  // at valid_at when provided. Passing dormant_days to getDecayReport would add
  // entity-level dormant_owner signals that are redundant and not temporally
  // consistent with the valid_at snapshot.
  const decayReport = getDecayReport(graph, {});

  // Build maps from entity_id -> decay categories
  const decayByEntity = new Map<string, Set<string>>();
  for (const item of decayReport.decay_items) {
    if (item.type !== "entity") continue;
    const cats = decayByEntity.get(item.id) ?? new Set();
    cats.add(item.decay_category);
    decayByEntity.set(item.id, cats);
  }

  // Step 2: Collect candidate entities (those with at least one decay signal
  // OR that have a likely_owner_of edge pointing to them)
  const candidateIds = new Set<string>(decayByEntity.keys());

  // Also include entities that have at least one likely_owner_of inbound edge
  const ownerTargetRows = graph.db
    .query<{ target_id: string }, []>(
      `SELECT DISTINCT target_id
       FROM edges
       WHERE relation_type = 'likely_owner_of'
         AND invalidated_at IS NULL`,
    )
    .all();
  for (const row of ownerTargetRows) {
    candidateIds.add(row.target_id);
  }

  // Step 3: Resolve entity names
  const nameMap = new Map<string, string>();
  if (candidateIds.size > 0) {
    const placeholders = Array.from(candidateIds)
      .map(() => "?")
      .join(",");
    const nameRows = graph.db
      .query<EntityNameRow, unknown[]>(
        `SELECT id, canonical_name FROM entities WHERE id IN (${placeholders}) AND status = 'active'`,
      )
      .all(...Array.from(candidateIds));
    for (const r of nameRows) {
      nameMap.set(r.id, r.canonical_name);
    }
  }

  // Step 4: Build entries
  const entries: OwnershipRiskEntry[] = [];

  for (const entityId of candidateIds) {
    const entityName = nameMap.get(entityId);
    if (!entityName) continue; // entity not active or not found

    // Module filter: check if entity name starts with module prefix
    if (modulePrefix && !entityName.startsWith(modulePrefix)) continue;

    const decayCats = decayByEntity.get(entityId);
    const decayTypes = decayCats ? Array.from(decayCats) : [];

    // Find strongest likely_owner_of edge
    const ownerEdge = findStrongestOwner(
      graph,
      entityId,
      minConfidence,
      validAt,
    );

    const ownerId = ownerEdge?.source_id ?? null;
    const ownerName = ownerEdge?.owner_name ?? null;
    const ownerConfidence = ownerEdge?.confidence ?? 0;

    // Days since owner last activity (Bug 5 fix: pass validAt to filter authored_by edges)
    const daysSinceActivity =
      ownerId !== null
        ? daysSinceOwnerActivity(graph, ownerId, nowMs, validAt)
        : null;

    // Count co_changes_with edges for blast radius
    const couplingCount = countCouplingEdges(graph, entityId);

    // Classification
    // Bug 1 fix: dormant owner requires a known owner (ownerId != null).
    // Entities with no likely_owner_of edge are orphaned/unowned — not dormant-owner.
    const isDormantOwner =
      ownerId !== null &&
      daysSinceActivity !== null &&
      daysSinceActivity > dormantDays;
    const isConcentratedRisk = decayTypes.includes("concentrated_risk");
    const isHighCoupling = couplingCount >= COUPLING_THRESHOLD;

    let risk_level: OwnershipRiskLevel;
    if (isDormantOwner && (isConcentratedRisk || isHighCoupling)) {
      risk_level = "critical";
    } else if (isConcentratedRisk || isDormantOwner || isHighCoupling) {
      risk_level = "elevated";
    } else {
      risk_level = "stable";
    }

    // Collect evidence ids (from entity evidence)
    const evidenceIds = getEntityEvidenceIds(graph, entityId);

    // Evidence invariant: skip entries with no evidence
    if (evidenceIds.length === 0) continue;

    entries.push({
      entity_id: entityId,
      entity_name: entityName,
      risk_level,
      owner_id: ownerId,
      owner_name: ownerName,
      owner_confidence: ownerConfidence,
      days_since_owner_activity: daysSinceActivity,
      decay_types: decayTypes,
      coupling_count: couplingCount,
      evidence_ids: evidenceIds,
    });
  }

  // Sort: critical first, then elevated, then stable
  const riskOrder: Record<OwnershipRiskLevel, number> = {
    critical: 0,
    elevated: 1,
    stable: 2,
  };
  entries.sort((a, b) => riskOrder[a.risk_level] - riskOrder[b.risk_level]);

  const limited = entries.slice(0, limit);

  const critical_count = limited.filter(
    (e) => e.risk_level === "critical",
  ).length;
  const elevated_count = limited.filter(
    (e) => e.risk_level === "elevated",
  ).length;
  const stable_count = limited.filter((e) => e.risk_level === "stable").length;

  return {
    generated_at,
    // Bug 2 fix: count unique candidates examined, not entries after the evidence filter
    total_entities_analyzed: candidateIds.size,
    critical_count,
    elevated_count,
    stable_count,
    entries: limited,
  };
}
