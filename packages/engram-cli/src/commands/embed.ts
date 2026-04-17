/**
 * embed.ts — `engram embed` command.
 *
 * Modes (mutually exclusive flags):
 *   --reindex   Clear and rebuild the vector index
 *   --check     Validate stored model matches configured provider
 *   --enable    First-time opt-in for databases initialized with --embedding-model none
 *   --status    Show embedding coverage summary
 */

import * as path from "node:path";
import { confirm, intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type { AIProvider } from "engram-core";
import {
  checkGoogle,
  checkOllama,
  checkOpenAI,
  closeGraph,
  countEmbeddings,
  GeminiProvider,
  getEmbeddingModel,
  NullProvider,
  OllamaProvider,
  openGraph,
  reindexEmbeddings,
} from "engram-core";

type ReindexTarget = "all" | "entities" | "episodes";

interface EmbedOpts {
  reindex?: boolean;
  check?: boolean;
  enable?: boolean;
  status?: boolean;
  target: ReindexTarget;
  model?: string;
  provider?: string;
  db: string;
  yes?: boolean;
  verify: boolean;
  limit?: number;
}

// ─── Provider resolution ──────────────────────────────────────────────────────

function inferProviderName(model: string): string {
  if (
    model.startsWith("nomic-") ||
    model.startsWith("mxbai-") ||
    model.startsWith("all-minilm")
  ) {
    return "ollama";
  }
  if (
    model.startsWith("gemini-") ||
    model === "text-embedding-004" ||
    model.startsWith("models/")
  ) {
    return "gemini";
  }
  if (
    model.startsWith("text-embedding-3") ||
    model.startsWith("text-embedding-ada")
  ) {
    return "openai";
  }
  return "ollama";
}

function buildProvider(model: string, providerHint?: string): AIProvider {
  const p = providerHint ?? inferProviderName(model);
  switch (p) {
    case "ollama":
      return new OllamaProvider({
        embedModel: model,
        baseUrl: process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434",
      });
    case "gemini":
      return new GeminiProvider({
        embedModel: model,
        apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      });
    default:
      throw new Error(
        `Unknown provider "${p}". Supported: ollama, gemini.\n` +
          `Tip: use --provider to override auto-detection.`,
      );
  }
}

function buildProviderFromEnv(): AIProvider | null {
  const p = process.env.ENGRAM_AI_PROVIDER ?? "null";
  if (p === "ollama") {
    return new OllamaProvider({
      baseUrl: process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434",
    });
  }
  if (p === "gemini") {
    return new GeminiProvider({
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    });
  }
  // openai and other providers: not supported for embeddings in this CLI version
  return null;
}

// ─── Coverage helpers ─────────────────────────────────────────────────────────

interface CountRow {
  count: number;
}

function queryCoverage(graph: ReturnType<typeof openGraph>): {
  entityEmbedded: number;
  entityTotal: number;
  episodeEmbedded: number;
  episodeTotal: number;
} {
  const entityEmbedded =
    graph.db
      .query<CountRow, []>(
        `SELECT COUNT(*) as count FROM embeddings em
         JOIN entities e ON e.id = em.target_id
         WHERE em.target_type = 'entity' AND e.status = 'active'`,
      )
      .get()?.count ?? 0;

  const entityTotal =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM entities WHERE status = 'active'",
      )
      .get()?.count ?? 0;

  const episodeEmbedded =
    graph.db
      .query<CountRow, []>(
        `SELECT COUNT(*) as count FROM embeddings em
         JOIN episodes ep ON ep.id = em.target_id
         WHERE em.target_type = 'episode' AND ep.status != 'redacted'`,
      )
      .get()?.count ?? 0;

  // Match reindexEmbeddings filter: status != 'redacted'
  const episodeTotal =
    graph.db
      .query<CountRow, []>(
        "SELECT COUNT(*) as count FROM episodes WHERE status != 'redacted'",
      )
      .get()?.count ?? 0;

  return { entityEmbedded, entityTotal, episodeEmbedded, episodeTotal };
}

