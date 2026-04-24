# Engram — Status

> Last synced: 2026-04-24
> Latest release: **v0.3.1** (2026-04-24) — see [CHANGELOG.md](../../CHANGELOG.md) for the full v0.3 surface (narrative CLI, `sync`, repo-lifecycle health).

## Phase 1 — Foundation (v0.1) — shipped 2026-04-08

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
- [x] Integrity verification — `verifyGraph()` with 8 checks, `engram verify` CLI command (#28)
- [x] EngRAMark v0.1 — 20 ground-truth Q&A for Fastify, VCS-only + grep baselines (#29)
- [x] Markdown and text ingestion (#30)
- [x] AI provider integration — `AIProvider` interface, `NullProvider`, `OllamaProvider`, `GeminiProvider`, `storeEmbedding()`, `findSimilar()`, hybrid search (#31)
- [x] Graph visualization — Cytoscape.js web UI with filter sidebar, search-to-focus, temporal slider, decay/ownership overlays (#58–#62)
- [x] commitlint CI action permission fix (#16)

## Phase 2 — Growth (v0.2) — shipped 2026-04-19

### Done

#### Projection layer (schema v0.2)

- [x] Projection layer spec + ADR-002 (#77)
- [x] Schema migration v0.1 → v0.2 — projection tables (#78)
- [x] `project()` operation + `ProjectionGenerator` interface (#79)
- [x] `listActiveProjections()`, `searchProjections()` with batched staleness (#80)
- [x] `reconcile()` assess phase — `Budget`, `softRefresh`, `currentInputState` (#81)
- [x] `verifyGraph()` projection invariants (#82)
- [x] `engram export wiki` — materialize projections to markdown folder (#83)
- [x] Kind catalog — v0.2 built-in kinds (#84)
- [x] `engram project` — explicit projection authoring (#85, #218, #219, #220)
- [x] Real AI projection authoring — Anthropic, Gemini, OpenAI providers (#95)
- [x] `engram reconcile` — two-phase maintenance loop (#87, #88, #92, #220)
- [x] Reconcile discover phase — emergent projection authoring (#87, #219)
- [x] Discover-phase prompt experiment + v0.1 draft (#63, #218)

#### Source code ingestion

- [x] Source ingestion scaffold + file walker (#104)
- [x] tree-sitter parser + grammar vendoring (#105)
- [x] TypeScript extractor + tree-sitter queries (#106)
- [x] Source ingestion — episode/entity/edge writes + idempotency (#107)
- [x] Sweep phase — archive episodes for deleted source files (#108)
- [x] `engram ingest source` subcommand (#109)
- [x] Source ingestion docs + self-ingest verification (#110)
- [x] Language expansion — Go, Python (#235), Rust (#232), Java (#233), Ruby, C, C++, C# (#234)
- [x] Orchestrator generalized for extractor-declared entities and edges (#241)

#### Kubernetes operator graph (epic #236)

- [x] Starlark/BUILD tree-sitter extractor for Bazel dependency graph (#237)
- [x] Kubebuilder `+kubebuilder:rbac` markers as RBAC permission edges (#238, #247, #249)
- [x] controller-runtime `SetupWithManager` watches graph extraction (#239)
- [ ] YAML source extractor for Kubernetes CRDs, Roles, RoleBindings (#240) — issue closed without implementation; needs re-opening if still wanted

#### Plugin system

- [x] Plugin loading architecture spec + ADR-006 (#204, #212)
- [x] Plugin loader — XDG discovery, manifest parsing, js-module + executable transports (#206, #214)
- [x] Formal ingest plugin contract — D3 Deliverable 1 (#129)

#### Enrichment adapters

- [x] EnrichmentAdapter v2 contract — `AuthCredential`, `ScopeSchema`, cursor helpers (#213)
- [x] Gerrit adapter — changes, owners, reviewers from Gerrit REST API (#191, #211)
- [x] `engram ingest` — consume v2 adapter options (#205, #215)

#### Graph and ingestion

- [x] Cross-source reference edge resolver (#208)
- [x] Adapter shorthand alias convention (#209)
- [x] Controlled vocabulary registries — `entity_type`, `source_type`, `relation_type` (#199, #210)
- [x] Episode supersession — schema, graph helpers, `verifyGraph()` invariants (#201, #207, #216, #217)
- [x] Semantic entity embeddings — vector search over entities (#127)
- [x] Embedding model as per-database config (ADR-003) (#126)

#### CLI and UX

- [x] `engram init` — interactive embedding/provider setup, enrichment selection, companion wiring (#130, #180, #189)
- [x] `engram status` — health + config dashboard (#131)
- [x] `engram embed` — reindex, check, enable, status (#132)
- [x] `engram doctor` — diagnostic and repair (#188)
- [x] `engram companion --check --file` — idempotent CI use (#182)
- [x] `engram context --max-entities --max-edges` hard caps (#181)
- [x] `--format text\|json` on `stats`, `decay`, `show`, `history` (#164, #165, #166, #167)
- [x] `-j` and `-v` short flags on all commands (#183)
- [x] Colorized terminal output (#190)
- [x] `.engram` directory layout migration — flat file → `.engram/` dir (#187)
- [x] CLI help text pass — Phases 1-3 (#133, #134, #135)

#### Stale-knowledge benchmark

- [x] Stale-knowledge benchmark spec (#86)
- [x] EngRAMark stale-knowledge detection benchmark (#90)

#### Decommissioning (ADR-005)

- [x] MCP projection tools (get, search, list, project, reconcile) implemented (#89), then removed alongside the MCP server
- [x] `engram-mcp` server removed — replaced by `engram context` (#136)
- [x] `engramark` suite removed; stale-knowledge tests relocated (#128)

#### Retrieval tuning

- [x] Config noise filter; term-matching entities ranked higher (#137)

#### Plugin migration (ADR-008)

- [x] Gerrit adapter migrated from built-in to in-repo plugin (#222)
- [x] `engram plugin install` and `uninstall` subcommands — wire first-party plugins into XDG (#223)
- [x] VISION.md phase 2 updated for in-repo plugin adapter model (#224)
- [x] `plugin-create` skill for guided adapter authoring (#231)

#### Retrieval

- [x] Retrieval precision + context provider viability epic (#111)

#### Documentation

- [x] README v0.2 overhaul — plugins, Gerrit, reconcile, companion, token-budget semantics (#221)
- [x] Various CLI fixes in #168-#179 (embed default, port validation, sparse-results gating, piped-intro suppression, etc.)

## Phase 2 — Shipped in v0.3 (2026-04-23 → 2026-04-24)

### Done

#### Narrative & temporal CLI surface

- [x] `engram context --as-of <when>` — pack-level temporal time travel, learn-time filter (#264)
- [x] `engram diff <from> <to>` — temporal diff of substrate and projections between two refs (#268)
- [x] `engram why <file|symbol|line>` — narrate history and rationale (#269)
- [x] `engram brief <PR|issue|topic>` — grounded briefing (#270)
- [x] `engram onboard <area>` — guided briefing for a new contributor (#271)

#### Multi-source orchestration

- [x] `engram sync` — config-driven multi-source orchestration (#266, closes #203)

#### Adapters & ingest

- [x] Google Workspace adapter — Docs ingest with revision-aware episodes (#254, closes #196)
- [x] Google Workspace scope grammar — `folder:` and `query:` discovery modes (#255, closes #198)
- [x] Google Workspace adapter migrated to `packages/plugins/google-workspace/` (#256)
- [x] Monorepo-aware source exclusions — vendor heuristics + `.engramignore` (#265)

#### Plugin system

- [x] Plugin docs contract — manifest `description`/`docs` fields + `engram plugin info` command (#257)

#### Repo-lifecycle health

- [x] `engram doctor` checks — `freshness`, `engine_version_drift`, `update_available` (#274)
- [x] `engram whats-new` — render user-facing highlights from `docs/whats-new.json` (#274)
- [x] `engram update` — self-updater with `--check` / atomic binary replace (#274)
- [x] `engram status` — per-source "N commits behind, X days ago" inline (#274)
- [x] `ENGINE_VERSION` synced across workspace + `check-versions` guard (#274)

#### Graph visualization

- [x] Design refresh — Geist font, Tailwind, projections in graph, source-type filter (#272)
- [x] Mobile sidebar toggle + layout fix for revealed nodes (#273)

#### CLI / UX

- [x] Systematic UX audit fixes for human and agent ergonomics (#251)
- [x] `/cleanup` skill for stale branch and worktree triage (#252)

#### Documentation

- [x] README update for expanded source-ingest language coverage (#250)
- [x] STATUS and VISION sync with v0.2 shipped work (#253)

## Phase 2 — In flight / Next up

### Open, unlabeled

- [ ] #275 — `engram update`: verify downloaded binary against published checksum (follow-up to #274; supply-chain hardening for the self-updater)

### Open, needs refinement (`backlog/needs-refinement`)

- [ ] #193 — GitLab adapter (reclassified as in-repo plugin per ADR-008)
- [ ] #194 — Jira adapter (reclassified as in-repo plugin per ADR-008)
- [ ] #195 — Linear adapter (reclassified as in-repo plugin per ADR-008)
- [ ] #192 — Buganizer spike (verify public API alignment)
- [ ] #123 — Harness plugin core + Gemini CLI adapter (D3 Deliverable 2)
- [ ] #116 — **Workflow benchmark** (priority/high, research) — Gate G1 for narrative projections per ADR-004. Flagged in most recent `/product` check: `decision_page`, `contradiction_report`, and `topic_cluster` shipped in v0.2.0 without G1 exit criteria met.

## Phase 3 — Maturity — not started

Per VISION.md:
- Tribal merge: centralized reconciliation of personal engram files
- Organizational knowledge topology dashboards
- Real-time ingestion from CI/CD pipelines
- IDE extensions (VS Code, JetBrains)
- Obsidian plugin

Phase 3 is gated on Phase 2 adapter coverage (Gerrit migration + Jira/Linear/GitLab/Google Docs shipping as plugins) and on Gate G1 (#116) validating the projection layer on real multi-file tasks.

## Architecture Stats

- **Packages**: 3 core (`engram-core`, `engram-cli`, `engram-web`) + 2 in-repo plugins (`gerrit`, `google-workspace`) under `packages/plugins/`
- **Specs**: 22 under `docs/internal/specs/`
- **ADRs**: 8 recorded in `docs/internal/DECISIONS.md`
- **Schema version**: v0.2 (projection layer + mutable-source supersession)
- **Adapter contract**: v2 (typed auth, scope schema, cursor helpers)
