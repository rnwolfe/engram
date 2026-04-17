/**
 * github.ts — GitHub enrichment adapter.
 *
 * Fetches PRs and issues from the GitHub REST API and ingests them into an
 * EngramGraph. Uses ingestion_runs cursors for idempotency.
 *
 * Token is accepted via opts.token and NEVER written to the graph.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../../format/index.js";
import { ENGINE_VERSION } from "../../format/version.js";
import { resolveEntity } from "../../graph/aliases.js";
import { addEdge } from "../../graph/edges.js";
import { addEntity, type EvidenceInput } from "../../graph/entities.js";
import { addEpisode } from "../../graph/episodes.js";
import type { EnrichmentAdapter, EnrichOpts } from "../adapter.js";
import { EnrichmentAdapterError } from "../adapter.js";
import type { IngestResult } from "../git.js";

// ---------------------------------------------------------------------------
// Internal types (GitHub REST API shapes — only fields we use)
// ---------------------------------------------------------------------------

interface GitHubUser {
  login: string;
}

interface GitHubPR {
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

interface GitHubIssue {
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

interface IngestionRun {
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
// Validation
// ---------------------------------------------------------------------------

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function validateRepo(repo: string): void {
  if (!REPO_RE.test(repo)) {
    throw new EnrichmentAdapterError(
      "data_error",
      `GitHubAdapter: repo must be in 'owner/repo' format, got: ${repo}`,
    );
  }
}

// ---------------------------------------------------------------------------
// ingestion_runs helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE = "github";

function createIngestionRun(
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

function completeIngestionRun(
  graph: EngramGraph,
  runId: string,
  cursor: string | null,
  counts: { episodes: number; entities: number; edges: number },
): void {
  const now = new Date().toISOString();
  graph.db
    .prepare<void, [string, string | null, number, number, number, string]>(
      `UPDATE ingestion_runs
       SET completed_at = ?, cursor = ?, episodes_created = ?,
           entities_created = ?, edges_created = ?, status = 'completed'
       WHERE id = ?`,
    )
    .run(now, cursor, counts.episodes, counts.entities, counts.edges, runId);
}

function failIngestionRun(
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

function getLastCursor(graph: EngramGraph, sourceScope: string): number {
  const row = graph.db
    .query<{ cursor: string | null }, [string, string]>(
      `SELECT cursor FROM ingestion_runs
       WHERE source_type = ? AND source_scope = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get(SOURCE_TYPE, sourceScope);

  if (!row?.cursor) return 0;
  const n = parseInt(row.cursor, 10);
  return Number.isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when the GitHub API returns 401 or 403.
 * Caught by the CLI to display a targeted help message.
 */
