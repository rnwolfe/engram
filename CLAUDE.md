# Engram — Operating Manual

> This is the agentic knowledge base for engram. It captures architecture decisions,
> patterns, and development practices. It is the source of truth for how to work on
> this project.

## Project Overview

**Engram** — a local-first temporal knowledge graph engine for developer memory.

- **Language**: TypeScript (Bun runtime)
- **Storage**: SQLite via `better-sqlite3`
- **Linter**: Biome
- **IDs**: ULIDs (sortable, unique, no coordination)
- **Monorepo**: Bun workspaces

## Build & Test

```bash
bun install              # Install dependencies
bun run build            # Build all packages
bun test                 # Run all tests
bun run lint             # Lint (Biome)
```

- ALWAYS run tests after code changes
- ALWAYS run build before committing
- NEVER commit if tests fail

## File Organization

```
engram/
├── packages/
│   ├── engram-core/          # The engine library (THE product)
│   │   ├── src/
│   │   │   ├── graph/        # Entity, edge, alias, evidence CRUD
│   │   │   ├── temporal/     # Validity windows, supersession, snapshots
│   │   │   ├── retrieval/    # Hybrid search (FTS + vector + graph traversal)
│   │   │   ├── ingest/       # Ingestion pipeline
│   │   │   │   ├── git.ts           # VCS layer (universal, no API needed)
│   │   │   │   ├── adapter.ts       # EnrichmentAdapter interface
│   │   │   │   ├── adapters/
│   │   │   │   │   └── github.ts    # GitHub PRs + Issues (v0.1)
│   │   │   │   ├── markdown.ts
│   │   │   │   ├── text.ts
│   │   │   │   └── source/            # Source code ingestion (tree-sitter)
│   │   │   ├── sync/         # Config-driven sync orchestrator
│   │   │   │   ├── types.ts         # SyncConfig, SyncSource, SyncResult, SyncAuthConfig
│   │   │   │   ├── errors.ts        # SyncConfigValidationError, SyncSourceError
│   │   │   │   ├── run.ts           # runSync() orchestrator + validateSyncConfig()
│   │   │   │   └── index.ts         # barrel export
│   │   │   │       ├── index.ts       # Orchestrator — ingestSource() entry point
│   │   │   │       ├── walker.ts      # File walker (respects .gitignore, denylist)
│   │   │   │       ├── parser.ts      # tree-sitter WASM wrapper
│   │   │   │       ├── extractors/    # Language-specific symbol extractors
│   │   │   │       ├── queries/       # tree-sitter query files
│   │   │   │       └── grammars/      # Bundled WASM grammar files
│   │   │   ├── ai/           # LLM integration (entity extraction, embeddings)
│   │   │   │   ├── provider.ts      # Abstract interface
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── null.ts          # No-AI fallback
│   │   │   ├── evidence/     # Evidence chain tracking
│   │   │   ├── format/       # .engram file I/O, schema, migrations
│   │   │   └── index.ts      # Public API surface
│   │   └── test/
│   ├── engram-cli/           # CLI application
│   │   └── src/
│   │       └── commands/     # init, add, search, show, decay, ingest, export, project, reconcile
├── docs/
│   ├── internal/
│   │   ├── VISION.md         # Product vision and design principles
│   │   ├── DECISIONS.md      # Architectural decision records
│   │   ├── LIFECYCLE.md      # Lifecycle documentation
│   │   └── autodev-pipeline.md
│   ├── format-spec.md        # .engram format specification (standalone, versioned)
│   └── architecture.md       # Architecture decision records
├── forge.toml                # Pipeline configuration
├── CLAUDE.md                 # This file
└── README.md
```

Rules:
- `engram-core` is the product. CLI and other consumers depend on it — never the reverse.
- Tests live next to the code they test (colocated in `test/` directories within each package)
- Keep files under 500 lines
- New ingest adapters go in `packages/engram-core/src/ingest/adapters/`
- AI providers go in `packages/engram-core/src/ai/`

## Architecture Patterns

### Three-Layer Architecture

1. **engram-core** (library) — all logic lives here. Zero CLI or transport dependencies.
2. **engram-cli** — thin wrapper using `commander` + `@clack/prompts`. Calls core APIs.
3. **(future) engram-plugins** — pluggable transport/integration layer. Calls core APIs.

