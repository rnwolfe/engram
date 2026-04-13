# engram

> A local-first temporal knowledge graph engine for developer memory.

> [!WARNING]
> **Early-stage experiment.** The `.engram` format and APIs are unstable and will change without notice. Use at your own risk. Not recommended for production data.

Git is for code. Engram is for everything you learned along the way.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/rnwolfe/engram/main/install.sh | bash
```

Installs the `engram` binary to `/usr/local/bin` (or `~/.local/bin` if not writable). Supports Linux and macOS on x64 and arm64.

## How It Works

Engram runs a three-layer pipeline:

1. **Ingest** — pull knowledge from where it already lives: git history (free, no tokens), GitHub PRs and review comments (optional enrichment), markdown documents. Every piece of source material becomes an immutable episode in the graph.

2. **Graph** — encode that evidence as a temporal knowledge graph: entities, relationships, and facts with validity windows. Every edge traces back to source material. Every claim knows when it was true.

3. **Project** — synthesize AI-authored documents from the graph: entity summaries, decision pages, contradiction reports. They anchor to the graph substrate and reconcile themselves as new evidence lands.

The result is a self-maintaining wiki grounded in evidence — not a snapshot, not a RAG index. A versioned synthesis that knows what changed, when, and why.

## Quick Start

```bash
# Step 1 — build a knowledge graph from your git history (free, no tokens needed)
cd your-repo
engram init --from-git .

# Step 2 — enrich with PR and issue context (optional, needs GITHUB_TOKEN)
engram ingest enrich github --token $GITHUB_TOKEN

# Step 3 — synthesize living documents from the graph (needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000
engram export wiki --out ./wiki

# Step 4 — query and explore
engram search "who owns the auth module"
engram search "what changed in the last 30 days"
engram visualize   # opens http://127.0.0.1:7878
```

## Ingestion

### Git — free, no tokens

`engram init --from-git .` builds the structural graph from git history alone:

- **Entities**: authors, files, modules, issue references
- **Observed edges**: git blame attribution, file change records
- **Inferred edges**: co-change patterns, likely ownership, bus factor signals
- **Evidence chains**: every edge traces back to specific commits
- **Temporal validity**: every relationship carries a validity window

The result is a single `.engram` file — a SQLite database you can copy, back up, and version alongside your repo.

### Enrichment — decision context from code review

Git tells you what changed. Enrichment adapters tell you why — PR discussions, review comments, linked issues, the rationale behind decisions.

| Source | Status | What it adds |
|--------|--------|-------------|
| GitHub | **Supported** | PRs, issues, review comments, linked decisions |
| GitLab | Planned | MRs, issues |
| Gerrit | Planned | Code review discussions |
| Jira | Planned | Issue tracker, sprint context |
| Linear | Planned | Issue tracker, project context |
| Slack | Desired | Decisions made outside code review |
| Confluence | Desired | Internal docs, ADRs |

```bash
engram ingest enrich github --token $GITHUB_TOKEN
```

## Projections

Projections are the output layer — AI-synthesized documents anchored to the graph substrate. Unlike a static wiki, they know when they're stale and re-reconcile themselves as new evidence arrives. Like every other fact in the graph, they carry validity windows and trace back to source material.

Four built-in kinds:

| Kind | What it produces |
|------|-----------------|
| `entity_summary` | What an entity is, who owns it, how it's changed |
| `decision_page` | Key decisions, rationale, alternatives considered |
| `contradiction_report` | Conflicting facts or ownership overlaps in the substrate |
| `topic_cluster` | Synthesized view across a theme or system boundary |

Projection authoring requires `ANTHROPIC_API_KEY`.

### Reconcile — the main workflow

```bash
# Assess stale projections and discover candidates for new ones
engram reconcile --max-cost 50000

# Assess only (no discovery)
engram reconcile --phase assess --max-cost 10000

# Dry run — see what would change without writing
engram reconcile --dry-run
```

`reconcile` runs in two phases:
1. **Assess** — finds projections whose inputs have drifted and regenerates them
2. **Discover** — surveys uncovered substrate and proposes new projections

### Author a single projection

```bash
engram project --kind entity_summary \
               --anchor entity:<ULID> \
               --input episode:<ULID> \
               --input episode:<ULID>
