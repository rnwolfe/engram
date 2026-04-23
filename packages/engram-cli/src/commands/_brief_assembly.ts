/**
 * _brief_assembly.ts — digest assembly helpers and assembly functions for `engram brief`.
 */

import type { EngramGraph } from "engram-core";
import {
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

// ---------------------------------------------------------------------------
// Episode row helpers
// ---------------------------------------------------------------------------

const EXCERPT_MAX = 400;

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

function fetchEpisodeBySourceRef(
  graph: EngramGraph,
  sourceType: string,
  sourceRef: string,
): EpisodeRow | null {
  for (const ref of [sourceRef, `#${sourceRef}`]) {
    const row = graph.db
      .query<EpisodeRow, [string, string]>(
        `SELECT id, source_type, source_ref, actor, timestamp, content
         FROM episodes
         WHERE source_type = ? AND source_ref = ? AND status = 'active'
         LIMIT 1`,
      )
      .get(sourceType, ref);
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

// ---------------------------------------------------------------------------
// Entity / projection DB helpers
// ---------------------------------------------------------------------------

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
         WHERE ee.episode_id = ?
           AND e.status = 'active'
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

// ---------------------------------------------------------------------------
// Assembly — PR mode
// ---------------------------------------------------------------------------

export async function assemblePrDigest(
  graph: EngramGraph,
  prRef: string,
): Promise<BriefDigest> {
  const episodeRow = fetchEpisodeBySourceRef(
    graph,
    EPISODE_SOURCE_TYPES.GITHUB_PR,
    prRef,
  );

  if (!episodeRow) {
    return {
      target: `pr:${prRef}`,
      target_kind: "pr",
      touched_files: [],
      who: [],
      history: [],
      connections: [],
      risk: [],
      introducing_episode: null,
      truncated: false,
    };
  }

  const introducingEpisode = toCitedEpisode(episodeRow);
  const prTitle = episodeRow.content.split("\n")[0]?.trim() || `PR #${prRef}`;

  let prStatus: "open" | "merged" | "closed" = "open";
  const contentLower = episodeRow.content.toLowerCase();
  if (contentLower.includes("merged")) prStatus = "merged";
  else if (contentLower.includes("closed")) prStatus = "closed";

  const linkedEntities = getEpisodeLinkedEntities(graph, episodeRow.id);
  const fileEntities = linkedEntities.filter(
    (e) =>
      e.entity_type === "file" ||
      e.entity_type === "source_file" ||
      e.entity_type === "module",
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

  const risk: BriefDigest["risk"] = [];
  const riskSeen = new Set<string>();
  for (const proj of getProjectionsOverlappingEntities(graph, fileEntityIds)) {
    if (
      connectionIds.has(proj.projection_id) ||
      riskSeen.has(proj.projection_id)
    )
      continue;
    riskSeen.add(proj.projection_id);
    const projResult = listActiveProjections(graph, {}).find(
      (r) => r.projection.id === proj.projection_id,
    );
    const title =
      prStatus === "open"
        ? `${proj.title} [would be invalidated if merged]`
        : proj.title;
    risk.push({
      kind: proj.kind,
      title,
      overlap_files: touchedFiles.slice(0, 3),
      stale: projResult?.stale,
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
  const episodeRow = fetchEpisodeBySourceRef(
    graph,
    EPISODE_SOURCE_TYPES.GITHUB_ISSUE,
    issueRef,
  );

  if (!episodeRow) {
    return {
      target: `issue:${issueRef}`,
      target_kind: "issue",
      issue_labels: [],
      who: [],
      history: [],
      connections: [],
      risk: [],
      introducing_episode: null,
      truncated: false,
    };
  }

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
    for (const assignee of assigneesMatch[1]
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean)) {
      if (!who.find((w) => w.name === assignee))
        who.push({ name: assignee, role: "assignee" });
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
        ? prRow.source_ref.replace(/^#/, "")
        : prRow.id;
      history.push({
        canonical_name: `PR #${epRef}: ${prTitle.slice(0, 60)}`,
        weight: 1,
        episode_id: prRow.id,
      });
    }
  } catch {
    // ignore
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
  const projResults = listActiveProjections(graph, { anchor_id: entityId });
  const connectionIds = new Set<string>();
  for (const result of projResults) {
    connectionIds.add(result.projection.id);
    connections.push({
      kind: result.projection.kind,
      title: result.projection.title,
      valid_from: result.projection.valid_from,
      stale: result.stale,
    });
  }

  const risk: BriefDigest["risk"] = [];
  for (const proj of getProjectionsOverlappingEntities(graph, [entityId])) {
    if (connectionIds.has(proj.projection_id)) continue;
    const projResult = listActiveProjections(graph, {}).find(
      (r) => r.projection.id === proj.projection_id,
    );
    risk.push({
      kind: proj.kind,
      title: proj.title,
      overlap_files: [label],
      stale: projResult?.stale,
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
  if (!entity) {
    return {
      target: `entity:${entityId}`,
      target_kind: "entity",
      who: [],
      history: [],
      connections: [],
      risk: [],
      introducing_episode: null,
      truncated: false,
    };
  }
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
  const ftsRows = searchEntitiesFts(graph, topic, 10);

  if (ftsRows.length === 0) {
    return {
      target: topic,
      target_kind: "topic",
      who: [],
      history: [],
      connections: [],
      risk: [],
      introducing_episode: null,
      truncated: false,
    };
  }

  if (ftsRows.length > 3) {
    const candidateLines = ftsRows
      .slice(0, 10)
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
