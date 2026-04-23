/**
 * _brief_assembly.ts — digest assembly helpers and assembly functions for `engram brief`.
 */

import type { EngramGraph } from "engram-core";
import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  getEntity,
  listActiveProjections,
} from "engram-core";
import type { BriefDigest } from "./_brief_render.js";
import type { CitedEpisode } from "./_render.js";
import {
  getCoChangeNeighbors,
  getOwnershipEdges,
  searchEntitiesFts,
} from "./_retrieval.js";

const EXCERPT_MAX = 400;
const FILE_ENTITY_TYPES = new Set([ENTITY_TYPES.FILE, ENTITY_TYPES.MODULE]);

function excerptContent(content: string): string {
  const trimmed = content.trim();
  return trimmed.length <= EXCERPT_MAX
    ? trimmed
    : `${trimmed.slice(0, EXCERPT_MAX)}…`;
}

interface EpisodeRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  content: string;
}

/**
 * Fetch a GitHub PR or issue episode by PR/issue number.
 * The GitHub adapter stores source_ref as the html_url (e.g. https://github.com/org/repo/pull/42).
 * We match on exact number, #-prefixed number, and URL suffix patterns.
 */
function fetchEpisodeByRef(
  graph: EngramGraph,
  sourceType: string,
  ref: string,
): EpisodeRow | null {
  // Determine URL path segment based on source type
  const urlSegment =
    sourceType === EPISODE_SOURCE_TYPES.GITHUB_PR ? "pull" : "issues";

  for (const candidate of [ref, `#${ref}`, `%/${urlSegment}/${ref}`]) {
    const op = candidate.includes("%") ? "LIKE" : "=";
    const row = graph.db
      .query<EpisodeRow, [string, string]>(
        `SELECT id, source_type, source_ref, actor, timestamp, content
         FROM episodes
         WHERE source_type = ? AND source_ref ${op} ? AND status = 'active'
         LIMIT 1`,
      )
      .get(sourceType, candidate);
    if (row) return row;
  }
  return null;
}

function toCitedEpisode(row: EpisodeRow): CitedEpisode {
  return {
    episode_id: row.id,
    source_type: row.source_type,
    source_ref: row.source_ref,
    actor: row.actor,
    timestamp: row.timestamp,
    excerpt: excerptContent(row.content),
  };
}

interface EntityLinkRow {
  id: string;
  canonical_name: string;
  entity_type: string;
}

function getEpisodeLinkedEntities(
  graph: EngramGraph,
  episodeId: string,
): EntityLinkRow[] {
  try {
    return graph.db
      .query<EntityLinkRow, [string]>(
        `SELECT e.id, e.canonical_name, e.entity_type
         FROM entity_evidence ee
         JOIN entities e ON e.id = ee.entity_id
         WHERE ee.episode_id = ? AND e.status = 'active'
         ORDER BY e.entity_type, e.canonical_name`,
      )
      .all(episodeId);
  } catch {
    return [];
  }
}

interface ProjectionOverlapRow {
  projection_id: string;
  kind: string;
  title: string;
  valid_from: string;
}

function getProjectionsOverlappingEntities(
  graph: EngramGraph,
  entityIds: string[],
): ProjectionOverlapRow[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  try {
    return graph.db
      .query<ProjectionOverlapRow, string[]>(
        `SELECT DISTINCT p.id AS projection_id, p.kind, p.title, p.valid_from
         FROM projections p
         JOIN projection_evidence pe ON pe.projection_id = p.id
         WHERE pe.target_type = 'entity'
           AND pe.target_id IN (${placeholders})
           AND p.invalidated_at IS NULL
         ORDER BY p.valid_from DESC`,
      )
      .all(...entityIds);
  } catch {
    return [];
  }
}

/** Build a stale lookup map from a single listActiveProjections scan. */
function buildStaleMap(graph: EngramGraph): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const r of listActiveProjections(graph, {})) {
    map.set(r.projection.id, r.stale);
  }
  return map;
}

