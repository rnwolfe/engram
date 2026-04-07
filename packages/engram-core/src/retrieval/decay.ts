/**
 * decay.ts — Knowledge decay detection for the engram graph.
 *
 * Detects five categories of knowledge decay:
 *   - stale_evidence: entities/edges with no recent supporting evidence
 *   - contradicted: edges recently superseded by newer facts
 *   - concentrated_risk: entities with many edges but few distinct owners
 *   - dormant_owner: entities whose primary contributor has gone quiet
 *   - orphaned: active entities with no active edges
 */

import type { EngramGraph } from "../format/index.js";

export type DecayCategory =
  | "stale_evidence"
  | "contradicted"
  | "concentrated_risk"
  | "dormant_owner"
  | "orphaned";

export type DecaySeverity = "low" | "medium" | "high" | "critical";

export interface DecayItem {
  type: "entity" | "edge";
  id: string;
  name: string;
  decay_category: DecayCategory;
  severity: DecaySeverity;
  details: string;
  last_evidence_at: string | null;
}

export interface DecayReport {
  generated_at: string;
  total_entities: number;
  total_edges: number;
  decay_items: DecayItem[];
  summary: {
    stale_evidence: number;
    contradicted: number;
    concentrated_risk: number;
    dormant_owner: number;
    orphaned: number;
  };
}

export interface DecayOpts {
  stale_days?: number;
  dormant_days?: number;
  min_edges_for_risk?: number;
}

