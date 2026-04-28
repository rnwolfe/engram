/**
 * init-runners.ts — Shared helpers and runNonInteractive() for `engram init`.
 *
 * Extracted from init.ts to keep each file under 500 lines.
 *
 * Exports:
 *  - InitOpts, EMBEDDING_DIMENSIONS, KNOWN_EMBEDDING_MODELS (shared types/consts)
 *  - prepareDbDirectory, buildProvider (shared utility helpers)
 *  - runMarkdownIngest, runSourceIngest, runEmbed (step runners used by both modes)
 *  - runNonInteractive (the --yes pipeline)
 *
 * Interactive mode lives in init-interactive.ts.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log, spinner } from "@clack/prompts";
import type { AIProvider } from "engram-core";
import {
  closeGraph,
  createGraph,
  GeminiProvider,
  ingestGitRepo,
  ingestMarkdown,
  ingestSource,
  OllamaProvider,
  reindexEmbeddings,
  resolveDbPath,
  setEmbeddingModel,
} from "engram-core";
import type { CompanionSummary, GitHubEnrichSummary } from "./init-pipeline.js";
import {
  appendCompanionToFiles,
  detectGitHubRemote,
  detectHarnessFiles,
  runGitHubEnrich,
} from "./init-pipeline.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InitOpts {
  fromGit?: string;
  db: string;
  embeddingModel?: string;
  embeddingProvider?: string;
  ollamaEndpoint: string;
  yes: boolean;
  verify: boolean;
  ingestMd?: string;
  ingestSource?: boolean;
  embed?: boolean;
  format?: string;
  githubRepo?: string;
}

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "mxbai-embed-large": 1024,
  "text-embedding-3-small": 1536,
  "gemini-embedding-2-preview": 3072,
};

export const KNOWN_EMBEDDING_MODELS = new Set(
  Object.keys(EMBEDDING_DIMENSIONS),
);
KNOWN_EMBEDDING_MODELS.add("none");

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/**
 * Prepare the directory for a new engram database:
 *  - Creates the directory at `dbDir` if it doesn't already exist.
 *  - Appends `<dirName>/` to the nearest `.gitignore` when that pattern isn't
 *    already present, and only when dbDir is inside cwd.
 */
export function prepareDbDirectory(dbDir: string): void {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const cwd = process.cwd();
  if (!dbDir.startsWith(cwd + path.sep) && dbDir !== cwd) return;

  const gitignorePath = path.join(cwd, ".gitignore");
  const dirName = path.basename(dbDir);
  const gitignoreEntry = `${dirName}/`;

  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, "utf8");
    const lines = content.split("\n").map((l) => l.trim());
    const alreadyIgnored =
      lines.includes(gitignoreEntry) || lines.includes(dirName);
    if (!alreadyIgnored) {
      const suffix = content.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(gitignorePath, `${suffix}${gitignoreEntry}\n`);
    }
  }
}

