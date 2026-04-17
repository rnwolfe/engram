import * as fs from "node:fs";
import * as path from "node:path";
import {
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import type { Command } from "commander";
import {
  checkGoogle,
  checkOllama,
  checkOpenAI,
  closeGraph,
  createGraph,
  ingestGitRepo,
  setEmbeddingModel,
} from "engram-core";

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "nomic-embed-text": 384,
  "text-embedding-3-small": 1536,
  "text-embedding-004": 768,
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
}

function cancelAndExit(): never {
  log.error("Cancelled.");
  process.exit(1);
}

function assertNotCancel<T>(val: T | symbol): T {
  if (isCancel(val)) cancelAndExit();
  return val as T;
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
      message: "Ingest source",
      options: [
        { value: "git", label: "Current git repository (recommended)" },
        { value: "git-other", label: "A different path" },
        { value: "skip", label: "Skip for now" },
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
          value: "nomic-embed-text",
          label: "nomic-embed-text — Ollama (recommended, local)",
        },
        {
          value: "text-embedding-3-small",
          label: "text-embedding-3-small — OpenAI",
        },
        { value: "text-embedding-004", label: "text-embedding-004 — Google" },
        { value: "none", label: "none — BM25 full-text search only" },
      ],
    }),
  ) as string;

  let ollamaEndpoint = opts.ollamaEndpoint;

  if (embeddingChoice === "nomic-embed-text") {
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
      const reach = await checkOllama(ollamaEndpoint, "nomic-embed-text");
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
  } else if (embeddingChoice === "text-embedding-004" && opts.verify) {
    const s = spinner();
    s.start("Checking Google API key…");
    const reach = await checkGoogle(
      process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY,
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
          value: "gemini-2.0-flash",
          label: "gemini-2.0-flash — Google (set GEMINI_API_KEY)",
        },
        {
          value: "claude-haiku-4-5",
          label: "claude-haiku-4-5 — Anthropic (set ANTHROPIC_API_KEY)",
        },
        { value: "ollama", label: "ollama/<model> — local Ollama" },
      ],
    }),
  );

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
    log.info(
      `Ingesting git repository at ${ingestPath} — this may take a while…`,
    );
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

  closeGraph(graph);

  outro(
    [
      "Done! Next steps:",
      `  engram context "your query here" --db ${dbPath}`,
      `  engram companion >> CLAUDE.md`,
      `  engram status --db ${dbPath}`,
    ].join("\n"),
  );
}

async function runNonInteractive(opts: InitOpts): Promise<void> {
  const dbPath = path.resolve(opts.db);

  if (fs.existsSync(dbPath)) {
    log.error(
      `File already exists: ${dbPath}\nUse a different --db path or remove it with:  rm ${dbPath}`,
    );
    process.exit(1);
  }

  const embeddingModel = opts.embeddingModel ?? "nomic-embed-text";

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
  # Interactive setup with local Ollama (recommended)
  engram init

  # Non-interactive, BM25 only (no AI embedding), useful in CI
  engram init --yes --embedding-model none --db .engram

  # Non-interactive with OpenAI embeddings and git ingest
  engram init --yes --embedding-model text-embedding-3-small --from-git . --no-verify`,
    )
    .option("--db <path>", "path for the .engram file", ".engram")
    .option("--from-git <path>", "also ingest a git repository after creating")
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
