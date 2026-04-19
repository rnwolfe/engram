/**
 * adapter.ts — Stable contract for pluggable enrichment adapters (v2).
 *
 * ## Contract axes
 *
 * **Auth**: Adapters declare which auth kinds they support via `supportedAuth`
 * (typed `AuthCredential['kind'][]`). Credentials are always passed through
 * `EnrichOpts.auth` at call time and MUST never be written into the graph.
 *
 * **Scope**: Adapters declare a `scopeSchema` that describes the expected
 * `opts.scope` string and validates it. Scope replaces the old `opts.repo`.
 *
 * **Pagination / cursor semantics**: Adapters that support resume from a prior
 * run declare `supportsCursor: true`. The cursor value is an opaque string stored
 * in `ingestion_runs.cursor`. Use the helpers in `cursor.ts` to read/write.
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
 *
 * ## v1 → v2 migration
 *
 * v1 callers using `opts.token` and `opts.repo` continue to work via an automatic
 * compat shim (see `applyCompatShim`). A one-shot deprecation warning is emitted
 * to stderr the first time a v1-style call is detected. Migrate to `opts.auth` and
 * `opts.scope` at your earliest convenience.
 */

import type { EngramGraph } from "../format/index.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// AuthCredential union
// ---------------------------------------------------------------------------

/**
 * Credentials passed to an adapter at call time. NEVER stored in the graph.
 *
 * Variants:
 * - `none`            — no auth required (e.g. public APIs, local sources)
 * - `bearer`          — HTTP Bearer / personal access token
 * - `basic`           — HTTP Basic auth (username + password/secret)
 * - `service_account` — JSON key file for service accounts (e.g. Google APIs)
 * - `oauth2`          — OAuth2 access token, optionally refreshable
 *
 * JSON round-trip note: the `oauth2.refresh` callback is a function and will be
 * lost during JSON serialization. All other variants are fully serializable.
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
       *
       * In-process only — subprocess plugins handle refresh internally.
       */
      refresh?: () => Promise<string>;
    };

// ---------------------------------------------------------------------------
// Scope schema
// ---------------------------------------------------------------------------

/**
 * Declares the expected format and semantics of `EnrichOpts.scope` for a
 * given adapter. Plain object for JSON-expressibility — no closures except
 * the `validate` method which throws on invalid input.
 * @stable
 */
export interface ScopeSchema {
  /** Human-readable description of the expected scope format. */
  description: string;
  /**
   * Validates the scope string. Throws a plain `Error` with a descriptive
   * message if the value is invalid. Returns `void` on success.
   */
  validate(scope: string): void;
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
   * Auth kinds the adapter supports, typed against `AuthCredential['kind']`.
   * Replaces the old `supportsAuth?: string[]`.
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
// Compat shim
// ---------------------------------------------------------------------------

/** Emits the v1→v2 deprecation warning exactly once per process. */
let _deprecationWarned = false;

/**
 * Maps v1 `opts.token` / `opts.repo` to their v2 equivalents (`auth`, `scope`).
 * Emits a one-shot stderr warning the first time v1 fields are detected.
 *
 * Call this at the start of `enrich()` before reading `opts.auth` or `opts.scope`.
 */
/** Internal marker — truthy when `auth` was synthesised by the compat shim. */
const _SHIM_AUTH = Symbol("shimAuth");

export function applyCompatShim(opts: EnrichOpts): EnrichOpts {
  const hasV1 = opts.token !== undefined || opts.repo !== undefined;
  if (!hasV1) return opts;

  if (!_deprecationWarned) {
    process.stderr.write(
      "engram deprecation: EnrichOpts.token and EnrichOpts.repo are deprecated. " +
        "Use opts.auth = { kind: 'bearer', token } and opts.scope instead.\n",
    );
    _deprecationWarned = true;
  }

  const patched: EnrichOpts & { [_SHIM_AUTH]?: true } = { ...opts };
  if (opts.token !== undefined && patched.auth === undefined) {
    patched.auth = { kind: "bearer", token: opts.token };
    // Mark that this auth was synthesised by the shim so assertAuthKind skips it.
    patched[_SHIM_AUTH] = true;
  }
  if (opts.repo !== undefined && patched.scope === undefined) {
    patched.scope = opts.repo;
  }
  return patched;
}

/** Returns true when opts.auth was synthesised by the compat shim (not explicitly provided). */
export function isShimmedAuth(opts: EnrichOpts): boolean {
  return (opts as Record<symbol, unknown>)[_SHIM_AUTH] === true;
}

// ---------------------------------------------------------------------------
// Auth kind validation helper
// ---------------------------------------------------------------------------

/**
 * Validates that the provided `opts.auth.kind` is in `adapter.supportedAuth`.
 * Throws `EnrichmentAdapterError` with `code: 'auth_failure'` if not.
 *
 * Call this at the start of `enrich()` after applying the compat shim.
 */
export function assertAuthKind(
  adapter: Pick<EnrichmentAdapter, "name" | "supportedAuth">,
  opts: EnrichOpts,
): void {
  // Skip the check when auth was synthesised by the compat shim — the shim maps
  // the old `token` field to bearer regardless of what the adapter supports.
  // Only explicitly-provided v2 `auth` fields are validated.
  if (isShimmedAuth(opts)) return;

  const authKind = opts.auth?.kind ?? "none";
  if (!adapter.supportedAuth.includes(authKind)) {
    throw new EnrichmentAdapterError(
      "auth_failure",
      `${adapter.name}: auth kind '${authKind}' is not supported. Supported kinds: ${adapter.supportedAuth.join(", ")}.`,
    );
  }
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