export function buildProvider(
  embeddingModel: string,
  ollamaEndpoint: string,
): AIProvider | null {
  if (embeddingModel === "none") return null;
  if (
    embeddingModel.startsWith("mxbai-") ||
    embeddingModel.startsWith("nomic-") ||
    embeddingModel.startsWith("all-minilm")
  ) {
    return new OllamaProvider({
      embedModel: embeddingModel,
      baseUrl: ollamaEndpoint,
    });
  }
  if (embeddingModel.startsWith("gemini-")) {
    const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;
    return new GeminiProvider({ embedModel: embeddingModel, apiKey });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step runners (shared between interactive and non-interactive)
// ---------------------------------------------------------------------------

export async function runMarkdownIngest(
  graph: ReturnType<typeof createGraph>,
  mdPath: string,
): Promise<{ episodesCreated: number; episodesSkipped: number } | null> {
  const s = spinner();
  s.start(`Ingesting markdown: ${mdPath}`);
  try {
    const result = await ingestMarkdown(graph, mdPath);
    s.stop(
      `Markdown ingestion complete — ${result.episodesCreated} episodes created, ${result.episodesSkipped} skipped`,
    );
    return {
      episodesCreated: result.episodesCreated,
      episodesSkipped: result.episodesSkipped,
    };
  } catch (err) {
    s.stop(
      `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function runSourceIngest(
  graph: ReturnType<typeof createGraph>,
  root: string,
): Promise<{
  filesParsed: number;
  filesSkipped: number;
  entitiesCreated: number;
  edgesCreated: number;
} | null> {
  const s = spinner();
  s.start("Ingesting source code…");
  try {
    const result = await ingestSource(graph, { root });
    s.stop(
      [
        "Source ingestion complete",
        `  Files: ${result.filesParsed} parsed, ${result.filesSkipped} skipped`,
        `  Entities: ${result.entitiesCreated} created`,
        `  Edges:    ${result.edgesCreated} created`,
      ].join("\n"),
    );
    return {
      filesParsed: result.filesParsed,
      filesSkipped: result.filesSkipped,
      entitiesCreated: result.entitiesCreated,
      edgesCreated: result.edgesCreated,
    };
  } catch (err) {
    s.stop(
      `Source ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function runEmbed(
  graph: ReturnType<typeof createGraph>,
  provider: AIProvider,
): Promise<{ done: number; errors: number; elapsedS: string } | null> {
  const startMs = Date.now();
  const s = spinner();
  s.start("Generating embeddings…");
  try {
    const result = await reindexEmbeddings(graph, provider, (p) => {
      const rate =
        p.done > 0
          ? `${(p.done / ((Date.now() - startMs) / 1000)).toFixed(0)}/s`
          : "…";
      s.message(`Generating embeddings… ${p.done}/${p.total} (${rate})`);
    });
    const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
    s.stop(`Embeddings complete — ${result.done} items in ${elapsed}s`);
    if (result.errors > 0) {
      log.warn(
        `${result.errors} items failed — run  engram embed --reindex  to retry.`,
      );
    }
    return { done: result.done, errors: result.errors, elapsedS: elapsed };
  } catch (err) {
    s.stop(
      `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    log.warn("Run  engram embed --reindex  to retry.");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Non-interactive (--yes) mode
// ---------------------------------------------------------------------------

export async function runNonInteractive(opts: InitOpts): Promise<void> {
  const rawDbPath = path.resolve(opts.db);
  const dbPath = resolveDbPath(rawDbPath);

  if (fs.existsSync(dbPath)) {
    log.error(
      `File already exists: ${dbPath}\nUse a different --db path or remove it with:  rm ${dbPath}`,
    );
    process.exit(1);
  }

  prepareDbDirectory(path.dirname(dbPath));

  const embeddingModel = opts.embeddingModel ?? "mxbai-embed-large";
  if (!KNOWN_EMBEDDING_MODELS.has(embeddingModel)) {
    log.error(
      `Unknown embedding model: ${embeddingModel}\nValid values: ${[...KNOWN_EMBEDDING_MODELS].join(", ")}`,
    );
    process.exit(1);
  }

  const graph = createGraph(dbPath);

  if (embeddingModel === "none") {
    graph.db
      .prepare(
        "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run("embedding_model", "none");
  } else {
    setEmbeddingModel(
      graph,
      embeddingModel,
      EMBEDDING_DIMENSIONS[embeddingModel],
    );
  }

  type GitSummary = {
    episodesCreated: number;
    episodesSkipped: number;
    entitiesCreated: number;
    edgesCreated: number;
  };
  type MdSummary = { episodesCreated: number; episodesSkipped: number };
  type SourceSummary = {
    filesParsed: number;
    filesSkipped: number;
    entitiesCreated: number;
    edgesCreated: number;
  };
  type EmbedSummary = { done: number; errors: number; elapsedS: string };

  let gitSummary: GitSummary | null = null;
  let mdSummary: MdSummary | null = null;
  let sourceSummary: SourceSummary | null = null;
  let githubSummary: GitHubEnrichSummary | null = null;
  let companionSummary: CompanionSummary | null = null;
  let embedSummary: EmbedSummary | null = null;

  const cwd = process.cwd();

  // Step 1 — Git ingest (always runs when --from-git provided)
  if (opts.fromGit) {
    const repoPath = path.resolve(opts.fromGit);
    log.info(`Ingesting git repository at ${repoPath}…`);
    try {
      const result = await ingestGitRepo(graph, repoPath);
      log.success(
        [
          "Git ingestion complete",
          `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          `  Entities: ${result.entitiesCreated} created`,
          `  Edges:    ${result.edgesCreated} created`,
        ].join("\n"),
      );
      gitSummary = {
        episodesCreated: result.episodesCreated,
        episodesSkipped: result.episodesSkipped,
        entitiesCreated: result.entitiesCreated,
        edgesCreated: result.edgesCreated,
      };
    } catch (err) {
      log.error(
        `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      closeGraph(graph);
      process.exit(2);
    }
  }

  // Step 2 — GitHub enrichment (auto-detect when GITHUB_TOKEN is set)
  const githubToken = process.env.GITHUB_TOKEN;
  if (githubToken) {
    const repoPath = opts.fromGit ? path.resolve(opts.fromGit) : cwd;
    const explicitRepo = opts.githubRepo ?? null;
    let targetRepo = explicitRepo;

    if (!targetRepo) {
      const { repo: detected, hint } = detectGitHubRemote(repoPath);
      if (detected) {
        targetRepo = detected;
      } else {
        log.info(`GitHub enrichment skipped: ${hint}`);
      }
    }

    if (targetRepo) {
      githubSummary = await runGitHubEnrich(graph, targetRepo, githubToken);
    }
  } else {
    log.info(
      "GitHub enrichment skipped: GITHUB_TOKEN not set. Set it to enable PR/issue enrichment.",
    );
  }

  if (opts.ingestMd) {
    mdSummary = await runMarkdownIngest(graph, opts.ingestMd);
  }

  // Step 3 — Source ingest (always runs)
  sourceSummary = await runSourceIngest(graph, cwd);

  // Step 4 — Companion setup (append to detected harness files)
  const detectedHarnesses = detectHarnessFiles(cwd);
  if (detectedHarnesses.length > 0) {
    companionSummary = appendCompanionToFiles(cwd, detectedHarnesses);
    const appended = companionSummary.appended.concat(companionSummary.created);
    if (appended.length > 0)
      log.success(`Companion guide appended to: ${appended.join(", ")}`);
    if (companionSummary.skipped.length > 0) {
      log.info(
        `Companion already present in: ${companionSummary.skipped.join(", ")}`,
      );
    }
  } else {
    log.info(
      "No harness files found (CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules) — companion setup skipped.",
    );
  }

  // Step 5 — Embed
  if (opts.embed) {
    const ollamaEndpoint =
      process.env.ENGRAM_OLLAMA_ENDPOINT ?? opts.ollamaEndpoint;
    const provider = buildProvider(embeddingModel, ollamaEndpoint);
    if (!provider) {
      log.warn(
        `Cannot embed: no provider available for model ${embeddingModel}. ` +
          "Set GEMINI_API_KEY, OPENAI_API_KEY, or ensure Ollama is running.",
      );
    } else {
      embedSummary = await runEmbed(graph, provider);
    }
  }

  closeGraph(graph);

  const isJsonMode = opts.format === "json";

  if (isJsonMode) {
    const jsonOut = {
      git: gitSummary
        ? { episodes: gitSummary.episodesCreated }
        : { skipped: true },
      enrichment: githubSummary
        ? {
            github: { prs: githubSummary.prs, issues: githubSummary.issues },
            skipped: [],
          }
        : { skipped: ["github"] },
      source: sourceSummary
        ? {
            files: sourceSummary.filesParsed,
            symbols: sourceSummary.entitiesCreated,
          }
        : { skipped: true },
      companion: companionSummary ?? { appended: [], created: [], skipped: [] },
      embed: embedSummary ? { embedded: embedSummary.done } : { skipped: true },
    };
    process.stdout.write(`${JSON.stringify(jsonOut, null, 2)}\n`);
    return;
  }

  const summaryLines: string[] = [`✓ Created ${dbPath}`, ""];
  if (gitSummary) {
    summaryLines.push(
      `  Git ingestion:    ${gitSummary.episodesCreated} episodes, ` +
        `${gitSummary.entitiesCreated} entities, ${gitSummary.edgesCreated} edges` +
        (gitSummary.episodesSkipped > 0
          ? ` (${gitSummary.episodesSkipped} skipped)`
          : ""),
    );
  }
  if (githubSummary) {
    summaryLines.push(
      `  GitHub enrichment: ${githubSummary.prs} PRs, ${githubSummary.issues} issues`,
    );
  }
  if (mdSummary) {
    summaryLines.push(
      `  Markdown:         ${mdSummary.episodesCreated} episodes created` +
        (mdSummary.episodesSkipped > 0
          ? `, ${mdSummary.episodesSkipped} skipped`
          : ""),
    );
  }
  if (sourceSummary) {
    summaryLines.push(
      `  Source ingestion: ${sourceSummary.entitiesCreated} entities, ` +
        `${sourceSummary.edgesCreated} edges (${sourceSummary.filesParsed} files parsed)`,
    );
  }
  if (companionSummary) {
    const appended = companionSummary.appended.concat(companionSummary.created);
    if (appended.length > 0) {
      summaryLines.push(
        `  Companion:        appended to ${appended.join(", ")}`,
      );
    }
  }
  if (embedSummary) {
    summaryLines.push(
      `  Embeddings:       ${embedSummary.done} items indexed in ${embedSummary.elapsedS}s`,
    );
  }

  const hasStats =
    gitSummary !== null ||
    mdSummary !== null ||
    sourceSummary !== null ||
    embedSummary !== null;
  if (hasStats) summaryLines.push("");

  summaryLines.push("Next steps:");
  summaryLines.push(`  engram context "your query" --db ${dbPath}`);
  if (
    !companionSummary ||
    (companionSummary.appended.length === 0 &&
      companionSummary.created.length === 0)
  ) {
    summaryLines.push("  engram companion >> CLAUDE.md");
  }

  log.success(summaryLines.join("\n"));
}
