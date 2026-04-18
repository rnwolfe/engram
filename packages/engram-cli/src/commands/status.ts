/**
 * status.ts — `engram status` command.
 *
 * Shows a health + config dashboard: database info, embedding model/coverage,
 * generation provider, graph counts, and last ingestion runs.
 *
 * Exit codes:
 *   0 — all OK
 *   1 — DB cannot be opened
 *   2 — embedding model not recorded (absent from metadata; "none" is valid)
 *   3 — embedding provider reachability failed
 *   4 — generation provider reachability failed (only if configured)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, getEmbeddingModel, openGraph } from "engram-core";

interface StatusOpts {
  db: string;
  json: boolean;
  noVerify: boolean;
  quiet: boolean;
}

interface CountRow {
  count: number;
}

interface IngestionRow {
  source_type: string;
  completed_at: string | null;
  cursor: string | null;
}

interface ReachabilityResult {
  ok: boolean;
  message: string;
}

interface DbSection {
  path: string;
  sizeMb: string;
  schemaVersion: string;
  createdAt: string;
  lastModified: string;
}

interface EmbeddingSection {
  model: string | null;
  dimensions: number | null;
  provider: string;
  providerEndpoint: string | null;
  entityCoverage: { withEmbedding: number; total: number };
  episodeCoverage: { withEmbedding: number; total: number };
  reachability?: ReachabilityResult;
}

interface GenerationSection {
  provider: string;
  model: string | null;
  keyEnvVar: string | null;
  keySet: boolean;
  reachability?: ReachabilityResult;
}

interface GraphSection {
  entitiesActive: number;
  edgesActive: number;
  edgesInvalidated: number;
  episodesActive: number;
  episodesRedacted: number;
  projectionsActive: number;
  projectionsStale: number;
}

interface IngestionSection {
  git: { completedAt: string | null; cursor: string | null };
  github: { completedAt: string | null; cursor: string | null };
  source: { completedAt: string | null; cursor: string | null };
}

interface StatusOutput {
  db: DbSection;
  embedding: EmbeddingSection;
  generation: GenerationSection;
  graph: GraphSection;
  ingestion: IngestionSection;
}

// ─── Reachability checks ──────────────────────────────────────────────────────

async function checkOllama(endpoint: string): Promise<ReachabilityResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true, message: "reachable" };
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg.includes("abort") ? "timeout" : msg };
  }
}

async function checkGoogle(apiKey: string): Promise<ReachabilityResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
      {
        headers: { "x-goog-api-key": apiKey },
        signal: controller.signal,
      },
    );
    clearTimeout(timer);
    if (res.ok) return { ok: true, message: "reachable" };
    if (res.status === 400 || res.status === 403) {
      return { ok: false, message: `HTTP ${res.status} (invalid key?)` };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg.includes("abort") ? "timeout" : msg };
  }
}

async function checkOpenAI(apiKey: string): Promise<ReachabilityResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch("https://api.openai.com/v1/models?limit=1", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true, message: "reachable" };
    if (res.status === 401) {
      return { ok: false, message: "HTTP 401 (invalid key)" };
    }
    return { ok: false, message: `HTTP ${res.status}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, message: msg.includes("abort") ? "timeout" : msg };
  }
}

// ─── Data collection ──────────────────────────────────────────────────────────

function collectDb(graph: EngramGraph, dbPath: string): DbSection {
  let sizeMb = "unknown";
  let lastModified = "unknown";
  try {
    const stat = fs.statSync(dbPath);
    sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
    lastModified = formatDateTime(stat.mtime.toISOString());
  } catch {
    // ignore
  }

  return {
    path: dbPath,
    sizeMb,
    schemaVersion: graph.formatVersion,
    createdAt: formatDate(graph.createdAt),
    lastModified,
  };
}

function collectEmbedding(graph: EngramGraph): EmbeddingSection {
  const stored = getEmbeddingModel(graph);

  // Count embeddings for active entities/episodes only (joined to filter soft-deleted rows)
  const entityEmbedCount =
    graph.db
      .query<CountRow, []>(
        `SELECT COUNT(*) as count FROM embeddings em
         JOIN entities e ON e.id = em.target_id
         WHERE em.target_type = 'entity' AND e.status = 'active'`,
      )
      .get()?.count ?? 0;

  const episodeEmbedCount =
    graph.db
      .query<CountRow, []>(
        `SELECT COUNT(*) as count FROM embeddings em
         JOIN episodes ep ON ep.id = em.target_id
         WHERE em.target_type = 'episode' AND ep.status = 'active'`,
      )
      .get()?.count ?? 0;

  const activeEntities =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM entities WHERE status = 'active'",
      )
      .get()?.count ?? 0;

  const activeEpisodes =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM episodes WHERE status = 'active'",
      )
      .get()?.count ?? 0;

  // Determine embedding provider from env
  const aiProvider = process.env.ENGRAM_AI_PROVIDER ?? "null";
  const ollamaEndpoint =
    process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434";

  let provider: string;
  let providerEndpoint: string | null = null;

  if (aiProvider === "ollama") {
    provider = "ollama";
    providerEndpoint = ollamaEndpoint;
  } else if (aiProvider === "gemini") {
    provider = "google";
  } else if (aiProvider === "openai") {
    provider = "openai";
  } else if (aiProvider === "none") {
    provider = "none";
  } else {
    // ENGRAM_AI_PROVIDER not set ("null") or unrecognised — auto-detect from stored model + available API keys
    const modelName = stored?.model ?? "";
    if (
      modelName.startsWith("nomic") ||
      modelName.startsWith("mxbai") ||
      modelName.startsWith("all-minilm")
    ) {
      provider = "ollama";
      providerEndpoint = ollamaEndpoint;
    } else if (
      (modelName.startsWith("gemini-") ||
        modelName === "text-embedding-004" ||
        modelName.startsWith("models/")) &&
      (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
    ) {
      provider = "google";
    } else {
      provider = "none";
    }
  }

  return {
    model: stored?.model ?? null,
    dimensions: stored?.dimensions ?? null,
    provider,
    providerEndpoint,
    entityCoverage: { withEmbedding: entityEmbedCount, total: activeEntities },
    episodeCoverage: {
      withEmbedding: episodeEmbedCount,
      total: activeEpisodes,
    },
  };
}

function collectGeneration(): GenerationSection {
  const aiProvider = process.env.ENGRAM_AI_PROVIDER;

  // Explicit provider
  if (aiProvider === "anthropic") {
    const key = process.env.ANTHROPIC_API_KEY;
    return {
      provider: "anthropic",
      model: null,
      keyEnvVar: "ANTHROPIC_API_KEY",
      keySet: !!key,
    };
  }
  if (aiProvider === "gemini") {
    const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    return {
      provider: "google",
      model: "gemini-2.0-flash",
      keyEnvVar: process.env.GEMINI_API_KEY
        ? "GEMINI_API_KEY"
        : "GOOGLE_API_KEY",
      keySet: !!key,
    };
  }
  if (aiProvider === "openai") {
    const key = process.env.OPENAI_API_KEY;
    return {
      provider: "openai",
      model: null,
      keyEnvVar: "OPENAI_API_KEY",
      keySet: !!key,
    };
  }

  // Auto-detect from API keys
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      model: null,
      keyEnvVar: "ANTHROPIC_API_KEY",
      keySet: true,
    };
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    const envVar = process.env.GEMINI_API_KEY
      ? "GEMINI_API_KEY"
      : "GOOGLE_API_KEY";
    return {
      provider: "google",
      model: "gemini-2.0-flash",
      keyEnvVar: envVar,
      keySet: true,
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      provider: "openai",
      model: null,
      keyEnvVar: "OPENAI_API_KEY",
      keySet: true,
    };
  }

  return {
    provider: "none",
    model: null,
    keyEnvVar: null,
    keySet: false,
  };
}

function collectGraph(graph: EngramGraph): GraphSection {
  const entitiesActive =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM entities WHERE status = 'active'",
      )
      .get()?.count ?? 0;

  const edgesActive =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM edges WHERE invalidated_at IS NULL",
      )
      .get()?.count ?? 0;

  const edgesInvalidated =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM edges WHERE invalidated_at IS NOT NULL",
      )
      .get()?.count ?? 0;

  const episodesActive =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM episodes WHERE status = 'active'",
      )
      .get()?.count ?? 0;

  const episodesRedacted =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM episodes WHERE status = 'redacted'",
      )
      .get()?.count ?? 0;

  // Projections — check if table exists first (v0.2+ schema)
  let projectionsActive = 0;
  let projectionsStale = 0;
  try {
    projectionsActive =
      graph.db
        .query<CountRow, []>(
          "SELECT COUNT(*) as count FROM projections WHERE invalidated_at IS NULL",
        )
        .get()?.count ?? 0;

    // Stale projections: join with projection_evidence and check content hashes
    // For simplicity, count projections that have a stale flag via computeBatchedStaleness
    // We use a simpler approach: count projections with input_fingerprint that doesn't
    // match current — this requires the full staleness check. Use a proxy: any projection
    // where last_assessed_at is non-null (has been assessed at some point) — but that
    // doesn't tell us stale vs fresh. Instead just query what we can from the DB.
    // The stale count requires reading projection inputs — too expensive for status.
    // Show active count only; stale requires reconcile. Leave as 0 unless we can query it.
    projectionsStale = 0;
  } catch {
    // projections table may not exist in older format versions
  }

  return {
    entitiesActive,
    edgesActive,
    edgesInvalidated,
    episodesActive,
    episodesRedacted,
    projectionsActive,
    projectionsStale,
  };
}

function collectIngestion(graph: EngramGraph): IngestionSection {
  const defaultRun = { completedAt: null, cursor: null };

  const getLastRun = (
    sourceType: string,
  ): { completedAt: string | null; cursor: string | null } => {
    try {
      const row = graph.db
        .query<IngestionRow, [string]>(
          `SELECT source_type, completed_at, cursor
           FROM ingestion_runs
           WHERE source_type = ? AND status = 'completed'
           ORDER BY completed_at DESC LIMIT 1`,
        )
        .get(sourceType);
      if (!row) return defaultRun;
      return {
        completedAt: row.completed_at ? formatDateTime(row.completed_at) : null,
        cursor: row.cursor,
      };
    } catch {
      return defaultRun;
    }
  };

  return {
    git: getLastRun("git"),
    github: getLastRun("github"),
    source: getLastRun("source"),
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    const date = d.toISOString().slice(0, 10);
    const time = d.toISOString().slice(11, 16);
    return `${date} ${time}`;
  } catch {
    return iso;
  }
}

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function reachIcon(r: ReachabilityResult | undefined): string {
  if (!r) return "";
  return r.ok ? "  ✓ reachable" : `  ✗ ${r.message}`;
}

function printHuman(status: StatusOutput, noVerify: boolean): void {
  const { db, embedding, generation, graph, ingestion } = status;

  console.log("engram status\n");

  // Database
  console.log("Database");
  console.log(`  Path:            ${db.path}`);
  console.log(`  Size:            ${db.sizeMb} MB`);
  console.log(`  Schema version:  ${db.schemaVersion}`);
  console.log(`  Created:         ${db.createdAt}`);
  console.log(`  Last modified:   ${db.lastModified}`);
  console.log();

  // Embedding
  console.log("Embedding");
  let modelStr: string;
  if (embedding.model === "none") {
    modelStr = "BM25 only (no vector search)";
  } else if (embedding.model) {
    modelStr = `${embedding.model}${embedding.dimensions ? ` (${embedding.dimensions} dims)` : ""}`;
  } else {
    modelStr = "(not recorded)";
  }
  console.log(`  Model:           ${modelStr}`);

  let providerLine: string;
  if (embedding.provider === "ollama") {
    providerLine = `ollama @ ${embedding.providerEndpoint}${reachIcon(embedding.reachability)}`;
  } else if (embedding.provider === "none") {
    if (embedding.model === "none") {
      providerLine = "none (BM25-only mode)";
    } else if (embedding.model) {
      providerLine = "none (set ENGRAM_AI_PROVIDER or the matching API key)";
    } else {
      providerLine = "none (set ENGRAM_AI_PROVIDER)";
    }
  } else {
    providerLine = `${embedding.provider}${reachIcon(embedding.reachability)}`;
  }
  console.log(`  Provider:        ${providerLine}`);

  const ec = embedding.entityCoverage;
  const epc = embedding.episodeCoverage;
  console.log(
    `  Coverage:        entities ${ec.withEmbedding}/${ec.total} (${pct(ec.withEmbedding, ec.total)})` +
      `  ·  episodes ${epc.withEmbedding}/${epc.total} (${pct(epc.withEmbedding, epc.total)})`,
  );
  const missingEntities = ec.total - ec.withEmbedding;
  const missingEpisodes = epc.total - epc.withEmbedding;
  if (missingEntities > 0 || missingEpisodes > 0) {
    const parts: string[] = [];
    if (missingEntities > 0) parts.push(`${missingEntities} entities`);
    if (missingEpisodes > 0) parts.push(`${missingEpisodes} episodes`);
    const hint =
      embedding.provider === "none"
        ? `set ENGRAM_AI_PROVIDER, then run engram embed --fill`
        : `run engram embed --fill to fill the gap`;
    console.log(`  Gap:             ${parts.join(", ")} missing — ${hint}`);
  }
  console.log();

  // Generation
  console.log("Generation");
  const genModel = generation.model ?? "(auto)";
  const keyInfo = generation.keyEnvVar
    ? `${generation.keyEnvVar} ${generation.keySet ? "set" : "NOT SET"}`
    : "";
  const genProviderLine =
    generation.provider === "none"
      ? "none (set ENGRAM_AI_PROVIDER or an API key)"
      : `${generation.provider}${keyInfo ? ` (${keyInfo})` : ""}${reachIcon(generation.reachability)}`;

  if (generation.provider !== "none") {
    console.log(`  Model:           ${genModel}`);
  }
  console.log(`  Provider:        ${genProviderLine}`);
  console.log();

  // Graph
  console.log("Graph");
  console.log(`  Entities:        ${graph.entitiesActive} active`);
  console.log(
    `  Edges:           ${graph.edgesActive} active  ·  ${graph.edgesInvalidated} invalidated`,
  );
  console.log(
    `  Episodes:        ${graph.episodesActive} active  ·  ${graph.episodesRedacted} redacted`,
  );
  const staleNote =
    graph.projectionsStale > 0 ? `  ·  ${graph.projectionsStale} stale` : "";
  console.log(
    `  Projections:     ${graph.projectionsActive} active${staleNote}`,
  );
  console.log();

  // Ingestion
  console.log("Ingestion");
  const gitInfo = ingestion.git.completedAt
    ? `${ingestion.git.completedAt}${ingestion.git.cursor ? ` (HEAD: ${ingestion.git.cursor.slice(0, 7)})` : ""}`
    : "never";
  const githubInfo = ingestion.github.completedAt ?? "never";
  const sourceInfo = ingestion.source.completedAt ?? "never";

  console.log(`  Last git ingest:    ${gitInfo}`);
  console.log(`  Last github sync:   ${githubInfo}`);
  console.log(`  Last source ingest: ${sourceInfo}`);

  if (noVerify) {
    console.log();
    console.log(
      "  (reachability checks skipped — use without --no-verify to enable)",
    );
  }
}

function printQuietFailures(status: StatusOutput, exitCode: number): void {
  if (exitCode === 2) {
    console.log("Embedding: model not recorded in database metadata");
  }
  if (exitCode === 3) {
    const r = status.embedding.reachability;
    console.log(
      `Embedding: provider unreachable — ${r?.message ?? "unknown error"}`,
    );
  }
  if (exitCode === 4) {
    const r = status.generation.reachability;
    console.log(
      `Generation: provider unreachable — ${r?.message ?? "unknown error"}`,
    );
  }
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description(
      "Show a health and config dashboard (embedding model, graph counts, provider reachability). For raw graph counts only, see engram stats.",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--json", "emit JSON output", false)
    .option("--no-verify", "skip reachability checks")
    .option(
      "--quiet",
      "print nothing on success; print only failing sections on error",
      false,
    )
    .addHelpText(
      "after",
      `
Examples:
  # Full health dashboard
  engram status

  # JSON output for scripting
  engram status --json

  # CI health check (quiet mode — exits non-zero on failure)
  engram status --quiet

When to use:
  After setup to verify embedding model and provider are configured correctly.
  Use engram stats for a quick raw count without reachability checks.

See also:
  engram stats     raw graph counts (entities, edges, episodes)
  engram embed     manage embedding index`,
    )
    .action(async (opts: StatusOpts) => {
      const dbPath = path.resolve(opts.db);

      // Open graph — exit 1 on failure
      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        if (!opts.quiet) {
          console.error(
            `Error: cannot open database: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        process.exit(1);
      }

      try {
        const dbSection = collectDb(graph, dbPath);
        const embeddingSection = collectEmbedding(graph);
        const generationSection = collectGeneration();
        const graphSection = collectGraph(graph);
        const ingestionSection = collectIngestion(graph);

        // Reachability checks
        if (!opts.noVerify) {
          // Embedding provider reachability
          if (
            embeddingSection.provider === "ollama" &&
            embeddingSection.providerEndpoint
          ) {
            embeddingSection.reachability = await checkOllama(
              embeddingSection.providerEndpoint,
            );
          } else if (embeddingSection.provider === "google") {
            const key =
              process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
            if (key) {
              embeddingSection.reachability = await checkGoogle(key);
            }
          } else if (embeddingSection.provider === "openai") {
            const key = process.env.OPENAI_API_KEY;
            if (key) {
              embeddingSection.reachability = await checkOpenAI(key);
            }
          }

          // Generation provider reachability
          if (
            generationSection.provider !== "none" &&
            generationSection.keySet
          ) {
            if (generationSection.provider === "google") {
              const key =
                process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
              if (key) generationSection.reachability = await checkGoogle(key);
            } else if (generationSection.provider === "anthropic") {
              // Anthropic doesn't have a simple ping endpoint — mark as key-set only
              generationSection.reachability = {
                ok: true,
                message: "key set (reachability not checked)",
              };
            } else if (generationSection.provider === "openai") {
              const key = process.env.OPENAI_API_KEY;
              if (key) generationSection.reachability = await checkOpenAI(key);
            }
          }
        }

        const status: StatusOutput = {
          db: dbSection,
          embedding: embeddingSection,
          generation: generationSection,
          graph: graphSection,
          ingestion: ingestionSection,
        };

        // Determine exit code
        let exitCode = 0;

        if (embeddingSection.model === null) {
          exitCode = 2;
        } else if (
          embeddingSection.reachability &&
          !embeddingSection.reachability.ok
        ) {
          exitCode = 3;
        } else if (
          generationSection.provider !== "none" &&
          generationSection.reachability &&
          !generationSection.reachability.ok
        ) {
          exitCode = 4;
        }

        // Output
        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
        } else if (opts.quiet && exitCode === 0) {
          // Silent on success
        } else if (opts.quiet && exitCode !== 0) {
          printQuietFailures(status, exitCode);
        } else {
          printHuman(status, opts.noVerify);
        }

        closeGraph(graph);
        process.exit(exitCode);
      } catch (err) {
        if (!opts.quiet) {
          console.error(
            `Error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        closeGraph(graph);
        process.exit(1);
      }
    });
}