const SEVERITY_ORDER: Record<DecaySeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function staleSeverity(ageDays: number, staleDays: number): DecaySeverity {
  if (ageDays > staleDays * 8) return "critical";
  if (ageDays > staleDays * 4) return "high";
  if (ageDays > staleDays * 2) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// stale_evidence detection
// ---------------------------------------------------------------------------

interface StaleRow {
  id: string;
  name: string;
  item_type: string;
  max_ts: string | null;
}

function detectStaleEvidence(
  graph: EngramGraph,
  staleDays: number,
  nowMs: number,
): DecayItem[] {
  const items: DecayItem[] = [];
  const staleMs = staleDays * 24 * 60 * 60 * 1000;

  // Entities: find max episode timestamp per entity
  const entityRows = graph.db
    .query<StaleRow, []>(`
      SELECT
        e.id,
        e.canonical_name AS name,
        'entity' AS item_type,
        MAX(ep.timestamp) AS max_ts
      FROM entities e
      LEFT JOIN entity_evidence ee ON ee.entity_id = e.id
      LEFT JOIN episodes ep ON ep.id = ee.episode_id AND ep.status != 'redacted'
      WHERE e.status = 'active'
      GROUP BY e.id
    `)
    .all();

  for (const row of entityRows) {
    if (!row.max_ts) continue;
    const ageMs = nowMs - new Date(row.max_ts).getTime();
    if (ageMs > staleMs) {
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      items.push({
        type: "entity",
        id: row.id,
        name: row.name,
        decay_category: "stale_evidence",
        severity: staleSeverity(ageDays, staleDays),
        details: `No evidence updates in ${Math.round(ageDays)} days (threshold: ${staleDays})`,
        last_evidence_at: row.max_ts,
      });
    }
  }

  // Edges: find max episode timestamp per active edge
  const edgeRows = graph.db
    .query<StaleRow, []>(`
      SELECT
        ed.id,
        ed.fact AS name,
        'edge' AS item_type,
        MAX(ep.timestamp) AS max_ts
      FROM edges ed
      LEFT JOIN edge_evidence eve ON eve.edge_id = ed.id
      LEFT JOIN episodes ep ON ep.id = eve.episode_id AND ep.status != 'redacted'
      WHERE ed.invalidated_at IS NULL
      GROUP BY ed.id
    `)
    .all();

  for (const row of edgeRows) {
    if (!row.max_ts) continue;
    const ageMs = nowMs - new Date(row.max_ts).getTime();
    if (ageMs > staleMs) {
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      items.push({
        type: "edge",
        id: row.id,
        name: row.name,
        decay_category: "stale_evidence",
        severity: staleSeverity(ageDays, staleDays),
        details: `No evidence updates in ${Math.round(ageDays)} days (threshold: ${staleDays})`,
        last_evidence_at: row.max_ts,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// contradicted detection
// ---------------------------------------------------------------------------

interface ContradictedRow {
  id: string;
  fact: string;
  invalidated_at: string;
}

function detectContradicted(
  graph: EngramGraph,
  staleDays: number,
  nowMs: number,
): DecayItem[] {
  const recentWindowMs = staleDays * 2 * 24 * 60 * 60 * 1000;

  const rows = graph.db
    .query<ContradictedRow, []>(`
      SELECT id, fact, invalidated_at
      FROM edges
      WHERE invalidated_at IS NOT NULL AND superseded_by IS NOT NULL
    `)
    .all();

  return rows.map((row) => {
    const ageMs = nowMs - new Date(row.invalidated_at).getTime();
    const severity: DecaySeverity = ageMs <= recentWindowMs ? "medium" : "low";
    return {
      type: "edge" as const,
      id: row.id,
      name: row.fact,
      decay_category: "contradicted" as const,
      severity,
      details: `Edge was superseded at ${row.invalidated_at}`,
      last_evidence_at: null,
    };
  });
}

// ---------------------------------------------------------------------------
// concentrated_risk detection
// ---------------------------------------------------------------------------

interface RiskRow {
  id: string;
  canonical_name: string;
  edge_count: number;
  owner_count: number;
}

function detectConcentratedRisk(
  graph: EngramGraph,
  minEdges: number,
): DecayItem[] {
  const rows = graph.db
    .query<RiskRow, [number]>(`
      SELECT
        en.id,
        en.canonical_name,
        COUNT(DISTINCT ed.id) AS edge_count,
        COUNT(DISTINCT ep.owner_id) AS owner_count
      FROM entities en
      JOIN edges ed ON (ed.source_id = en.id OR ed.target_id = en.id)
        AND ed.invalidated_at IS NULL
      JOIN entity_evidence ee ON ee.entity_id = en.id
      JOIN episodes ep ON ep.id = ee.episode_id
        AND ep.status != 'redacted'
        AND ep.owner_id IS NOT NULL
      WHERE en.status = 'active'
      GROUP BY en.id
      HAVING COUNT(DISTINCT ed.id) >= ?
        AND COUNT(DISTINCT ep.owner_id) <= 2
    `)
    .all(minEdges);

  return rows.map((row) => ({
    type: "entity" as const,
    id: row.id,
    name: row.canonical_name,
    decay_category: "concentrated_risk" as const,
    severity: (row.owner_count <= 1 ? "high" : "medium") as DecaySeverity,
    details: `${row.edge_count} active edges backed by only ${row.owner_count} distinct owner(s)`,
    last_evidence_at: null,
  }));
}

// ---------------------------------------------------------------------------
// dormant_owner detection
// ---------------------------------------------------------------------------

interface ActorRow {
  entity_id: string;
  canonical_name: string;
  actor: string;
  last_ts: string;
  weight_sum: number;
}

function detectDormantOwner(
  graph: EngramGraph,
  dormantDays: number,
  nowMs: number,
): DecayItem[] {
  const HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000;

  // Pull all (entity, actor, episode timestamp) combinations
  const rawRows = graph.db
    .query<
      { entity_id: string; canonical_name: string; actor: string; ts: string },
      []
    >(`
      SELECT
        en.id AS entity_id,
        en.canonical_name,
        ep.actor,
        ep.timestamp AS ts
      FROM entities en
      JOIN entity_evidence ee ON ee.entity_id = en.id
      JOIN episodes ep ON ep.id = ee.episode_id
        AND ep.status != 'redacted'
        AND ep.actor IS NOT NULL
      WHERE en.status = 'active'
    `)
    .all();

  // Group by entity + actor and accumulate recency weights
  const actorMap = new Map<string, ActorRow>();

  for (const row of rawRows) {
    const key = `${row.entity_id}::${row.actor}`;
    const tsMs = new Date(row.ts).getTime();
    const ageMs = nowMs - tsMs;
    const weight = Math.exp((-ageMs * Math.LN2) / HALF_LIFE_MS);

    const existing = actorMap.get(key);
    if (existing) {
      existing.weight_sum += weight;
      if (row.ts > existing.last_ts) {
        existing.last_ts = row.ts;
      }
    } else {
      actorMap.set(key, {
        entity_id: row.entity_id,
        canonical_name: row.canonical_name,
        actor: row.actor,
        last_ts: row.ts,
        weight_sum: weight,
      });
    }
  }

  // For each entity find top author by weight_sum, then check if dormant
  const topAuthorByEntity = new Map<string, ActorRow>();
  for (const row of actorMap.values()) {
    const existing = topAuthorByEntity.get(row.entity_id);
    if (!existing || row.weight_sum > existing.weight_sum) {
      topAuthorByEntity.set(row.entity_id, row);
    }
  }

  const dormantMs = dormantDays * 24 * 60 * 60 * 1000;
  const items: DecayItem[] = [];

  for (const top of topAuthorByEntity.values()) {
    const inactiveMs = nowMs - new Date(top.last_ts).getTime();
    if (inactiveMs > dormantMs) {
      const inactiveDays = Math.round(inactiveMs / (24 * 60 * 60 * 1000));
      const severity: DecaySeverity =
        inactiveMs > dormantMs * 2 ? "high" : "medium";
      items.push({
        type: "entity",
        id: top.entity_id,
        name: top.canonical_name,
        decay_category: "dormant_owner",
        severity,
        details: `Primary contributor '${top.actor}' inactive for ${inactiveDays} days (threshold: ${dormantDays})`,
        last_evidence_at: top.last_ts,
      });
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// orphaned detection
// ---------------------------------------------------------------------------

interface OrphanRow {
  id: string;
  canonical_name: string;
}

function detectOrphaned(graph: EngramGraph): DecayItem[] {
  const rows = graph.db
    .query<OrphanRow, []>(`
      SELECT en.id, en.canonical_name
      FROM entities en
      WHERE en.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM edges ed
          WHERE ed.invalidated_at IS NULL
            AND (ed.source_id = en.id OR ed.target_id = en.id)
        )
    `)
    .all();

  return rows.map((row) => ({
    type: "entity" as const,
    id: row.id,
    name: row.canonical_name,
    decay_category: "orphaned" as const,
    severity: "low" as DecaySeverity,
    details: "Active entity with no active edges",
    last_evidence_at: null,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all five decay detection passes and return a consolidated DecayReport.
 * Results are sorted: critical → high → medium → low.
 */
export function getDecayReport(
  graph: EngramGraph,
  opts?: DecayOpts,
): DecayReport {
  const staleDays = opts?.stale_days ?? 180;
  const dormantDays = opts?.dormant_days ?? 90;
  const minEdges = opts?.min_edges_for_risk ?? 3;
  const now = new Date();
  const nowMs = now.getTime();
  const generated_at = now.toISOString();

  // Total counts
  const countEntitiesRow = graph.db
    .query<{ total_entities: number }, []>(
      "SELECT COUNT(*) AS total_entities FROM entities WHERE status = 'active'",
    )
    .get();
  const total_entities = countEntitiesRow?.total_entities ?? 0;

  const countEdgesRow = graph.db
    .query<{ total_edges: number }, []>(
      "SELECT COUNT(*) AS total_edges FROM edges WHERE invalidated_at IS NULL",
    )
    .get();
  const total_edges = countEdgesRow?.total_edges ?? 0;

  // Run all detectors
  const staleItems = detectStaleEvidence(graph, staleDays, nowMs);
  const contradictedItems = detectContradicted(graph, staleDays, nowMs);
  const riskItems = detectConcentratedRisk(graph, minEdges);
  const dormantItems = detectDormantOwner(graph, dormantDays, nowMs);
  const orphanedItems = detectOrphaned(graph);

  const all = [
    ...staleItems,
    ...contradictedItems,
    ...riskItems,
    ...dormantItems,
    ...orphanedItems,
  ];

  // Sort: critical first, then high, medium, low
  all.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const summary = {
    stale_evidence: staleItems.length,
    contradicted: contradictedItems.length,
    concentrated_risk: riskItems.length,
    dormant_owner: dormantItems.length,
    orphaned: orphanedItems.length,
  };

  return {
    generated_at,
    total_entities,
    total_edges,
    decay_items: all,
    summary,
  };
}
