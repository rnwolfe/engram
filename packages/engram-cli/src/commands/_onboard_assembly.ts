/**
 * _onboard_assembly.ts — area-mode digest assembly for `engram onboard`.
 *
 * Person-mode assembly lives in _onboard_person.ts.
 * Shared helpers (getOwnershipEdgesForEntities, getTenureForPerson) are exported
 * for use by _onboard_person.ts.
 */

import type { EngramGraph } from "engram-core";
import {
  ENTITY_TYPES,
  getEntity,
  listActiveProjections,
  RELATION_TYPES,
} from "engram-core";
import type {
  DecisionEntry,
  FileEntry,
  OnboardDigest,
  PersonEntry,
  ReadingItem,
} from "./_onboard_render.js";
import {
  getCoChangeNeighbors,
  resolvePathTarget,
  searchEntitiesFts,
} from "./_retrieval.js";

// ---------------------------------------------------------------------------
// Projection kind constants (no vocab registry yet — module-level literals)
// ---------------------------------------------------------------------------

const KIND_DECISION_PAGE = "decision_page";
const KIND_ADR = "adr";
const KIND_ARCH_DECISION = "architecture_decision";
const KIND_CONTRADICTION = "contradiction_report";
const DECISION_KINDS = [KIND_DECISION_PAGE, KIND_ADR, KIND_ARCH_DECISION];

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface OwnershipEdgeRow {
  source_id: string;
  target_id: string;
  weight: number;
  valid_from: string | null;
}

// ---------------------------------------------------------------------------
// Exported shared helpers (used by _onboard_person.ts)
// ---------------------------------------------------------------------------

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function decayWeight(weight: number, validFrom: string | null): number {
  if (!validFrom) return weight;
  const age = Date.now() - new Date(validFrom).getTime();
  return age > NINETY_DAYS_MS ? weight * 0.5 : weight;
}

export function getOwnershipEdgesForEntities(
  graph: EngramGraph,
  entityIds: string[],
  limit: number,
): OwnershipEdgeRow[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  try {
    return graph.db
      .query<OwnershipEdgeRow, string[]>(
        `SELECT source_id, target_id, weight, valid_from
         FROM edges
         WHERE (source_id IN (${placeholders}) OR target_id IN (${placeholders}))
           AND relation_type = ?
           AND invalidated_at IS NULL
         ORDER BY weight DESC
         LIMIT ${limit}`,
      )
      .all(...entityIds, ...entityIds, RELATION_TYPES.LIKELY_OWNER_OF);
  } catch {
    return [];
  }
}

export function getTenureForPerson(
  graph: EngramGraph,
  personId: string,
  personName: string,
): { tenure_from: string; tenure_to: string } {
  try {
    const firstRow = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT ep.timestamp FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ? AND ep.status = 'active'
         ORDER BY ep.timestamp ASC LIMIT 1`,
      )
      .get(personId);
    const lastRow = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT ep.timestamp FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ? AND ep.status = 'active'
         ORDER BY ep.timestamp DESC LIMIT 1`,
      )
      .get(personId);
    const actorFirst = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT timestamp FROM episodes WHERE actor = ? AND status = 'active'
         ORDER BY timestamp ASC LIMIT 1`,
      )
      .get(personName);
    const actorLast = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT timestamp FROM episodes WHERE actor = ? AND status = 'active'
         ORDER BY timestamp DESC LIMIT 1`,
      )
      .get(personName);

    const from = [firstRow?.timestamp, actorFirst?.timestamp].filter(
      Boolean,
    ) as string[];
    const to = [lastRow?.timestamp, actorLast?.timestamp].filter(
      Boolean,
    ) as string[];
    const now = new Date().toISOString();
    return {
      tenure_from: from.length > 0 ? from.sort()[0] : now,
      tenure_to: to.length > 0 ? to.sort().reverse()[0] : now,
    };
  } catch {
    const now = new Date().toISOString();
    return { tenure_from: now, tenure_to: now };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function buildStaleMap(graph: EngramGraph): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of listActiveProjections(graph, {})) {
    map.set(r.projection.id, r.stale);
  }
  return map;
}