### Data Model

The `.engram` file is a SQLite database with this entity model:

- **Episodes** — immutable raw evidence (git commits, PR discussions, manual notes)
- **Entities** — derived projections (people, modules, services, decisions)
- **Edges** — temporal facts between entities with validity windows and evidence chains
- **Evidence tables** — many-to-many links from entities/edges back to episodes

**Hard invariant**: every entity and edge must have at least one evidence link. No floating knowledge without provenance.

**Vocabulary**: `entity_type`, `episodes.source_type`, `ingestion_runs.source_type`, and `relation_type` values are defined in `packages/engram-core/src/vocab/`. All adapters MUST import from there — never inline string literals. See `docs/internal/specs/vocabulary.md`.

### Temporal Model

- All timestamps are ISO8601 UTC
- Edges use half-open intervals: `[valid_from, valid_until)`
- `valid_from = NULL` means unknown start, `valid_until = NULL` means still current
- `invalidated_at` is the transactional timestamp when the system learned a fact was superseded
- Supersession is atomic: `supersedeEdge()` invalidates old + creates new in one transaction
- Time-travel queries: use `engram context "<q>" --as-of "<when>"` to retrieve a context pack reflecting what the graph knew at a past point in time (learn-time filter: `created_at <= T AND (invalidated_at IS NULL OR invalidated_at > T)`); see `docs/internal/specs/as-of-queries.md`

### Read-Time Staleness (Projection Invariant)

Every read of a projection recomputes its current input fingerprint and carries a
`stale: boolean` and optional `stale_reason` in the result. This is an invariant —
no read path (`getProjection`, `listActiveProjections`, `searchProjections`) may return
a projection without computing the freshness flag.

- `stale: false` — stored `input_fingerprint` matches current substrate content.
- `stale: true, stale_reason: 'input_content_changed'` — an input's content has drifted.
- `stale: true, stale_reason: 'input_deleted'` — an input was redacted or invalidated.

Coverage drift ("new substrate rows that were never in the evidence set") is **not** a
read-time signal — that is the `reconcile` discover phase's responsibility. Conflating
the two would require O(substrate) read-time queries instead of O(inputs).

The stale flag is read-only. It never modifies `invalidated_at` or any projection column.
Resolving stale projections requires `engram reconcile`.

### Edge Kinds

Every edge has an `edge_kind` that separates observed fact from inference from human assertion:

- `observed` — directly extracted from source (e.g. git blame attribution)
- `inferred` — derived by heuristic (e.g. co-change frequency implies dependency)
- `asserted` — manually stated by a human

This distinction is critical for trust. Never present inferred edges as observed facts.

### Ingestion Architecture

Two layers:
1. **VCS layer (universal)**: git commits, blame, co-change analysis. No API tokens needed. Produces the structural graph.
2. **Enrichment adapters (pluggable)**: GitHub PRs/issues, Gerrit, future Jira/etc. Each implements `EnrichmentAdapter` interface (v2). New adapters must import `entity_type`, `source_type`, and `relation_type` values from `packages/engram-core/src/vocab/`.

**Preferred entry point**: For routine multi-source ingestion, use `engram sync` with a `.engram.config.json` rather than composing individual `engram ingest` commands. See `docs/internal/specs/sync-orchestration.md`.

**Adapter contract v2 — key conventions:**
- **Auth**: Use `AuthCredential` union (`bearer`, `basic`, `service_account`, `oauth2`, `none`) via `opts.auth`. Declare accepted kinds in `supportedAuth: AuthCredential['kind'][]`. Use `assertAuthKind()` helper before processing.
- **Scope**: Declare `scopeSchema: ScopeSchema` with a description and `validate()` method. Pass scope via `opts.scope` (replaces deprecated `opts.repo`).
- **Cursors**: Use `readIsoCursor()`, `readNumericCursor()`, and `writeCursor()` from `packages/engram-core/src/ingest/cursor.ts` — never inline cursor SQL.
- **Compat shim**: Call `applyCompatShim(opts)` at the start of `enrich()` to automatically map deprecated `opts.token`/`opts.repo` to v2 fields with a one-shot warning.
- See `docs/internal/specs/adapter-contract.md` for full contract documentation.

