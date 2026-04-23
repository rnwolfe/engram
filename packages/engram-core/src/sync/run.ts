/**
 * sync/run.ts — config-driven multi-source ingestion orchestrator.
 *
 * Runs all configured sources in declaration order, then runs the cross-ref
 * resolver. Replaces hand-crafted shell sequences of individual ingest commands.
 */

import * as path from "node:path";
import type { EngramGraph } from "../format/index.js";
import type { AuthCredential, EnrichmentAdapter } from "../ingest/adapter.js";
import { resolveReferences } from "../ingest/cross-ref/index.js";
import { ingestGitRepo } from "../ingest/git.js";
import { ingestSource } from "../ingest/source/index.js";
import {
  bundledPluginsRoot,
  discoverPlugins,
  loadExecutablePlugin,
  loadJsModulePlugin,
} from "../plugins/index.js";
import { SyncConfigValidationError, SyncSourceError } from "./errors.js";
import type {
  RunSyncOpts,
  SourceResult,
  SyncAuthConfig,
  SyncConfig,
  SyncResult,
  SyncSource,
} from "./types.js";
import { resolveSyncAuth } from "./types.js";

// ---------------------------------------------------------------------------
// Built-in adapter types
// ---------------------------------------------------------------------------

const BUILT_IN_TYPES = ["git", "source", "github", "google_workspace"] as const;

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

const ALLOWED_AUTH_KINDS = [
  "none",
  "bearer",
  "basic",
  "service_account",
  "oauth2",
] as const;

const ALLOWED_SOURCE_FIELDS = new Set([
  "name",
  "type",
  "scope",
  "path",
  "root",
  "auth",
]);

const ALLOWED_AUTH_FIELDS: Record<string, Set<string>> = {
  none: new Set(["kind"]),
  bearer: new Set(["kind", "tokenEnv"]),
  basic: new Set(["kind", "usernameEnv", "secretEnv"]),
  service_account: new Set(["kind", "keyJsonEnv"]),
  oauth2: new Set(["kind", "tokenEnv", "scopesEnv"]),
};

/**
 * Validate a raw JSON object against the SyncConfig schema.
 * Collects ALL errors before throwing, so the user can fix everything at once.
 *
 * Rules (fail-closed):
 * - `version: 1` required
 * - Every source: `name` (unique), `type` — no unknown fields
 * - Auth uses `SyncAuthConfig` union — no unknown fields per kind
 */
export function validateSyncConfig(raw: unknown): SyncConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SyncConfigValidationError([
      { field: "(root)", reason: "must be a JSON object" },
    ]);
  }

  const obj = raw as Record<string, unknown>;
  const failures: Array<{ field: string; reason: string }> = [];

  // Check for unknown top-level fields
  const ALLOWED_TOP_FIELDS = new Set(["version", "sources"]);
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_FIELDS.has(key)) {
      failures.push({
        field: key,
        reason: `unknown top-level field (allowed: ${Array.from(ALLOWED_TOP_FIELDS).join(", ")})`,
      });
    }
  }

  // Validate version
  if (!("version" in obj)) {
    failures.push({ field: "version", reason: "required field missing" });
  } else if (obj.version !== 1) {
    failures.push({
      field: "version",
      reason: `must be 1 (got ${JSON.stringify(obj.version)}). If you have a newer config format, upgrade engram to the matching version.`,
    });
  }

  // Validate sources
  if (!("sources" in obj)) {
    failures.push({ field: "sources", reason: "required field missing" });
  } else if (!Array.isArray(obj.sources)) {
    failures.push({ field: "sources", reason: "must be an array" });
  } else {
    const seenNames = new Set<string>();

    for (let i = 0; i < obj.sources.length; i++) {
      const src = obj.sources[i];
      const prefix = `sources[${i}]`;

      if (typeof src !== "object" || src === null || Array.isArray(src)) {
        failures.push({ field: prefix, reason: "must be an object" });
        continue;
      }

      const srcObj = src as Record<string, unknown>;

      // Check for unknown source fields
      for (const key of Object.keys(srcObj)) {
        if (!ALLOWED_SOURCE_FIELDS.has(key)) {
          failures.push({
            field: `${prefix}.${key}`,
            reason: `unknown field (allowed: ${Array.from(ALLOWED_SOURCE_FIELDS).join(", ")})`,
          });
        }
      }

      // name
      if (!("name" in srcObj)) {
        failures.push({ field: `${prefix}.name`, reason: "required" });
      } else if (typeof srcObj.name !== "string" || !srcObj.name) {
        failures.push({
          field: `${prefix}.name`,
          reason: "must be a non-empty string",
        });
      } else if (seenNames.has(srcObj.name)) {
        failures.push({
          field: `${prefix}.name`,
          reason: `duplicate source name '${srcObj.name}' — names must be unique`,
        });
      } else {
        seenNames.add(srcObj.name as string);
      }

      // type
      if (!("type" in srcObj)) {
        failures.push({ field: `${prefix}.type`, reason: "required" });
      } else if (typeof srcObj.type !== "string" || !srcObj.type) {
        failures.push({
          field: `${prefix}.type`,
          reason: "must be a non-empty string",
        });
      }

      // scope (optional string)
      if ("scope" in srcObj && typeof srcObj.scope !== "string") {
        failures.push({ field: `${prefix}.scope`, reason: "must be a string" });
      }

      // path (optional string)
      if ("path" in srcObj && typeof srcObj.path !== "string") {
        failures.push({ field: `${prefix}.path`, reason: "must be a string" });
      }

      // root (optional string)
      if ("root" in srcObj && typeof srcObj.root !== "string") {
        failures.push({ field: `${prefix}.root`, reason: "must be a string" });
      }

      // auth (optional)
      if ("auth" in srcObj) {
        const authFailures = validateAuthConfig(srcObj.auth, `${prefix}.auth`);
        failures.push(...authFailures);
      }
    }
  }

  if (failures.length > 0) {
    throw new SyncConfigValidationError(failures);
  }

  return obj as unknown as SyncConfig;
}

