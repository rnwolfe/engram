/**
 * sync/types.ts — types for the config-driven sync orchestrator.
 */

import type { AuthCredential } from "../ingest/adapter.js";

// ---------------------------------------------------------------------------
// Config schema
// ---------------------------------------------------------------------------

/**
 * Auth config within a sync source. Uses `tokenEnv` to reference an
 * environment variable name rather than storing a literal token.
 *
 * This is the config-file representation — converted to `AuthCredential`
 * at runtime by resolving the env var.
 */
export type SyncAuthConfig =
  | { kind: "none" }
  | { kind: "bearer"; tokenEnv: string }
  | { kind: "basic"; usernameEnv: string; secretEnv: string }
  | { kind: "service_account"; keyJsonEnv: string }
  | { kind: "oauth2"; tokenEnv: string; scopesEnv?: string };

/** A single source entry in `.engram.config.json`. */
export interface SyncSource {
  /** Unique name for this source (used with --only). */
  name: string;
  /** Adapter type: 'git', 'source', 'github', 'google_workspace', or a plugin type. */
  type: string;
  /**
   * Adapter-specific scope (e.g. 'owner/repo' for github, 'domain' for google_workspace).
   * Not required for 'git' and 'source' built-ins.
   */
  scope?: string;
  /**
   * Filesystem path — used as repo path for 'git', root dir for 'source'.
   * Not used for network adapters.
   */
  path?: string;
  /**
   * Filesystem root — alias for 'path' specifically for 'source' adapter.
   * If both are provided, 'root' takes precedence.
   */
  root?: string;
  /** Auth configuration. May be omitted for 'git' and 'source'. */
  auth?: SyncAuthConfig;
}

/** Root `.engram.config.json` schema. */
export interface SyncConfig {
  version: 1;
  sources: SyncSource[];
}

// ---------------------------------------------------------------------------
// Runtime result types
// ---------------------------------------------------------------------------

export type SourceStatus = "success" | "failed" | "skipped";

/** Per-source result from a sync run. */
export interface SourceResult {
  name: string;
  type: string;
  status: SourceStatus;
  /** Human-readable error message if status === 'failed'. */
  error?: string;
  /** Episodes created during this source run. */
  episodesCreated?: number;
  /** Entities created during this source run. */
  entitiesCreated?: number;
  /** Edges created during this source run. */
  edgesCreated?: number;
  /** Elapsed time in milliseconds. */
  elapsedMs: number;
}

/** Result of a full sync run. */
export interface SyncResult {
  sources: SourceResult[];
  /** Cross-ref resolver result (null if skipped). */
  crossRefs: {
    edgesCreated: number;
    unresolved: number;
    elapsedMs: number;
  } | null;
  /** Overall status: success if all sources succeeded, failed otherwise. */
  status: "success" | "failed";
  /** Total elapsed time in milliseconds. */
  elapsedMs: number;
}

// ---------------------------------------------------------------------------
// Runtime options
// ---------------------------------------------------------------------------

export interface RunSyncOpts {
  /** Run only these named sources (declaration order preserved). */
  only?: string[];
  /** Continue running remaining sources after a failure (default: fail-fast). */
  continueOnError?: boolean;
  /** Skip the cross-ref resolver step. */
  noCrossRefs?: boolean;
  /** Dry run: validate config + print plan, no execution. */
  dryRun?: boolean;
  /** Optional progress callback called before each source starts. */
  onSourceStart?: (name: string, type: string) => void;
  /** Optional progress callback called after each source completes. */
  onSourceEnd?: (result: SourceResult) => void;
}

// ---------------------------------------------------------------------------
// Auth resolution helper (config → runtime credential)
// ---------------------------------------------------------------------------

/**
 * Resolve a SyncAuthConfig to a runtime AuthCredential by reading env vars.
 * Returns null if a required env var is missing (caller reports the error).
 */
export function resolveSyncAuth(
  authConfig: SyncAuthConfig,
): { credential: AuthCredential } | { missing: string } {
  switch (authConfig.kind) {
    case "none":
      return { credential: { kind: "none" } };

    case "bearer": {
      const token = process.env[authConfig.tokenEnv];
      if (!token) return { missing: authConfig.tokenEnv };
      return { credential: { kind: "bearer", token } };
    }

    case "basic": {
      const username = process.env[authConfig.usernameEnv];
      const secret = process.env[authConfig.secretEnv];
      if (!username) return { missing: authConfig.usernameEnv };
      if (!secret) return { missing: authConfig.secretEnv };
      return { credential: { kind: "basic", username, secret } };
    }

    case "service_account": {
      const keyJson = process.env[authConfig.keyJsonEnv];
      if (!keyJson) return { missing: authConfig.keyJsonEnv };
      return { credential: { kind: "service_account", keyJson } };
    }

    case "oauth2": {
      const token = process.env[authConfig.tokenEnv];
      if (!token) return { missing: authConfig.tokenEnv };
      const rawScopes = authConfig.scopesEnv
        ? process.env[authConfig.scopesEnv]
        : undefined;
      const scopes = rawScopes ? rawScopes.split(",").map((s) => s.trim()) : [];
      return { credential: { kind: "oauth2", token, scopes } };
    }
  }
}