Ingestion is idempotent:
- Episode dedup via `(source_type, source_ref)` unique index
- Ingestion cursors in `ingestion_runs` table
- Edge dedup via active edge uniqueness check before insert
- On collision: supersede (never silently skip)

### Evidence-First Writes

The API enforces evidence on every write:
- `addEntity()` requires `EvidenceInput`
- `addEdge()` requires `EvidenceInput`
- Manual assertions create an episode of `source_type = 'manual'` and link through evidence like any other source

### Entity Resolution

Conservative in v0.1: exact canonical name or alias match only. `resolveEntity()` returns null if no match — caller decides whether to create or merge. No automatic semantic dedup.

## Testing Standards

- Unit tests for all core engine operations (graph CRUD, temporal logic, evidence chains)
- Integration tests for ingestion pipeline against real git repos
- Stale-knowledge detection tests in `packages/engram-core/test/stale-knowledge/`
- Test file naming: `*.test.ts` colocated with source
- Use real SQLite databases in tests (in-memory `:memory:` or temp files), not mocks
- Test temporal invariants explicitly: validity windows, supersession chains, evidence integrity
- Run `verifyGraph()` in tests to catch invariant violations

## Error Handling

- Wrap errors with context: what operation failed, on what input
- Use typed error classes for distinct failure modes (e.g. `EvidenceRequiredError`, `EntityNotFoundError`)
- Never swallow errors silently — the evidence chain depends on correctness
- CLI should print human-readable error messages, not stack traces
- Log at debug level for ingestion progress, warn for skipped/deduped items, error for failures

## Security Rules

- NEVER hardcode secrets or API keys
- NEVER commit `.env` files
- API tokens for enrichment adapters are passed via environment variables or CLI flags, never stored in `.engram` files
- The `.engram` file contains raw source content (commit messages, PR text) — treat it as potentially sensitive
- Validate all user input at system boundaries (CLI args, tool parameters)
- Sanitize file paths in git ingestion (prevent directory traversal)
- Episode redaction (`status = 'redacted'`) is the mechanism for data deletion — preserve the row, clear the content

## Development Workflow

- **main is sacred.** All changes go through PRs. No direct pushes.
- Branch naming: `feat/`, `fix/`, `chore/`, `docs/` prefixes
- Conventional commits: `type: description` format (lowercase, no scope, no trailing period)
- PRs require CI passing (commitlint + test + build + lint)
- Biome handles formatting and linting — run `bun run lint` before committing

## Autonomous Development Workflow

An event-driven GitHub Actions pipeline that autonomously implements issues end-to-end.
For a comprehensive architecture deep-dive with diagrams, see
[docs/internal/autodev-pipeline.md](docs/internal/autodev-pipeline.md).

### How it works

Four workflows form the core loop, plus a weekly audit:

1. **`autodev-dispatch`** — Runs on a configurable cron. Picks the highest-priority `backlog/ready` issue, labels it `agent/implementing`, and triggers the implement workflow.
2. **`autodev-implement`** — Checks out the base branch, creates a feature branch, runs the agent to implement the issue, pushes, and opens a PR. After creating the PR, the workflow polls for Copilot review and dispatches `autodev-review-fix`.
3. **`autodev-review-fix`** — Phased review pipeline: Copilot phase (up to N iterations) -> Claude phase -> done.
4. **`claude-code-review`** — Triggered by `agent/review-claude` label or `@claude` mention.
5. **`autodev-audit`** — Weekly pipeline health report filed as a GitHub issue.

### Labels

| Label | Meaning |
|-------|---------|
| `backlog/ready` | Issue is ready for autonomous implementation |
| `agent/implementing` | Issue is currently being implemented by an agent |
| `agent/review-copilot` | Agent is addressing Copilot review feedback |
| `agent/review-claude` | Agent is addressing Claude review feedback |
| `human/blocked` | Agent hit a limit and needs human intervention |
| `via/actions` | PR created by GitHub Actions pipeline |
| `via/autodev` | PR created by /autodev CLI skill |

### Secrets required