function pct(num: number, den: number): string {
  if (den === 0) return "—";
  return `${Math.round((num / den) * 100)}%`;
}

// ─── Modes — each returns an exit code (0 = success) ────────────────────────

async function runReindex(
  graph: ReturnType<typeof openGraph>,
  opts: EmbedOpts,
): Promise<number> {
  const provider = buildProviderFromEnv();
  if (!provider) {
    log.error(
      "No embedding provider configured.\n" +
        "Set ENGRAM_AI_PROVIDER=ollama (or gemini) before running --reindex.\n" +
        "Or use --enable --model <id> to configure a model first.",
    );
    return 1;
  }

  const activeModel = provider.modelName();
  const stored = getEmbeddingModel(graph);
  const counts = countEmbeddings(graph);
  const target = opts.target ?? "all";
  const targetLabel = target === "all" ? "entities + episodes" : target;

  log.info(
    [
      "About to reindex embeddings:",
      `  Target:         ${targetLabel}`,
      `  Current index:  ${counts.entities} entity, ${counts.episodes} episode embeddings`,
      `  New model:      ${activeModel}`,
      stored
        ? `  Stored model:   ${stored.model} (${stored.dimensions} dims)`
        : "  Stored model:   (none recorded)",
    ].join("\n"),
  );

  if (!opts.yes) {
    const ok = await confirm({
      message: `Rebuild the ${targetLabel} vector index with ${activeModel}?`,
      initialValue: false,
    });
    if (!ok || typeof ok !== "boolean") {
      log.info("Aborted.");
      return 0;
    }
  }

  const startMs = Date.now();
  const s = spinner();
  s.start("Reindexing…");

  const result = await reindexEmbeddings(
    graph,
    provider,
    (p) => {
      const rate =
        p.done > 0
          ? `${(p.done / ((Date.now() - startMs) / 1000)).toFixed(0)}/s`
          : "…";
      s.message(`Reindexing… ${p.done}/${p.total} (${rate})`);
    },
    target,
  );

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  const rate = (
    result.done / Math.max(1, (Date.now() - startMs) / 1000)
  ).toFixed(1);
  s.stop(
    `Reindexed ${result.done.toLocaleString()} items in ${elapsedSec}s (${rate} items/s)`,
  );

  if (result.errors > 0) {
    log.warn(`${result.errors} items failed — run again to retry.`);
  }

  const newModel = getEmbeddingModel(graph);
  if (newModel) {
    log.success(
      `Embedding model recorded: ${newModel.model} (${newModel.dimensions} dims)`,
    );
  }
  return 0;
}

async function runCheck(
  graph: ReturnType<typeof openGraph>,
  opts: EmbedOpts,
): Promise<number> {
  const stored = getEmbeddingModel(graph);

  if (!stored || stored.model === "none") {
    log.warn("Embedding model not configured — semantic search is disabled.");
    return 1;
  }

  const aiProviderEnv = process.env.ENGRAM_AI_PROVIDER ?? "null";
  const provider = buildProviderFromEnv();

  const modelLine = `Embedding model (stored):      ${stored.model} (${stored.dimensions} dims)`;

  if (!provider) {
    // Provider env is set to something we can't instantiate (e.g. openai)
    const note =
      aiProviderEnv !== "null" && aiProviderEnv !== "none"
        ? `${aiProviderEnv} (not supported for embedding validation)`
        : "(none — ENGRAM_AI_PROVIDER not set)";
    log.warn(
      [
        modelLine,
        `Configured provider:           ${note}`,
        "Status:  UNCONFIGURED — set ENGRAM_AI_PROVIDER=ollama or =gemini",
      ].join("\n"),
    );
    return 1;
  }

  const activeModel = provider.modelName();
  const configLine = `Configured provider model:     ${activeModel}`;

  if (stored.model !== activeModel) {
    log.warn(
      [
        modelLine,
        configLine,
        "Status:  MISMATCH — run  engram embed --reindex  to rebuild",
      ].join("\n"),
    );
    return 2;
  }

  let reachLine = "";
  if (opts.verify) {
    const ollamaEndpoint =
      process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434";

    let reach: { ok: boolean; message: string } | null = null;
    if (aiProviderEnv === "ollama") {
      reach = await checkOllama(ollamaEndpoint, stored.model);
    } else if (aiProviderEnv === "gemini") {
      reach = await checkGoogle(
        process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      );
    } else if (aiProviderEnv === "openai") {
      reach = await checkOpenAI(process.env.OPENAI_API_KEY);
    }

    if (reach) {
      reachLine = `\nProvider reachability:         ${reach.ok ? `✓ ${reach.message}` : `✗ ${reach.message}`}`;
    }
  }

  log.info(
    [
      modelLine,
      configLine,
      `Status:  OK — stored model matches configured model${reachLine}`,
    ].join("\n"),
  );
  return 0;
}

