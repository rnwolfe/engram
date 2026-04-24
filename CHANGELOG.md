# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-04-24

### Fixed

- Resolved 10 `noNonNullAssertion` lint warnings in `brief`, `onboard`,
  and `why` commands. `ParsedTarget` converted from an optional-field
  interface to a discriminated union so TypeScript narrows `path`/`symbol`
  access without assertions. `graph` variables in action handlers declared
  as `EngramGraph` (not `| undefined`) — TypeScript's definite-assignment
  analysis handles `process.exit` in the catch branch.
- `docs/whats-new.json` 0.2.0 entry corrected — removed six items
  (`sync`, `brief`, `why`, `onboard`, `diff`, `visualize`) that were
  not present in the v0.2.0 tag. The five narrative CLI commands now
  appear in the 0.3.0 entry where they actually shipped; `engram
  visualize` moved to its original home in 0.1.0 with a design-refresh
  note in 0.3.0's `changed` section.

## [0.3.0] - 2026-04-23

### Added

#### Narrative & temporal CLI surface

- **`engram context --as-of <when>`** — Pack-level temporal time travel with
  learn-time filter: retrieve a context pack reflecting what the graph knew
  at a past point in time (#264).
- **`engram diff <from> <to>`** — Temporal diff of substrate and projections
  between two refs (#268).
- **`engram why <file|symbol|line>`** — Narrate the history and rationale of
  a file, symbol, or line using commits, PRs, and ownership signals (#269).
- **`engram brief <PR|issue|topic>`** — Grounded briefing for a PR, issue,
  or topic, with evidence and co-change context (#270).
- **`engram onboard <area>`** — Guided briefing for a new contributor
  entering an area of the codebase (#271).
- **`engram sync`** — Config-driven multi-source orchestration. Reads
  `.engram.config.json` and runs git, GitHub, source, and plugin adapters
  in one pass (#266).

#### Repo-lifecycle health

- **`engram doctor`** new checks — `freshness` (days + commits behind HEAD
  per source), `engine_version_drift` (nudge when the user upgraded but
  hasn't reviewed what changed), and `update_available` (GitHub releases,
  cached 24h) (#274).
- **`engram whats-new`** — Render user-facing highlights from
  `docs/whats-new.json` filtered to versions the user hasn't acknowledged (#274).
- **`engram update`** — Self-updater: `--check` probes the release API; the
  default mode downloads the matching OS/arch binary and atomic-renames it
  into `process.execPath`. Refuses dev installs (#274).
- **`engram status`** — Surfaces per-source "N commits behind, X days ago"
  inline (#274).

#### Source-code ingestion — language expansion

- Tree-sitter parsers for **Go** and **Python** (#235), **Rust** (#243),
  **Java** (#244), **Ruby, C, C++, C#** (#245), and **Starlark/BUILD**
  for Bazel dependency graphs (#248).

#### Kubernetes operator graph

- **kubebuilder RBAC markers** — `+kubebuilder:rbac` annotations in Go
  source extracted as RBAC permission edges (#247).
- **controller-runtime watches** — `SetupWithManager` watches extracted
  as graph edges (#246).

#### Adapters & ingest

- **Google Workspace adapter** — Docs ingest with revision-aware episodes
  (first LLM-consumable mutable source per ADR-007). Supports `folder:`
  and `query:` scope grammar for folder and query-based discovery
  (#254, #255).
- **Monorepo-aware source exclusions** — Vendor/build-artifact heuristics
  and `.engramignore` support in `engram ingest source` (#265).

#### Plugin system

- **`engram plugin install`** and **`engram plugin uninstall`** — Wire
  first-party plugins into `$XDG_DATA_HOME/engram/plugins/` from the
  monorepo's `packages/plugins/` directory (#228).
- **Plugin docs contract** — Manifests carry `description` and `docs` fields;
  `engram plugin info <name>` surfaces them (#257).

#### Graph visualization

- **Web UI design refresh** — Geist font, Tailwind-based styling, projection
  nodes rendered directly in the graph, source-type filter (#272).

### Changed

- **Gerrit adapter is now a plugin, not built-in** — `engram ingest enrich
  gerrit` no longer works out of the box on a fresh install (#229).
  - Migration: Run `engram plugin install gerrit` once to restore the
    subcommand. Existing flags (`--scope`, `--endpoint`, `--token`, etc.)
    are unchanged.
- **Google Workspace adapter ships as an in-repo plugin** from day one per
  ADR-008 (#256). Install with `engram plugin install google-workspace`.
- Orchestrator generalized to accept extractor-declared entities and
  edges — internal refactor making language extractors simpler to author
  (#242).

### Fixed

- Viz sidebar toggle on mobile; layout fix for nodes revealed by
  filters (#273).
- Systematic UX audit fixes across the CLI surface for both human and
  agent ergonomics (#251).
- Restored RBAC marker extraction to `main` after #247 merged to the
  wrong base (#249).

## [0.2.0] - 2026-04-19

### Added

#### Projection layer (schema v0.2)

- **`engram reconcile`** — Two-phase projection maintenance loop. `assess`
  refreshes stale projections; `discover` surveys uncovered substrate and
  proposes new projections. Supports `--phase`, `--scope`, `--max-cost`
  (token budget), `--dry-run`, `--reset-cursor`, and `--cross-refs`.
- **`engram project`** — Explicit projection authoring on a specific anchor
  with declared inputs.
- **`engram export wiki`** — Materialize active projections to a markdown
  folder (one file per projection).
- **Projection authoring via Anthropic, Gemini, and OpenAI** —
  Auto-detected from the exported API key. `ENGRAM_AI_PROVIDER` available
  for explicit selection when multiple keys are present.
- **Built-in projection kinds** — `entity_summary`, `decision_page`,
  `contradiction_report`, `topic_cluster`. User-defined kinds loadable
  from `$XDG_CONFIG_HOME/engram/kinds/`.
- **Projection invariants in `verifyGraph()`** — Validity windows, evidence
  coverage, and input-fingerprint staleness flags.

#### Source code ingestion

- **`engram ingest source`** — Walks the working tree, parses files with
  tree-sitter, and creates file, module, and symbol entities. TypeScript
  and JavaScript supported. Respects `.gitignore`; skips `node_modules`,
  build artifacts, and lockfiles. Sweep phase archives episodes for
  deleted source files. Supports `--exclude`, `--dry-run`, `--verbose`.

#### Plugin system

- **Plugin loader** — XDG discovery (`$XDG_DATA_HOME/engram/plugins/`,
  `%LOCALAPPDATA%\engram\plugins\`, or project-local
  `<project>/.engram/plugins/`) with manifest validation and path-traversal
  guards.
- **Two transports** — `js-module` (dynamic import, in-process) and
  `executable` (subprocess over JSON-lines stdio). Engram owns all graph
  writes; plugins only emit records.
- **`engram plugin list`** — Discovered plugins with name, version,
  transport, scope, and manifest-validation status.
- **Auto-registration** — Discovered plugins appear as
  `engram ingest enrich <plugin-name>` subcommands at startup.
- **Vocabulary extensions** — Plugins can extend `entity_type`,
  `source_type`, and `relation_type` registries with collision detection.

#### Enrichment adapters

- **Gerrit adapter** (`engram ingest enrich gerrit --scope <project>`) —
  Changes, owners, and reviewers from the Gerrit REST API. Supports
  `--endpoint`, bearer auth (`--token`), HTTP Basic
  (`--username`/`--password`), and anonymous access.
- **EnrichmentAdapter v2 contract** — New `--scope` flag (`--repo` kept as
  deprecated alias). Typed `AuthCredential` union covering `bearer`,
  `basic`, `service_account`, `oauth2`, and `none`. Adapters declare
  `supportedAuth` and a `scopeSchema` with validation. Cursor helpers
  (`readIsoCursor`, `readNumericCursor`, `writeCursor`) standardize
  incremental ingestion.

#### Graph and ingestion

- **Cross-source reference resolver** — Resolves references across
  adapter boundaries (e.g. a Gerrit change linking a GitHub issue)
  using a shorthand alias convention.
- **Episode supersession** — Atomic supersede-and-insert for mutable
  sources (Google Docs, Linear, Jira). Preserves prior revisions with
  `superseded_by` and a partial unique index on active episodes.
- **Controlled vocabulary registries** — Formalized `entity_type`,
  `source_type`, and `relation_type` values in
  `packages/engram-core/src/vocab/`. Adapters import from there instead
  of inlining strings. `verifyGraph({ strict: true })` validates
  vocabulary conformance.
- **Semantic entity embeddings** — Vector search over entities, not just
  episodes.
- **Embedding model per database** — Model recorded in metadata and
  enforced across queries (ADR-003).

#### CLI commands and UX

- **`engram init`** — Interactive embedding/provider setup with
  enrichment selection, source ingest, markdown ingest, companion file
  wiring, and structured non-interactive output. New flags:
  `--from-git`, `--ingest-md`, `--ingest-source`, `--embed`,
  `--embedding-model`, `--embedding-provider`, `--github-repo`, `--yes`.
- **`engram status`** — Health and config dashboard: embedding model,
  graph counts, provider reachability.
- **`engram embed`** — Manage vector embeddings: reindex, check, enable,
  status, and `--fill` for gap-only embedding without full reindex.
- **`engram doctor`** — Diagnostic and repair command for common issues.
- **`engram companion --check --file <path>`** — Idempotent CI setup for
  appending harness instructions.
- **`engram context --max-entities` / `--max-edges`** — Hard caps on
  pack size regardless of token budget.
- **`--format text|json`** on `stats`, `decay`, `show`, `history`.
- **`-j` and `-v` short flags** on all commands.
- **Colorized terminal output** for readability.

### Changed

- **`.engram` is now a directory, not a flat file** — SQLite and related
  state move into `.engram/`. Old flat-file `.engram` databases are not
  automatically migrated; recreate or move them by hand.
- **`--repo` on enrichment adapters is deprecated** — Use `--scope`
  instead. `--repo` still accepted for one cycle, with a deprecation
  warning.
- **`engram-mcp` removed** (ADR-005) — MCP server transport replaced by
  `engram context` for agent integration. Reduces surface area to a
  single pack-based API.
- **`engramark` benchmark suite removed** (ADR-005) — Stale-knowledge
  detection tests relocated under `packages/engram-core/test/`.
- **Retrieval ranking** — Config noise filtered; term-matching entities
  ranked higher.

### Fixed

- `engram status` — Auto-detects embedding provider; exits 0 for databases
  initialized with `--embedding-model none`; reports coverage gaps.
- `GOOGLE_API_KEY` accepted as a Gemini alias alongside `GEMINI_API_KEY`.
- `engram embed` — Defaults to `--status` when no mode flag is given;
  intro printed before validation.
- `engram ingest source --dry-run` exits 1 when parse errors occur.
- `engram ingest git` and `engram ingest md` suppress interactive
  intro/outro when stdout is piped.
- `engram export wiki` routes overwrite warnings to stderr.
- `engram search` sparse-results note gated on `--verbose` or stderr TTY.
- `engram visualize --port` validates range (1-65535) before starting.
- `engram reconcile --max-cost` validated before opening the graph.
- `engram reconcile` summary label column alignment.
- `engram project --kind` help text shows character constraint.
- `engram visualize` — Web UI assets bundled; graph rendering fixed.
- Markdown ingest — Walks directories; walker deny list tightened.
- README documentation — Overhauled to reflect the v0.2 surface (plugins,
  Gerrit, reconcile, `engram companion`, token-budget semantics).

## [0.1.0] - 2026-04-08

### Added

- **`.engram` format** — Single-file SQLite database schema with versioned
  migrations, metadata table, and all core tables (episodes, entities, edges,
  evidence chains).
- **Entity and edge CRUD** — Full graph write API with evidence-first invariants:
  every entity and edge requires provenance at creation time.
- **Temporal engine** — Validity windows (`valid_from`/`valid_until`), atomic
  supersession, and point-in-time snapshots across all edges.
- **Entity resolution and aliases** — Canonical name lookup with alias support;
  conservative exact-match resolution in v0.1.
- **Git VCS ingestion** (`engram init --from-git`) — Walks git history to extract
  authors, files, co-change patterns, ownership signals, and bus-factor edges.
  No API tokens required.
- **GitHub enrichment adapter** (`engram ingest enrich github`) — Pulls PR
  discussions, linked issues, and review comments into the graph.
- **Markdown and text ingestion** — Ingest `.md` and plain-text documents as
  episode sources.
- **Full-text search and hybrid retrieval** — FTS5-backed keyword search blended
  with vector similarity when an AI provider is configured.
- **Graph traversal and temporal queries** — Depth-limited neighbor traversal,
  edge filtering by kind/validity, and path-finding across the knowledge graph.
- **Knowledge decay detection** (`engram decay`) — Surfaces edges whose evidence
  is stale relative to recent activity.
- **CLI — core commands** — `init`, `add`, `search`, `show`, `history`, `decay`,
  `stats`, `verify`, `ingest`, `export`, `serve`.
- **MCP server** — stdio transport with a read-heavy tool surface for AI agents
  (Claude Code, Cursor).
- **Integrity verification** (`engram verify`) — Checks graph invariants: evidence
  coverage, temporal consistency, orphan detection.
- **Pluggable AI provider layer** — `null` (FTS-only, default), `ollama`
  (`nomic-embed-text`), and `gemini` (`gemini-embedding-001`) providers.
- **EngRAMark benchmark suite** — Stratified ground-truth Q&A evaluated against
  the Fastify repo, with per-type (relational/graph) breakdown and strategy
  comparison across retrieval modes.
- **Entity-anchored search** — Search results anchored to specific entities,
  improving precision for ownership and authorship queries.
- **Graph-aware retrieval with edge traversal** — Retrieval pipeline walks graph
  edges to gather context beyond direct keyword/vector matches.
- **MCP graph traversal tools** — `get_neighbors`, `find_edges`, `get_path` MCP
  tools for programmatic graph exploration.
- **Ownership risk report** (`engram ownership-report` / MCP `get_ownership_report`)
  — Bus-factor analysis: surfaces files and modules with single-owner concentration.
- **Graph visualization** (`engram visualize`) — Launches a local web UI backed
  by Cytoscape.js with pan/zoom, typed node/edge styling, entity and evidence
  detail panels, filter sidebar, search-to-focus, temporal time slider, and decay
  and ownership overlays.

### Fixed

- Hybrid search vector scores misaligned with FTS scores due to evidence chain
  mismatch — now normalized via a shared evidence chain so recall is consistent
  across retrieval modes.
- EngRAMark ground-truth dataset and clone depth were misconfigured, producing
  meaningless benchmark results — corrected dataset and full-depth clone.
- CI `commitlint` job was missing `pull-requests: read` permission, causing false
  failures on PRs.

[Unreleased]: https://github.com/rnwolfe/engram/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/rnwolfe/engram/releases/tag/v0.3.1
[0.3.0]: https://github.com/rnwolfe/engram/releases/tag/v0.3.0
[0.2.0]: https://github.com/rnwolfe/engram/releases/tag/v0.2.0
[0.1.0]: https://github.com/rnwolfe/engram/releases/tag/v0.1.0
