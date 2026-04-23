/**
 * sync.ts — `engram sync` command.
 *
 * Reads a config file and runs all configured ingesters in declaration order,
 * then runs the cross-ref resolver. Replaces hand-crafted shell sequences of
 * individual `engram ingest` commands.
 *
 * Config discovery (first match wins):
 *   1. --config <path>
 *   2. $ENGRAM_CONFIG env var
 *   3. <cwd>/.engram.config.json
 *   4. <db-dir>/.engram.config.json  (adjacent to the .engram file)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "@clack/prompts";
import type { Command } from "commander";
import {
  closeGraph,
  openGraph,
  resolveDbPath,
  runSync,
  type SourceResult,
  SyncConfigValidationError,
  type SyncResult,
  validateSyncConfig,
} from "engram-core";

// ---------------------------------------------------------------------------
// Config discovery
// ---------------------------------------------------------------------------

const CONFIG_FILENAME = ".engram.config.json";
const EXAMPLE_CONFIG_PATH = "docs/examples/.engram.config.json";

/**
 * Discover the config file path using the documented resolution order.
 * Returns null if no config can be found.
 */
function discoverConfigPath(
  explicitPath: string | undefined,
  dbPath: string,
): string | null {
  // 1. --config flag
  if (explicitPath) {
    return path.resolve(explicitPath);
  }

  // 2. $ENGRAM_CONFIG env var
  const envPath = process.env.ENGRAM_CONFIG;
  if (envPath) {
    return path.resolve(envPath);
  }

  // 3. <cwd>/.engram.config.json
  const cwdConfig = path.join(process.cwd(), CONFIG_FILENAME);
  if (fs.existsSync(cwdConfig)) {
    return cwdConfig;
  }

  // 4. db-adjacent (.engram file's directory)
  const dbDir = path.dirname(path.resolve(dbPath));
  const dbAdjacentConfig = path.join(dbDir, CONFIG_FILENAME);
  if (dbAdjacentConfig !== cwdConfig && fs.existsSync(dbAdjacentConfig)) {
    return dbAdjacentConfig;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatStatus(status: string): string {
  switch (status) {
    case "success":
      return "ok     ";
    case "failed":
      return "FAILED ";
    case "skipped":
      return "skipped";
    default:
      return status;
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function printTable(results: SourceResult[]): void {
  const colWidths = {
    name: Math.max(4, ...results.map((r) => r.name.length)),
    type: Math.max(4, ...results.map((r) => r.type.length)),
    status: 7,
    episodes: 8,
    entities: 8,
    edges: 5,
    elapsed: 7,
  };

  const header = [
    "name".padEnd(colWidths.name),
    "type".padEnd(colWidths.type),
    "status ",
    "episodes".padStart(colWidths.episodes),
    "entities".padStart(colWidths.entities),
    "edges".padStart(colWidths.edges),
    "elapsed",
  ].join("  ");

  const divider = "-".repeat(header.length);

  process.stdout.write(`${header}\n${divider}\n`);

  for (const r of results) {
    const row = [
      r.name.padEnd(colWidths.name),
      r.type.padEnd(colWidths.type),
      formatStatus(r.status),
      (r.episodesCreated ?? "-").toString().padStart(colWidths.episodes),
      (r.entitiesCreated ?? "-").toString().padStart(colWidths.entities),
      (r.edgesCreated ?? "-").toString().padStart(colWidths.edges),
      formatMs(r.elapsedMs).padStart(colWidths.elapsed),
    ].join("  ");
    process.stdout.write(`${row}\n`);
  }

  process.stdout.write(`${divider}\n`);
}

function printSyncResult(result: SyncResult): void {
  printTable(result.sources);

  const totalEpisodes = result.sources.reduce(
    (s, r) => s + (r.episodesCreated ?? 0),
    0,
  );
  const totalEntities = result.sources.reduce(
    (s, r) => s + (r.entitiesCreated ?? 0),
    0,
  );
  const totalEdges = result.sources.reduce(
    (s, r) => s + (r.edgesCreated ?? 0),
    0,
  );
  const failed = result.sources.filter((r) => r.status === "failed").length;

  process.stdout.write(
    `\nTotal: ${result.sources.length} sources, ${failed} failed — ` +
      `${totalEpisodes} episodes, ${totalEntities} entities, ${totalEdges} edges, ` +
      `${formatMs(result.elapsedMs)} total\n`,
  );

  if (result.crossRefs) {
    process.stdout.write(
      `Cross-refs: ${result.crossRefs.edgesCreated} edges created, ` +
        `${result.crossRefs.unresolved} unresolved, ` +
        `${formatMs(result.crossRefs.elapsedMs)}\n`,
    );
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

interface SyncOpts {
  config?: string;
  db: string;
  only?: string;
  continueOnError?: boolean;
  noCrossRefs?: boolean;
  format?: string;
  dryRun?: boolean;
}

export function registerSync(program: Command): void {
  program
    .command("sync")
    .description(
      "Run all configured ingesters from .engram.config.json, then resolve cross-refs",
    )
    .addHelpText(
      "after",
      `
Config discovery (first match wins):
  --config <path>              Explicit config file path
  $ENGRAM_CONFIG               Environment variable
  <cwd>/.engram.config.json    Auto-discovered in working directory
  <db-dir>/.engram.config.json Adjacent to the .engram database file

Config format (.engram.config.json):
  {
    "version": 1,
    "sources": [
      { "name": "repo-git",  "type": "git",    "path": "." },
      { "name": "repo-src",  "type": "source", "root": "packages/" },
      { "name": "engram-gh", "type": "github", "scope": "org/repo",
        "auth": { "kind": "bearer", "tokenEnv": "GITHUB_TOKEN" } }
    ]
  }

Examples:
  # Run all configured sources
  engram sync --db myproject.engram

  # Dry-run to see what would run
  engram sync --dry-run

  # Run only the git source
  engram sync --only repo-git

  # Continue even if one source fails
  engram sync --continue-on-error

  # JSON output for scripting
  engram sync --format json | jq .status

Exit codes:
  0 — all sources succeeded
  1 — at least one source failed
  2 — config validation error, unknown --only name, or missing auth env var
  3 — no discoverable config file`,
    )
    .option("--config <path>", "path to sync config file")
    .option("--db <path>", "path to .engram file", ".engram")
    .option(
      "--only <names>",
      "comma-separated list of source names to run (subset)",
    )
    .option(
      "--continue-on-error",
      "run remaining sources after a failure (default: fail-fast)",
    )
    .option("--no-cross-refs", "skip the cross-ref resolver step")
    .option(
      "--format <format>",
      "output format: 'human' (default) or 'json'",
      "human",
    )
    .option(
      "--dry-run",
      "validate config and print plan without executing any ingestion",
    )
    .action(async (opts: SyncOpts) => {
      const isTTY = process.stdout.isTTY;
      const isJson = opts.format === "json";

      // Resolve db path
      const dbPath = resolveDbPath(path.resolve(opts.db));

      // Discover config
      const configPath = discoverConfigPath(opts.config, dbPath);
      if (!configPath) {
        const msg =
          `No sync config found. Create ${CONFIG_FILENAME} in your project directory.\n` +
          `See ${EXAMPLE_CONFIG_PATH} for an example, or use --config <path> to specify a file.\n` +
          `\nResolution order checked:\n` +
          `  1. --config flag\n` +
          `  2. $ENGRAM_CONFIG env var\n` +
          `  3. ${path.join(process.cwd(), CONFIG_FILENAME)}\n` +
          `  4. ${path.join(path.dirname(path.resolve(dbPath)), CONFIG_FILENAME)}`;
        process.stderr.write(`${msg}\n`);
        process.exit(3);
      }

      // Load and parse config
      let rawConfig: unknown;
      try {
        const content = fs.readFileSync(configPath, "utf8");
        rawConfig = JSON.parse(content);
      } catch (err) {
        process.stderr.write(
          `Cannot read config file '${configPath}': ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(2);
      }

      // Validate config
      let config: ReturnType<typeof validateSyncConfig>;
      try {
        config = validateSyncConfig(rawConfig);
      } catch (err) {
        if (err instanceof SyncConfigValidationError) {
          process.stderr.write(`${err.message}\n`);
        } else {
          process.stderr.write(
            `Config validation error: ${err instanceof Error ? err.message : String(err)}\n`,
          );
        }
        process.exit(2);
      }

      // Validate --only names
      const onlyNames = opts.only
        ? opts.only
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
        : undefined;

      if (onlyNames && onlyNames.length > 0) {
        const knownNames = new Set(config.sources.map((s) => s.name));
        const unknown = onlyNames.filter((n) => !knownNames.has(n));
        if (unknown.length > 0) {
          process.stderr.write(
            `Unknown source name(s) in --only: ${unknown.map((n) => `'${n}'`).join(", ")}\n` +
              `Known sources: ${Array.from(knownNames).join(", ")}\n`,
          );
          process.exit(2);
        }
      }

      // Dry-run: print plan and exit
      if (opts.dryRun) {
        const sourcesToRun = onlyNames
          ? config.sources.filter((s) => onlyNames.includes(s.name))
          : config.sources;

        if (!isJson) {
          process.stdout.write(
            `Dry-run: would run ${sourcesToRun.length} source(s) from ${configPath}\n\n`,
          );
          for (const src of sourcesToRun) {
            const authDesc = src.auth ? ` [auth: ${src.auth.kind}]` : "";
            const scopeDesc = src.scope ? ` scope=${src.scope}` : "";
            const pathDesc =
              (src.root ?? src.path) ? ` path=${src.root ?? src.path}` : "";
            process.stdout.write(
              `  ${src.name.padEnd(20)} type=${src.type}${scopeDesc}${pathDesc}${authDesc}\n`,
            );
          }
          if (!opts.noCrossRefs) {
            process.stdout.write("\n  [cross-ref resolver would run after]\n");
          }
        } else {
          const plan = {
            dryRun: true,
            configPath,
            sources: sourcesToRun.map((s) => ({
              name: s.name,
              type: s.type,
              scope: s.scope,
              path: s.root ?? s.path,
              authKind: s.auth?.kind ?? "none",
            })),
            crossRefs: !opts.noCrossRefs,
          };
          process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
        }
        process.exit(0);
      }

      // Open graph
      let graph: ReturnType<typeof openGraph>;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        process.stderr.write(
          `Cannot open graph '${dbPath}': ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
      }

      // Run sync
      let result: SyncResult;
      try {
        result = await runSync(
          graph,
          config,
          {
            only: onlyNames,
            continueOnError: opts.continueOnError,
            noCrossRefs: opts.noCrossRefs,
            dryRun: false,
            onSourceStart: (name, type) => {
              if (isTTY && !isJson) {
                log.info(`Running source '${name}' (${type})...`);
              }
            },
            onSourceEnd: (sourceResult) => {
              if (isTTY && !isJson) {
                if (sourceResult.status === "failed") {
                  log.error(
                    `Source '${sourceResult.name}' failed: ${sourceResult.error}`,
                  );
                }
              }
            },
          },
          process.cwd(),
        );
      } catch (err) {
        // SyncSourceError from pre-flight auth check
        process.stderr.write(
          `${err instanceof Error ? err.message : String(err)}\n`,
        );
        closeGraph(graph);
        process.exit(2);
      }

      closeGraph(graph);

      // Output results
      if (isJson) {
        process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      } else {
        printSyncResult(result);
      }

      // Exit code
      const exitCode = result.status === "failed" ? 1 : 0;
      process.exit(exitCode);
    });
}
