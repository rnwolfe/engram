/**
 * github-helpers.ts — Internal helpers for the GitHub enrichment adapter.
 *
 * Extracted to keep github.ts under 500 lines. Not part of the public API.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../../format/index.js";
import { ENGINE_VERSION } from "../../format/version.js";
import { addEntityAlias, resolveEntity } from "../../graph/aliases.js";
import { addEdge } from "../../graph/edges.js";
import { addEntity, type EvidenceInput } from "../../graph/entities.js";
import { addEpisode } from "../../graph/episodes.js";
import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  INGESTION_SOURCE_TYPES,
  RELATION_TYPES,
} from "../../vocab/index.js";
import { EnrichmentAdapterError } from "../adapter.js";
import { writeCursor } from "../cursor.js";

// ---------------------------------------------------------------------------
// Internal types (GitHub REST API shapes — only fields we use)
// ---------------------------------------------------------------------------

export interface GitHubUser {
  login: string;
}

export interface GitHubPR {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  requested_reviewers: GitHubUser[];
  assignees: GitHubUser[];
}

export interface GitHubIssue {
  number: number;
  html_url: string;
  title: string;
  body: string | null;
  state: string;
  user: GitHubUser | null;
  created_at: string;
  updated_at: string;
  pull_request?: unknown; // present when this issue is actually a PR
}

export interface IngestionRun {
  id: string;
  source_type: string;
  source_scope: string;
  started_at: string;
  completed_at: string | null;
  cursor: string | null;
  extractor_version: string;
  episodes_created: number;
  entities_created: number;
  edges_created: number;
  status: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// ingestion_runs helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.GITHUB;

export function createIngestionRun(
  graph: EngramGraph,
  sourceScope: string,
): IngestionRun {
  const id = ulid();
  const now = new Date().toISOString();

  graph.db
    .prepare<
      void,
      [string, string, string, string, string, number, number, number, string]
    >(
      `INSERT INTO ingestion_runs
         (id, source_type, source_scope, started_at, extractor_version,
          episodes_created, entities_created, edges_created, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, SOURCE_TYPE, sourceScope, now, ENGINE_VERSION, 0, 0, 0, "running");

  return graph.db
    .query<IngestionRun, [string]>("SELECT * FROM ingestion_runs WHERE id = ?")
    .get(id) as IngestionRun;
}

export function completeIngestionRun(
  graph: EngramGraph,
  runId: string,
  cursor: string | null,
  counts: { episodes: number; entities: number; edges: number },
): void {
  const now = new Date().toISOString();
  writeCursor(graph, runId, cursor);
  graph.db
    .prepare<void, [string, number, number, number, string]>(
      `UPDATE ingestion_runs
       SET completed_at = ?, episodes_created = ?,
           entities_created = ?, edges_created = ?, status = 'completed'
       WHERE id = ?`,
    )
    .run(now, counts.episodes, counts.entities, counts.edges, runId);
}

export function failIngestionRun(
  graph: EngramGraph,
  runId: string,
  error: string,
): void {
  const now = new Date().toISOString();
  graph.db
    .prepare<void, [string, string, string]>(
      `UPDATE ingestion_runs SET completed_at = ?, status = 'failed', error = ? WHERE id = ?`,
    )
    .run(now, error, runId);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

export type FetchFn = typeof fetch;

/**
 * Thrown when the GitHub API returns 401 or 403.
 * Caught by the CLI to display a targeted help message.
 */
export class GitHubHttpAuthError extends EnrichmentAdapterError {
  constructor(message: string) {
    super("auth_failure", message);
    // Preserve the public name GitHubAuthError regardless of internal class name.
    this.name = "GitHubAuthError";
  }
}

