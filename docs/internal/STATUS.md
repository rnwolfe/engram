# Engram — Status

> Last synced: 2026-04-07

## Phase 1 — Foundation (v0.1)

### Done

- [x] `.engram` file format — SQLite schema, metadata, FTS5, migrations (#15)
- [x] Graph CRUD — entities, edges, episodes, evidence chains (#17)
- [x] Temporal engine — validity windows, supersession, fact history (#18)
- [x] Entity resolution — exact-match canonical name + alias lookup (#19)
- [x] Git VCS ingestion — commits, blame, co-change, ownership inference (#20)
- [x] GitHub enrichment adapter — PRs, issues, `reviewed_by` / `references` edges (#21)
- [x] Full-text search — FTS5 across entities/edges/episodes, composite scoring (#23)
- [x] Graph traversal — BFS neighbors, shortest path, temporal snapshots (#24)
- [x] Knowledge decay detection — stale, contradicted, concentrated risk, dormant, orphaned (#25)
- [x] CLI — full command surface: init, add, search, show, history, decay, stats, ingest, export, verify (#26)
- [x] MCP server — stdio transport, 8 tools, 2 resources, context tool with budget-aware truncation (#27)
- [x] Integrity verification — `verifyGraph()` with 8 checks, `engram verify` CLI command (#28)
- [x] EngRAMark v0.1 — 20 ground-truth Q&A for Fastify, VCS-only + grep baselines (#29)
- [x] Markdown and text ingestion (#30)

### In Progress

- [ ] AI provider integration — pluggable embeddings + entity extraction (#31, specced at `docs/internal/specs/ai-providers.md`)
  - `AIProvider` interface, `NullProvider`, `OllamaProvider`, `GeminiProvider`
  - `storeEmbedding()`, `findSimilar()`, hybrid search integration
  - Unblocked — all Phase 1 dependencies shipped

### Next Up

- [ ] AI benchmarking extension (#32)
  - `ai-enhanced` runner, `--all` comparison mode, CI baseline regression detection
  - **Blocked by**: #31

### Bugs

- [ ] commitlint CI action needs `pull-requests: read` permission (#16)

## Phase 2 — Growth (v0.2+)

Not started. Phase 1 completion (AI provider layer) is the gate.

Planned per VISION.md:
- Team/tribal knowledge merging
- EngRAMark against Kubernetes
- Enrichment adapters: Gerrit, Jira, Linear, GitLab
- Non-git ingestors (Slack, Confluence)
- Community detection and topic clustering
- Rich TUI and graph visualization

## Architecture Stats

- **Test count**: ~293 (as of EngRAMark merge)
- **Packages**: 3 (engram-core, engram-cli, engram-mcp)
- **Specs**: 2 (format-v0.1, ai-providers)