```

### Export as a wiki

```bash
engram export wiki --out ./wiki
# Writes one markdown file per active projection
```

## Architecture

```
engram-core          Library (the product). Graph, temporal, retrieval, ingestion, projection engines.
engram-cli           CLI wrapper. commander + @clack/prompts.
engram-mcp           MCP server (stdio). Read and authoring tool surface for AI agents.
engramark            Benchmark suite (EngRAMark). Validated against Fastify and stale-knowledge scenarios.
```

The `.engram` file format is the durable contract. The CLI and MCP server are reference implementations over that contract.

## Design Principles

1. **Embeddable, not monolithic** — library first, CLI second, server third
2. **Local-first, single-file portable** — one `.engram` file, no external databases
3. **Temporal by default** — every fact has a validity window
4. **Evidence-first** — every claim traces back to source material
5. **Deterministic substrate, AI-authored projections — both versioned in time** — the graph is correct without AI; projections are where the LLM compounds value between queries, and both layers share the same temporal model
6. **Developer-native** — CLI interface, MCP integration surface, git-first ingestors
7. **Format over features** — the `.engram` format is the contract
8. **Personal today, tribal tomorrow** — provenance from day one, merge later

## AI Providers

Engram uses AI for two distinct purposes. Provider support differs between them.

### Embeddings (hybrid search)

Blends vector similarity into search scores during ingest and retrieval. Falls back to FTS-only if no provider is configured. Embedding failures never corrupt the graph.

| Provider | Configuration | Default model | Notes |
|----------|---------------|---------------|-------|
| `null` | (default) | — | FTS-only. No setup required. |
| `ollama` | `ENGRAM_AI_PROVIDER=ollama` | `nomic-embed-text` | Local. Requires Ollama running. |
| `gemini` | `ENGRAM_AI_PROVIDER=gemini` + `GEMINI_API_KEY=<key>` | `gemini-embedding-001` | Google Gemini API. |
| OpenAI | Not supported | — | — |
| Anthropic | Not supported for embeddings | — | Use Anthropic for projection authoring. |

```bash
# No AI — FTS-only (default)
engram search "who owns the auth module"

# With Ollama running locally
ENGRAM_AI_PROVIDER=ollama engram search "who owns the auth module"

# With Gemini
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<key> engram search "who owns the auth module"

# Ingest with embeddings
ENGRAM_AI_PROVIDER=ollama engram ingest git .
```

### Projection authoring (reconcile, project)

Synthesizes projection bodies from the graph substrate. Supported providers are auto-detected from present API keys — no `ENGRAM_AI_PROVIDER` required unless you want to be explicit.

| Provider | Auto-detected from | Explicit | Default model | Notes |
|----------|--------------------|----------|---------------|-------|
| Anthropic | `ANTHROPIC_API_KEY` | `ENGRAM_AI_PROVIDER=anthropic` | `claude-sonnet-4-6` | Detected first when multiple keys are set. |
| Gemini | `GEMINI_API_KEY` | `ENGRAM_AI_PROVIDER=gemini` | `gemini-2.0-flash` | Detected second. |
| OpenAI | `OPENAI_API_KEY` | `ENGRAM_AI_PROVIDER=openai` | `gpt-4o` | Detected third. |
| Ollama | — | Not supported | — | Embeddings only. |

```bash
# Anthropic
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000

# Gemini
GEMINI_API_KEY=<key> engram reconcile --max-cost 50000

# OpenAI
OPENAI_API_KEY=<key> engram reconcile --max-cost 50000

# Explicit selection when multiple keys are present
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<key> engram reconcile --max-cost 50000
```

### Programmatic API

```typescript
import { createProvider, storeEmbedding, findSimilar, search } from "engram-core";

// Create a provider (reads ENGRAM_AI_PROVIDER env by default)
const provider = createProvider({ provider: "ollama" });

// Hybrid search (FTS + vector)
const results = await search(graph, "auth module ownership", { provider });

// Store embeddings manually
storeEmbedding(graph, entityId, "entity", "nomic-embed-text", embeddingVector, sourceText);

// Find similar items by vector
const similar = findSimilar(graph, queryEmbedding, { limit: 10, target_type: "entity" });
```

## Status

**v0.2 (schema) — in development.** The projection layer (schema v0.2) is live. Format is experimental. Breaking changes expected before 1.0.

## License

MIT
