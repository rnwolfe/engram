/**
 * brief.ts — `engram brief` command.
 *
 * Produces a structured briefing about a PR, issue, entity, or topic.
 * Assembles evidence from the knowledge graph and renders it in a structured
 * multi-section format (What / Who / History / Connections / Risk).
 *
 * Usage:
 *   engram brief pr:<n>
 *   engram brief issue:<n>
 *   engram brief entity:<ulid>
 *   engram brief <topic>
 *   engram brief pr:123 --format text|markdown|json
 *   engram brief pr:123 --no-ai
 *   engram brief pr:123 --db <path>
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import {
  closeGraph,
  EPISODE_SOURCE_TYPES,
  getEntity,
  listActiveProjections,
  openGraph,
  resolveDbPath,
} from "engram-core";
import type { CitedEpisode, OutputFormat } from "./_render.js";
import { citationMarkdown, citationText } from "./_render.js";
import {
  getCoChangeNeighbors,
  getOwnershipEdges,
  searchEntitiesFts,
} from "./_retrieval.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriefDigest {
  target: string;
  target_kind: "pr" | "issue" | "entity" | "topic";
  // PR fields
  pr_title?: string;
  pr_status?: "open" | "merged" | "closed";
  touched_files?: string[];
  // Issue fields
  issue_title?: string;
  issue_status?: string;
  issue_labels?: string[];
  // Common sections
  who: Array<{ name: string; role: string; entity_id?: string }>;
  history: Array<{
    canonical_name: string;
    weight: number;
    episode_id?: string;
  }>;
  connections: Array<{
    kind: string;
    title: string;
    valid_from: string;
    stale: boolean;
    episode_id?: string;
  }>;
  risk: Array<{
    kind: string;
    title: string;
    overlap_files: string[];
    stale?: boolean;
  }>;
  introducing_episode: CitedEpisode | null;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Target parsing
// ---------------------------------------------------------------------------

export type BriefTargetKind = "pr" | "issue" | "entity" | "topic";

export interface ParsedBriefTarget {
  kind: BriefTargetKind;
  ref: string;
  raw: string;
}

/**
 * Parse a brief target argument:
 *   pr:<n>          → PR mode
 *   issue:<n>       → issue mode
 *   entity:<ulid>   → entity mode
 *   <anything else> → topic mode
 */
