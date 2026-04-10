/**
 * verify.ts — integrity verification for .engram graph files.
 *
 * verifyGraph() runs a suite of checks and returns a VerifyResult.
 * valid = true means no error-severity violations (warnings are acceptable).
 */

import type { EngramGraph } from "./graph.js";
import { FORMAT_VERSION, MIN_READABLE_VERSION } from "./version.js";

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export type ViolationSeverity = "error" | "warning";

export interface Violation {
  check: string;
  entity_or_edge_id?: string;
  message: string;
  severity: ViolationSeverity;
}

export interface VerifyResult {
  valid: boolean;
  violations: Violation[];
}

const REQUIRED_METADATA_KEYS = [
  "format_version",
  "engine_version",
  "created_at",
  "owner_id",
  "default_timezone",
] as const;

function checkMetadata(graph: EngramGraph): Violation[] {
  const violations: Violation[] = [];

  // Batch fetch all required metadata keys in a single query
  const placeholders = REQUIRED_METADATA_KEYS.map(() => "?").join(", ");
  const rows = graph.db
    .query<{ key: string; value: string }, string[]>(
      `SELECT key, value FROM metadata WHERE key IN (${placeholders})`,
    )
    .all(...(REQUIRED_METADATA_KEYS as unknown as string[]));

  const found = new Map(rows.map((r) => [r.key, r.value]));

  for (const key of REQUIRED_METADATA_KEYS) {
    if (!found.has(key)) {
      violations.push({
        check: "checkMetadata",
        message: `Required metadata key '${key}' is missing`,
        severity: "error",
      });
    }
  }

  const formatVersion = found.get("format_version");
  if (
    formatVersion &&
    (compareSemver(formatVersion, MIN_READABLE_VERSION) < 0 ||
      compareSemver(formatVersion, FORMAT_VERSION) > 0)
  ) {
    violations.push({
      check: "checkMetadata",
      message: `Unrecognized format_version '${formatVersion}' (engine supports ${MIN_READABLE_VERSION}–${FORMAT_VERSION})`,
      severity: "error",
    });
  }

  return violations;
}

function checkEntityEvidence(graph: EngramGraph): Violation[] {
  const rows = graph.db
    .query<{ id: string }, []>(
      `SELECT e.id FROM entities e
       LEFT JOIN entity_evidence ev ON e.id = ev.entity_id
       WHERE ev.entity_id IS NULL`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkEntityEvidence",
    entity_or_edge_id: row.id,
    message: `Entity '${row.id}' has no evidence links`,
    severity: "error" as ViolationSeverity,
  }));
}

function checkEdgeEvidence(graph: EngramGraph): Violation[] {
  const rows = graph.db
    .query<{ id: string }, []>(
      `SELECT e.id FROM edges e
       LEFT JOIN edge_evidence ev ON e.id = ev.edge_id
       WHERE ev.edge_id IS NULL`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkEdgeEvidence",
    entity_or_edge_id: row.id,
    message: `Edge '${row.id}' has no evidence links`,
    severity: "error" as ViolationSeverity,
  }));
}

function checkSupersededByRefs(graph: EngramGraph): Violation[] {
  const rows = graph.db
    .query<{ id: string; superseded_by: string }, []>(
      `SELECT e.id, e.superseded_by FROM edges e
       LEFT JOIN edges e2 ON e.superseded_by = e2.id
       WHERE e.superseded_by IS NOT NULL AND e2.id IS NULL`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkSupersededByRefs",
    entity_or_edge_id: row.id,
    message: `Edge '${row.id}' references nonexistent superseded_by edge '${row.superseded_by}'`,
    severity: "error" as ViolationSeverity,
  }));
}

function checkAliasEpisodeRefs(graph: EngramGraph): Violation[] {
  const rows = graph.db
    .query<{ id: string; episode_id: string }, []>(
      `SELECT a.id, a.episode_id FROM entity_aliases a
       LEFT JOIN episodes ep ON a.episode_id = ep.id
       WHERE a.episode_id IS NOT NULL AND ep.id IS NULL`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkAliasEpisodeRefs",
    entity_or_edge_id: row.id,
    message: `Alias '${row.id}' references nonexistent episode '${row.episode_id}'`,
    severity: "warning" as ViolationSeverity,
  }));
}

