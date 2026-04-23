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
import { SyncSourceError } from "./errors.js";
import type {
  RunSyncOpts,
  SourceResult,
  SyncAuthConfig,
  SyncConfig,
  SyncResult,
  SyncSource,
} from "./types.js";
import { resolveSyncAuth } from "./types.js";

export { validateSyncConfig } from "./validate.js";

// ---------------------------------------------------------------------------
// Built-in adapter types
// ---------------------------------------------------------------------------

const BUILT_IN_TYPES = ["git", "source", "github", "google_workspace"] as const;

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
    const missingVars = resolveSyncAuth(src.auth);
    for (const envVar of missingVars) {
      missing.push({ sourceName: src.name, envVar });
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
): Promise<SourceResult> {
  const startMs = Date.now();
  const type = src.type;

  try {
    if (type === "git") {
      const repoPath = path.resolve(cwd, src.path ?? src.root ?? ".");
      const result = await ingestGitRepo(graph, repoPath);
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
      const result = await ingestSource(graph, { root });
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
      const missing = resolveSyncAuth(src.auth as SyncAuthConfig);
      if (missing.length > 0) {
        throw new Error(
          `Missing required env vars for source '${src.name}': ${missing.join(", ")}`,
        );
      }
      // Re-resolve to get the credential (all vars confirmed present)
      const resolved = resolveSyncAuthCredential(src.auth as SyncAuthConfig);
      auth = resolved;
    }

    // Validate scope
    if (adapter.scopeSchema && src.scope) {
      adapter.scopeSchema.validate(src.scope);
    }

    const result = await adapter.enrich(graph, {
      auth,
      scope: src.scope,
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
    // B3: use the actual source type from the first failing source
    const firstMissing = missingEnvVars[0];
    const firstSrc = sourcesToRun.find(
      (s) => s.name === firstMissing.sourceName,
    );
    throw new SyncSourceError(
      firstMissing.sourceName,
      firstSrc?.type ?? "",
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

    // B4: dry-run is handled entirely at orchestrator level — skip adapter calls
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
      : await runSource(graph, src, cwd);

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

// ---------------------------------------------------------------------------
// Internal: resolve credential after all vars confirmed present
// ---------------------------------------------------------------------------

function resolveSyncAuthCredential(authConfig: SyncAuthConfig): AuthCredential {
  switch (authConfig.kind) {
    case "none":
      return { kind: "none" };
    case "bearer":
      return {
        kind: "bearer",
        token: process.env[authConfig.tokenEnv] ?? "",
      };
    case "basic":
      return {
        kind: "basic",
        username: process.env[authConfig.usernameEnv] ?? "",
        secret: process.env[authConfig.secretEnv] ?? "",
      };
    case "service_account":
      return {
        kind: "service_account",
        keyJson: process.env[authConfig.keyJsonEnv] ?? "",
      };
    case "oauth2": {
      const rawScopes = authConfig.scopesEnv
        ? process.env[authConfig.scopesEnv]
        : undefined;
      const scopes = rawScopes ? rawScopes.split(",").map((s) => s.trim()) : [];
      return {
        kind: "oauth2",
        token: process.env[authConfig.tokenEnv] ?? "",
        scopes,
      };
    }
  }
}
