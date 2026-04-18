import * as fs from "node:fs";
import * as path from "node:path";
import {
  confirm,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { Command } from "commander";
import type { AIProvider } from "engram-core";
import {
  checkGoogle,
  checkOllama,
  checkOpenAI,
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
import {
  appendCompanionToFiles,
  type CompanionSummary,
  detectGitHubRemote,
  detectHarnessFiles,
  type GitHubEnrichSummary,
  type HarnessFile,
  runGitHubEnrich,
} from "./init-pipeline.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "mxbai-embed-large": 1024,
  "text-embedding-3-small": 1536,
  "gemini-embedding-2-preview": 3072,
};

const KNOWN_EMBEDDING_MODELS = new Set(Object.keys(EMBEDDING_DIMENSIONS));
KNOWN_EMBEDDING_MODELS.add("none");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InitOpts {
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
// Utility helpers
// ---------------------------------------------------------------------------

function cancelAndExit(): never {
  log.error("Cancelled.");
  process.exit(1);
}

function assertNotCancel<T>(val: T | symbol): T {
  if (isCancel(val)) cancelAndExit();
  return val as T;
}

/**
 * Prepare the directory for a new engram database:
 *  - Creates the directory at `dbDir` if it doesn't already exist.
 *  - Appends `<dirName>/` to the nearest `.gitignore` when that pattern isn't
 *    already present, and only when dbDir is inside cwd.
 */
function prepareDbDirectory(dbDir: string): void {
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

function buildProvider(
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

async function runMarkdownIngest(
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

async function runSourceIngest(
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

async function runEmbed(
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
// Interactive mode
// ---------------------------------------------------------------------------

async function runInteractive(opts: InitOpts): Promise<void> {
  intro("engram init");

  const rawDb = assertNotCancel(
    await text({
      message: "Database path",
      placeholder: ".engram",
      defaultValue: ".engram",
      initialValue: opts.db !== ".engram" ? opts.db : undefined,
    }),
  );
  const rawDbPath = path.resolve(rawDb as string);
  const dbPath = resolveDbPath(rawDbPath);

  if (fs.existsSync(dbPath)) {
    log.error(
      `File already exists: ${dbPath}\nUse a different --db path or remove it with:  rm ${dbPath}`,
    );
    process.exit(1);
  }

  prepareDbDirectory(path.dirname(dbPath));

  // Step 1 — Git ingest
  const ingestChoice = assertNotCancel(
    await select({
      message: "Ingest git history",
      options: [
        { value: "git", label: "Current git repository (recommended)" },
        { value: "git-other", label: "A different path" },
        { value: "skip", label: "Skip" },
      ],
    }),
  ) as string;

  let ingestPath: string = path.resolve(".");
  if (ingestChoice === "git-other") {
    const rawPath = assertNotCancel(
      await text({ message: "Repository path", placeholder: "/path/to/repo" }),
    );
    ingestPath = path.resolve(rawPath as string);
  }

  // Step 2 — Enrichment selection
  const repoPath = ingestChoice !== "skip" ? ingestPath : path.resolve(".");
  const { repo: detectedRepo, hint: remoteHint } = detectGitHubRemote(repoPath);
  const githubToken = process.env.GITHUB_TOKEN;
  let githubRepo: string | null = null;

  if (githubToken && detectedRepo) {
    const doEnrich = assertNotCancel(
      await confirm({
        message: `Enrich with GitHub PRs/issues from ${detectedRepo}?`,
        initialValue: true,
      }),
    ) as boolean;
    if (doEnrich) githubRepo = detectedRepo;
  } else if (!githubToken) {
    log.info(
      "GitHub enrichment: GITHUB_TOKEN not set — skipping. Set it to enable PR/issue enrichment.",
    );
  } else if (remoteHint) {
    log.info(`GitHub enrichment: ${remoteHint}`);
  }

  // Embedding model
  const embeddingChoice = assertNotCancel(
    await select({
      message: "Embedding model",
      options: [
        {
          value: "mxbai-embed-large",
          label: "mxbai-embed-large — Ollama (recommended, local, 1024 dims)",
        },
        {
          value: "text-embedding-3-small",
          label: "text-embedding-3-small — OpenAI (1536 dims)",
        },
        {
          value: "gemini-embedding-2-preview",
          label: "gemini-embedding-2-preview — Google (3072 dims)",
        },
        { value: "none", label: "none — BM25 full-text search only" },
      ],
    }),
  ) as string;

  let ollamaEndpoint = opts.ollamaEndpoint;

  if (embeddingChoice === "mxbai-embed-large") {
    const rawEndpoint = assertNotCancel(
      await text({
        message: "Ollama endpoint",
        placeholder: "http://localhost:11434",
        defaultValue: "http://localhost:11434",
        initialValue:
          opts.ollamaEndpoint !== "http://localhost:11434"
            ? opts.ollamaEndpoint
            : undefined,
      }),
    );
    ollamaEndpoint = rawEndpoint as string;
    if (opts.verify) {
      const s = spinner();
      s.start("Checking Ollama reachability…");
      const reach = await checkOllama(ollamaEndpoint, "mxbai-embed-large");
      if (reach.ok) {
        s.stop(`Ollama: ${reach.message}`);
      } else {
        s.stop(`Ollama unreachable: ${reach.message}`);
        if (reach.hint) log.warn(`Hint: ${reach.hint}`);
        log.warn("Continuing anyway — you can fix this later.");
      }
    }
  } else if (embeddingChoice === "text-embedding-3-small" && opts.verify) {
    const s = spinner();
    s.start("Checking OpenAI API key…");
    const reach = await checkOpenAI(process.env.OPENAI_API_KEY);
    reach.ok
      ? s.stop(`OpenAI: ${reach.message}`)
      : s.stop(`OpenAI key check failed: ${reach.message}`);
    if (!reach.ok) {
      if (reach.hint) log.warn(`Hint: ${reach.hint}`);
      log.warn("Continuing anyway — set the key before running embeddings.");
    }
  } else if (embeddingChoice === "gemini-embedding-2-preview" && opts.verify) {
    const s = spinner();
    s.start("Checking Google API key…");
    const reach = await checkGoogle(
      process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    );
    reach.ok
      ? s.stop(`Google: ${reach.message}`)
      : s.stop(`Google key check failed: ${reach.message}`);
    if (!reach.ok) {
      if (reach.hint) log.warn(`Hint: ${reach.hint}`);
      log.warn("Continuing anyway — set the key before running embeddings.");
    }
  }

  const _generatorChoice = assertNotCancel(
    await select({
      message: "Generation model (for engram project/reconcile)",
      options: [
        { value: "none", label: "none for now" },
        {
          value: "gemini-3-flash-preview",
          label: "gemini-3-flash-preview — Google (set GEMINI_API_KEY)",
        },
        {
          value: "claude-haiku-4-5-20251001",
          label: "claude-haiku-4-5 — Anthropic (set ANTHROPIC_API_KEY)",
        },
        { value: "ollama", label: "ollama/<model> — local Ollama" },
      ],
    }),
  );

  // Markdown docs
  const mdRaw = assertNotCancel(
    await text({
      message:
        "Ingest markdown docs? (path to docs dir, or leave blank to skip)",
      placeholder: "docs/",
      defaultValue: "",
    }),
  ) as string;
  const mdPath = mdRaw.trim();

  // Step 3 — Source ingest (always offered)
  const doSource = assertNotCancel(
    await confirm({ message: "Ingest source code?", initialValue: true }),
  ) as boolean;

  // Step 4 — Companion setup
  const cwd = process.cwd();
  const detectedHarnesses = detectHarnessFiles(cwd);
  let companionFiles: HarnessFile[] = [];
  if (detectedHarnesses.length > 0) {
    const fileList = detectedHarnesses.map((h) => h.file).join(", ");
    const doCompanion = assertNotCancel(
      await confirm({
        message: `Append engram context guide to: ${fileList}?`,
        initialValue: true,
      }),
    ) as boolean;
    if (doCompanion) companionFiles = detectedHarnesses;
  } else {
    log.info(
      "No agent harness files found (CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules).",
    );
    log.info(
      "Run  engram companion --harness <name> >> <file>  to add one later.",
    );
  }

  // Step 5 — Embeddings
  const provider = buildProvider(embeddingChoice, ollamaEndpoint);
  const canEmbed = provider !== null;
  let doEmbed = false;
  if (canEmbed) {
    doEmbed = assertNotCancel(
      await confirm({
        message: "Generate embeddings now? (recommended, takes a few minutes)",
        initialValue: true,
      }),
    ) as boolean;
  }

  // ── Execute ──────────────────────────────────────────────────────────────

  const graph = createGraph(dbPath);
  log.success(`Created ${dbPath}`);

  if (embeddingChoice === "none") {
    graph.db
      .prepare(
        "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run("embedding_model", "none");
  } else {
    const dims = EMBEDDING_DIMENSIONS[embeddingChoice] ?? 0;
    setEmbeddingModel(graph, embeddingChoice, dims);
  }

  // Step 1 execute
  if (ingestChoice === "git" || ingestChoice === "git-other") {
    log.info(`Ingesting git repository at ${ingestPath}…`);
    try {
      const result = await ingestGitRepo(graph, ingestPath);
      log.success(
        [
          "Git ingestion complete",
          `  Episodes: ${result.episodesCreated} created, ${result.episodesSkipped} skipped`,
          `  Entities: ${result.entitiesCreated} created`,
          `  Edges:    ${result.edgesCreated} created`,
        ].join("\n"),
      );
    } catch (err) {
      log.error(
        `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      closeGraph(graph);
      process.exit(1);
    }
  }

  // Step 2 execute — enrichment
  if (githubRepo && githubToken) {
    await runGitHubEnrich(graph, githubRepo, githubToken);
  }

  if (mdPath) await runMarkdownIngest(graph, mdPath);

  // Step 3 execute — source
  if (doSource) await runSourceIngest(graph, cwd);

  // Step 4 execute — companion
  if (companionFiles.length > 0) {
    const summary = appendCompanionToFiles(cwd, companionFiles);
    const appended = summary.appended.concat(summary.created);
    if (appended.length > 0)
      log.success(`Companion guide appended to: ${appended.join(", ")}`);
    if (summary.skipped.length > 0)
      log.info(`Companion already present in: ${summary.skipped.join(", ")}`);
  }

  // Step 5 execute — embed
  if (doEmbed && provider) await runEmbed(graph, provider);

  closeGraph(graph);

  const nextSteps: string[] = [];
  if (!doEmbed && canEmbed)
    nextSteps.push("  engram embed --reindex   # generate vector embeddings");
  nextSteps.push(`  engram context "your query here" --db ${dbPath}`);
  if (detectedHarnesses.length === 0)
    nextSteps.push("  engram companion >> CLAUDE.md");

  outro(["Done!", ...nextSteps].join("\n"));
}

// ---------------------------------------------------------------------------
// Non-interactive (--yes) mode
// ---------------------------------------------------------------------------

async function runNonInteractive(opts: InitOpts): Promise<void> {
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
      process.exit(1);
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
    process.stdout.write(JSON.stringify(jsonOut, null, 2) + "\n");
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

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Create a new .engram knowledge graph database")
    .addHelpText(
      "after",
      `
Examples:
  # Interactive full setup (recommended)
  engram init

  # Non-interactive, BM25 only, useful in CI
  engram init --yes --embedding-model none --db .engram

  # Non-interactive with full ingestion and embeddings
  engram init --yes --from-git . --ingest-md docs/ --embed \\
    --embedding-model gemini-embedding-2-preview

  # Non-interactive with JSON output (for CI/scripting)
  engram init --yes --from-git . --format json

See also:
  engram ingest git     re-ingest or update git history
  engram ingest md      ingest additional markdown files
  engram ingest source  ingest source code symbols
  engram embed          manage and rebuild vector embeddings
  engram companion      write agent harness companion prompt`,
    )
    .option("--db <path>", "path for the .engram file", ".engram")
    .option("--from-git <path>", "ingest a git repository after creating")
    .option(
      "--ingest-md <path>",
      "ingest markdown docs from this directory/glob",
    )
    .option(
      "--ingest-source",
      "ingest source code symbols (deprecated: now always runs in --yes)",
      false,
    )
    .option("--embed", "generate vector embeddings after ingestion", false)
    .option("--embedding-model <id|none>", "embedding model to use")
    .option(
      "--embedding-provider <ollama|openai|google>",
      "override embedding provider",
    )
    .option(
      "--ollama-endpoint <url>",
      "Ollama endpoint URL",
      "http://localhost:11434",
    )
    .option(
      "--github-repo <owner/repo>",
      "GitHub repo for enrichment (auto-detected from git remote when GITHUB_TOKEN is set)",
    )
    .option("--yes", "skip all prompts (non-interactive)", false)
    .option("--no-verify", "skip reachability check")
    .option("-j, --format <format>", "output format (json)")
    .action(async (opts: InitOpts) => {
      if (opts.yes) {
        await runNonInteractive(opts);
      } else {
        await runInteractive(opts);
      }
    });
}