function checkEvidenceEpisodeRefs(graph: EngramGraph): Violation[] {
  const violations: Violation[] = [];

  const entityRows = graph.db
    .query<{ entity_id: string; episode_id: string }, []>(
      `SELECT ev.entity_id, ev.episode_id FROM entity_evidence ev
       LEFT JOIN episodes ep ON ev.episode_id = ep.id
       WHERE ep.id IS NULL`,
    )
    .all();

  for (const row of entityRows) {
    violations.push({
      check: "checkEvidenceEpisodeRefs",
      entity_or_edge_id: row.entity_id,
      message: `entity_evidence for entity '${row.entity_id}' references nonexistent episode '${row.episode_id}'`,
      severity: "error",
    });
  }

  const edgeRows = graph.db
    .query<{ edge_id: string; episode_id: string }, []>(
      `SELECT ev.edge_id, ev.episode_id FROM edge_evidence ev
       LEFT JOIN episodes ep ON ev.episode_id = ep.id
       WHERE ep.id IS NULL`,
    )
    .all();

  for (const row of edgeRows) {
    violations.push({
      check: "checkEvidenceEpisodeRefs",
      entity_or_edge_id: row.edge_id,
      message: `edge_evidence for edge '${row.edge_id}' references nonexistent episode '${row.episode_id}'`,
      severity: "error",
    });
  }

  return violations;
}

function checkEmbeddingTargets(graph: EngramGraph): Violation[] {
  const violations: Violation[] = [];

  const entityEmbeddings = graph.db
    .query<{ id: string; target_id: string }, []>(
      `SELECT em.id, em.target_id FROM embeddings em
       LEFT JOIN entities e ON em.target_id = e.id
       WHERE em.target_type = 'entity' AND e.id IS NULL`,
    )
    .all();

  for (const row of entityEmbeddings) {
    violations.push({
      check: "checkEmbeddingTargets",
      entity_or_edge_id: row.target_id,
      message: `Embedding '${row.id}' references nonexistent entity '${row.target_id}'`,
      severity: "warning",
    });
  }

  const edgeEmbeddings = graph.db
    .query<{ id: string; target_id: string }, []>(
      `SELECT em.id, em.target_id FROM embeddings em
       LEFT JOIN edges e ON em.target_id = e.id
       WHERE em.target_type = 'edge' AND e.id IS NULL`,
    )
    .all();

  for (const row of edgeEmbeddings) {
    violations.push({
      check: "checkEmbeddingTargets",
      entity_or_edge_id: row.target_id,
      message: `Embedding '${row.id}' references nonexistent edge '${row.target_id}'`,
      severity: "warning",
    });
  }

  return violations;
}

function checkActiveEdgeOverlaps(graph: EngramGraph): Violation[] {
  // Find pairs of active edges (no invalidated_at) sharing the same
  // (source_id, target_id, relation_type, edge_kind) with overlapping validity windows.
  // Two half-open intervals [a_from, a_until) and [b_from, b_until) overlap when:
  //   a_from < b_until (or b_until IS NULL) AND b_from < a_until (or a_until IS NULL)
  // We only report each pair once (a._rowid < b._rowid).
  const rows = graph.db
    .query<{ id_a: string; id_b: string }, []>(
      `SELECT a.id AS id_a, b.id AS id_b
       FROM edges a
       JOIN edges b ON
         a.source_id     = b.source_id AND
         a.target_id     = b.target_id AND
         a.relation_type = b.relation_type AND
         a.edge_kind     = b.edge_kind AND
         a._rowid        < b._rowid
       WHERE
         a.invalidated_at IS NULL AND
         b.invalidated_at IS NULL AND
         (a.valid_from  IS NULL OR b.valid_until IS NULL OR a.valid_from  < b.valid_until) AND
         (b.valid_from  IS NULL OR a.valid_until IS NULL OR b.valid_from  < a.valid_until)`,
    )
    .all();

  return rows.map((row) => ({
    check: "checkActiveEdgeOverlaps",
    entity_or_edge_id: row.id_a,
    message: `Active edges '${row.id_a}' and '${row.id_b}' share the same (source, target, relation, kind) with overlapping validity windows`,
    severity: "warning" as ViolationSeverity,
  }));
}

/**
 * Runs all integrity checks against the graph and returns a VerifyResult.
 * valid is true when there are no error-severity violations.
 */
export function verifyGraph(graph: EngramGraph): VerifyResult {
  const violations: Violation[] = [];

  violations.push(...checkMetadata(graph));
  violations.push(...checkEntityEvidence(graph));
  violations.push(...checkEdgeEvidence(graph));
  violations.push(...checkSupersededByRefs(graph));
  violations.push(...checkAliasEpisodeRefs(graph));
  violations.push(...checkEvidenceEpisodeRefs(graph));
  violations.push(...checkEmbeddingTargets(graph));
  violations.push(...checkActiveEdgeOverlaps(graph));

  const valid = !violations.some((v) => v.severity === "error");
  return { valid, violations };
}
