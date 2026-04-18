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
  setEmbeddingModel,
} from "engram-core";

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "mxbai-embed-large": 1024,
  "text-embedding-3-small": 1536,
  "gemini-embedding-2-preview": 3072,
};

const KNOWN_EMBEDDING_MODELS = new Set(Object.keys(EMBEDDING_DIMENSIONS));
KNOWN_EMBEDDING_MODELS.add("none");

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
}

function cancelAndExit(): never {
  log.error("Cancelled.");
  process.exit(1);
}

function assertNotCancel<T>(val: T | symbol): T {
  if (isCancel(val)) cancelAndExit();
  return val as T;
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
  if (embeddingModel.startsWith("text-embedding-")) {
    // OpenAI — not yet wired for embeddings in init
    return null;
  }
  return null;
}

async function runMarkdownIngest(
  graph: ReturnType<typeof createGraph>,
  mdPath: string,
): Promise<void> {
  const s = spinner();
  s.start(`Ingesting markdown: ${mdPath}`);
  try {
    const result = await ingestMarkdown(graph, mdPath);
    s.stop(
      `Markdown ingestion complete — ${result.episodesCreated} episodes created, ${result.episodesSkipped} skipped`,
    );
  } catch (err) {
    s.stop(
      `Markdown ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function runSourceIngest(
  graph: ReturnType<typeof createGraph>,
  root: string,
): Promise<void> {
  const s = spinner();
  s.start("Ingesting source code…");
  try {
    const result = await ingestSource(graph, { root });
    s.stop(
      [
        "Source ingestion complete",
        `  Files: ${result.parsed} parsed, ${result.skipped} skipped`,
        `  Entities: ${result.entitiesCreated} created`,
        `  Edges:    ${result.edgesCreated} created`,
      ].join("\n"),
    );
  } catch (err) {
    s.stop(
      `Source ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function runEmbed(
  graph: ReturnType<typeof createGraph>,
  provider: AIProvider,
): Promise<void> {
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
  } catch (err) {
    s.stop(
      `Embedding failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    log.warn("Run  engram embed --reindex  to retry.");
  }
}

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
  const dbPath = path.resolve(rawDb as string);

  if (fs.existsSync(dbPath)) {
    log.error(
      `File already exists: ${dbPath}\nUse a different --db path or remove it with:  rm ${dbPath}`,
    );
    process.exit(1);
  }

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
      await text({
        message: "Repository path",
        placeholder: "/path/to/repo",
      }),
    );
    ingestPath = path.resolve(rawPath as string);
  }

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
    if (reach.ok) {
      s.stop(`OpenAI: ${reach.message}`);
    } else {
      s.stop(`OpenAI key check failed: ${reach.message}`);
      if (reach.hint) log.warn(`Hint: ${reach.hint}`);
      log.warn("Continuing anyway — set the key before running embeddings.");
    }
  } else if (embeddingChoice === "gemini-embedding-2-preview" && opts.verify) {
    const s = spinner();
    s.start("Checking Google API key…");
    const reach = await checkGoogle(
      process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    );
    if (reach.ok) {
      s.stop(`Google: ${reach.message}`);
    } else {
      s.stop(`Google key check failed: ${reach.message}`);
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

  // Source code
  const doSource = assertNotCancel(
    await confirm({
      message: "Ingest source code?",
      initialValue: true,
    }),
  ) as boolean;

  // Embeddings — only offer if model was chosen and provider can be built
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
    const upsert = graph.db.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    upsert.run("embedding_model", "none");
  } else {
    const dims = EMBEDDING_DIMENSIONS[embeddingChoice] ?? 0;
    setEmbeddingModel(graph, embeddingChoice, dims);
  }

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

  if (mdPath) {
    await runMarkdownIngest(graph, mdPath);
  }

  if (doSource) {
    await runSourceIngest(graph, path.resolve("."));
  }

  if (doEmbed && provider) {
    await runEmbed(graph, provider);
  }

  closeGraph(graph);

  const nextSteps: string[] = [];
  if (!doEmbed && canEmbed) {
    nextSteps.push("  engram embed --reindex   # generate vector embeddings");
  }
  nextSteps.push(`  engram context "your query here" --db ${dbPath}`);
  nextSteps.push("  engram companion >> CLAUDE.md");

  outro(["Done!", ...nextSteps].join("\n"));
}

async function runNonInteractive(opts: InitOpts): Promise<void> {
  const dbPath = path.resolve(opts.db);

  if (fs.existsSync(dbPath)) {
    log.error(
      `File already exists: ${dbPath}\nUse a different --db path or remove it with:  rm ${dbPath}`,
    );
    process.exit(1);
  }

  const embeddingModel = opts.embeddingModel ?? "mxbai-embed-large";

  if (!KNOWN_EMBEDDING_MODELS.has(embeddingModel)) {
    log.error(
      `Unknown embedding model: ${embeddingModel}\nValid values: ${[...KNOWN_EMBEDDING_MODELS].join(", ")}`,
    );
    process.exit(1);
  }

  const graph = createGraph(dbPath);

  if (embeddingModel === "none") {
    const upsert = graph.db.prepare(
      "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    upsert.run("embedding_model", "none");
  } else {
    const dims = EMBEDDING_DIMENSIONS[embeddingModel];
    setEmbeddingModel(graph, embeddingModel, dims);
  }

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
    } catch (err) {
      log.error(
        `Git ingestion failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      closeGraph(graph);
      process.exit(1);
    }
  }

  if (opts.ingestMd) {
    await runMarkdownIngest(graph, opts.ingestMd);
  }

  if (opts.ingestSource) {
    await runSourceIngest(graph, path.resolve("."));
  }

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
      await runEmbed(graph, provider);
    }
  }

  log.success(`Created ${dbPath}`);
  closeGraph(graph);
}

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
  engram init --yes --from-git . --ingest-md docs/ --ingest-source --embed \\
    --embedding-model gemini-embedding-2-preview

See also:
  engram ingest git     re-ingest or update git history
  engram ingest md      ingest additional markdown files
  engram ingest source  ingest source code symbols
  engram embed          manage and rebuild vector embeddings`,
    )
    .option("--db <path>", "path for the .engram file", ".engram")
    .option("--from-git <path>", "ingest a git repository after creating")
    .option(
      "--ingest-md <path>",
      "ingest markdown docs from this directory/glob",
    )
    .option("--ingest-source", "ingest source code symbols", false)
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
    .option("--yes", "skip all prompts (non-interactive)", false)
    .option("--no-verify", "skip reachability check")
    .action(async (opts: InitOpts) => {
      if (opts.yes) {
        await runNonInteractive(opts);
      } else {
        await runInteractive(opts);
      }
    });
}
