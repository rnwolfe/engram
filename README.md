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

## What It Does

Engram extracts knowledge from where it already lives — git history, code review
discussions, commit messages, documents — and encodes it as a temporal knowledge graph:
entities, relationships, and facts that track how your understanding evolves over time.

Every claim in the graph traces back to evidence. Every fact has a validity window.
The graph is structurally sound without AI, so when AI queries it, the answers are grounded.

## Quick Start

```bash
# Step 1 — build a knowledge graph from your git history (no API tokens needed)
cd your-repo
engram init --from-git .

# Step 2 — query it
engram search "who owns the auth module"
engram search "what changed in the last 30 days"

# Step 3 — visualize it (opens http://127.0.0.1:7878)
engram visualize

# Step 4 — synthesize AI documents from the graph (optional, needs ANTHROPIC_API_KEY)
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000
engram export wiki --out ./wiki
```

`engram init --from-git` builds the graph with no cloud and no API tokens:

- **Entities**: authors, files, modules, issue references
- **Observed edges**: git blame attribution, file change records
- **Inferred edges**: co-change patterns, likely ownership, bus factor signals
- **Evidence chains**: every edge traces back to specific commits
- **Temporal validity**: every relationship carries a validity window

The result is a single `.engram` file — a SQLite database you can copy, back up, and version alongside your repo.

## Enrichment

```bash
engram ingest enrich github --token $GITHUB_TOKEN
```

Pull PR discussions, linked issues, and review comments into the graph — adding decision
context that commit messages alone don't capture.

## Projections

Projections are AI-synthesized documents — summaries, reports, decision pages — anchored to specific entities, edges, or topics in the graph. They form a human-readable knowledge layer on top of the raw evidence.

Four built-in kinds ship out of the box:

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

The `.engram` file format is the durable contract. The CLI and MCP server are reference
implementations over that contract.

## Design Principles

1. **Embeddable, not monolithic** — library first, CLI second, server third
2. **Local-first, single-file portable** — one `.engram` file, no external databases
3. **Temporal by default** — every fact has a validity window
4. **Evidence-first** — every claim traces back to source material
5. **Structurally sound without AI** — deterministic extraction, AI enhances queries
6. **Developer-native** — CLI interface, MCP integration surface, git-first ingestors
7. **Format over features** — the `.engram` format is the contract
8. **Personal today, tribal tomorrow** — provenance from day one, merge later

## AI-Enhanced Mode

Engram works without any AI configured. AI unlocks two distinct capabilities:

**Embeddings** — blends vector similarity into search scores during ingest.

| Provider | Configuration | Notes |
|----------|---------------|-------|
| `null` | (default) | No embeddings. FTS-only search. Always available. |
| `ollama` | `ENGRAM_AI_PROVIDER=ollama` | Local Ollama. Default model: `nomic-embed-text`. |
| `gemini` | `ENGRAM_AI_PROVIDER=gemini` + `GEMINI_API_KEY=<key>` | Google Gemini. Default model: `gemini-embedding-001`. |

**Projection authoring** — synthesizes entities/topics/decisions from the graph into readable documents. Requires Anthropic:

```bash
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000
```

### Embedding usage

```bash
# No AI — FTS-only (default)
engram search "who owns the auth module"

# With Ollama running locally
ENGRAM_AI_PROVIDER=ollama engram search "who owns the auth module"

# With Gemini
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<your-key> engram search "who owns the auth module"

# Ingest with embeddings
ENGRAM_AI_PROVIDER=ollama engram ingest git .
```

Engram degrades gracefully: if the embedding provider is offline or the key is missing, it logs a warning and falls back to FTS-only. Embedding failures never corrupt the graph.

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
