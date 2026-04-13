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
│   │   │   │   └── text.ts
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
│   │       └── commands/     # init, add, search, show, decay, ingest, serve, export, project, reconcile
│   ├── engram-mcp/           # MCP server (stdio transport)
│   │   └── src/
│   │       ├── tools/        # MCP tool implementations
│   │       │   │             #   engram_search, engram_get_entity, engram_get_context,
│   │       │   │             #   engram_get_decay, engram_get_history,
│   │       │   │             #   engram_ownership_report,
│   │       │   │             #   engram_add_episode, engram_add_entity, engram_add_edge
│   │       └── server.ts     # stdio transport
│   └── engramark/            # Benchmark suite
│       └── src/
│           ├── datasets/     # Ground-truth Q&A for test repos
│           │   ├── fastify/  # v0.1 retrieval benchmark target
│           │   └── stale-knowledge/  # Stale-knowledge detection scenarios
│           │       ├── fastify.json  # 10 scenarios (sk-001..sk-010), 7 stale + 3 fresh
│           │       └── loader.ts     # loadDataset(), prepareScenarios() with project()
│           ├── runners/      # Benchmark execution
│           │   ├── stale-naive-rag.ts      # Baseline: always "not stale" (score 0.0)
│           │   ├── stale-read-time.ts      # Read-time: getProjection() stale flag only
│           │   └── stale-full-reconcile.ts # Full: reconcile() assess phase
│           ├── scoring/
│           │   └── stale-knowledge.ts  # computeStaleKnowledgeMetrics() — recall, precision, F1
│           └── report.ts     # Results formatting (includes stale-knowledge tables)
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
- `engram-core` is the product. CLI, MCP, and benchmark depend on it — never the reverse.
- Tests live next to the code they test (colocated in `test/` directories within each package)
- Keep files under 500 lines
- New ingest adapters go in `packages/engram-core/src/ingest/adapters/`
- AI providers go in `packages/engram-core/src/ai/`

## Architecture Patterns

### Three-Layer Architecture

1. **engram-core** (library) — all logic lives here. Zero CLI or transport dependencies.
2. **engram-cli** — thin wrapper using `commander` + `@clack/prompts`. Calls core APIs.
3. **engram-mcp** — thin wrapper using `@modelcontextprotocol/sdk`. Calls core APIs.

### Data Model

The `.engram` file is a SQLite database with this entity model:

- **Episodes** — immutable raw evidence (git commits, PR discussions, manual notes)
- **Entities** — derived projections (people, modules, services, decisions)
- **Edges** — temporal facts between entities with validity windows and evidence chains
- **Evidence tables** — many-to-many links from entities/edges back to episodes

**Hard invariant**: every entity and edge must have at least one evidence link. No floating knowledge without provenance.

### Temporal Model

- All timestamps are ISO8601 UTC
- Edges use half-open intervals: `[valid_from, valid_until)`
- `valid_from = NULL` means unknown start, `valid_until = NULL` means still current
- `invalidated_at` is the transactional timestamp when the system learned a fact was superseded
- Supersession is atomic: `supersedeEdge()` invalidates old + creates new in one transaction

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
2. **Enrichment adapters (pluggable)**: GitHub PRs/issues, future Gerrit/Jira/etc. Each implements `EnrichmentAdapter` interface.

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
- Benchmark tests in `engramark` package against Fastify repo
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
- Validate all user input at system boundaries (CLI args, MCP tool parameters)
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
| Language | TypeScript (Bun) | Author expertise, fast iteration, npm ecosystem for MCP |
| Storage | SQLite via `better-sqlite3` | Zero dependency, single file, FTS5 built in |
| Vector search | `sqlite-vec` or brute force | No external vector DB. Brute force fine for <50k embeddings |
| IDs | ULIDs | Sortable, unique, no coordination. Enables future merge without collision |
| Embedding default | `nomic-embed-text` via Ollama (384 dims) | Local-first, cloud optional |
| CLI framework | `commander` + `@clack/prompts` | Simple, proven, interactive when needed |
| MCP transport | stdio | Reference implementation for Claude Code/Cursor |

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
| `packages/engram-core/src/ai/` | AI provider layer (NullProvider, OllamaProvider, GeminiProvider) |
| `packages/engram-core/src/ai/kinds/` | Built-in projection kind catalog files (YAML). User overrides via `$XDG_CONFIG_HOME/engram/kinds/` (fallback `~/.config/engram/kinds/`). |
| `packages/engram-core/src/ai/kinds.ts` | Kind catalog loader — `loadKindCatalog()`, `KindEntry`, `KindCatalog` |
| `packages/engram-core/src/ingest/git.ts` | Git VCS ingestion (the "money command" engine) |
| `packages/engram-core/src/ingest/adapter.ts` | EnrichmentAdapter interface |

## MCP Tools

Tools exposed by `engram-mcp` via stdio transport:

| Tool | Purpose |
|------|---------|
| `engram_get_entity` | Retrieve a single entity by ID with edges and evidence chain |
| `engram_add_entity` | Add a new entity with backing evidence episode |
| `engram_search` | Hybrid search (FTS + vector + graph) across the knowledge graph |
| `engram_get_neighbors` | Return subgraph within N hops of an anchor entity (BFS traversal) |
| `engram_find_edges` | Filter edges by source, target, relation type, and/or time |
| `engram_get_path` | Find shortest path between two entities via BFS traversal |
