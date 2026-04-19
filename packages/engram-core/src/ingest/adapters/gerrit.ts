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
 * This adapter strips the prefix before parsing (handled in gerrit-helpers.ts).
 *
 * Internal helpers live in gerrit-helpers.ts.
 */

import type { EngramGraph } from "../../format/index.js";
import { INGESTION_SOURCE_TYPES } from "../../vocab/index.js";
import type {
  AuthCredential,
  EnrichmentAdapter,
  EnrichOpts,
  ScopeSchema,
} from "../adapter.js";
import { applyCompatShim, assertAuthKind } from "../adapter.js";
import { readNumericCursor } from "../cursor.js";
import type { IngestResult } from "../git.js";
import {
  apiGet,
  completeIngestionRun,
  createIngestionRun,
  type FetchFn,
  failIngestionRun,
  GerritAuthError,
  ingestChange,
  PAGE_SIZE,
} from "./gerrit-helpers.js";

export { GerritAuthError } from "./gerrit-helpers.js";

// ---------------------------------------------------------------------------
// Scope schema
// ---------------------------------------------------------------------------

/**
 * ScopeSchema for the Gerrit adapter.
 * Scope must be a non-empty project name (no leading slash).
 */
export const gerritScopeSchema: ScopeSchema = {
  description: "Gerrit project name (e.g. 'my-project' or 'org/sub-project')",
  validate(scope: string): void {
    if (!scope || scope.startsWith("/") || scope.endsWith("/")) {
      throw new Error(
        `GerritAdapter: scope must be a non-empty project name without leading/trailing slashes, got: ${JSON.stringify(scope)}`,
      );
    }
  },
};

// ---------------------------------------------------------------------------
// GerritAdapter
// ---------------------------------------------------------------------------

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.GERRIT;

export class GerritAdapter implements EnrichmentAdapter {
  name = "gerrit";
  kind = "enrichment";

  /** Typed auth kinds supported by this adapter. */
  supportedAuth: AuthCredential["kind"][] = ["basic", "bearer", "none"];

  /** Scope schema — Gerrit project name. */
  scopeSchema: ScopeSchema = gerritScopeSchema;

  /**
   * @deprecated Use `supportedAuth` instead.
   * @experimental
   */
  supportsAuth: string[] = ["token", "none"];

  /** @experimental */
  supportsCursor = true;

  private fetchFn: FetchFn;

  constructor(fetchFn?: FetchFn) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
    // Apply v1→v2 compat shim (token→auth, repo→scope) with one-shot warning.
    opts = applyCompatShim(opts);

    // Validate auth kind against supportedAuth.
    assertAuthKind(this, opts);

    const project = opts.scope ?? opts.repo;
    if (!project) {
      throw new Error(
        "GerritAdapter: opts.scope is required (Gerrit project name)",
      );
    }
    gerritScopeSchema.validate(project);

    const endpoint = (
      opts.endpoint ?? "https://gerrit-review.googlesource.com"
    ).replace(/\/$/, "");

    // Resolve token from v2 auth credential or deprecated v1 token field.
    // Gerrit uses HTTP Basic auth: "user:password" encoded.
    let token: string | undefined;
    const auth = opts.auth;
    if (auth) {
      if (auth.kind === "basic") {
        token = `${auth.username}:${auth.secret}`;
      } else if (auth.kind === "bearer") {
        token = auth.token;
      }
      // 'none' → token remains undefined
    } else if (opts.token) {
      token = opts.token;
    }

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
      let offset = opts.dryRun
        ? 0
        : readNumericCursor(graph, SOURCE_TYPE, sourceScope);
      let hasMore = true;

      while (hasMore) {
        let q = `project:${project}`;
        if (opts.since) q += ` after:${opts.since}`;
        const query = encodeURIComponent(q);
        const path =
          `/changes/?q=${query}&start=${offset}` +
          `&limit=${PAGE_SIZE}&o=DETAILED_ACCOUNTS`;

        const batch = await apiGet<
          Array<{ _more_changes?: boolean; [k: string]: unknown }>
        >(this.fetchFn, endpoint, path, token);

        if (!Array.isArray(batch) || batch.length === 0) break;

        hasMore = batch[batch.length - 1]?._more_changes === true;

        for (const change of batch) {
          if (opts.dryRun) {
            totals.episodesCreated++;
            continue;
          }

          // biome-ignore lint/suspicious/noExplicitAny: GerritChange cast
          const counts = ingestChange(graph, change as any, endpoint);
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

// Suppress unused import warning — GerritAuthError is re-exported above and
// used internally by apiGet in gerrit-helpers.ts.
void GerritAuthError;