export async function apiGet<T>(
  fetchFn: FetchFn,
  endpoint: string,
  path: string,
  token: string | undefined,
): Promise<T> {
  const url = `${endpoint}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetchFn(url, { headers });

  if (!resp.ok) {
    const body = await resp.text();

    if (resp.status === 401) {
      throw new GitHubHttpAuthError(
        token
          ? "GitHub API returned 401 — your token may be invalid or expired. Check your GITHUB_TOKEN."
          : "GitHub API returned 401 — this repository requires authentication. Provide a token with --token or GITHUB_TOKEN env var.",
      );
    }
    if (resp.status === 403) {
      throw new GitHubHttpAuthError(
        token
          ? "GitHub API returned 403 — your token may lack the required scope. Private repos need the `repo` scope."
          : "GitHub API returned 403 — access denied. This repository may be private. Provide a token with --token or GITHUB_TOKEN env var.",
      );
    }
    if (resp.status === 404) {
      throw new EnrichmentAdapterError(
        "data_error",
        `GitHubAdapter: repository not found. Check the owner/repo format and ensure the repository exists. (${url})`,
      );
    }
    if (resp.status === 429) {
      const resetAt = resp.headers.get("x-ratelimit-reset");
      const resetMsg = resetAt
        ? ` Rate limit resets at ${new Date(Number(resetAt) * 1000).toISOString()}.`
        : "";
      throw new EnrichmentAdapterError(
        "rate_limited",
        `GitHubAdapter: rate limit exceeded.${resetMsg}${!token ? " Provide a GITHUB_TOKEN to raise the limit from 60 to 5,000 requests/hour." : ""}`,
      );
    }

    throw new EnrichmentAdapterError(
      "server_error",
      `GitHubAdapter: GET ${url} returned HTTP ${resp.status}: ${body}`,
    );
  }

  return resp.json() as Promise<T>;
}

export async function fetchAllPages<T>(
  fetchFn: FetchFn,
  endpoint: string,
  basePath: string,
  token: string | undefined,
  since?: string,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    let path = `${basePath}${sep}per_page=100&page=${page}`;
    if (since) {
      path += `&since=${encodeURIComponent(since)}`;
    }

    const batch = await apiGet<T[]>(fetchFn, endpoint, path, token);
    if (!Array.isArray(batch) || batch.length === 0) break;

    results.push(...batch);
    if (batch.length < 100) break;
    page++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

export const EXTRACTOR = "github-ingest";

export function getOrCreatePerson(
  graph: EngramGraph,
  login: string,
  episodeId: string,
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  const existing = resolveEntity(graph, login, ENTITY_TYPES.PERSON);

  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }

  const entity = addEntity(
    graph,
    { canonical_name: login, entity_type: ENTITY_TYPES.PERSON },
    [{ episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 }],
  );

  counts.entitiesCreated++;
  return entity.id;
}

// ---------------------------------------------------------------------------
// PR ingestion
// ---------------------------------------------------------------------------

export function ingestPR(
  graph: EngramGraph,
  pr: GitHubPR,
  repo: string,
  counts: {
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    entitiesResolved: number;
    edgesCreated: number;
    edgesSuperseded: number;
    episodeIds: string[];
  },
): void {
  const content = [
    `PR #${pr.number}: ${pr.title}`,
    `URL: ${pr.html_url}`,
    `State: ${pr.state}`,
    `Author: ${pr.user?.login ?? "unknown"}`,
    `Created: ${pr.created_at}`,
    "",
    pr.body ?? "",
  ]
    .join("\n")
    .trim();

  // Pre-check for existing episode (idempotent dedup)
  const existingEpisode = graph.db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
    )
    .get(EPISODE_SOURCE_TYPES.GITHUB_PR, pr.html_url);

  if (existingEpisode) {
    counts.episodesSkipped++;
    return;
  }

  const episode = addEpisode(graph, {
    source_type: EPISODE_SOURCE_TYPES.GITHUB_PR,
    source_ref: pr.html_url,
    content,
    actor: pr.user?.login ?? undefined,
    timestamp: pr.created_at,
    extractor_version: ENGINE_VERSION,
    metadata: {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      html_url: pr.html_url,
    },
  });

  counts.episodesCreated++;

  const episodeId = episode.id;
  counts.episodeIds.push(episodeId);
  const evidence: EvidenceInput[] = [
    { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
  ];

  // Create PR entity and register shorthand aliases for cross-ref resolution
  let prEntity = resolveEntity(graph, pr.html_url, ENTITY_TYPES.PULL_REQUEST);
  if (!prEntity) {
    prEntity = addEntity(
      graph,
      {
        canonical_name: pr.html_url,
        entity_type: ENTITY_TYPES.PULL_REQUEST,
        summary: pr.title,
      },
      evidence,
    );
    counts.entitiesCreated++;
    addEntityAlias(graph, {
      entity_id: prEntity.id,
      alias: `#${pr.number}`,
      episode_id: episodeId,
    });
    addEntityAlias(graph, {
      entity_id: prEntity.id,
      alias: `${repo}#${pr.number}`,
      episode_id: episodeId,
    });
  } else {
    counts.entitiesResolved++;
  }

  if (!pr.user?.login) return;

  const authorId = getOrCreatePerson(graph, pr.user.login, episodeId, counts);

  // Create reviewed_by edges: reviewer → author
  for (const reviewer of pr.requested_reviewers ?? []) {
    if (!reviewer.login || reviewer.login === pr.user.login) continue;

    const reviewerId = getOrCreatePerson(
      graph,
      reviewer.login,
      episodeId,
      counts,
    );

    // Dedup: check for existing reviewed_by edge
    const existing = graph.db
      .query<{ id: string }, [string, string, string, string]>(
        `SELECT id FROM edges
         WHERE source_id = ? AND target_id = ? AND relation_type = ?
           AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
      )
      .get(reviewerId, authorId, RELATION_TYPES.REVIEWED_BY, "observed");

    if (!existing) {
      addEdge(
        graph,
        {
          source_id: reviewerId,
          target_id: authorId,
          relation_type: RELATION_TYPES.REVIEWED_BY,
          edge_kind: "observed",
          fact: `${reviewer.login} reviewed PR #${pr.number} by ${pr.user.login}`,
          valid_from: pr.created_at,
          confidence: 1.0,
        },
        evidence,
      );
      counts.edgesCreated++;
    }
  }
}