function getDecisionProjections(
  graph: EngramGraph,
  entityIds: string[],
  limit: number,
): DecisionEntry[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  const kindPlaceholders = DECISION_KINDS.map(() => "?").join(",");
  try {
    const rows = graph.db
      .query<
        { id: string; kind: string; title: string; valid_from: string },
        string[]
      >(
        `SELECT DISTINCT p.id, p.kind, p.title, p.valid_from
         FROM projections p
         JOIN projection_evidence pe ON pe.projection_id = p.id
         WHERE pe.target_type = 'entity'
           AND pe.target_id IN (${placeholders})
           AND p.kind IN (${kindPlaceholders})
           AND p.invalidated_at IS NULL
         ORDER BY p.valid_from ASC
         LIMIT ${limit}`,
      )
      .all(...entityIds, ...DECISION_KINDS);

    const staleMap = buildStaleMap(graph);
    return rows.map((r) => ({
      kind: r.kind,
      title: r.title,
      valid_from: r.valid_from,
      stale: staleMap.get(r.id) ?? false,
      projection_id: r.id,
    }));
  } catch {
    return [];
  }
}

function getContradictionProjections(
  graph: EngramGraph,
  entityIds: string[],
  limit: number,
): DecisionEntry[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  try {
    const rows = graph.db
      .query<
        { id: string; kind: string; title: string; valid_from: string },
        string[]
      >(
        `SELECT DISTINCT p.id, p.kind, p.title, p.valid_from
         FROM projections p
         JOIN projection_evidence pe ON pe.projection_id = p.id
         WHERE pe.target_type = 'entity'
           AND pe.target_id IN (${placeholders})
           AND p.kind = ?
           AND p.invalidated_at IS NULL
         ORDER BY p.valid_from DESC
         LIMIT ${limit}`,
      )
      .all(...entityIds, KIND_CONTRADICTION);

    const staleMap = buildStaleMap(graph);
    return rows.map((r) => ({
      kind: r.kind,
      title: r.title,
      valid_from: r.valid_from,
      stale: staleMap.get(r.id) ?? false,
      projection_id: r.id,
    }));
  } catch {
    return [];
  }
}

function emptyAreaFields() {
  return {
    people: [] as PersonEntry[],
    decisions: [] as DecisionEntry[],
    hot_files: [] as FileEntry[],
    contradictions: [] as DecisionEntry[],
  };
}

// ---------------------------------------------------------------------------
// Assembly — Area mode
// ---------------------------------------------------------------------------

