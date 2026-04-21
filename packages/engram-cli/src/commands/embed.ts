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
  OllamaProvider,
  openGraph,
  reindexEmbeddings,
  resolveDbPath,
} from "engram-core";

type ReindexTarget = "all" | "entities" | "episodes";

interface EmbedOpts {
  reindex?: boolean;
  fill?: boolean;
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
  json?: boolean;
  j?: boolean;
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

function buildProviderFromEnv(storedModel?: string): AIProvider | null {
  const explicit = process.env.ENGRAM_AI_PROVIDER;

  if (explicit === "ollama") {
    return new OllamaProvider({
      embedModel: storedModel,
      baseUrl: process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434",
    });
  }
  if (explicit === "gemini") {
    return new GeminiProvider({
      embedModel: storedModel,
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    });
  }

  // Auto-detect: infer provider from stored model, then validate credentials exist.
  const inferred = storedModel ? inferProviderName(storedModel) : null;

  if (
    inferred === "gemini" &&
    (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  ) {
    return new GeminiProvider({
      embedModel: storedModel,
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    });
  }
  if (inferred === "ollama") {
    return new OllamaProvider({
      embedModel: storedModel,
      baseUrl: process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434",
    });
  }

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
  gapOnly = false,
): Promise<number> {
  const stored = getEmbeddingModel(graph);
  const provider = buildProviderFromEnv(stored?.model);
  if (!provider) {
    log.error(
      "No embedding provider configured.\n" +
        "Set ENGRAM_AI_PROVIDER=gemini (or ollama), or set GEMINI_API_KEY / GOOGLE_API_KEY.\n" +
        "Or use --enable --model <id> to configure a model first.",
    );
    return 1;
  }

  const activeModel = provider.modelName();
  const counts = countEmbeddings(graph);
  const target = opts.target ?? "all";
  const targetLabel = target === "all" ? "entities + episodes" : target;

  if (gapOnly) {
    log.info(
      [
        "Filling embedding gaps (existing embeddings are preserved):",
        `  Target:    ${targetLabel}`,
        `  Model:     ${activeModel}`,
        `  Indexed:   ${counts.entities} entities, ${counts.episodes} episodes`,
      ].join("\n"),
    );
  } else {
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
  }

  if (!opts.yes && !opts.json) {
    const message = gapOnly
      ? `Embed missing ${targetLabel} with ${activeModel}?`
      : `Rebuild the ${targetLabel} vector index with ${activeModel}?`;
    const ok = await confirm({ message, initialValue: false });
    if (!ok || typeof ok !== "boolean") {
      log.info("Aborted.");
      return 0;
    }
  }

  const startMs = Date.now();
  const s = opts.json ? undefined : spinner();
  const verb = gapOnly ? "Filling gaps" : "Reindexing";
  if (s) s.start(`${verb}…`);

  const result = await reindexEmbeddings(
    graph,
    provider,
    (p) => {
      if (!s) return;
      const rate =
        p.done > 0
          ? `${(p.done / ((Date.now() - startMs) / 1000)).toFixed(0)}/s`
          : "…";
      s.message(`${verb}… ${p.done}/${p.total} (${rate})`);
    },
    target,
    gapOnly,
  );

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);

  if (gapOnly && result.total === 0) {
    if (s) s.stop("Coverage is already complete — nothing to fill.");
    if (opts.json) {
      const newModel = getEmbeddingModel(graph);
      console.log(
        JSON.stringify(
          {
            mode: "fill",
            done: 0,
            total: 0,
            errors: 0,
            elapsed: 0,
            model: newModel?.model ?? null,
            dimensions: newModel?.dimensions ?? null,
            alreadyComplete: true,
          },
          null,
          2,
        ),
      );
    }
    return 0;
  }

  const rate = (
    result.done / Math.max(1, (Date.now() - startMs) / 1000)
  ).toFixed(1);

  if (s)
    s.stop(
      `${gapOnly ? "Filled" : "Reindexed"} ${result.done.toLocaleString()} items in ${elapsedSec}s (${rate} items/s)`,
    );

  if (result.errors > 0 && !opts.json) {
    log.warn(`${result.errors} items failed — run again to retry.`);
  }

  const newModel = getEmbeddingModel(graph);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          mode: gapOnly ? "fill" : "reindex",
          done: result.done,
          errors: result.errors,
          elapsed: parseFloat(elapsedSec),
          model: newModel?.model ?? null,
          dimensions: newModel?.dimensions ?? null,
        },
        null,
        2,
      ),
    );
  } else if (newModel) {
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
    if (opts.json) {
      console.log(
        JSON.stringify(
          { mode: "check", ok: false, exitCode: 1, status: "unconfigured" },
          null,
          2,
        ),
      );
    } else {
      log.warn("Embedding model not configured — semantic search is disabled.");
    }
    return 1;
  }

  const aiProviderEnv = process.env.ENGRAM_AI_PROVIDER ?? "null";
  const provider = buildProviderFromEnv(stored.model);

  const modelLine = `Embedding model (stored):      ${stored.model} (${stored.dimensions} dims)`;

  if (!provider) {
    const note =
      aiProviderEnv !== "null" && aiProviderEnv !== "none"
        ? `${aiProviderEnv} (not supported for embedding validation)`
        : "(none — ENGRAM_AI_PROVIDER not set)";
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            mode: "check",
            ok: false,
            exitCode: 1,
            status: "unconfigured",
            storedModel: stored.model,
            storedDimensions: stored.dimensions,
            configuredProvider: note,
          },
          null,
          2,
        ),
      );
    } else {
      log.warn(
        [
          modelLine,
          `Configured provider:           ${note}`,
          "Status:  UNCONFIGURED — set ENGRAM_AI_PROVIDER=ollama or =gemini",
        ].join("\n"),
      );
    }
    return 1;
  }

  const activeModel = provider.modelName();
  const configLine = `Configured provider model:     ${activeModel}`;

  if (stored.model !== activeModel) {
    if (opts.json) {
      console.log(
        JSON.stringify(
          {
            mode: "check",
            ok: false,
            exitCode: 2,
            status: "mismatch",
            storedModel: stored.model,
            storedDimensions: stored.dimensions,
            configuredModel: activeModel,
          },
          null,
          2,
        ),
      );
    } else {
      log.warn(
        [
          modelLine,
          configLine,
          "Status:  MISMATCH — run  engram embed --reindex  to rebuild",
        ].join("\n"),
      );
    }
    return 2;
  }

  let reach: { ok: boolean; message: string } | null = null;
  if (opts.verify) {
    const ollamaEndpoint =
      process.env.ENGRAM_OLLAMA_ENDPOINT ?? "http://localhost:11434";

    if (aiProviderEnv === "ollama") {
      reach = await checkOllama(ollamaEndpoint, stored.model);
    } else if (aiProviderEnv === "gemini") {
      reach = await checkGoogle(
        process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      );
    } else if (aiProviderEnv === "openai") {
      reach = await checkOpenAI(process.env.OPENAI_API_KEY);
    }
  }

  if (opts.json) {
    const output: Record<string, unknown> = {
      mode: "check",
      ok: true,
      exitCode: 0,
      status: "ok",
      storedModel: stored.model,
      storedDimensions: stored.dimensions,
      configuredModel: activeModel,
    };
    if (reach) output.reachability = reach;
    console.log(JSON.stringify(output, null, 2));
  } else {
    const reachLine = reach
      ? `\nProvider reachability:         ${reach.ok ? `✓ ${reach.message}` : `✗ ${reach.message}`}`
      : "";
    log.info(
      [
        modelLine,
        configLine,
        `Status:  OK — stored model matches configured model${reachLine}`,
      ].join("\n"),
    );
  }
  return 0;
}

