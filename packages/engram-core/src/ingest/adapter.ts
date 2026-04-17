/**
 * adapter.ts — Stable contract for pluggable enrichment adapters.
 *
 * ## Contract axes
 *
 * **Auth**: Adapters declare which auth schemes they support via `supportsAuth`.
 * Credentials (tokens, OAuth) are always passed through `EnrichOpts` at call time
 * and MUST never be written into the graph.
 *
 * **Pagination / cursor semantics**: Adapters that support resume from a prior
 * run declare `supportsCursor: true`. The cursor value is an opaque string stored
 * in `ingestion_runs.cursor` by the adapter itself. On the next call the adapter
 * reads its own cursor and resumes from there.
 *
 * **Rate-limiting**: Adapters are responsible for respecting remote rate limits.
 * When a limit is hit, throw `EnrichmentAdapterError` with `code: 'rate_limited'`
 * so callers can back off and retry.
 *
 * **Dry-run**: When `opts.dryRun` is true the adapter MUST skip all writes and
 * return a result describing what *would* have been created. This is experimental
 * and adapters that do not implement it may ignore the flag (they SHOULD document
 * this limitation).
 *
 * **Progress**: `opts.onProgress` is an optional hook called periodically during
 * long-running enrichment. Adapters SHOULD call it after each logical batch.
 *
 * **Error taxonomy**: All adapter-level failures SHOULD be surfaced as
 * `EnrichmentAdapterError` with an appropriate `code` so callers can handle them
 * uniformly (e.g. surface `auth_failure` as a targeted help message).
 */

import type { EngramGraph } from "../format/index.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// Progress reporting
// ---------------------------------------------------------------------------

/**
 * Snapshot of adapter progress emitted via `EnrichOpts.onProgress`.
 * @experimental — shape may change before stabilization.
 */
export interface EnrichProgress {
  /** Human-readable phase label (e.g. 'fetching PRs', 'ingesting issues'). */
  phase: string;
  /** Total items fetched from the remote source so far. */
  fetched: number;
  /** Items that resulted in a new graph write. */
  created: number;
  /** Items skipped due to deduplication or cursor filtering. */
  skipped: number;
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface EnrichOpts {
  /**
   * Auth token for the remote API. NEVER stored in the graph.
   * Optional — omit for public repositories (unauthenticated, 60 req/hr).
   * Required for private repositories.
   * @stable
   */
  token?: string;

  /**
   * ISO8601 date — only fetch items updated after this date.
   * @stable
   */
  since?: string;

  /**
   * API endpoint base URL (default: adapter-specific, e.g. 'https://api.github.com').
   * @stable
   */
  endpoint?: string;

  /**
   * Repository or project identifier (format is adapter-specific, e.g. 'owner/repo' for GitHub).
   * @stable
   */
  repo?: string;

  /**
   * When true, the adapter MUST skip all writes and return a result describing
   * what would have been created. Adapters that do not implement dry-run MAY
   * ignore this flag but SHOULD document that limitation.
   * @experimental
   */
  dryRun?: boolean;

  /**
   * Optional progress hook called periodically during long-running enrichment.
   * Adapters SHOULD call this after each logical batch.
   * @experimental
   */
  onProgress?: (p: EnrichProgress) => void;
}

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface EnrichmentAdapter {
  /**
   * Unique adapter name (e.g. 'github', 'gerrit').
   * @stable
   */
  name: string;

  /**
   * Adapter category (e.g. 'enrichment').
   * @stable
   */
  kind: string;

  /**
   * List of auth schemes the adapter supports.
   * Values: 'token' | 'oauth' | 'none'.
   * @experimental
   */
  supportsAuth?: string[];

  /**
   * Whether the adapter supports resume from a stored cursor.
   * When true, the adapter reads its own cursor from `ingestion_runs` and
   * resumes incrementally on subsequent calls.
   * @experimental
   */
  supportsCursor?: boolean;

  /**
   * Enrich the graph with data from the remote source.
   * Must be idempotent — safe to call multiple times.
   * @stable
   */
  enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult>;
}

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

/**
 * Base error class for all adapter-level failures.
 *
 * Callers should catch `EnrichmentAdapterError` and switch on `code` to
 * provide targeted messages (e.g. show token help for `auth_failure`,
 * schedule a retry for `rate_limited`).
 */
export class EnrichmentAdapterError extends Error {
  readonly code:
    | "auth_failure"
    | "rate_limited"
    | "server_error"
    | "data_error";

  constructor(
    code: "auth_failure" | "rate_limited" | "server_error" | "data_error",
    message: string,
  ) {
    super(message);
    this.name = "EnrichmentAdapterError";
    this.code = code;
  }
}
