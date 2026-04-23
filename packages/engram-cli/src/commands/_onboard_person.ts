/**
 * _onboard_person.ts — person-mode assembly for `engram onboard`.
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
import {
  getOwnershipEdgesForEntities,
  getTenureForPerson,
} from "./_onboard_assembly.js";
import type { OnboardDigest, PersonEntry } from "./_onboard_render.js";
import { searchEntitiesFts } from "./_retrieval.js";

interface EntityRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
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
      if (entity)
        result.push({
          entity_id: entityId,
          canonical_name: entity.canonical_name,
          weight: row.weight,
        });
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
): Array<{
  id: string;
  source_ref: string | null;
  timestamp: string;
  content: string;
}> {
  try {
    return graph.db
      .query<
        {
          id: string;
          source_ref: string | null;
          timestamp: string;
          content: string;
        },
        [string, string]
      >(
        `SELECT id, source_ref, timestamp, content
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

export async function assemblePersonDigest(
  graph: EngramGraph,
  name: string,
  limit: number,
): Promise<OnboardDigest | { notFound: true; suggestions: string[] }> {
  let personEntity: EntityRow | null = null;

  personEntity = graph.db
    .query<EntityRow, [string, string]>(
      `SELECT id, canonical_name, entity_type, summary, status, created_at, updated_at
       FROM entities WHERE entity_type = ? AND canonical_name = ? AND status = 'active' LIMIT 1`,
    )
    .get(ENTITY_TYPES.PERSON, name);

  if (!personEntity) {
    const resolved = resolveEntity(graph, name);
    if (resolved && resolved.entity_type === ENTITY_TYPES.PERSON) {
      personEntity = resolved as unknown as EntityRow;
    }
  }

  if (!personEntity) {
    const ftsRows = searchEntitiesFts(graph, name, 10).filter(
      (r) => r.entity_type === ENTITY_TYPES.PERSON,
    );
    if (ftsRows.length === 0) {
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

  if (!personEntity) return { notFound: true, suggestions: [] };

  const personId = personEntity.id;
  const personName = personEntity.canonical_name;

  const ownershipRaw = getPersonOwnershipEdges(graph, personId, limit);
  const ownership_footprint = ownershipRaw
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((o) => ({ canonical_name: o.canonical_name, weight: o.weight }));

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
      collaboratorScores.set(
        coOwner.canonical_name,
        (collaboratorScores.get(coOwner.canonical_name) ?? 0) +
          (edge.weight ?? 1),
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

  const tenure = getTenureForPerson(graph, personId, personName);

  const reading_order = [];
  let rank = 1;
  for (const area of ownership_footprint.slice(0, Math.ceil(limit / 2))) {
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