async function runEnable(
  graph: ReturnType<typeof openGraph>,
  opts: EmbedOpts,
): Promise<number> {
  if (!opts.model) {
    log.error(
      "--enable requires --model <id>.\nExample: engram embed --enable --model mxbai-embed-large",
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

  if (!opts.yes && !opts.json) {
    const ok = await confirm({ message: "Continue?", initialValue: false });
    if (!ok || typeof ok !== "boolean") {
      log.info("Aborted.");
      return 0;
    }
  }

  const startMs = Date.now();
  const s = opts.json ? undefined : spinner();
  if (s) s.start("Embedding…");

  const result = await reindexEmbeddings(graph, provider, (p) => {
    if (!s) return;
    const rate =
      p.done > 0
        ? `${(p.done / ((Date.now() - startMs) / 1000)).toFixed(0)}/s`
        : "…";
    s.message(`Embedding… ${p.done}/${p.total} (${rate})`);
  });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  if (s)
    s.stop(`Embedded ${result.done.toLocaleString()} items in ${elapsedSec}s`);

  if (result.errors > 0 && !opts.json) {
    log.warn(`${result.errors} items failed — run again to retry.`);
  }

  const newModel = getEmbeddingModel(graph);
  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          mode: "enable",
          done: result.done,
          errors: result.errors,
          elapsed: parseFloat(elapsedSec),
          model: newModel?.model ?? null,
          dimensions: newModel?.dimensions ?? null,
        },
        null,
        2,
      ),
    );
  } else if (newModel) {
    log.success(
      `Semantic search enabled: ${newModel.model} (${newModel.dimensions} dims)`,
    );
  }
  return 0;
}