// ---------------------------------------------------------------------------
// Issue ingestion
// ---------------------------------------------------------------------------

export function ingestIssue(
  graph: EngramGraph,
  issue: GitHubIssue,
  repo: string,
  counts: {
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    entitiesResolved: number;
    edgesCreated: number;
    edgesSuperseded: number;
    episodeIds: string[];
  },
): void {
  // Pre-check for existing episode (idempotent dedup — mirrors ingestPR)
  const existingEpisode = graph.db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
    )
    .get(EPISODE_SOURCE_TYPES.GITHUB_ISSUE, issue.html_url);

  if (existingEpisode) {
    counts.episodesSkipped++;
    return;
  }

  const content = [
    `Issue #${issue.number}: ${issue.title}`,
    `URL: ${issue.html_url}`,
    `State: ${issue.state}`,
    `Author: ${issue.user?.login ?? "unknown"}`,
    `Created: ${issue.created_at}`,
    "",
    issue.body ?? "",
  ]
    .join("\n")
    .trim();

  const episode = addEpisode(graph, {
    source_type: EPISODE_SOURCE_TYPES.GITHUB_ISSUE,
    source_ref: issue.html_url,
    content,
    actor: issue.user?.login ?? undefined,
    timestamp: issue.created_at,
    extractor_version: ENGINE_VERSION,
    metadata: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      html_url: issue.html_url,
    },
  });

  counts.episodesCreated++;

  const episodeId = episode.id;
  counts.episodeIds.push(episodeId);
  const evidence: EvidenceInput[] = [
    { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
  ];

  // Resolve or create issue entity for reference edges
  let issueEntity = resolveEntity(graph, issue.html_url, ENTITY_TYPES.ISSUE);
  if (!issueEntity) {
    issueEntity = addEntity(
      graph,
      {
        canonical_name: issue.html_url,
        entity_type: ENTITY_TYPES.ISSUE,
        summary: issue.title,
      },
      evidence,
    );
    counts.entitiesCreated++;
    addEntityAlias(graph, {
      entity_id: issueEntity.id,
      alias: `#${issue.number}`,
      episode_id: episodeId,
    });
    addEntityAlias(graph, {
      entity_id: issueEntity.id,
      alias: `${repo}#${issue.number}`,
      episode_id: episodeId,
    });
  } else {
    counts.entitiesResolved++;
  }
}
