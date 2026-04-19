/**
 * github.ts — GitHub enrichment adapter.
 *
 * Fetches PRs and issues from the GitHub REST API and ingests them into an
 * EngramGraph. Uses ingestion_runs cursors for idempotency.
 *
 * Token is accepted via opts.token and NEVER written to the graph.
 *
 * Internal helpers (HTTP, entity, ingestion_runs) live in github-helpers.ts.
 */

import type { EngramGraph } from "../../format/index.js";
import { INGESTION_SOURCE_TYPES } from "../../vocab/index.js";
import type {
  AuthCredential,
  EnrichmentAdapter,
  EnrichOpts,
  ScopeSchema,
} from "../adapter.js";
import {
  applyCompatShim,
  assertAuthKind,
  EnrichmentAdapterError,
} from "../adapter.js";
import { BUILT_IN_PATTERNS, resolveReferences } from "../cross-ref/index.js";
import { readNumericCursor } from "../cursor.js";
import type { IngestResult } from "../git.js";
import {
  completeIngestionRun,
  createIngestionRun,
  type FetchFn,
  failIngestionRun,
  fetchAllPages,
  ingestIssue,
  ingestPR,
} from "./github-helpers.js";

export { GitHubHttpAuthError as GitHubAuthError } from "./github-helpers.js";

// ---------------------------------------------------------------------------
// Scope schema
// ---------------------------------------------------------------------------

const REPO_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * ScopeSchema for the GitHub adapter.
 * Scope must be in 'owner/repo' format.
 */
export const githubScopeSchema: ScopeSchema = {
  description: "GitHub repository in owner/repo format",
  validate(scope: string): void {
    if (!REPO_RE.test(scope)) {
      throw new Error(
        `GitHubAdapter: scope must be in 'owner/repo' format, got: ${JSON.stringify(scope)}`,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// GitHubAdapter
// ---------------------------------------------------------------------------

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.GITHUB;

export class GitHubAdapter implements EnrichmentAdapter {
  name = "github";
  kind = "enrichment";

  /** Typed auth kinds supported by this adapter. */
  supportedAuth: AuthCredential["kind"][] = ["bearer", "none"];

  /** Scope schema — GitHub repository in 'owner/repo' format. */
  scopeSchema: ScopeSchema = githubScopeSchema;

  /**
   * @deprecated Use `supportedAuth` instead.
   * @experimental
   */
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
    // Apply v1→v2 compat shim (token→auth, repo→scope) with one-shot warning.
    opts = applyCompatShim(opts);

    // Validate auth kind against supportedAuth.
    assertAuthKind(this, opts);

    const repo = opts.scope ?? opts.repo;
    if (!repo) {
      throw new EnrichmentAdapterError(
        "data_error",
        "GitHubAdapter: opts.scope is required (owner/repo)",
      );
    }
    githubScopeSchema.validate(repo);

    const endpoint = opts.endpoint ?? "https://api.github.com";

    // Resolve token from v2 auth credential or deprecated v1 token field
    let token: string | undefined;
    const auth = opts.auth;
    if (auth) {
      if (auth.kind === "bearer") {
        token = auth.token;
      } else if (auth.kind === "oauth2") {
        token = auth.token;
      }
      // 'none' → token remains undefined
    } else if (opts.token) {
      token = opts.token;
    }

    const run = createIngestionRun(graph, repo);
    const runId = run.id;

    const counts = {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      entitiesResolved: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
      episodeIds: [] as string[],
    };

    try {
      const lastNumber = readNumericCursor(graph, SOURCE_TYPE, repo);
      let latestNumber = lastNumber;

      // --- Fetch and ingest PRs ---
      const prs = await fetchAllPages(
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

        ingestPR(graph, pr, repo, counts);

        if (pr.number > latestNumber) {
          latestNumber = pr.number;
        }
      }

      // --- Fetch and ingest Issues (skip those that are PRs) ---
      const issues = await fetchAllPages(
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

        ingestIssue(graph, issue, repo, counts);

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

      resolveReferences(graph, counts.episodeIds, BUILT_IN_PATTERNS);

      return { ...counts, runId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      failIngestionRun(graph, runId, msg);
      throw err;
    }
  }
}