export function parseBriefTarget(target: string): ParsedBriefTarget {
  const lower = target.toLowerCase();
  if (lower.startsWith("pr:")) {
    return { kind: "pr", ref: target.slice(3).replace(/^#/, ""), raw: target };
  }
  if (lower.startsWith("issue:")) {
    return {
      kind: "issue",
      ref: target.slice(6).replace(/^#/, ""),
      raw: target,
    };
  }
  if (lower.startsWith("entity:")) {
    return { kind: "entity", ref: target.slice(7), raw: target };
  }
  return { kind: "topic", ref: target, raw: target };
}

// ---------------------------------------------------------------------------
// Episode helpers
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
  // Try exact match and with # prefix
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
// Parse touched files from PR episode content
// ---------------------------------------------------------------------------

/**
 * Extract file paths from episode content.
 * Looks for patterns commonly emitted by GitHub PR ingest:
 *   - Lines like `- path/to/file.ts`
 *   - Lines matching a file path pattern
 */
function parseTouchedFiles(content: string): string[] {
  const files = new Set<string>();
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines that look like file paths: contain / or . and a file extension
    const fileMatch = trimmed.match(
      /^[-*+]?\s*([\w./\\-][\w./\\-]*[.][a-zA-Z]{1,10})$/,
    );
    if (fileMatch) {
      files.add(fileMatch[1]);
    }
  }
  return Array.from(files);
}

/**
 * Find entities linked to an episode via entity_evidence.
 */
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

/**
 * Find projections whose evidence set includes any of the given entity IDs.
 * Returns projection rows with basic info.
 */
interface ProjectionOverlapRow {
  projection_id: string;
  kind: string;
  title: string;
  valid_from: string;
  input_fingerprint: string;
  created_at: string;
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
        `SELECT DISTINCT p.id AS projection_id, p.kind, p.title, p.valid_from,
                p.input_fingerprint, p.created_at
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
// Digest assembly — PR mode
// ---------------------------------------------------------------------------

async function assemblePrDigest(
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
      pr_title: undefined,
      pr_status: undefined,
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

  // Parse title and status from content (first line is typically the title)
  const contentLines = episodeRow.content.split("\n");
  const prTitle = contentLines[0]?.trim() || `PR #${prRef}`;

  // Parse status from content keywords
  let prStatus: "open" | "merged" | "closed" = "open";
  const contentLower = episodeRow.content.toLowerCase();
  if (contentLower.includes("merged")) prStatus = "merged";
  else if (contentLower.includes("closed")) prStatus = "closed";

  // Get entities linked to this PR episode (touched files / modules)
  const linkedEntities = getEpisodeLinkedEntities(graph, episodeRow.id);
  const touchedFiles = linkedEntities
    .filter(
      (e) =>
        e.entity_type === "file" ||
        e.entity_type === "source_file" ||
        e.entity_type === "module",
    )
    .map((e) => e.canonical_name);

  // Also try to parse files from content if no entities found
  if (touchedFiles.length === 0) {
    const parsedFiles = parseTouchedFiles(episodeRow.content);
    touchedFiles.push(...parsedFiles);
  }

  // Who: actor from episode + file owners
  const who: BriefDigest["who"] = [];
  if (episodeRow.actor) {
    who.push({ name: episodeRow.actor, role: "author" });
  }

  // Collect ownership for touched file entities
  const fileEntityIds = linkedEntities
    .filter(
      (e) =>
        e.entity_type === "file" ||
        e.entity_type === "source_file" ||
        e.entity_type === "module",
    )
    .map((e) => e.id);

  const ownersSeen = new Set<string>();
  for (const entityId of fileEntityIds) {
    const ownerEdges = getOwnershipEdges(graph, entityId);
    for (const edge of ownerEdges) {
      const ownerId =
        edge.source_id === entityId ? edge.target_id : edge.source_id;
      if (!ownersSeen.has(ownerId)) {
        ownersSeen.add(ownerId);
        const ownerEntity = getEntity(graph, ownerId);
        if (ownerEntity) {
          who.push({
            name: ownerEntity.canonical_name,
            role: "file-owner",
            entity_id: ownerId,
          });
        }
      }
    }
  }

  // History: co-change neighbors of touched file entities
  const history: BriefDigest["history"] = [];
  const historySeen = new Set<string>();
  for (const entityId of fileEntityIds.slice(0, 5)) {
    const neighbors = getCoChangeNeighbors(graph, entityId, 5);
    for (const neighbor of neighbors) {
      const neighborId =
        neighbor.source_id === entityId
          ? neighbor.target_id
          : neighbor.source_id;
      if (!historySeen.has(neighborId) && !fileEntityIds.includes(neighborId)) {
        historySeen.add(neighborId);
        const neighborEntity = getEntity(graph, neighborId);
        if (neighborEntity) {
          history.push({
            canonical_name: neighborEntity.canonical_name,
            weight: neighbor.weight,
          });
        }
      }
    }
  }
  history.sort((a, b) => b.weight - a.weight);

  // Connections: projections anchored on touched file entities
  const connections: BriefDigest["connections"] = [];
  const connectionsSeen = new Set<string>();
  for (const entityId of fileEntityIds) {
    const projResults = listActiveProjections(graph, { anchor_id: entityId });
    for (const result of projResults) {
      const { projection, stale } = result;
      if (!connectionsSeen.has(projection.id)) {
        connectionsSeen.add(projection.id);
        connections.push({
          kind: projection.kind,
          title: projection.title,
          valid_from: projection.valid_from,
          stale,
        });
      }
    }
  }

  // Risk: projections whose evidence overlaps touched files
  const risk: BriefDigest["risk"] = [];
  const riskSeen = new Set<string>();
  const overlapProjections = getProjectionsOverlappingEntities(
    graph,
    fileEntityIds,
  );
  for (const proj of overlapProjections) {
    if (connectionsSeen.has(proj.projection_id)) continue; // already in connections
    if (riskSeen.has(proj.projection_id)) continue;
    riskSeen.add(proj.projection_id);

    // Find which files overlap
    const overlapFiles = touchedFiles.slice(0, 3); // simplification: all touched files

    // Stale check via listActiveProjections
    const projResults = listActiveProjections(graph, {});
    const projResult = projResults.find(
      (r) => r.projection.id === proj.projection_id,
    );

    const riskEntry: BriefDigest["risk"][number] = {
      kind: proj.kind,
      title: proj.title,
      overlap_files: overlapFiles,
    };
    if (projResult) {
      riskEntry.stale = projResult.stale;
    }

    if (prStatus === "open") {
      // label as "would be invalidated if merged" — append note to title
      riskEntry.title = `${proj.title} [would be invalidated if merged]`;
    }
    risk.push(riskEntry);
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
// Digest assembly — Issue mode
// ---------------------------------------------------------------------------

async function assembleIssueDigest(
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
      issue_title: undefined,
      issue_status: undefined,
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
  const contentLines = episodeRow.content.split("\n");
  const issueTitle = contentLines[0]?.trim() || `Issue #${issueRef}`;

  // Parse labels from content (look for "Labels: ..." line)
  const labelsMatch = episodeRow.content.match(/Labels?:\s*(.+)/i);
  const issueLabels = labelsMatch
    ? labelsMatch[1]
        .split(/[,;]/)
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  // Parse status
  const contentLower = episodeRow.content.toLowerCase();
  let issueStatus = "open";
  if (contentLower.includes("closed")) issueStatus = "closed";

  // Who: assignees + actor
  const who: BriefDigest["who"] = [];
  if (episodeRow.actor) {
    who.push({ name: episodeRow.actor, role: "reporter" });
  }
  // Look for assignees in content
  const assigneesMatch = episodeRow.content.match(/Assignee[s]?:\s*(.+)/i);
  if (assigneesMatch) {
    const assignees = assigneesMatch[1]
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);
    for (const assignee of assignees) {
      if (!who.find((w) => w.name === assignee)) {
        who.push({ name: assignee, role: "assignee" });
      }
    }
  }

  // History: find PRs that reference this issue
  const history: BriefDigest["history"] = [];
  try {
    for (const _ref of [issueRef, `#${issueRef}`]) {
      const prRows = graph.db
        .query<
          { id: string; source_ref: string | null; content: string },
          [string, string]
        >(
          `SELECT id, source_ref, content FROM episodes
           WHERE source_type = ?
             AND (content LIKE ? OR content LIKE ? OR content LIKE ? OR content LIKE ?)
             AND status = 'active'
           ORDER BY timestamp DESC
           LIMIT 10`,
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
        const episodeRef = prRow.source_ref
          ? prRow.source_ref.replace(/^#/, "")
          : prRow.id;
        history.push({
          canonical_name: `PR #${episodeRef}: ${prTitle.slice(0, 60)}`,
          weight: 1,
          episode_id: prRow.id,
        });
      }
      if (history.length > 0) break;
    }
  } catch {
    // ignore query errors
  }

  // Connections: projections related to entities mentioned in issue body
  const linkedEntities = getEpisodeLinkedEntities(graph, episodeRow.id);
  const connections: BriefDigest["connections"] = [];
  const connectionsSeen = new Set<string>();
  for (const entity of linkedEntities.slice(0, 10)) {
    const projResults = listActiveProjections(graph, { anchor_id: entity.id });
    for (const result of projResults) {
      const { projection, stale } = result;
      if (!connectionsSeen.has(projection.id)) {
        connectionsSeen.add(projection.id);
        connections.push({
          kind: projection.kind,
          title: projection.title,
          valid_from: projection.valid_from,
          stale,
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
    risk: [], // no Risk section for issues
    introducing_episode: introducingEpisode,
    truncated: false,
  };
}

// ---------------------------------------------------------------------------
// Digest assembly — Entity / Topic mode
// ---------------------------------------------------------------------------

async function assembleEntityDigest(
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

async function assembleTopicDigest(
  graph: EngramGraph,
  topic: string,
  exitOnAmbiguous: () => never,
): Promise<BriefDigest> {
  // FTS over entities
  const ftsRows = searchEntitiesFts(graph, topic, 10);

  if (ftsRows.length === 0) {
    // Also try episodes FTS
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
    // Ambiguous — print candidates and exit 2
    const candidateLines = ftsRows
      .slice(0, 10)
      .map((r) => `  ${r.canonical_name} [${r.entity_type}]`)
      .join("\n");
    console.error(
      `Ambiguous topic '${topic}' — ${ftsRows.length} candidates:\n${candidateLines}\n` +
        `Hint: use 'entity:<id>' to pin a specific entity, or narrow your query.`,
    );
    exitOnAmbiguous();
  }

  // Use top match as anchor
  const topRow = ftsRows[0];
  return assembleAnchorDigest(graph, topRow.id, topRow.canonical_name, "topic");
}

async function assembleAnchorDigest(
  graph: EngramGraph,
  entityId: string,
  label: string,
  kind: "entity" | "topic",
): Promise<BriefDigest> {
  // What: terse entity summary from linked episodes
  let introducingEpisode: CitedEpisode | null = null;
  const introEpRow = graph.db
    .query<EpisodeRow, [string, string]>(
      `SELECT ep.id, ep.source_type, ep.source_ref, ep.actor, ep.timestamp, ep.content
       FROM entity_evidence ee
       JOIN episodes ep ON ep.id = ee.episode_id
       WHERE ee.entity_id = ?
         AND ep.source_type = ?
         AND ep.status = 'active'
       ORDER BY ep.timestamp ASC
       LIMIT 1`,
    )
    .get(entityId, EPISODE_SOURCE_TYPES.GIT_COMMIT);
  if (introEpRow) {
    introducingEpisode = toCitedEpisode(introEpRow);
  }

  // Who: ownership
  const who: BriefDigest["who"] = [];
  const ownerEdges = getOwnershipEdges(graph, entityId);
  const ownersSeen = new Set<string>();
  for (const edge of ownerEdges) {
    const ownerId =
      edge.source_id === entityId ? edge.target_id : edge.source_id;
    if (!ownersSeen.has(ownerId)) {
      ownersSeen.add(ownerId);
      const ownerEntity = getEntity(graph, ownerId);
      if (ownerEntity) {
        who.push({
          name: ownerEntity.canonical_name,
          role: "owner",
          entity_id: ownerId,
        });
      }
    }
  }

  // History: co-change neighbors
  const history: BriefDigest["history"] = [];
  const coChangeRows = getCoChangeNeighbors(graph, entityId, 10);
  for (const row of coChangeRows) {
    const neighborId =
      row.source_id === entityId ? row.target_id : row.source_id;
    const neighborEntity = getEntity(graph, neighborId);
    if (neighborEntity) {
      history.push({
        canonical_name: neighborEntity.canonical_name,
        weight: row.weight,
      });
    }
  }

  // Connections: anchored projections
  const connections: BriefDigest["connections"] = [];
  const projResults = listActiveProjections(graph, { anchor_id: entityId });
  for (const result of projResults) {
    const { projection, stale } = result;
    connections.push({
      kind: projection.kind,
      title: projection.title,
      valid_from: projection.valid_from,
      stale,
    });
  }

  // Risk: projections with overlapping evidence
  const risk: BriefDigest["risk"] = [];
  const connectionIds = new Set(
    connections.map((_, i) => projResults[i]?.projection.id).filter(Boolean),
  );
  const overlapProjections = getProjectionsOverlappingEntities(graph, [
    entityId,
  ]);
  for (const proj of overlapProjections) {
    if (connectionIds.has(proj.projection_id)) continue;
    const projAllResults = listActiveProjections(graph, {});
    const projResult = projAllResults.find(
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

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------

function shortDate(ts: string): string {
  return ts.slice(0, 10);
}

export function renderBriefText(digest: BriefDigest): string {
  const lines: string[] = [];
  lines.push(`=== Brief: ${digest.target} ===`);
  lines.push("");

  // What
  lines.push("WHAT");
  if (digest.target_kind === "pr") {
    if (digest.pr_title) lines.push(`  Title:  ${digest.pr_title}`);
    if (digest.pr_status) lines.push(`  Status: ${digest.pr_status}`);
    if (digest.touched_files && digest.touched_files.length > 0) {
      lines.push(
        `  Files:  ${digest.touched_files.slice(0, 5).join(", ")}${digest.touched_files.length > 5 ? ` (+${digest.touched_files.length - 5} more)` : ""}`,
      );
    }
  } else if (digest.target_kind === "issue") {
    if (digest.issue_title) lines.push(`  Title:  ${digest.issue_title}`);
    if (digest.issue_status) lines.push(`  Status: ${digest.issue_status}`);
    if (digest.issue_labels && digest.issue_labels.length > 0) {
      lines.push(`  Labels: ${digest.issue_labels.join(", ")}`);
    }
  } else {
    lines.push(`  Entity: ${digest.target}`);
  }
  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const cit = citationText(ep.episode_id);
    lines.push(`  Source: ${ep.excerpt.split("\n")[0].slice(0, 72)}  ${cit}`);
  }
  lines.push("");

  // Who
  if (digest.who.length > 0) {
    lines.push("WHO");
    for (const w of digest.who) {
      lines.push(`  ${w.name} (${w.role})`);
    }
    lines.push("");
  }

  // History
  if (digest.history.length > 0) {
    lines.push("HISTORY");
    for (const h of digest.history) {
      const cit = h.episode_id ? `  ${citationText(h.episode_id)}` : "";
      lines.push(`  ${h.canonical_name.slice(0, 60)}  ${h.weight}×${cit}`);
    }
    lines.push("");
  }

  // Connections
  if (digest.connections.length > 0) {
    lines.push("CONNECTIONS");
    for (const c of digest.connections) {
      const staleFlag = c.stale ? " [stale]" : "";
      lines.push(
        `  ${c.kind.padEnd(16)} "${c.title.slice(0, 50)}"  ${shortDate(c.valid_from)}${staleFlag}`,
      );
    }
    lines.push("");
  }

  // Risk
  if (digest.risk.length > 0) {
    lines.push("RISK");
    for (const r of digest.risk) {
      const staleFlag = r.stale ? " [stale]" : "";
      lines.push(
        `  ${r.kind.padEnd(16)} "${r.title.slice(0, 50)}"${staleFlag}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderBriefMarkdown(
  digest: BriefDigest,
  repoUrl?: string,
): string {
  const lines: string[] = [];

  lines.push(`## Brief: \`${digest.target}\``);
  lines.push("");

  // What
  lines.push("### What");
  if (digest.target_kind === "pr") {
    if (digest.pr_title) lines.push(`**Title:** ${digest.pr_title}`);
    if (digest.pr_status) lines.push(`**Status:** ${digest.pr_status}`);
    if (digest.touched_files && digest.touched_files.length > 0) {
      const shown = digest.touched_files.slice(0, 8);
      const extra = digest.touched_files.length - shown.length;
      lines.push(`**Touched files:**`);
      for (const f of shown) lines.push(`- \`${f}\``);
      if (extra > 0) lines.push(`- _…and ${extra} more_`);
    }
  } else if (digest.target_kind === "issue") {
    if (digest.issue_title) lines.push(`**Title:** ${digest.issue_title}`);
    if (digest.issue_status) lines.push(`**Status:** ${digest.issue_status}`);
    if (digest.issue_labels && digest.issue_labels.length > 0)
      lines.push(
        `**Labels:** ${digest.issue_labels.map((l) => `\`${l}\``).join(", ")}`,
      );
  } else {
    lines.push(`**Entity:** \`${digest.target}\``);
  }
  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const cit = citationMarkdown(ep, repoUrl);
    const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 80);
    lines.push(`**Source:** ${firstLine} ${cit}`);
  }
  lines.push("");

  // Who
  if (digest.who.length > 0) {
    lines.push("### Who");
    for (const w of digest.who) {
      lines.push(`- **${w.name}** (${w.role})`);
    }
    lines.push("");
  }

  // History
  if (digest.history.length > 0) {
    lines.push("### History");
    for (const h of digest.history) {
      const cit = h.episode_id ? ` [E:${h.episode_id}]` : "";
      lines.push(`- \`${h.canonical_name}\` — **${h.weight}×**${cit}`);
    }
    lines.push("");
  }

  // Connections
  if (digest.connections.length > 0) {
    lines.push("### Connections");
    for (const c of digest.connections) {
      const staleFlag = c.stale ? " ⚠ stale" : "";
      const cit = c.episode_id ? ` [E:${c.episode_id}]` : "";
      lines.push(
        `- **${c.kind}** — _${c.title}_ (${shortDate(c.valid_from)})${staleFlag}${cit}`,
      );
    }
    lines.push("");
  }

  // Risk
  if (digest.risk.length > 0) {
    lines.push("### Risk");
    for (const r of digest.risk) {
      const staleFlag = r.stale ? " ⚠ stale" : "";
      const files =
        r.overlap_files.length > 0
          ? ` — overlaps: ${r.overlap_files
              .slice(0, 3)
              .map((f) => `\`${f}\``)
              .join(", ")}`
          : "";
      lines.push(`- **${r.kind}** — _${r.title}_${files}${staleFlag}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export interface BriefJson {
  target: string;
  target_kind: string;
  pr_title?: string;
  pr_status?: string;
  touched_files?: string[];
  issue_title?: string;
  issue_status?: string;
  issue_labels?: string[];
  who: BriefDigest["who"];
  history: BriefDigest["history"];
  connections: BriefDigest["connections"];
  risk: BriefDigest["risk"];
  introducing_episode: CitedEpisode | null;
  truncated: boolean;
}

export function renderBriefJson(
  digest: BriefDigest,
  _repoUrl?: string,
): BriefJson {
  return {
    target: digest.target,
    target_kind: digest.target_kind,
    ...(digest.pr_title !== undefined && { pr_title: digest.pr_title }),
    ...(digest.pr_status !== undefined && { pr_status: digest.pr_status }),
    ...(digest.touched_files !== undefined && {
      touched_files: digest.touched_files,
    }),
    ...(digest.issue_title !== undefined && {
      issue_title: digest.issue_title,
    }),
    ...(digest.issue_status !== undefined && {
      issue_status: digest.issue_status,
    }),
    ...(digest.issue_labels !== undefined && {
      issue_labels: digest.issue_labels,
    }),
    who: digest.who,
    history: digest.history,
    connections: digest.connections,
    risk: digest.risk,
    introducing_episode: digest.introducing_episode,
    truncated: digest.truncated,
  };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

interface BriefOpts {
  db: string;
  format: string;
  noAi: boolean;
  j?: boolean;
}

export function registerBrief(program: Command): void {
  program
    .command("brief <target>")
    .description(
      "Produce a structured briefing for a PR, issue, entity, or topic",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .option(
      "--format <fmt>",
      "output format: text, markdown, or json",
      "markdown",
    )
    .option("-j", "shorthand for --format json")
    .option("--no-ai", "structured output only (AI prose is a stretch goal)")
    .addHelpText(
      "after",
      `
Target forms:
  pr:<n>          Briefing for GitHub PR #n
  issue:<n>       Briefing for GitHub issue #n
  entity:<ulid>   Briefing anchored on a specific entity
  <topic>         FTS over entities; exit 2 if ambiguous

Sections produced:
  What       — title, status, touched files (PR) or labels (issue)
  Who        — author, assignees, file owners
  History    — co-change neighbors of touched files
  Connections — projections anchored on touched entities
  Risk       — projections whose evidence overlaps touched files

Examples:
  engram brief pr:123
  engram brief issue:42 --format json
  engram brief "authentication middleware" --format text
  engram brief entity:01HXYZ... --format markdown

See also:
  engram why     Narrate the history of a file or symbol
  engram context Assemble a full context pack for a query`,
    )
    .action(async (target: string, opts: BriefOpts) => {
      if (opts.j) opts.format = "json";

      const validFormats: OutputFormat[] = ["text", "markdown", "json"];
      if (!validFormats.includes(opts.format as OutputFormat)) {
        console.error(
          `Error: --format must be one of: ${validFormats.join(", ")}`,
        );
        process.exit(1);
      }

      const dbPath = resolveDbPath(path.resolve(opts.db));

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        const parsed = parseBriefTarget(target);
        let digest: BriefDigest;

        switch (parsed.kind) {
          case "pr":
            digest = await assemblePrDigest(graph, parsed.ref);
            break;
          case "issue":
            digest = await assembleIssueDigest(graph, parsed.ref);
            break;
          case "entity":
            digest = await assembleEntityDigest(graph, parsed.ref);
            break;
          default:
            digest = await assembleTopicDigest(graph, parsed.ref, () => {
              if (graph) closeGraph(graph);
              process.exit(2);
            });
        }

        let output: string;
        switch (opts.format as OutputFormat) {
          case "json":
            output = JSON.stringify(renderBriefJson(digest), null, 2);
            break;
          case "text":
            output = renderBriefText(digest);
            break;
          default:
            output = renderBriefMarkdown(digest);
        }

        console.log(output);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