export class GitHubAuthError extends EnrichmentAdapterError {
  constructor(message: string) {
    super("auth_failure", message);
    this.name = "GitHubAuthError";
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type FetchFn = typeof fetch;

async function apiGet<T>(
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
      throw new GitHubAuthError(
        token
          ? "GitHub API returned 401 — your token may be invalid or expired. Check your GITHUB_TOKEN."
          : "GitHub API returned 401 — this repository requires authentication. Provide a token with --token or GITHUB_TOKEN env var.",
      );
    }
    if (resp.status === 403) {
      throw new GitHubAuthError(
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

async function fetchAllPages<T>(
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

const EXTRACTOR = "github-ingest";

function getOrCreatePerson(
  graph: EngramGraph,
  login: string,
  episodeId: string,
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  const existing = resolveEntity(graph, login, "person");

  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }

  const entity = addEntity(
    graph,
    { canonical_name: login, entity_type: "person" },
    [{ episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 }],
  );

  counts.entitiesCreated++;
  return entity.id;
}

// ---------------------------------------------------------------------------
// PR ingestion
// ---------------------------------------------------------------------------

function ingestPR(
  graph: EngramGraph,
  pr: GitHubPR,
  counts: {
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    entitiesResolved: number;
    edgesCreated: number;
    edgesSuperseded: number;
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
    .get("github_pr", pr.html_url);

  if (existingEpisode) {
    counts.episodesSkipped++;
    return;
  }

  const episode = addEpisode(graph, {
    source_type: "github_pr",
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
  const evidence: EvidenceInput[] = [
    { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
  ];

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
      .get(reviewerId, authorId, "reviewed_by", "observed");

    if (!existing) {
      addEdge(
        graph,
        {
          source_id: reviewerId,
          target_id: authorId,
          relation_type: "reviewed_by",
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

// Match #123 PR/issue references and short 7-40 char hex SHAs
const SHA_RE = /\b([0-9a-f]{7,40})\b/gi;
const PR_REF_RE = /#(\d+)/g;

function ingestIssue(
  graph: EngramGraph,
  issue: GitHubIssue,
  counts: {
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    entitiesResolved: number;
    edgesCreated: number;
    edgesSuperseded: number;
  },
): void {
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
    source_type: "github_issue",
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
  const evidence: EvidenceInput[] = [
    { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
  ];

  // Resolve or create issue entity for reference edges
  let issueEntity = resolveEntity(graph, issue.html_url, "issue");
  if (!issueEntity) {
    issueEntity = addEntity(
      graph,
      {
        canonical_name: issue.html_url,
        entity_type: "issue",
        summary: issue.title,
      },
      evidence,
    );
    counts.entitiesCreated++;
  } else {
    counts.entitiesResolved++;
  }

  const body = issue.body ?? "";

  // Create references edges for mentioned commit SHAs
  const shaMatches = [...body.matchAll(SHA_RE)];
  for (const match of shaMatches) {
    const sha = match[1];
    if (!sha) continue;

    const mentioned = graph.db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM entities WHERE canonical_name = ? AND entity_type = ? LIMIT 1",
      )
      .get(sha, "commit");

    if (!mentioned) continue;

    // Self-reference guard
    if (mentioned.id === issueEntity.id) continue;

    const existing = graph.db
      .query<{ id: string }, [string, string, string, string]>(
        `SELECT id FROM edges
         WHERE source_id = ? AND target_id = ? AND relation_type = ?
           AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
      )
      .get(issueEntity.id, mentioned.id, "references", "observed");

    if (!existing) {
      addEdge(
        graph,
        {
          source_id: issueEntity.id,
          target_id: mentioned.id,
          relation_type: "references",
          edge_kind: "observed",
          fact: `Issue #${issue.number} references commit ${sha}`,
          valid_from: issue.created_at,
          confidence: 0.9,
        },
        evidence,
      );
      counts.edgesCreated++;
    }
  }

  // Create references edges for mentioned #N (PR/issue refs)
  const prMatches = [...body.matchAll(PR_REF_RE)];
  for (const match of prMatches) {
    const refNum = match[1];
    if (!refNum) continue;

    // Look for an entity whose canonical_name ends with /pull/<N> or /issues/<N>
    const mentioned = graph.db
      .query<{ id: string }, [string, string]>(
        `SELECT id FROM entities WHERE (canonical_name LIKE ? OR canonical_name LIKE ?)
         AND entity_type IN ('issue', 'pull_request') LIMIT 1`,
      )
      .get(`%/pull/${refNum}`, `%/issues/${refNum}`);

    if (!mentioned) continue;

    // Self-reference guard
    if (mentioned.id === issueEntity.id) continue;

    const existing = graph.db
      .query<{ id: string }, [string, string, string, string]>(
        `SELECT id FROM edges
         WHERE source_id = ? AND target_id = ? AND relation_type = ?
           AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
      )
      .get(issueEntity.id, mentioned.id, "references", "observed");

    if (!existing) {
      addEdge(
        graph,
        {
          source_id: issueEntity.id,
          target_id: mentioned.id,
          relation_type: "references",
          edge_kind: "observed",
          fact: `Issue #${issue.number} references #${refNum}`,
          valid_from: issue.created_at,
          confidence: 0.9,
        },
        evidence,
      );
      counts.edgesCreated++;
    }
  }
}

// ---------------------------------------------------------------------------
// GitHubAdapter
// ---------------------------------------------------------------------------

export class GitHubAdapter implements EnrichmentAdapter {
  name = "github";
  kind = "enrichment";
  /** @experimental */
  supportsAuth: string[] = ["token", "none"];
  /** @experimental */
  supportsCursor = true;

  /**
   * Optionally inject a custom fetch function (useful for testing).
   * Defaults to the global fetch.
   */
  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
    const repo = opts.repo;
    if (!repo) {
      throw new Error("GitHubAdapter: opts.repo is required (owner/repo)");
    }
    validateRepo(repo);

    const endpoint = opts.endpoint ?? "https://api.github.com";
    const token = opts.token;

    const run = createIngestionRun(graph, repo);
    const runId = run.id;

    const counts = {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      entitiesResolved: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
    };

    try {
      const lastNumber = getLastCursor(graph, repo);
      let latestNumber = lastNumber;

      // --- Fetch and ingest PRs ---
      const prs = await fetchAllPages<GitHubPR>(
        this.fetchFn,
        endpoint,
        `/repos/${repo}/pulls?state=closed`,
        token,
        opts.since,
      );

      for (const pr of prs) {
        if (pr.number <= lastNumber) {
          counts.episodesSkipped++;
          continue;
        }

        ingestPR(graph, pr, counts);

        if (pr.number > latestNumber) {
          latestNumber = pr.number;
        }
      }

      // --- Fetch and ingest Issues (skip those that are PRs) ---
      const issues = await fetchAllPages<GitHubIssue>(
        this.fetchFn,
        endpoint,
        `/repos/${repo}/issues?state=all`,
        token,
        opts.since,
      );

      for (const issue of issues) {
        // Skip items that are actually PRs (GitHub issues API returns PRs too)
        if (issue.pull_request !== undefined) continue;

        if (issue.number <= lastNumber) {
          counts.episodesSkipped++;
          continue;
        }

        ingestIssue(graph, issue, counts);

        if (issue.number > latestNumber) {
          latestNumber = issue.number;
        }
      }

      const cursor = latestNumber > 0 ? String(latestNumber) : null;
      completeIngestionRun(graph, runId, cursor, {
        episodes: counts.episodesCreated,
        entities: counts.entitiesCreated,
        edges: counts.edgesCreated,
      });

      return { ...counts, runId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failIngestionRun(graph, runId, msg);
      throw err;
    }
  }
}