export async function assembleAreaDigest(
  graph: EngramGraph,
  target: string,
  limit: number,
): Promise<OnboardDigest | { ambiguous: true; candidates: string[] }> {
  let anchorIds: string[] = [];

  const looksLikePath =
    target.includes("/") ||
    /\.[a-zA-Z]{1,6}$/.test(target) ||
    target.startsWith("./") ||
    target.startsWith("../");

  if (looksLikePath) {
    const resolved = resolvePathTarget(graph, target);
    if (!resolved)
      return {
        target,
        target_kind: "area",
        ...emptyAreaFields(),
        reading_order: [],
      };
    if ("ambiguous" in resolved) {
      return {
        ambiguous: true,
        candidates: resolved.candidates.map((c) => c.canonical_name),
      };
    }
    anchorIds.push(resolved.entity.id);
    const normalized = target.replace(/^\.\//, "");
    // Escape LIKE special chars in user path
    const escaped = normalized.replace(/%/g, "\\%").replace(/_/g, "\\_");
    try {
      const childRows = graph.db
        .query<{ id: string }, [string]>(
          `SELECT id FROM entities WHERE canonical_name LIKE ? ESCAPE '\\' AND status = 'active'`,
        )
        .all(`${escaped}/%`);
      for (const row of childRows) anchorIds.push(row.id);
    } catch {
      /* ignore */
    }
  } else {
    const ftsRows = searchEntitiesFts(graph, target, 10);
    if (ftsRows.length === 0)
      return {
        target,
        target_kind: "area",
        ...emptyAreaFields(),
        reading_order: [],
      };
    if (ftsRows.length > 3)
      return {
        ambiguous: true,
        candidates: ftsRows.map((r) => r.canonical_name),
      };
    anchorIds = ftsRows.map((r) => r.id);
  }

  anchorIds = [...new Set(anchorIds)];

  // People
  const ownerEdges = getOwnershipEdgesForEntities(graph, anchorIds, limit * 3);
  const personScores = new Map<
    string,
    { score: number; entity_id: string; tenure_from: string; tenure_to: string }
  >();
  for (const edge of ownerEdges) {
    const personId = anchorIds.includes(edge.source_id)
      ? edge.target_id
      : edge.source_id;
    if (anchorIds.includes(personId)) continue;
    const entity = getEntity(graph, personId);
    if (!entity || entity.entity_type !== ENTITY_TYPES.PERSON) continue;
    const decayed = decayWeight(edge.weight, edge.valid_from);
    const existing = personScores.get(entity.canonical_name);
    if (existing) {
      existing.score += decayed;
    } else {
      personScores.set(entity.canonical_name, {
        score: decayed,
        entity_id: personId,
        ...getTenureForPerson(graph, personId, entity.canonical_name),
      });
    }
  }
  const people: PersonEntry[] = [...personScores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([name, data]) => ({
      name,
      score: Math.round(data.score * 100) / 100,
      tenure_from: data.tenure_from,
      tenure_to: data.tenure_to,
      entity_id: data.entity_id,
    }));

  const decisions = getDecisionProjections(graph, anchorIds, limit);

  // Hot files
  const fileCommitCounts = new Map<string, number>();
  for (const entityId of anchorIds) {
    for (const neighbor of getCoChangeNeighbors(graph, entityId, limit)) {
      const neighborId =
        neighbor.source_id === entityId
          ? neighbor.target_id
          : neighbor.source_id;
      const entity = getEntity(graph, neighborId);
      if (
        !entity ||
        (entity.entity_type !== ENTITY_TYPES.FILE &&
          entity.entity_type !== ENTITY_TYPES.MODULE)
      )
        continue;
      fileCommitCounts.set(
        entity.canonical_name,
        (fileCommitCounts.get(entity.canonical_name) ?? 0) +
          Math.round(neighbor.weight),
      );
    }
    const entity = getEntity(graph, entityId);
    if (
      entity &&
      (entity.entity_type === ENTITY_TYPES.FILE ||
        entity.entity_type === ENTITY_TYPES.MODULE)
    ) {
      fileCommitCounts.set(
        entity.canonical_name,
        (fileCommitCounts.get(entity.canonical_name) ?? 0) + 1,
      );
    }
  }
  const hot_files: FileEntry[] = [...fileCommitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([canonical_name, commit_count]) => ({
      canonical_name,
      commit_count,
    }));

  const contradictions = getContradictionProjections(graph, anchorIds, limit);

  // Reading order
  const reading_order: ReadingItem[] = [];
  let rank = 1;
  for (const d of [...decisions].sort((a, b) =>
    a.valid_from < b.valid_from ? -1 : 1,
  )) {
    reading_order.push({
      rank: rank++,
      label: d.title,
      kind: "decision",
      note: d.stale ? "stale" : undefined,
    });
  }
  for (const f of hot_files.slice(0, Math.ceil(limit / 3))) {
    reading_order.push({
      rank: rank++,
      label: f.canonical_name,
      kind: "file",
      note: `${f.commit_count} commits`,
    });
  }
  for (const c of contradictions) {
    reading_order.push({ rank: rank++, label: c.title, kind: "contradiction" });
  }

  return {
    target,
    target_kind: "area",
    people,
    decisions,
    hot_files,
    contradictions,
    reading_order,
  };
}