const EMPTY_BRIEF = (
  target: string,
  kind: BriefDigest["target_kind"],
): BriefDigest => ({
  target,
  target_kind: kind,
  who: [],
  history: [],
  connections: [],
  risk: [],
  introducing_episode: null,
  truncated: false,
});

// ---------------------------------------------------------------------------
// Assembly — PR mode
// ---------------------------------------------------------------------------

export async function assemblePrDigest(
  graph: EngramGraph,
  prRef: string,
): Promise<BriefDigest> {
  const episodeRow = fetchEpisodeByRef(
    graph,
    EPISODE_SOURCE_TYPES.GITHUB_PR,
    prRef,
  );
  if (!episodeRow)
    return { ...EMPTY_BRIEF(`pr:${prRef}`, "pr"), touched_files: [] };

  const introducingEpisode = toCitedEpisode(episodeRow);
  const prTitle = episodeRow.content.split("\n")[0]?.trim() || `PR #${prRef}`;

  let prStatus: "open" | "merged" | "closed" = "open";
  const contentLower = episodeRow.content.toLowerCase();
  if (contentLower.includes("merged")) prStatus = "merged";
  else if (contentLower.includes("closed")) prStatus = "closed";

  const linkedEntities = getEpisodeLinkedEntities(graph, episodeRow.id);
  const fileEntities = linkedEntities.filter((e) =>
    FILE_ENTITY_TYPES.has(e.entity_type as never),
  );
  const touchedFiles = fileEntities.map((e) => e.canonical_name);
  const fileEntityIds = fileEntities.map((e) => e.id);

  const who: BriefDigest["who"] = [];
  if (episodeRow.actor) who.push({ name: episodeRow.actor, role: "author" });
  const ownersSeen = new Set<string>();
  for (const entityId of fileEntityIds) {
    for (const edge of getOwnershipEdges(graph, entityId)) {
      const ownerId =
        edge.source_id === entityId ? edge.target_id : edge.source_id;
      if (!ownersSeen.has(ownerId)) {
        ownersSeen.add(ownerId);
        const ownerEntity = getEntity(graph, ownerId);
        if (ownerEntity)
          who.push({
            name: ownerEntity.canonical_name,
            role: "file-owner",
            entity_id: ownerId,
          });
      }
    }
  }

  const history: BriefDigest["history"] = [];
  const historySeen = new Set<string>();
  for (const entityId of fileEntityIds.slice(0, 5)) {
    for (const neighbor of getCoChangeNeighbors(graph, entityId, 5)) {
      const neighborId =
        neighbor.source_id === entityId
          ? neighbor.target_id
          : neighbor.source_id;
      if (!historySeen.has(neighborId) && !fileEntityIds.includes(neighborId)) {
        historySeen.add(neighborId);
        const neighborEntity = getEntity(graph, neighborId);
        if (neighborEntity)
          history.push({
            canonical_name: neighborEntity.canonical_name,
            weight: neighbor.weight,
          });
      }
    }
  }
  history.sort((a, b) => b.weight - a.weight);

  const connections: BriefDigest["connections"] = [];
  const connectionIds = new Set<string>();
  for (const entityId of fileEntityIds) {
    for (const result of listActiveProjections(graph, {
      anchor_id: entityId,
    })) {
      if (!connectionIds.has(result.projection.id)) {
        connectionIds.add(result.projection.id);
        connections.push({
          kind: result.projection.kind,
          title: result.projection.title,
          valid_from: result.projection.valid_from,
          stale: result.stale,
        });
      }
    }
  }

  const staleMap = buildStaleMap(graph);
  const risk: BriefDigest["risk"] = [];
  const riskSeen = new Set<string>();
  for (const proj of getProjectionsOverlappingEntities(graph, fileEntityIds)) {
    if (
      connectionIds.has(proj.projection_id) ||
      riskSeen.has(proj.projection_id)
    )
      continue;
    riskSeen.add(proj.projection_id);
    const title =
      prStatus === "open"
        ? `${proj.title} [would be invalidated if merged]`
        : proj.title;
    risk.push({
      kind: proj.kind,
      title,
      overlap_files: touchedFiles.slice(0, 3),
      stale: staleMap.get(proj.projection_id),
    });
  }

  return {
    target: `pr:${prRef}`,
    target_kind: "pr",
    pr_title: prTitle,
    pr_status: prStatus,
    touched_files: touchedFiles,
    who,
    history: history.slice(0, 10),
    connections,
    risk,
    introducing_episode: introducingEpisode,
    truncated: false,
  };
}

