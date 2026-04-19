/**
 * verify-episodes.ts — episode and vocab integrity checks for verifyGraph().
 *
 * Extracted from verify.ts to keep that file under 500 lines.
 */

import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  INGESTION_SOURCE_TYPES,
  RELATION_TYPES,
} from "../vocab/index.js";
import type { EngramGraph } from "./graph.js";
import type { Violation, ViolationSeverity } from "./verify.js";

const KNOWN_ENTITY_TYPES = new Set(Object.values(ENTITY_TYPES));
const KNOWN_EPISODE_SOURCE_TYPES = new Set(Object.values(EPISODE_SOURCE_TYPES));
const KNOWN_INGESTION_SOURCE_TYPES = new Set(
  Object.values(INGESTION_SOURCE_TYPES),
);
const KNOWN_RELATION_TYPES = new Set(Object.values(RELATION_TYPES));

export function checkVocab(graph: EngramGraph): Violation[] {
  const violations: Violation[] = [];

  // entities.entity_type
  const entityRows = graph.db
    .query<{ id: string; entity_type: string }, []>(
      "SELECT id, entity_type FROM entities",
    )
    .all();
  for (const row of entityRows) {
    if (!KNOWN_ENTITY_TYPES.has(row.entity_type)) {
      violations.push({
        check: "checkVocab",
        entity_or_edge_id: row.id,
        message: `Entity '${row.id}' has unknown entity_type '${row.entity_type}' (not in ENTITY_TYPES registry)`,
        severity: "warning",
      });
    }
  }

  // episodes.source_type
  const episodeRows = graph.db
    .query<{ id: string; source_type: string }, []>(
      "SELECT id, source_type FROM episodes WHERE status != 'redacted'",
    )
    .all();
  for (const row of episodeRows) {
    if (!KNOWN_EPISODE_SOURCE_TYPES.has(row.source_type)) {
      violations.push({
        check: "checkVocab",
        entity_or_edge_id: row.id,
        message: `Episode '${row.id}' has unknown source_type '${row.source_type}' (not in EPISODE_SOURCE_TYPES registry)`,
        severity: "warning",
      });
    }
  }

  // ingestion_runs.source_type
  const runRows = graph.db
    .query<{ id: string; source_type: string }, []>(
      "SELECT id, source_type FROM ingestion_runs",
    )
    .all();
  for (const row of runRows) {
    if (!KNOWN_INGESTION_SOURCE_TYPES.has(row.source_type)) {
      violations.push({
        check: "checkVocab",
        entity_or_edge_id: row.id,
        message: `IngestionRun '${row.id}' has unknown source_type '${row.source_type}' (not in INGESTION_SOURCE_TYPES registry)`,
        severity: "warning",
      });
    }
  }

  // edges.relation_type
  const edgeRows = graph.db
    .query<{ id: string; relation_type: string }, []>(
      "SELECT id, relation_type FROM edges WHERE invalidated_at IS NULL",
    )
    .all();
  for (const row of edgeRows) {
    if (!KNOWN_RELATION_TYPES.has(row.relation_type)) {
      violations.push({
        check: "checkVocab",
        entity_or_edge_id: row.id,
        message: `Edge '${row.id}' has unknown relation_type '${row.relation_type}' (not in RELATION_TYPES registry)`,
        severity: "warning",
      });
    }
  }

  return violations;
}

export function checkEpisodeFanIn(graph: EngramGraph): Violation[] {
  // Each episode may have at most one successor (fan-in uniqueness).
  // i.e., no two episodes should share the same superseded_by value.
  const rows = graph.db
    .query<{ superseded_by: string; cnt: number }, []>(
      `SELECT superseded_by, COUNT(*) AS cnt
       FROM episodes
       WHERE superseded_by IS NOT NULL
       GROUP BY superseded_by
       HAVING cnt > 1`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkEpisodeFanIn",
    entity_or_edge_id: row.superseded_by,
    message: `Episode '${row.superseded_by}' is referenced as superseded_by by ${row.cnt} episodes (fan-in violation — each episode may have at most one successor)`,
    severity: "error" as ViolationSeverity,
  }));
}

export function checkEpisodeDanglingSupersededBy(
  graph: EngramGraph,
): Violation[] {
  // superseded_by must point to a valid existing episode id.
  const rows = graph.db
    .query<{ id: string; superseded_by: string }, []>(
      `SELECT id, superseded_by
       FROM episodes
       WHERE superseded_by IS NOT NULL
         AND superseded_by NOT IN (SELECT id FROM episodes)`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkEpisodeDanglingSupersededBy",
    entity_or_edge_id: row.id,
    message: `Episode '${row.id}' has superseded_by '${row.superseded_by}' which does not exist`,
    severity: "error" as ViolationSeverity,
  }));
}
