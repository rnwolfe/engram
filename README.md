# engram

> **Early-stage experiment.** The `.engram` format and APIs are unstable and will change without notice. Use at your own risk. Not recommended for production data.

> A local-first temporal knowledge graph engine for developer memory.

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

## The Money Command

```bash
engram init --from-git .
```

One command. No API tokens. No cloud. Walks your git history and builds a knowledge graph:

- **Entities**: authors, files, modules, issue references
- **Observed edges**: git blame attribution, file change records
- **Inferred edges**: co-change patterns, likely ownership, bus factor signals
- **Evidence chains**: every edge traces back to specific commits
- **Temporal validity**: all relationships carry time windows

The resulting `.engram` file is a single SQLite database you can copy, query, and back up.

## Visualize your knowledge graph

```bash
engram visualize --db repo.engram
# Opens http://127.0.0.1:7878
```

Interactive graph: pan, zoom, time slider, decay overlay, evidence drill-down.

## Enrichment

```bash
engram ingest enrich github --token $GITHUB_TOKEN
```

Pull PR discussions, linked issues, and review comments into the graph — adding decision
context that commit messages alone don't capture.

## Architecture

```
engram-core          Library (the product). Graph, temporal, retrieval, ingestion engines.
engram-cli           CLI wrapper. commander + @clack/prompts.
engram-mcp           MCP server (stdio). Read-heavy tool surface for AI agents.
engramark            Benchmark suite (EngRAMark). Validated against Fastify.
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

Engram works without any AI configured. With an AI provider, it generates embeddings for episodes during ingest (entity embeddings deferred to a future release), and blends vector similarity into search scores.

### Providers

| Provider | Configuration | Notes |
|----------|---------------|-------|
| `null` | (default) | No embeddings. FTS-only search. Always available. |
| `ollama` | `ENGRAM_AI_PROVIDER=ollama` | Local Ollama. Default model: `nomic-embed-text`. |
| `gemini` | `ENGRAM_AI_PROVIDER=gemini` + `GEMINI_API_KEY=<key>` | Google Gemini. Default model: `gemini-embedding-001`. |

### Usage

```bash
# No AI — FTS-only (default behavior, unchanged)
engram search "who owns the auth module"

# With Ollama running locally
ENGRAM_AI_PROVIDER=ollama engram search "who owns the auth module"

# With Gemini
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<your-key> engram search "who owns the auth module"

# Ingest with embeddings
ENGRAM_AI_PROVIDER=ollama engram ingest git .
```

Engram degrades gracefully: if the provider is offline or the key is missing, it logs a warning and falls back to null behavior. Embedding failures never corrupt the graph.

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

**v0.1 — in development.** Format is experimental. Breaking changes expected before 1.0.

## License

MIT