// ---------------------------------------------------------------------------
// Assembly — Issue mode
// ---------------------------------------------------------------------------

export async function assembleIssueDigest(
  graph: EngramGraph,
  issueRef: string,
): Promise<BriefDigest> {
  const episodeRow = fetchEpisodeByRef(
    graph,
    EPISODE_SOURCE_TYPES.GITHUB_ISSUE,
    issueRef,
  );
  if (!episodeRow)
    return { ...EMPTY_BRIEF(`issue:${issueRef}`, "issue"), issue_labels: [] };

  const introducingEpisode = toCitedEpisode(episodeRow);
  const issueTitle =
    episodeRow.content.split("\n")[0]?.trim() || `Issue #${issueRef}`;

  const labelsMatch = episodeRow.content.match(/Labels?:\s*(.+)/i);
  const issueLabels = labelsMatch
    ? labelsMatch[1]
        .split(/[,;]/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];
  const issueStatus = episodeRow.content.toLowerCase().includes("closed")
    ? "closed"
    : "open";

  const who: BriefDigest["who"] = [];
  if (episodeRow.actor) who.push({ name: episodeRow.actor, role: "reporter" });
  const assigneesMatch = episodeRow.content.match(/Assignee[s]?:\s*(.+)/i);
  if (assigneesMatch) {
    for (const a of assigneesMatch[1]
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!who.find((w) => w.name === a))
        who.push({ name: a, role: "assignee" });
    }
  }

  const history: BriefDigest["history"] = [];
  try {
    const prRows = graph.db
      .query<
        { id: string; source_ref: string | null; content: string },
        [string, string, string, string, string]
      >(
        `SELECT id, source_ref, content FROM episodes
         WHERE source_type = ?
           AND (content LIKE ? OR content LIKE ? OR content LIKE ? OR content LIKE ?)
           AND status = 'active'
         ORDER BY timestamp DESC LIMIT 10`,
      )
      .all(
        EPISODE_SOURCE_TYPES.GITHUB_PR,
        `%#${issueRef}%`,
        `%closes ${issueRef}%`,
        `%fixes ${issueRef}%`,
        `%issue ${issueRef}%`,
      );
    for (const prRow of prRows) {
      const prTitle = prRow.content.split("\n")[0]?.trim() || "";
      const epRef = prRow.source_ref
        ? prRow.source_ref.replace(/^#/, "").replace(/.*\/pull\//, "")
        : prRow.id;
      history.push({
        canonical_name: `PR #${epRef}: ${prTitle.slice(0, 60)}`,
        weight: 1,
        episode_id: prRow.id,
      });
    }
  } catch {
    /* ignore */
  }

  const linkedEntities = getEpisodeLinkedEntities(graph, episodeRow.id);
  const connections: BriefDigest["connections"] = [];
  const connectionsSeen = new Set<string>();
  for (const entity of linkedEntities.slice(0, 10)) {
    for (const result of listActiveProjections(graph, {
      anchor_id: entity.id,
    })) {
      if (!connectionsSeen.has(result.projection.id)) {
        connectionsSeen.add(result.projection.id);
        connections.push({
          kind: result.projection.kind,
          title: result.projection.title,
          valid_from: result.projection.valid_from,
          stale: result.stale,
        });
      }
    }
  }

  return {
    target: `issue:${issueRef}`,
    target_kind: "issue",
    issue_title: issueTitle,
    issue_status: issueStatus,
    issue_labels: issueLabels,
    who,
    history,
    connections,
    risk: [],
    introducing_episode: introducingEpisode,
    truncated: false,
  };
}

// ---------------------------------------------------------------------------
// Assembly — Entity / Topic mode
// ---------------------------------------------------------------------------