| Secret | Purpose |
|--------|---------|
| `CLAUDE_CODE_OAUTH_TOKEN` | OAuth token for Claude Code agent execution |
| `APP_ID` + `APP_PRIVATE_KEY` | GitHub App credentials for push/PR operations |

## GitHub Issue Workflow

When creating a PR that implements a GitHub issue:

1. Read the original issue and extract acceptance criteria
2. Verify each criterion is satisfied by the implementation
3. Document verification in the PR body under "Acceptance Criteria"
4. Use closing keywords (`Closes #N`, `Fixes #N`) for auto-close on merge

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (Bun) | Author expertise, fast iteration, rich npm ecosystem |
| Storage | SQLite via `better-sqlite3` | Zero dependency, single file, FTS5 built in |
| Vector search | `sqlite-vec` or brute force | No external vector DB. Brute force fine for <50k embeddings |
| IDs | ULIDs | Sortable, unique, no coordination. Enables future merge without collision |
| Embedding default | `nomic-embed-text` via Ollama (384 dims) | Local-first, cloud optional |
| CLI framework | `commander` + `@clack/prompts` | Simple, proven, interactive when needed |

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project operating manual |
| `forge.toml` | Pipeline configuration |
| `docs/internal/VISION.md` | Product vision and design principles |
| `docs/internal/DECISIONS.md` | Architectural decision records |
| `packages/engram-core/src/index.ts` | Public API surface |
| `packages/engram-core/src/format/` | `.engram` file schema and migrations |
| `packages/engram-core/src/graph/` | Entity, edge, alias, evidence CRUD |
| `packages/engram-core/src/temporal/` | Temporal logic (validity, supersession, snapshots) |
| `packages/engram-core/src/temporal/as-of.ts` | `resolveAsOf()` — parse `--as-of` strings (ISO, bare date, relative) into UTC timestamps; `InvalidAsOfError` |
| `docs/internal/specs/as-of-queries.md` | Learn-time filter semantic, relative-string grammar, stale semantics, rationale for deferring `--active-only` |
| `packages/engram-core/src/ai/` | AI provider layer (NullProvider, OllamaProvider, GeminiProvider) |
| `packages/engram-core/src/ai/kinds/` | Built-in projection kind catalog files (YAML). User overrides via `$XDG_CONFIG_HOME/engram/kinds/` (fallback `~/.config/engram/kinds/`). |
| `packages/engram-core/src/ai/kinds.ts` | Kind catalog loader — `loadKindCatalog()`, `KindEntry`, `KindCatalog` |
| `packages/engram-core/src/sync/run.ts` | `runSync()` orchestrator + `validateSyncConfig()` — preferred multi-source entry point |
| `docs/internal/specs/sync-orchestration.md` | Config schema, discovery, adapter resolution, failure semantics, exit codes |
| `docs/examples/.engram.config.json` | Example sync config file |
| `packages/engram-core/src/ingest/git.ts` | Git VCS ingestion (the "money command" engine) |
| `packages/engram-core/src/ingest/adapter.ts` | EnrichmentAdapter interface (v2) — AuthCredential, ScopeSchema, applyCompatShim, assertAuthKind |
| `packages/engram-core/src/ingest/cursor.ts` | Cursor helpers — readIsoCursor, readNumericCursor, writeCursor |
| `docs/internal/specs/adapter-contract.md` | Full adapter contract v2 documentation — auth, scope, cursors, migration |
| `docs/internal/specs/adapter-aliases.md` | Adapter shorthand alias convention (required for cross-source ref resolution) |
| `docs/internal/specs/cross-source-references.md` | Cross-source reference resolver architecture |
| `docs/internal/specs/vocabulary.md` | Controlled vocabulary registries — entity_type, source_type, relation_type |
| `packages/engram-core/src/vocab/` | Vocabulary registry module (ENTITY_TYPES, EPISODE_SOURCE_TYPES, RELATION_TYPES, etc.) |
| `packages/engram-core/src/format/verify.ts` | Graph integrity checker; supports `{ strict: true }` for vocab validation |
| `packages/engram-core/src/ingest/source/` | Source code ingestion — walks working tree, parses TS/JS with tree-sitter, creates file/module/symbol entities |
