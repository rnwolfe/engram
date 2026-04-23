/**
 * _onboard_assembly.ts — digest assembly for `engram onboard`.
 *
 * Provides assembleAreaDigest() and assemblePersonDigest() which query the
 * knowledge graph and return a typed OnboardDigest without any rendering.
 */

import type { EngramGraph } from "engram-core";
import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  getEntity,
  listActiveProjections,
  RELATION_TYPES,
  resolveEntity,
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
// Internal row types
// ---------------------------------------------------------------------------

interface EntityRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface OwnershipEdgeRow {
  source_id: string;
  target_id: string;
  weight: number;
  valid_from: string | null;
}

interface EpisodeRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  content: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function decayWeight(weight: number, validFrom: string | null): number {
  if (!validFrom) return weight;
  const age = Date.now() - new Date(validFrom).getTime();
  return age > NINETY_DAYS_MS ? weight * 0.5 : weight;
}

function getOwnershipEdgesForEntities(
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

function getPersonOwnershipEdges(
  graph: EngramGraph,
  personId: string,
  limit: number,
): Array<{ entity_id: string; canonical_name: string; weight: number }> {
  try {
    const rows = graph.db
      .query<
        { source_id: string; target_id: string; weight: number },
        [string, string, string]
      >(
        `SELECT source_id, target_id, weight
         FROM edges
         WHERE (source_id = ? OR target_id = ?)
           AND relation_type = ?
           AND invalidated_at IS NULL
         ORDER BY weight DESC
         LIMIT ${limit}`,
      )
      .all(personId, personId, RELATION_TYPES.LIKELY_OWNER_OF);

    const result: Array<{
      entity_id: string;
      canonical_name: string;
      weight: number;
    }> = [];
    for (const row of rows) {
      const entityId =
        row.source_id === personId ? row.target_id : row.source_id;
      if (entityId === personId) continue;
      const entity = getEntity(graph, entityId);
      if (entity) {
        result.push({
          entity_id: entityId,
          canonical_name: entity.canonical_name,
          weight: row.weight,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

function getPersonEpisodes(
  graph: EngramGraph,
  personName: string,
  sourceType: string,
  limit: number,
): EpisodeRow[] {
  try {
    return graph.db
      .query<EpisodeRow, [string, string]>(
        `SELECT id, source_type, source_ref, actor, timestamp, content
         FROM episodes
         WHERE actor = ? AND source_type = ? AND status = 'active'
         ORDER BY timestamp DESC
         LIMIT ${limit}`,
      )
      .all(personName, sourceType);
  } catch {
    return [];
  }
}

function getTenureForPerson(
  graph: EngramGraph,
  personId: string,
  personName: string,
): { tenure_from: string; tenure_to: string } {
  try {
    // First try via entity evidence
    const episodeRows = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT ep.timestamp
         FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ? AND ep.status = 'active'
         ORDER BY ep.timestamp ASC
         LIMIT 1`,
      )
      .all(personId);

    const latestRows = graph.db
      .query<{ timestamp: string }, [string]>(
        `SELECT ep.timestamp
         FROM entity_evidence ee
         JOIN episodes ep ON ep.id = ee.episode_id
         WHERE ee.entity_id = ? AND ep.status = 'active'
         ORDER BY ep.timestamp DESC
         LIMIT 1`,
      )
      .all(personId);

    // Also check actor-based episodes
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

    const candidates_from = [
      episodeRows[0]?.timestamp,
      actorFirst?.timestamp,
    ].filter(Boolean) as string[];
    const candidates_to = [
      latestRows[0]?.timestamp,
      actorLast?.timestamp,
    ].filter(Boolean) as string[];

    const tenure_from =
      candidates_from.length > 0
        ? candidates_from.sort()[0]
        : new Date().toISOString();
    const tenure_to =
      candidates_to.length > 0
        ? candidates_to.sort().reverse()[0]
        : new Date().toISOString();

    return { tenure_from, tenure_to };
  } catch {
    return {
      tenure_from: new Date().toISOString(),
      tenure_to: new Date().toISOString(),
    };
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
        {
          id: string;
          kind: string;
          title: string;
          valid_from: string;
          stale: number;
        },
        string[]
      >(
        `SELECT DISTINCT p.id, p.kind, p.title, p.valid_from, 0 as stale
         FROM projections p
         JOIN projection_evidence pe ON pe.projection_id = p.id
         WHERE pe.target_type = 'entity'
           AND pe.target_id IN (${placeholders})
           AND p.kind = 'contradiction_report'
           AND p.invalidated_at IS NULL
         ORDER BY p.valid_from DESC
         LIMIT ${limit}`,
      )
      .all(...entityIds);

    return rows.map((r) => ({
      kind: r.kind,
      title: r.title,
      valid_from: r.valid_from,
      stale: Boolean(r.stale),
      projection_id: r.id,
    }));
  } catch {
    return [];
  }
}

function getDecisionProjections(
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
           AND p.kind IN ('decision_page', 'adr', 'architecture_decision')
           AND p.invalidated_at IS NULL
         ORDER BY p.valid_from ASC
         LIMIT ${limit}`,
      )
      .all(...entityIds);

    // Get stale info using listActiveProjections selectively
    const staleMap = new Map<string, boolean>();
    for (const r of listActiveProjections(graph, {})) {
      staleMap.set(r.projection.id, r.stale);
    }

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

// ---------------------------------------------------------------------------
// Area mode
// ---------------------------------------------------------------------------

export async function assembleAreaDigest(
  graph: EngramGraph,
  target: string,
  limit: number,
): Promise<OnboardDigest | { ambiguous: true; candidates: string[] }> {
  // Resolve area entities
  let anchorIds: string[] = [];

  const looksLikePath =
    target.includes("/") ||
    /\.[a-zA-Z]{1,6}$/.test(target) ||
    target.startsWith("./") ||
    target.startsWith("../");

  if (looksLikePath) {
    const resolved = resolvePathTarget(graph, target);
    if (!resolved) {
      return {
        target,
        target_kind: "area",
        ...emptyAreaFields(),
        reading_order: [],
      };
    }
    if ("ambiguous" in resolved) {
      return {
        ambiguous: true,
        candidates: resolved.candidates.map((c) => c.canonical_name),
      };
    }
    anchorIds.push(resolved.entity.id);

    // Also find child entities with canonical_name LIKE <path>/%
    const normalized = target.replace(/^\.\//, "");
    try {
      const childRows = graph.db
        .query<{ id: string }, [string]>(
          `SELECT id FROM entities WHERE canonical_name LIKE ? AND status = 'active'`,
        )
        .all(`${normalized}/%`);
      for (const row of childRows) anchorIds.push(row.id);
    } catch {
      /* ignore */
    }
  } else {
    // Topic search
    const ftsRows = searchEntitiesFts(graph, target, 10);
    if (ftsRows.length === 0) {
      return {
        target,
        target_kind: "area",
        ...emptyAreaFields(),
        reading_order: [],
      };
    }
    if (ftsRows.length > 3) {
      return {
        ambiguous: true,
        candidates: ftsRows.map((r) => r.canonical_name),
      };
    }
    anchorIds = ftsRows.map((r) => r.id);
  }

  // Deduplicate
  anchorIds = [...new Set(anchorIds)];

  // --- People section ---
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
      const tenure = getTenureForPerson(graph, personId, entity.canonical_name);
      personScores.set(entity.canonical_name, {
        score: decayed,
        entity_id: personId,
        ...tenure,
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

  // --- Decisions section ---
  const decisions = getDecisionProjections(graph, anchorIds, limit);

  // --- Hot files section ---
  const fileCommitCounts = new Map<string, number>();
  for (const entityId of anchorIds) {
    for (const neighbor of getCoChangeNeighbors(graph, entityId, limit)) {
      const neighborId =
        neighbor.source_id === entityId
          ? neighbor.target_id
          : neighbor.source_id;
      const entity = getEntity(graph, neighborId);
      if (!entity) continue;
      if (
        entity.entity_type !== ENTITY_TYPES.FILE &&
        entity.entity_type !== ENTITY_TYPES.MODULE
      )
        continue;
      const existing = fileCommitCounts.get(entity.canonical_name) ?? 0;
      fileCommitCounts.set(
        entity.canonical_name,
        existing + Math.round(neighbor.weight),
      );
    }
  }
  // Also add the anchor entities themselves if they are files
  for (const entityId of anchorIds) {
    const entity = getEntity(graph, entityId);
    if (!entity) continue;
    if (
      entity.entity_type === ENTITY_TYPES.FILE ||
      entity.entity_type === ENTITY_TYPES.MODULE
    ) {
      const existing = fileCommitCounts.get(entity.canonical_name) ?? 0;
      fileCommitCounts.set(entity.canonical_name, existing + 1);
    }
  }

  const hot_files: FileEntry[] = [...fileCommitCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([canonical_name, commit_count]) => ({
      canonical_name,
      commit_count,
    }));

  // --- Contradictions section ---
  const contradictions = getContradictionProjections(graph, anchorIds, limit);

  // --- Reading order ---
  const reading_order: ReadingItem[] = [];
  let rank = 1;
  // 1. Foundational decisions first (oldest valid_from)
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
  // 2. Hot files
  for (const f of hot_files.slice(0, Math.ceil(limit / 3))) {
    reading_order.push({
      rank: rank++,
      label: f.canonical_name,
      kind: "file",
      note: `${f.commit_count} commits`,
    });
  }
  // 3. Contradictions
  for (const c of contradictions) {
    reading_order.push({
      rank: rank++,
      label: c.title,
      kind: "contradiction",
    });
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

function emptyAreaFields() {
  return {
    people: [] as PersonEntry[],
    decisions: [] as DecisionEntry[],
    hot_files: [] as FileEntry[],
    contradictions: [] as DecisionEntry[],
  };
}

// ---------------------------------------------------------------------------
// Person mode
// ---------------------------------------------------------------------------

export async function assemblePersonDigest(
  graph: EngramGraph,
  name: string,
  limit: number,
): Promise<OnboardDigest | { notFound: true; suggestions: string[] }> {
  // 1. Exact match
  let personEntity: EntityRow | null = null;
  personEntity = graph.db
    .query<EntityRow, [string, string]>(
      `SELECT id, canonical_name, entity_type, summary, status, created_at, updated_at
       FROM entities WHERE entity_type = ? AND canonical_name = ? AND status = 'active' LIMIT 1`,
    )
    .get(ENTITY_TYPES.PERSON, name);

  // 2. Alias lookup
  if (!personEntity) {
    const resolved = resolveEntity(graph, name);
    if (resolved && resolved.entity_type === ENTITY_TYPES.PERSON) {
      personEntity = resolved as unknown as EntityRow;
    }
  }

  // 3. FTS fallback
  if (!personEntity) {
    const ftsRows = searchEntitiesFts(graph, name, 10).filter(
      (r) => r.entity_type === ENTITY_TYPES.PERSON,
    );
    if (ftsRows.length === 0) {
      // Return suggestions from all types
      const allSuggestions = searchEntitiesFts(graph, name, 5);
      return {
        notFound: true,
        suggestions: allSuggestions.map((r) => r.canonical_name),
      };
    }
    if (ftsRows.length === 1) {
      personEntity = graph.db
        .query<EntityRow, [string]>(
          `SELECT id, canonical_name, entity_type, summary, status, created_at, updated_at
           FROM entities WHERE id = ? LIMIT 1`,
        )
        .get(ftsRows[0].id);
    } else {
      return {
        notFound: true,
        suggestions: ftsRows.map((r) => r.canonical_name),
      };
    }
  }

  if (!personEntity) {
    return { notFound: true, suggestions: [] };
  }

  const personId = personEntity.id;
  const personName = personEntity.canonical_name;

  // --- Ownership footprint ---
  const ownershipRaw = getPersonOwnershipEdges(graph, personId, limit);
  const ownership_footprint = ownershipRaw
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((o) => ({ canonical_name: o.canonical_name, weight: o.weight }));

  // --- Review footprint (GitHub PR episodes where actor = name) ---
  const prEpisodes = getPersonEpisodes(
    graph,
    personName,
    EPISODE_SOURCE_TYPES.GITHUB_PR,
    limit,
  );
  const review_footprint = prEpisodes.map((ep) => ({
    title: ep.content.split("\n")[0]?.trim().slice(0, 80) ?? "",
    timestamp: ep.timestamp,
    episode_id: ep.id,
  }));

  // --- Collaborators (people who co-own same entities) ---
  const ownedEntityIds = ownershipRaw.map((o) => o.entity_id);
  const collaboratorScores = new Map<string, number>();

  if (ownedEntityIds.length > 0) {
    const coOwnerEdges = getOwnershipEdgesForEntities(
      graph,
      ownedEntityIds,
      limit * 3,
    );
    for (const edge of coOwnerEdges) {
      const coOwnerId = ownedEntityIds.includes(edge.source_id)
        ? edge.target_id
        : edge.source_id;
      if (coOwnerId === personId || ownedEntityIds.includes(coOwnerId))
        continue;
      const coOwner = getEntity(graph, coOwnerId);
      if (!coOwner || coOwner.entity_type !== ENTITY_TYPES.PERSON) continue;
      const existing = collaboratorScores.get(coOwner.canonical_name) ?? 0;
      collaboratorScores.set(
        coOwner.canonical_name,
        existing + (edge.weight ?? 1),
      );
    }
  }

  const collaborators: PersonEntry[] = [...collaboratorScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([collabName, score]) => {
      const entity = graph.db
        .query<{ id: string }, [string, string]>(
          `SELECT id FROM entities WHERE canonical_name = ? AND entity_type = ? LIMIT 1`,
        )
        .get(collabName, ENTITY_TYPES.PERSON);
      const tenure = entity
        ? getTenureForPerson(graph, entity.id, collabName)
        : { tenure_from: "", tenure_to: "" };
      return {
        name: collabName,
        score: Math.round(score * 100) / 100,
        ...tenure,
        entity_id: entity?.id,
      };
    });

  // --- Tenure arc ---
  const tenure = getTenureForPerson(graph, personId, personName);

  // --- Reading order (one entry per top area) ---
  const reading_order: ReadingItem[] = [];
  let rank = 1;
  for (const area of ownership_footprint.slice(0, Math.ceil(limit / 2))) {
    // Find a representative projection for this area
    const areaEntity = graph.db
      .query<{ id: string }, [string]>(
        `SELECT id FROM entities WHERE canonical_name = ? AND status = 'active' LIMIT 1`,
      )
      .get(area.canonical_name);
    if (areaEntity) {
      const projRows = listActiveProjections(graph, {
        anchor_id: areaEntity.id,
      });
      const firstProj = projRows[0];
      if (firstProj) {
        reading_order.push({
          rank: rank++,
          label: `${area.canonical_name}: ${firstProj.projection.title}`,
          kind: "projection",
        });
      } else {
        reading_order.push({
          rank: rank++,
          label: area.canonical_name,
          kind: "file",
          note: `weight: ${area.weight}`,
        });
      }
    }
  }

  return {
    target: name,
    target_kind: "person",
    people: [],
    decisions: [],
    hot_files: [],
    contradictions: [],
    reading_order,
    ownership_footprint,
    review_footprint,
    collaborators,
    tenure_from: tenure.tenure_from,
    tenure_to: tenure.tenure_to,
  };
}
