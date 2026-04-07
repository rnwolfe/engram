# Engram — Vision

> A local-first temporal knowledge graph engine for developer memory.

## Identity

**What it is**: Engram extracts knowledge from where it already lives — git history, code review discussions, commit messages, documents — and encodes it as a temporal knowledge graph: entities, relationships, and facts that track how understanding evolves over time. It's a library first, CLI second, MCP server third.

**Who it's for**: Engineers and AI agents that need grounded, evidence-backed answers about a codebase — who owns what, why decisions were made, what knowledge is decaying. The primary consumers are locally-running agents (Claude Code via MCP, Cursor) that need a knowledge substrate with provenance and temporal validity.

**Why it exists**: Your company's most critical knowledge is encoded in git blame, auto-deleting Slack threads, and the head of an engineer who just gave notice. Every knowledge management tool wants manual transcription. Every AI agent treats context as ephemeral. Engram doesn't ask you to take notes — it builds the graph from source material that already exists, and every claim traces back to evidence.

## Design Principles

1. **Embeddable, not monolithic.** Engram is a library first. Other tools depend on it — it doesn't depend on them. The CLI and MCP server are reference implementations over the core engine.

2. **Local-first, single-file portable.** The entire knowledge graph lives in one `.engram` file (SQLite). Copy it, rsync it, back it up. No external databases. No cloud requirements.

3. **Temporal by default.** Every fact has a validity window. Knowledge isn't static — people change jobs, APIs break, decisions get reversed. The graph remembers what was true and when.

4. **Evidence-first.** Episodes are immutable raw evidence. Entities and edges are derived projections supported by evidence chains. Every claim in the graph traces back to source material.

5. **Structurally sound without AI, queryable with AI.** The data model doesn't depend on AI: entities, edges, temporal validity, and evidence chains are computed deterministically. But the interaction model does — compositional queries across those signals are where the graph earns its keep, and agents will compose them.

6. **Developer-native.** First-class ingestors understand git and code. Primary interface is a CLI. Integration surface is MCP. Infrastructure for engineers, not a productivity app.

7. **Format over features.** The `.engram` format is the durable contract. If the format is good enough, the ecosystem builds itself.

8. **Personal today, tribal tomorrow.** Every artifact carries provenance from day one. The schema supports multi-author entity resolution without requiring it. Tribal merge is a future capability requiring explicit reconciliation with human oversight.

## Out of Scope

- Not a note-taking app — no manual knowledge entry workflows
- Not a team collaboration tool (v0.1) — tribal merge is v0.2+
- Not a web app or desktop app — CLI and library only
- No non-git ingestors (Slack, Confluence) in v0.1
- No automatic semantic entity merging — accidental over-merging poisons a graph faster than duplicates
- No authentication, access control, or encryption in v0.1

## Personality

Developer infrastructure. Opinionated about correctness (evidence chains, temporal validity) but unopinionated about workflow. The tone is direct and technical — like good CLI documentation. No marketing language in the interface. The README can have a manifesto; the tool output should be factual.

## Roadmap

### Phase 1 — Foundation (v0.1)

The `.engram` format, the core engine, and the "money command":

- `.engram` file format (SQLite, stable enough to build against, migration-friendly)
- `engram-core` library: graph, temporal, retrieval, evidence, provenance APIs
- `engram init --from-git .` — builds structural graph from git history alone
- Core CLI: `add`, `search`, `show`, `decay`, `history`, `ingest`, `export`, `verify`
- `engram ingest git` (VCS-layer, universal, no API needed)
- `engram ingest enrich github` (PR/issue enrichment)
- `engram ingest md` (markdown files)
- MCP server (stdio) with read-heavy tool surface
- AI-enhanced mode when LLM available, graceful no-AI fallback
- EngRAMark v0.1 benchmarked against Fastify

### Phase 2 — Growth (v0.2+)

- Team/tribal knowledge merging with explicit reconciliation
- EngRAMark against Kubernetes
- Enrichment adapters: Gerrit, Jira, Linear, GitLab
- Non-git ingestors (Slack, Confluence)
- Community detection and topic clustering
- Rich TUI and graph visualization

### Phase 3 — Maturity

- Tribal merge: centralized reconciliation of personal engram files
- Organizational knowledge topology dashboards
- Real-time ingestion from CI/CD pipelines
- IDE extensions (VS Code, JetBrains)
- Obsidian plugin

## Prior Art & Constraints

- **Technology**: TypeScript (Bun), SQLite via `better-sqlite3`, ULIDs for IDs, pluggable embedding/LLM providers
- **Monorepo structure**: `packages/engram-core`, `packages/engram-cli`, `packages/engram-mcp`, `packages/engramark`
- **Key differentiator vs Copilot @workspace / Sourcegraph Cody**: Provenance and temporal model. When an agent says "Alice owns auth," it can cite the commits, show the validity window, and distinguish observed from inferred.
- **Key differentiator vs git-fame / hercules**: Compositional queries across signals (ownership + co-change + evidence strength + temporal validity), not just static reports
- **The no-AI story**: The graph is correct and complete without AI, so when AI queries it, the answers are grounded. That's the actual differentiator.