async function runEnable(
  graph: ReturnType<typeof openGraph>,
  opts: EmbedOpts,
): Promise<number> {
  if (!opts.model) {
    log.error(
      "--enable requires --model <id>.\nExample: engram embed --enable --model nomic-embed-text",
    );
    return 1;
  }

  const stored = getEmbeddingModel(graph);
  if (stored && stored.model !== "none") {
    log.error(
      `This database already uses ${stored.model} (${stored.dimensions} dims).\n` +
        "Use --reindex to rebuild the index with a different model.",
    );
    return 1;
  }

  let provider: AIProvider;
  try {
    provider = buildProvider(opts.model, opts.provider);
  } catch (err) {
    log.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  if (opts.verify) {
    const s = spinner();
    s.start("Checking provider reachability…");
    const inferredProvider = opts.provider ?? inferProviderName(opts.model);
    const ollamaEndpoint =
      process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434";

    let reach: { ok: boolean; message: string; hint?: string } | null = null;
    if (inferredProvider === "ollama") {
      reach = await checkOllama(ollamaEndpoint, opts.model);
    } else if (inferredProvider === "gemini") {
      reach = await checkGoogle(
        process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      );
    } else if (inferredProvider === "openai") {
      reach = await checkOpenAI(process.env.OPENAI_API_KEY);
    }

    if (reach) {
      if (reach.ok) {
        s.stop(`Provider: ${reach.message}`);
      } else {
        s.stop(`Provider unreachable: ${reach.message}`);
        if (reach.hint) log.warn(`Hint: ${reach.hint}`);
        if (!opts.yes) {
          const cont = await confirm({
            message: "Provider unreachable. Continue anyway?",
            initialValue: false,
          });
          if (!cont || typeof cont !== "boolean") {
            log.info("Aborted.");
            return 0;
          }
        }
      }
    }
  }

  const cov = queryCoverage(graph);
  const totalItems = cov.entityTotal + cov.episodeTotal;

  log.info(
    [
      "This database was initialized without embeddings.",
      `Enable semantic search with ${opts.model}?`,
      `This will embed ${cov.entityTotal.toLocaleString()} entities and ${cov.episodeTotal.toLocaleString()} episodes (~${totalItems.toLocaleString()} provider calls).`,
    ].join("\n"),
  );

  if (!opts.yes) {
    const ok = await confirm({ message: "Continue?", initialValue: false });
    if (!ok || typeof ok !== "boolean") {
      log.info("Aborted.");
      return 0;
    }
  }

  const startMs = Date.now();
  const s = spinner();
  s.start("Embedding…");

  const result = await reindexEmbeddings(graph, provider, (p) => {
    const rate =
      p.done > 0
        ? `${(p.done / ((Date.now() - startMs) / 1000)).toFixed(0)}/s`
        : "…";
    s.message(`Embedding… ${p.done}/${p.total} (${rate})`);
  });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  s.stop(`Embedded ${result.done.toLocaleString()} items in ${elapsedSec}s`);

  if (result.errors > 0) {
    log.warn(`${result.errors} items failed — run again to retry.`);
  }

  const newModel = getEmbeddingModel(graph);
  if (newModel) {
    log.success(
      `Semantic search enabled: ${newModel.model} (${newModel.dimensions} dims)`,
    );
  }
  return 0;
}

function runStatus(
  graph: ReturnType<typeof openGraph>,
  dbPath: string,
): number {
  const stored = getEmbeddingModel(graph);
  const cov = queryCoverage(graph);

  const modelStr = stored
    ? stored.model === "none"
      ? "none (BM25 only)"
      : `${stored.model} (${stored.dimensions} dims)`
    : "(not configured)";

  const entityPct = pct(cov.entityEmbedded, cov.entityTotal);
  const episodePct = pct(cov.episodeEmbedded, cov.episodeTotal);

  log.info(
    [
      `Database:         ${dbPath}`,
      `Embedding model:  ${modelStr}`,
      `Entity coverage:  ${cov.entityEmbedded}/${cov.entityTotal} (${entityPct})`,
      `Episode coverage: ${cov.episodeEmbedded}/${cov.episodeTotal} (${episodePct})`,
    ].join("\n"),
  );
  return 0;
}

// ─── Command registration ─────────────────────────────────────────────────────

export function registerEmbed(program: Command): void {
  program
    .command("embed")
    .description(
      "Manage embeddings for semantic search. For FTS index rebuilding, see engram rebuild-index.",
    )
    .option("--reindex", "clear and rebuild the vector index")
    .option("--check", "validate stored model matches configured provider")
    .option(
      "--enable",
      "enable semantic search on a database created with --embedding-model none",
    )
    .option("--status", "show embedding coverage summary")
    .option(
      "--target <scope>",
      "reindex scope: all, entities, or episodes (default: all)",
      "all",
    )
    .option("--model <id>", "embedding model id (required for --enable)")
    .option(
      "--provider <name>",
      "override provider auto-detection: ollama, gemini",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--yes", "skip confirmation prompts")
    .option("--no-verify", "skip provider reachability check")
    .option("--limit <n>", "reindex at most N items (for testing)", Number)
    .addHelpText(
      "after",
      `
Examples:
  # Rebuild the full vector index after switching models
  engram embed --reindex

  # Rebuild only entity embeddings
  engram embed --reindex --target entities

  # Non-interactive full reindex
  engram embed --reindex --yes

  # Check whether the configured model matches the stored model
  engram embed --check

  # Enable semantic search on a database that was init'd with --embedding-model none
  engram embed --enable --model nomic-embed-text

  # Show embedding coverage without reindexing
  engram embed --status`,
    )
    .action(async (opts: EmbedOpts) => {
      const modeCount = [
        opts.reindex,
        opts.check,
        opts.enable,
        opts.status,
      ].filter(Boolean).length;
      if (modeCount === 0) {
        log.error(
          "Specify a mode: --reindex, --check, --enable, or --status\n" +
            "Run  engram embed --help  for usage.",
        );
        process.exit(1);
      }
      if (modeCount > 1) {
        log.error(
          "Only one of --reindex, --check, --enable, --status may be used at a time.",
        );
        process.exit(1);
      }

      if (
        opts.target !== "all" &&
        opts.target !== "entities" &&
        opts.target !== "episodes"
      ) {
        log.error(
          `Invalid --target "${opts.target}". Valid values: all, entities, episodes`,
        );
        process.exit(1);
      }

      intro("engram embed");

      const dbPath = path.resolve(opts.db);
      let graph: ReturnType<typeof openGraph>;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      let exitCode = 0;
      try {
        if (opts.reindex) {
          exitCode = await runReindex(graph, opts);
        } else if (opts.check) {
          exitCode = await runCheck(graph, opts);
        } else if (opts.enable) {
          exitCode = await runEnable(graph, opts);
        } else if (opts.status) {
          exitCode = runStatus(graph, dbPath);
        }
      } finally {
        closeGraph(graph);
      }

      if (exitCode === 0) {
        outro("Done");
      }
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}