function validateAuthConfig(
  auth: unknown,
  fieldPrefix: string,
): Array<{ field: string; reason: string }> {
  const failures: Array<{ field: string; reason: string }> = [];

  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
    failures.push({ field: fieldPrefix, reason: "must be an object" });
    return failures;
  }

  const authObj = auth as Record<string, unknown>;

  if (!("kind" in authObj)) {
    failures.push({ field: `${fieldPrefix}.kind`, reason: "required" });
    return failures;
  }

  const kind = authObj.kind;
  if (
    !ALLOWED_AUTH_KINDS.includes(kind as (typeof ALLOWED_AUTH_KINDS)[number])
  ) {
    failures.push({
      field: `${fieldPrefix}.kind`,
      reason: `must be one of [${ALLOWED_AUTH_KINDS.join(", ")}], got ${JSON.stringify(kind)}`,
    });
    return failures;
  }

  const kindStr = kind as string;
  const allowedFields = ALLOWED_AUTH_FIELDS[kindStr];
  if (allowedFields) {
    for (const key of Object.keys(authObj)) {
      if (!allowedFields.has(key)) {
        failures.push({
          field: `${fieldPrefix}.${key}`,
          reason: `unknown field for auth kind '${kindStr}' (allowed: ${Array.from(allowedFields).join(", ")})`,
        });
      }
    }
  }

  // Kind-specific required fields
  switch (kindStr) {
    case "bearer":
      if (typeof authObj.tokenEnv !== "string" || !authObj.tokenEnv) {
        failures.push({
          field: `${fieldPrefix}.tokenEnv`,
          reason:
            "required for bearer auth — name of the env var holding the token",
        });
      }
      break;
    case "basic":
      if (typeof authObj.usernameEnv !== "string" || !authObj.usernameEnv) {
        failures.push({
          field: `${fieldPrefix}.usernameEnv`,
          reason: "required for basic auth",
        });
      }
      if (typeof authObj.secretEnv !== "string" || !authObj.secretEnv) {
        failures.push({
          field: `${fieldPrefix}.secretEnv`,
          reason: "required for basic auth",
        });
      }
      break;
    case "service_account":
      if (typeof authObj.keyJsonEnv !== "string" || !authObj.keyJsonEnv) {
        failures.push({
          field: `${fieldPrefix}.keyJsonEnv`,
          reason: "required for service_account auth",
        });
      }
      break;
    case "oauth2":
      if (typeof authObj.tokenEnv !== "string" || !authObj.tokenEnv) {
        failures.push({
          field: `${fieldPrefix}.tokenEnv`,
          reason: "required for oauth2 auth",
        });
      }
      break;
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Auth env var pre-flight check
// ---------------------------------------------------------------------------

/**
 * Check that all env vars referenced in auth configs are present.
 * Returns a list of {sourceName, envVar} pairs that are missing.
 */
function checkAuthEnvVars(
  sources: SyncSource[],
): Array<{ sourceName: string; envVar: string }> {
  const missing: Array<{ sourceName: string; envVar: string }> = [];

  for (const src of sources) {
    if (!src.auth) continue;
    const result = resolveSyncAuth(src.auth);
    if ("missing" in result) {
      missing.push({ sourceName: src.name, envVar: result.missing });
    }
  }

  return missing;
}

// ---------------------------------------------------------------------------
// Adapter resolution
// ---------------------------------------------------------------------------

async function resolveAdapter(
  src: SyncSource,
  cwd: string,
): Promise<EnrichmentAdapter> {
  // Only network adapters (non-git, non-source) need a loader
  const type = src.type;

  if (type === "github") {
    const { GitHubAdapter } = await import("../ingest/adapters/github.js");
    return new GitHubAdapter();
  }

  if (type === "google_workspace") {
    // Dynamic import so monorepo works without hard dependency
    try {
      const mod = await import("@engram/plugin-google-workspace" as string);
      return new mod.GoogleWorkspaceAdapter();
    } catch {
      throw new Error(
        `'google_workspace' adapter requires the '@engram/plugin-google-workspace' plugin. ` +
          `Install it with: engram plugin install google-workspace`,
      );
    }
  }

  // Plugin type — resolve via discoverPlugins
  const bundledRoot = bundledPluginsRoot() ?? undefined;
  const plugins = discoverPlugins(cwd, bundledRoot);
  const found = plugins.find((p) => p.name === type);
  if (!found) {
    const available = [...BUILT_IN_TYPES, ...plugins.map((p) => p.name)].join(
      ", ",
    );
    throw new Error(
      `Unknown source type '${type}'. Available types: ${available}`,
    );
  }

  // Load the plugin
  const { loadManifest } = await import("../plugins/manifest.js");
  const manifest = loadManifest(found.dir);
  if (manifest.transport === "js-module") {
    const plugin = await loadJsModulePlugin(found.dir, manifest);
    if (!plugin.adapter) {
      throw new Error(`Plugin '${type}' does not export an enrichment adapter`);
    }
    return plugin.adapter;
  }
  if (manifest.transport === "executable") {
    return loadExecutablePlugin(
      found.dir,
      manifest,
    ) as unknown as EnrichmentAdapter;
  }

  throw new Error(
    `Plugin '${type}' has unsupported transport '${manifest.transport}'`,
  );
}

// ---------------------------------------------------------------------------
// Single-source runner
// ---------------------------------------------------------------------------

async function runSource(
  graph: EngramGraph,
  src: SyncSource,
  cwd: string,
  dryRun: boolean,
): Promise<SourceResult> {
  const startMs = Date.now();
  const type = src.type;

  try {
    if (type === "git") {
      const repoPath = path.resolve(cwd, src.path ?? src.root ?? ".");
      const result = await ingestGitRepo(graph, repoPath, {
        dryRun,
      } as Parameters<typeof ingestGitRepo>[2]);
      return {
        name: src.name,
        type,
        status: "success",
        episodesCreated: result.episodesCreated,
        entitiesCreated: result.entitiesCreated,
        edgesCreated: result.edgesCreated,
        elapsedMs: Date.now() - startMs,
      };
    }

    if (type === "source") {
      const root = path.resolve(cwd, src.root ?? src.path ?? ".");
      const result = await ingestSource(graph, { root, dryRun });
      return {
        name: src.name,
        type,
        status: "success",
        episodesCreated: result.episodesCreated,
        entitiesCreated: result.entitiesCreated,
        edgesCreated: result.edgesCreated,
        elapsedMs: Date.now() - startMs,
      };
    }

    // Network adapter (github, google_workspace, or plugin)
    const adapter = await resolveAdapter(src, cwd);

    // Resolve auth credential
    let auth: AuthCredential = { kind: "none" };
    if (src.auth) {
      const resolved = resolveSyncAuth(src.auth as SyncAuthConfig);
      if ("missing" in resolved) {
        throw new Error(
          `Missing required env var '${resolved.missing}' for source '${src.name}'`,
        );
      }
      auth = resolved.credential;
    }

    // Validate scope
    if (adapter.scopeSchema && src.scope) {
      adapter.scopeSchema.validate(src.scope);
    }

    const result = await adapter.enrich(graph, {
      auth,
      scope: src.scope,
      dryRun,
    });

    return {
      name: src.name,
      type,
      status: "success",
      episodesCreated: result.episodesCreated,
      entitiesCreated: result.entitiesCreated,
      edgesCreated: result.edgesCreated,
      elapsedMs: Date.now() - startMs,
    };
  } catch (err) {
    return {
      name: src.name,
      type,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      elapsedMs: Date.now() - startMs,
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a full sync: all configured sources in declaration order,
 * then the cross-ref resolver.
 *
 * @param graph - Open EngramGraph to write to
 * @param config - Validated SyncConfig (call validateSyncConfig first)
 * @param opts - Runtime options (--only, --continue-on-error, etc.)
 * @param cwd - Working directory for resolving relative paths (default: process.cwd())
 */
export async function runSync(
  graph: EngramGraph,
  config: SyncConfig,
  opts: RunSyncOpts = {},
  cwd: string = process.cwd(),
): Promise<SyncResult> {
  const totalStart = Date.now();
  const dryRun = opts.dryRun ?? false;

  // Determine which sources to run
  let sourcesToRun = config.sources;
  if (opts.only && opts.only.length > 0) {
    // Preserve declaration order
    sourcesToRun = config.sources.filter(
      (s) => opts.only?.includes(s.name) ?? false,
    );
  }

  // Pre-flight: check all auth env vars before any execution
  const missingEnvVars = checkAuthEnvVars(sourcesToRun);
  if (missingEnvVars.length > 0) {
    const lines = missingEnvVars
      .map((m) => `  source '${m.sourceName}': missing env var '${m.envVar}'`)
      .join("\n");
    throw new SyncSourceError(
      missingEnvVars[0].sourceName,
      "",
      new Error(
        `Missing required environment variables:\n${lines}\n` +
          `Set these env vars before running sync.`,
      ),
    );
  }

  const sourceResults: SourceResult[] = [];
  let aborted = false;

  for (const src of sourcesToRun) {
    if (aborted) {
      sourceResults.push({
        name: src.name,
        type: src.type,
        status: "skipped",
        elapsedMs: 0,
      });
      continue;
    }

    opts.onSourceStart?.(src.name, src.type);

    const result = dryRun
      ? ({
          name: src.name,
          type: src.type,
          status: "success",
          episodesCreated: 0,
          entitiesCreated: 0,
          edgesCreated: 0,
          elapsedMs: 0,
        } satisfies SourceResult)
      : await runSource(graph, src, cwd, dryRun);

    sourceResults.push(result);
    opts.onSourceEnd?.(result);

    if (result.status === "failed" && !opts.continueOnError) {
      aborted = true;
    }
  }

  // Run cross-ref resolver unless: --no-cross-refs, dry-run, or fail-fast abort
  let crossRefs: SyncResult["crossRefs"] = null;
  const hadFailure = sourceResults.some((r) => r.status === "failed");

  if (!opts.noCrossRefs && !dryRun && !(aborted && hadFailure)) {
    const crossRefStart = Date.now();
    // Get all episode IDs from episodes table for a full scan
    const allEpisodes = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM episodes WHERE status != 'redacted' ORDER BY timestamp ASC",
      )
      .all();
    const allEpisodeIds = allEpisodes.map((e) => e.id);
    const resolveResult = resolveReferences(graph, allEpisodeIds);
    crossRefs = {
      edgesCreated: resolveResult.edgesCreated,
      unresolved: resolveResult.unresolved,
      elapsedMs: Date.now() - crossRefStart,
    };
  }

  const overallStatus = hadFailure ? "failed" : "success";

  return {
    sources: sourceResults,
    crossRefs,
    status: overallStatus,
    elapsedMs: Date.now() - totalStart,
  };
}