function runStatus(
  graph: ReturnType<typeof openGraph>,
  dbPath: string,
  json?: boolean,
): number {
  const stored = getEmbeddingModel(graph);
  const cov = queryCoverage(graph);

  if (json) {
    const pctNum = (n: number, d: number) =>
      d === 0 ? 0 : Math.round((n / d) * 100);
    console.log(
      JSON.stringify(
        {
          mode: "status",
          db: dbPath,
          model: stored?.model ?? null,
          dimensions: stored?.dimensions ?? null,
          entityCoverage: {
            embedded: cov.entityEmbedded,
            total: cov.entityTotal,
            pct: pctNum(cov.entityEmbedded, cov.entityTotal),
          },
          episodeCoverage: {
            embedded: cov.episodeEmbedded,
            total: cov.episodeTotal,
            pct: pctNum(cov.episodeEmbedded, cov.episodeTotal),
          },
        },
        null,
        2,
      ),
    );
    return 0;
  }

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
      "Manage embeddings for semantic search. With no flags, shows coverage status. For FTS index rebuilding, see engram rebuild-index.",
    )
    .option("--reindex", "clear and rebuild the vector index")
    .option(
      "--fill",
      "embed only items missing an embedding (preserves existing index)",
    )
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
    .option("--limit <n>", "reindex at most N items (for testing only)", Number)
    .option("--json", "emit JSON output")
    .option("-j", "shorthand for --json")
    .addHelpText(
      "after",
      `
Examples:
  # Fill only the coverage gap (safe to run anytime, idempotent)
  engram embed --fill

  # Fill only missing entity embeddings
  engram embed --fill --target entities

  # Rebuild the full vector index after switching models
  engram embed --reindex

  # Rebuild only entity embeddings
  engram embed --reindex --target entities

  # Non-interactive full reindex
  engram embed --reindex --yes

  # Check whether the configured model matches the stored model
  engram embed --check

  # Enable semantic search on a database that was init'd with --embedding-model none
  engram embed --enable --model mxbai-embed-large

  # Show embedding coverage without reindexing
  engram embed --status

  # Machine-readable output (for scripting and agents)
  engram embed --status --json
  engram embed --check --json

Exit codes (--check):
  0   stored model matches configured provider
  1   model not configured or provider unrecognised
  2   stored model does not match configured model (run --reindex to fix)`,
    )
    .action(async (opts: EmbedOpts) => {
      if (opts.j) opts.json = true;
      if (!opts.json) intro("engram embed");

      const modeCount = [
        opts.reindex,
        opts.fill,
        opts.check,
        opts.enable,
        opts.status,
      ].filter(Boolean).length;
      if (modeCount === 0) {
        opts.status = true;
      }
      if (modeCount > 1) {
        log.error(
          "Only one of --reindex, --fill, --check, --enable, --status may be used at a time.",
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

      const dbPath = resolveDbPath(path.resolve(opts.db));
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
        } else if (opts.fill) {
          exitCode = await runReindex(graph, opts, true);
        } else if (opts.check) {
          exitCode = await runCheck(graph, opts);
        } else if (opts.enable) {
          exitCode = await runEnable(graph, opts);
        } else if (opts.status) {
          exitCode = runStatus(graph, dbPath, opts.json);
        }
      } finally {
        closeGraph(graph);
      }

      if (exitCode === 0 && !opts.json) {
        outro("Done");
      }
      if (exitCode !== 0) {
        process.exit(exitCode);
      }
    });
}