async function assembleAnchorDigest(
  graph: EngramGraph,
  entityId: string,
  label: string,
  kind: "entity" | "topic",
): Promise<BriefDigest> {
  let introducingEpisode: CitedEpisode | null = null;
  const introRow = graph.db
    .query<EpisodeRow, [string, string]>(
      `SELECT ep.id, ep.source_type, ep.source_ref, ep.actor, ep.timestamp, ep.content
       FROM entity_evidence ee
       JOIN episodes ep ON ep.id = ee.episode_id
       WHERE ee.entity_id = ? AND ep.source_type = ? AND ep.status = 'active'
       ORDER BY ep.timestamp ASC LIMIT 1`,
    )
    .get(entityId, EPISODE_SOURCE_TYPES.GIT_COMMIT);
  if (introRow) introducingEpisode = toCitedEpisode(introRow);

  const who: BriefDigest["who"] = [];
  const ownersSeen = new Set<string>();
  for (const edge of getOwnershipEdges(graph, entityId)) {
    const ownerId =
      edge.source_id === entityId ? edge.target_id : edge.source_id;
    if (!ownersSeen.has(ownerId)) {
      ownersSeen.add(ownerId);
      const ownerEntity = getEntity(graph, ownerId);
      if (ownerEntity)
        who.push({
          name: ownerEntity.canonical_name,
          role: "owner",
          entity_id: ownerId,
        });
    }
  }

  const history: BriefDigest["history"] = [];
  for (const row of getCoChangeNeighbors(graph, entityId, 10)) {
    const neighborId =
      row.source_id === entityId ? row.target_id : row.source_id;
    const neighborEntity = getEntity(graph, neighborId);
    if (neighborEntity)
      history.push({
        canonical_name: neighborEntity.canonical_name,
        weight: row.weight,
      });
  }

  const connections: BriefDigest["connections"] = [];
  const connectionIds = new Set<string>();
  for (const result of listActiveProjections(graph, { anchor_id: entityId })) {
    connectionIds.add(result.projection.id);
    connections.push({
      kind: result.projection.kind,
      title: result.projection.title,
      valid_from: result.projection.valid_from,
      stale: result.stale,
    });
  }

  const staleMap = buildStaleMap(graph);
  const risk: BriefDigest["risk"] = [];
  for (const proj of getProjectionsOverlappingEntities(graph, [entityId])) {
    if (!connectionIds.has(proj.projection_id))
      risk.push({
        kind: proj.kind,
        title: proj.title,
        overlap_files: [label],
        stale: staleMap.get(proj.projection_id),
      });
  }

  return {
    target: kind === "entity" ? `entity:${entityId}` : label,
    target_kind: kind,
    who,
    history,
    connections,
    risk,
    introducing_episode: introducingEpisode,
    truncated: false,
  };
}

export async function assembleEntityDigest(
  graph: EngramGraph,
  entityId: string,
): Promise<BriefDigest> {
  const entity = getEntity(graph, entityId);
  if (!entity) return EMPTY_BRIEF(`entity:${entityId}`, "entity");
  return assembleAnchorDigest(
    graph,
    entity.id,
    entity.canonical_name,
    "entity",
  );
}

export async function assembleTopicDigest(
  graph: EngramGraph,
  topic: string,
  exitOnAmbiguous: () => never,
): Promise<BriefDigest> {
  const ftsRows = searchEntitiesFts(graph, topic, 5);
  if (ftsRows.length === 0) return EMPTY_BRIEF(topic, "topic");

  if (ftsRows.length > 1) {
    const candidateLines = ftsRows
      .map((r) => `  ${r.canonical_name} [${r.entity_type}]`)
      .join("\n");
    console.error(
      `Ambiguous topic '${topic}' — ${ftsRows.length} candidates:\n${candidateLines}\n` +
        "Hint: use 'entity:<id>' to pin a specific entity, or narrow your query.",
    );
    exitOnAmbiguous();
  }

  return assembleAnchorDigest(
    graph,
    ftsRows[0].id,
    ftsRows[0].canonical_name,
    "topic",
  );
}
