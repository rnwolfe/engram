/**
 * init-interactive.ts — runInteractive() for `engram init`.
 *
 * Handles the full interactive prompt flow (5-step pipeline with user prompts).
 * Called from init.ts when --yes is NOT passed.
 */

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
import {
  checkGoogle,
  checkOllama,
  checkOpenAI,
  closeGraph,
  createGraph,
  ingestGitRepo,
  resolveDbPath,
  setEmbeddingModel,
} from "engram-core";
import type { HarnessFile } from "./init-pipeline.js";
import {
  appendCompanionToFiles,
  detectGitHubRemote,
  detectHarnessFiles,
  runGitHubEnrich,
} from "./init-pipeline.js";
import {
  buildProvider,
  EMBEDDING_DIMENSIONS,
  type InitOpts,
  prepareDbDirectory,
  runEmbed,
  runMarkdownIngest,
  runSourceIngest,
} from "./init-runners.js";

function cancelAndExit(): never {
  log.error("Cancelled.");
  process.exit(1);
}

function assertNotCancel<T>(val: T | symbol): T {
  if (isCancel(val)) cancelAndExit();
  return val as T;
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

export async function runInteractive(opts: InitOpts): Promise<void> {
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
      process.exit(2);
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
