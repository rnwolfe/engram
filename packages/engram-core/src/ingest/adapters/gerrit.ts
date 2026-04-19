/**
 * gerrit.ts — Gerrit enrichment adapter.
 *
 * Fetches code-review changes from the Gerrit REST API and ingests them into
 * an EngramGraph. Uses ingestion_runs cursors (offset-based) for resumability.
 *
 * Auth: HTTP Basic auth. Pass credentials as "user:password" in opts.token.
 * Token is NEVER written to the graph.
 *
 * Note: Gerrit prefixes all JSON responses with ")]}'\n" for XSSI protection.
 * This adapter strips the prefix before parsing.
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
import type { EnrichmentAdapter, EnrichOpts } from "../adapter.js";
import { EnrichmentAdapterError } from "../adapter.js";
import type { IngestResult } from "../git.js";

// ---------------------------------------------------------------------------
// Internal types (Gerrit REST API shapes — only fields we use)
// ---------------------------------------------------------------------------

interface GerritAccount {
  _account_id: number;
  name?: string;
  email?: string;
  username?: string;
}

interface GerritChange {
  id: string; // "project~branch~Change-Id"
  _number: number;
  project: string;
  branch: string;
  subject: string;
  status: "NEW" | "MERGED" | "ABANDONED";
  owner: GerritAccount;
  reviewers?: {
    REVIEWER?: GerritAccount[];
    CC?: GerritAccount[];
  };
  created: string;
  updated: string;
  _more_changes?: boolean; // present on last item when pagination continues
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
// ingestion_runs helpers
// ---------------------------------------------------------------------------

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.GERRIT;

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
      `UPDATE ingestion_runs
       SET completed_at = ?, status = 'failed', error = ? WHERE id = ?`,
    )
    .run(now, error, runId);
}

function getLastOffset(graph: EngramGraph, sourceScope: string): number {
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

export class GerritAuthError extends EnrichmentAdapterError {
  constructor(message: string) {
    super("auth_failure", message);
    this.name = "GerritAuthError";
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

type FetchFn = typeof fetch;

const PAGE_SIZE = 100;
// Gerrit XSSI protection prefix present on all REST responses
const XSSI_PREFIX = ")]}'";

function stripXssiPrefix(text: string): string {
  if (text.startsWith(XSSI_PREFIX)) {
    return text.slice(XSSI_PREFIX.length).trimStart();
  }
  return text;
}

function buildAuthHeader(token: string | undefined): Record<string, string> {
  if (!token) return {};
  // Accept "user:pass"; if no colon, treat as password with anonymous username
  const credentials = btoa(token.includes(":") ? token : `anonymous:${token}`);
  return { Authorization: `Basic ${credentials}` };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiGet<T>(
  fetchFn: FetchFn,
  endpoint: string,
  path: string,
  token: string | undefined,
  attempt = 0,
): Promise<T> {
  const url = `${endpoint}${path}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...buildAuthHeader(token),
  };

  const resp = await fetchFn(url, { headers });

  if (!resp.ok) {
    const body = await resp.text();

    if (resp.status === 401) {
      throw new GerritAuthError(
        token
          ? "Gerrit API returned 401 — credentials invalid or expired."
          : "Gerrit API returned 401 — auth required. Pass 'user:password' via --token.",
      );
    }
    if (resp.status === 403) {
      throw new GerritAuthError(
        "Gerrit API returned 403 — access denied. Check project visibility.",
      );
    }
    if (resp.status === 404) {
      throw new EnrichmentAdapterError(
        "data_error",
        `GerritAdapter: not found — check project name. (${url})`,
      );
    }
    if (resp.status === 429 || resp.status === 503) {
      if (attempt < 4) {
        await sleep(1000 * 2 ** attempt);
        return apiGet<T>(fetchFn, endpoint, path, token, attempt + 1);
      }
      throw new EnrichmentAdapterError(
        "rate_limited",
        `GerritAdapter: rate limited after ${attempt + 1} attempts (HTTP ${resp.status}).`,
      );
    }

    throw new EnrichmentAdapterError(
      "server_error",
      `GerritAdapter: GET ${url} returned HTTP ${resp.status}: ${body}`,
    );
  }

  const text = await resp.text();
  return JSON.parse(stripXssiPrefix(text)) as T;
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

const EXTRACTOR = "gerrit-ingest";

function accountIdentifier(account: GerritAccount): string {
  return (
    account.email ??
    account.username ??
    account.name ??
    `gerrit-account-${account._account_id}`
  );
}

function getOrCreatePerson(
  graph: EngramGraph,
  account: GerritAccount,
  episodeId: string,
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  const identifier = accountIdentifier(account);
  const existing = resolveEntity(graph, identifier, ENTITY_TYPES.PERSON);

  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }

  const entity = addEntity(
    graph,
    { canonical_name: identifier, entity_type: ENTITY_TYPES.PERSON },
    [{ episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 }],
  );

  // Register secondary identifiers as aliases so cross-source lookups succeed
  const secondaryIds = [account.email, account.username, account.name].filter(
    (v): v is string => v != null && v !== identifier,
  );
  for (const alias of secondaryIds) {
    addEntityAlias(graph, {
      entity_id: entity.id,
      alias,
      episode_id: episodeId,
    });
  }

  counts.entitiesCreated++;
  return entity.id;
}

// ---------------------------------------------------------------------------
// Change ingestion
// ---------------------------------------------------------------------------

type IngestCounts = Omit<IngestResult, "runId">;

function ingestChange(
  graph: EngramGraph,
  change: GerritChange,
  endpoint: string,
): IngestCounts {
  const counts: IngestCounts = {
    episodesCreated: 0,
    episodesSkipped: 0,
    entitiesCreated: 0,
    entitiesResolved: 0,
    edgesCreated: 0,
    edgesSuperseded: 0,
  };

  const sourceRef = `${endpoint}/c/${change.project}/+/${change._number}`;

  const existing = graph.db
    .query<{ id: string }, [string, string]>(
      "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
    )
    .get(EPISODE_SOURCE_TYPES.GERRIT_CHANGE, sourceRef);

  if (existing) {
    counts.episodesSkipped++;
    return counts;
  }

  const content = [
    `CL ${change._number}: ${change.subject}`,
    `URL: ${sourceRef}`,
    `Project: ${change.project}`,
    `Branch: ${change.branch}`,
    `Status: ${change.status}`,
    `Owner: ${accountIdentifier(change.owner)}`,
    `Created: ${change.created}`,
  ]
    .join("\n")
    .trim();

  const episode = addEpisode(graph, {
    source_type: EPISODE_SOURCE_TYPES.GERRIT_CHANGE,
    source_ref: sourceRef,
    content,
    actor: accountIdentifier(change.owner),
    timestamp: change.created,
    extractor_version: ENGINE_VERSION,
    metadata: {
      number: change._number,
      subject: change.subject,
      status: change.status,
      project: change.project,
      branch: change.branch,
    },
  });

  counts.episodesCreated++;

  const episodeId = episode.id;
  const evidence: EvidenceInput[] = [
    { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
  ];

  // Create change entity with shorthand aliases for cross-ref resolution
  let changeEntity = resolveEntity(graph, sourceRef, ENTITY_TYPES.PULL_REQUEST);
  if (!changeEntity) {
    changeEntity = addEntity(
      graph,
      {
        canonical_name: sourceRef,
        entity_type: ENTITY_TYPES.PULL_REQUEST,
        summary: change.subject,
      },
      evidence,
    );
    counts.entitiesCreated++;
    addEntityAlias(graph, {
      entity_id: changeEntity.id,
      alias: `CL/${change._number}`,
      episode_id: episodeId,
    });
    addEntityAlias(graph, {
      entity_id: changeEntity.id,
      alias: `${change.project}/${change._number}`,
      episode_id: episodeId,
    });
  } else {
    counts.entitiesResolved++;
  }

  const ownerId = getOrCreatePerson(graph, change.owner, episodeId, counts);

  // authored_by edge: change entity → owner
  const existingAuthoredEdge = graph.db
    .query<{ id: string }, [string, string, string, string]>(
      `SELECT id FROM edges
       WHERE source_id = ? AND target_id = ? AND relation_type = ?
         AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
    )
    .get(changeEntity.id, ownerId, RELATION_TYPES.AUTHORED_BY, "observed");

  if (!existingAuthoredEdge) {
    addEdge(
      graph,
      {
        source_id: changeEntity.id,
        target_id: ownerId,
        relation_type: RELATION_TYPES.AUTHORED_BY,
        edge_kind: "observed",
        fact: `CL/${change._number} authored by ${accountIdentifier(change.owner)}`,
        valid_from: change.created,
        confidence: 1.0,
      },
      evidence,
    );
    counts.edgesCreated++;
  }

  // reviewed_by edges: each reviewer → owner
  const reviewers = change.reviewers?.REVIEWER ?? [];
  for (const reviewer of reviewers) {
    if (accountIdentifier(reviewer) === accountIdentifier(change.owner))
      continue;

    const reviewerId = getOrCreatePerson(graph, reviewer, episodeId, counts);

    const existingEdge = graph.db
      .query<{ id: string }, [string, string, string, string]>(
        `SELECT id FROM edges
         WHERE source_id = ? AND target_id = ? AND relation_type = ?
           AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
      )
      .get(reviewerId, ownerId, RELATION_TYPES.REVIEWED_BY, "observed");

    if (!existingEdge) {
      addEdge(
        graph,
        {
          source_id: reviewerId,
          target_id: ownerId,
          relation_type: RELATION_TYPES.REVIEWED_BY,
          edge_kind: "observed",
          fact: `${accountIdentifier(reviewer)} reviewed CL/${change._number}`,
          valid_from: change.created,
          confidence: 1.0,
        },
        evidence,
      );
      counts.edgesCreated++;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// GerritAdapter
// ---------------------------------------------------------------------------

export class GerritAdapter implements EnrichmentAdapter {
  name = "gerrit";
  kind = "enrichment";
  /** @experimental */
  supportsAuth: string[] = ["token", "none"];
  /** @experimental */
  supportsCursor = true;

  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
    const project = opts.repo;
    if (!project) {
      throw new Error(
        "GerritAdapter: opts.repo is required (Gerrit project name)",
      );
    }

    const endpoint = (
      opts.endpoint ?? "https://gerrit-review.googlesource.com"
    ).replace(/\/$/, "");
    const token = opts.token;
    const sourceScope = `${endpoint}/${project}`;

    const runId = opts.dryRun ? "" : createIngestionRun(graph, sourceScope).id;

    const totals: IngestResult = {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      entitiesResolved: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
      runId,
    };

    try {
      let offset = opts.dryRun ? 0 : getLastOffset(graph, sourceScope);
      let hasMore = true;

      while (hasMore) {
        let q = `project:${project}`;
        if (opts.since) q += ` after:${opts.since}`;
        const query = encodeURIComponent(q);
        const path =
          `/changes/?q=${query}&start=${offset}` +
          `&limit=${PAGE_SIZE}&o=DETAILED_ACCOUNTS`;

        const batch = await apiGet<GerritChange[]>(
          this.fetchFn,
          endpoint,
          path,
          token,
        );

        if (!Array.isArray(batch) || batch.length === 0) break;

        hasMore = batch[batch.length - 1]?._more_changes === true;

        for (const change of batch) {
          if (opts.dryRun) {
            totals.episodesCreated++;
            continue;
          }

          const counts = ingestChange(graph, change, endpoint);
          totals.episodesCreated += counts.episodesCreated;
          totals.episodesSkipped += counts.episodesSkipped;
          totals.entitiesCreated += counts.entitiesCreated;
          totals.entitiesResolved += counts.entitiesResolved;
          totals.edgesCreated += counts.edgesCreated;
        }

        offset += batch.length;

        opts.onProgress?.({
          phase: "fetching changes",
          fetched: offset,
          created: totals.episodesCreated,
          skipped: totals.episodesSkipped,
        });
      }

      if (!opts.dryRun) {
        const cursor = offset > 0 ? String(offset) : null;
        completeIngestionRun(graph, runId, cursor, {
          episodes: totals.episodesCreated,
          entities: totals.entitiesCreated,
          edges: totals.edgesCreated,
        });
      }

      return { ...totals, runId };
    } catch (err: unknown) {
      if (!opts.dryRun && runId) {
        const msg = err instanceof Error ? err.message : String(err);
        failIngestionRun(graph, runId, msg);
      }
      throw err;
    }
  }
}
