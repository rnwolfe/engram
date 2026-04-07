# engram

> A local-first temporal knowledge graph engine for developer memory.

Git is for code. Engram is for everything you learned along the way.

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

## Status

**v0.1 — in development.** Format is experimental. Breaking changes expected before 1.0.

## License

MIT
