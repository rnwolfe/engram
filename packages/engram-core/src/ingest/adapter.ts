/**
 * adapter.ts — Stable contract for pluggable enrichment adapters.
 *
 * ## Contract axes
 *
 * **Auth**: Adapters declare which auth schemes they support via `supportedAuth`.
 * Credentials are always passed through `EnrichOpts.auth` at call time and MUST
 * never be written into the graph.
 *
 * **Scope**: Adapters declare a `scopeSchema` with a description and validator.
 * The CLI calls `scopeSchema.validate()` before opening the graph.
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
// Auth credential union (v2)
// ---------------------------------------------------------------------------

/**
 * Typed credential passed to `enrich()` via `opts.auth`.
 * Adapters declare which kinds they accept via `supportedAuth`.
 * NEVER store these in the graph.
 * @stable
 */
export type AuthCredential =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; secret: string }
  | { kind: "service_account"; keyJson: string }
  | {
      kind: "oauth2";
      token: string;
      scopes: string[];
      /**
       * Optional refresh callback. When the adapter receives a 401/403 and
       * `refresh` is present, it MUST call `refresh()` once, swap the returned
       * token in, and retry. If the retry fails too, throw `auth_failure`.
       * Adapters without a refresh callback surface `auth_failure` immediately.
       */
      refresh?: () => Promise<string>;
    };

// ---------------------------------------------------------------------------
// Scope schema
// ---------------------------------------------------------------------------

/**
 * Per-adapter scope validator. The CLI calls `validate()` before `enrich()`.
 * @stable
 */
export interface ScopeSchema {
  /**
   * Human-readable description of the expected scope format.
   * Shown to users on validation failure.
   */
  description: string;

  /**
   * Validate the scope string. Returns `null` on success, or an error message
   * string on failure (no stack traces — plain English only).
   */
  validate(scope: string): string | null;
}

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
   * Typed auth credential constructed by the CLI from flags/env.
   * Replaces the legacy `token` field. NEVER stored in the graph.
   * @stable
   */
  auth?: AuthCredential;

  /**
   * Auth token for the remote API. NEVER stored in the graph.
   * @deprecated Use `auth: { kind: 'bearer', token }` instead.
   * Accepted for one minor version for backwards-compat; normalised to `auth`
   * by adapters when `auth` is absent.
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
   * Adapter-specific scope identifier (e.g. 'owner/repo' for GitHub,
   * project name for Gerrit). Replaces the legacy `repo` field.
   * Validated against `adapter.scopeSchema` before `enrich()` is called.
   * @stable
   */
  scope?: string;

  /**
   * Repository or project identifier.
   * @deprecated Use `scope` instead.
   * Normalised to `scope` by adapters when `scope` is absent.
   */
  repo?: string;

  /**
   * Opaque resume cursor from the previous run. Adapters read their own
   * cursor from `ingestion_runs` — this field is reserved for future use
   * where the caller wants to force a specific resume point.
   * @experimental
   */
  cursor?: string;

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
   * Auth kinds this adapter accepts.
   * Values: 'none' | 'bearer' | 'basic' | 'service_account' | 'oauth2'.
   * @stable
   */
  supportedAuth: AuthCredential["kind"][];

  /**
   * Scope format description and validator.
   * The CLI calls `scopeSchema.validate(scope)` before `enrich()`.
   * @stable
   */
  scopeSchema: ScopeSchema;

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
   *
   * **Alias convention (required)**: Every entity created MUST register
   * source-specific shorthand aliases via `addEntityAlias` so that
   * `resolveEntity` can match bare references (e.g. `#123`, `CL/456`, `b/789`).
   * See `docs/internal/specs/adapter-aliases.md` for the full convention.
   *
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
