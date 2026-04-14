# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: the code itself. It also unblocks the baseline reconcile phase (separate spec) that will synthesize a hierarchical "Karpathy wiki" over the combined git + source graph.

## Strategic Rationale

Engram's structural layer today is derived entirely from git history. That's powerful — it's how `engram init --from-git .` works without an API token, and it's why the graph has evidence from day one. But it has a blind spot: **nothing reads the code itself.** An entity called `validateToken` exists in the graph only if a commit message or PR mentioned it. Its actual signature, location, imports, and call sites are invisible to the engine.

That's a problem for three reasons:

1. **Retrieval quality.** "What does `validateToken` do?" can only be answered by surfacing commits that touched it, not by summarizing the function itself. For a code-native tool, that's backwards.

2. **Projection authoring.** The projection layer (entity summaries, decision pages) is supposed to compile synthesized views of the substrate. If the substrate doesn't contain the code, projections have to infer it from commit diffs — lossy, expensive, and frequently hallucinated.

3. **Baseline wiki is blocked.** The vision's "Karpathy-wiki, made temporal" requires a hierarchical synthesis over the repo: `symbol → file → module → area → system`. That hierarchy comes for free from the file tree — but only if the file tree is *in the graph* as entities with evidence chains. Today it isn't.

Source ingestion fixes this by walking the working tree, parsing each file with tree-sitter, and emitting file/module/symbol entities with the same evidence-first invariants as every other episode in the graph. Ingest is idempotent (content-hash keyed), respects `.gitignore`, and uses a hardcoded denylist for build artifacts the gitignore might miss.

Without this, engram cannot fulfill the "developer-native" principle — a tool that claims to be developer infrastructure must read developer infrastructure.

## What It Does

After this ships, `engram ingest source` walks a working tree and populates the graph with file, module, and symbol entities backed by source episodes.

```bash
# Fresh ingest of the current repo
engram ingest source

# Specify a path explicitly
engram ingest source --path packages/engram-core

# Add exclusions on top of defaults + .gitignore
engram ingest source --exclude "*.test.ts" --exclude "fixtures/**"

# Ignore .gitignore (rare — for repos that gitignore things engram should see)
engram ingest source --no-gitignore
```

Behavior:

- **Respected by default**: hardcoded denylist (`node_modules`, `dist`, `build`, `.next`, `target`, `.git`, `coverage`, lockfiles, `*.min.js`, `*.map`) applied unconditionally. `.gitignore` also applied unless `--no-gitignore` is passed.
- **Languages in v1**: TypeScript + JavaScript only (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`). Files outside this set are walked but not parsed — they become file entities without symbol children, which is still useful for the graph.
- **Idempotent**: re-running on an unchanged tree produces zero new episodes. The walker hashes each file's content and skips parsing for unchanged content — the expensive step — entirely.
- **Supersedes on change**: a changed file supersedes its previous episode via the standard dedup path, and the symbol extractor re-runs to update the entity graph.
- **Archives deletes**: files no longer present in the walk are not hard-deleted. Their episode moves to `status='archived'`, and downstream projections flag stale via the read-time invariant.
- **Degrades gracefully**: a parse failure on one file is logged and skipped, never fails the whole run. A missing grammar WASM is a hard error at startup (not a per-file issue).

The substrate is still correct without AI. Source ingestion is a pure parser — it does not call an LLM, it does not require a provider to be configured, and it produces deterministic output.

## Command Surface / API Surface

### Core library (`engram-core`)

| Export | Description |
|--------|-------------|
| `ingestSource(graph, opts)` | Orchestrator: walks the tree, parses files, writes episodes + entities + edges |
| `SourceIngestOptions` | `{ root: string; exclude?: string[]; respectGitignore?: boolean; onProgress?: (e) => void }` |
| `SourceIngestResult` | `{ filesScanned, filesParsed, filesSkipped, episodesCreated, entitiesCreated, edgesCreated, deletedArchived, errors }` |

### CLI (`engram-cli`)

New subcommand under the existing `ingest` group:

```
engram ingest source [path]
  --exclude <glob>      Additional exclude pattern (repeatable)
  --no-gitignore        Skip .gitignore application (denylist still applies)
  --dry-run             Walk and report what would be ingested, write nothing
  --verbose             Per-file progress output
```

Default path is the current working directory.

### Data model (no schema changes)

- **Episodes** — one per parsed source file:
  - `source_type = 'source'`
  - `source_ref = '<relative-path>@<blake3>'` — the existing `(source_type, source_ref)` unique index gives idempotency for free
  - `body` = raw file contents
  - `ingested_at` = walk timestamp
- **Entities** — three kinds:
  - `file` — canonical name: relative path from repo root (e.g. `packages/engram-core/src/ai/provider.ts`)
  - `module` — canonical name: relative directory (e.g. `packages/engram-core/src/ai`); one per directory that contains ingested files
  - `symbol` — canonical name: `<relative-path>::<symbol-name>` (e.g. `packages/engram-core/src/ai/provider.ts::AIProvider`); disambiguates identically-named symbols across files
- **Edges** — all `edge_kind='observed'`:
  - `module → contains → file`
  - `module → contains → module` (parent directory → child directory)
  - `file → contains → symbol`
  - `file → imports → file` (resolved imports only; unresolvable imports dropped silently, not errored)
  - `symbol → defined_in → file`
- **Evidence** — every entity and edge above links back to the file episode via the standard evidence table. Evidence-first invariant holds without exception.

### Symbol extraction scope (v1)

Top-level declarations only:

- `function_declaration`
- `class_declaration`
- `interface_declaration`
- `type_alias_declaration`
- `enum_declaration`
- Exported `variable_declarator` (const/let at module scope, named by identifier)
- Default exports (named by file stem if anonymous)

Nested methods, arrow functions inside variables, and function expressions inside objects are deliberately out of scope for v1. They become part of the containing class/function's symbol body (via the episode content) but don't get their own entity. Rationale in design doc.

## Architecture / Design

Module layout under `packages/engram-core/src/ingest/source/`:

```
source/
├── index.ts          # ingestSource() orchestrator
├── walker.ts         # File walker: denylist + .gitignore composition
├── parser.ts         # web-tree-sitter init, grammar loader, query runner
├── extractors/
│   └── typescript.ts # TS/JS capture → entity/edge mapping
├── queries/
│   └── typescript.scm # Tree-sitter query (top-level captures)
└── grammars/
    ├── tree-sitter-typescript.wasm  # ~300KB, checked in
    └── tree-sitter-tsx.wasm         # ~300KB, checked in
```

Depth of internal details (data flow, query text, trade-offs, alternatives considered) lives in [`source-ingestion-design.md`](source-ingestion-design.md). This spec is the contract; the design doc is the implementation plan.

## Dependencies

- **Internal**: existing ingest pipeline (`packages/engram-core/src/ingest/`), `ingestion_runs` cursor table (already present), entity + edge CRUD, evidence helpers. All shipped.
- **External**:
  - `web-tree-sitter` (WASM runtime, no native build) — new dep
  - `ignore` (`.gitignore` parser) — new dep
  - Grammar WASM files checked into the repo under `grammars/` (not downloaded at runtime)
- **Blocked by**: Nothing.

## Acceptance Criteria

### Walker

- [ ] `walker.ts` recursively lists files under `root`, returning relative paths
- [ ] Hardcoded denylist (`node_modules`, `dist`, `build`, `.next`, `target`, `.git`, `coverage`, `*.min.js`, `*.map`, `package-lock.json`, `bun.lock`, `yarn.lock`, `pnpm-lock.yaml`) is always applied
- [ ] `.gitignore` is respected by default; `respectGitignore: false` disables it
- [ ] Nested `.gitignore` files are honored (not just the root one)
- [ ] `--exclude` patterns from the CLI are merged with the denylist
- [ ] Binary files (detected by null-byte sniff in first 4KB) are skipped silently
- [ ] Files over 1MB are skipped with a logged warning

### Parser

- [ ] `web-tree-sitter` initializes with both TypeScript and TSX grammars from WASM files shipped in the package
- [ ] Parser instance is reused across files (init cost paid once per run)
- [ ] Parse failures on an individual file are caught, logged, and counted in `SourceIngestResult.errors`; do not abort the run

### Extractor

- [ ] Top-level `function_declaration`, `class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration` produce symbol entities
- [ ] Exported variable declarators at module scope produce symbol entities
- [ ] Default exports produce a symbol entity (named by identifier or file stem)
- [ ] Nested symbols (methods, arrow functions inside vars) do NOT produce entities
- [ ] Import statements produce `file → imports → file` edges when the target file resolves inside the repo root
- [ ] Unresolvable imports (npm packages, aliases) are silently dropped, not errored

### Idempotency

- [ ] Second run over an unchanged tree creates zero new episodes, entities, or edges
- [ ] Changing a single file creates a new episode, supersedes the old, and updates the symbol entities for that file only
- [ ] Deleting a file archives its episode (`status='archived'`) and does NOT delete its entities
- [ ] `verifyGraph()` passes after every run (fresh, unchanged, modified, deleted)

### CLI

- [ ] `engram ingest source` runs against the current directory with defaults
- [ ] `engram ingest source --path <dir>` runs against a specific directory
- [ ] `--exclude <glob>` is repeatable and merges with the denylist
- [ ] `--dry-run` reports counts without writing
- [ ] `--verbose` emits per-file progress

### Tests

- [ ] Fixture project at `test/fixtures/source-sample/` with TS files, a nested directory, a gitignored file, a `node_modules/evil.ts`, a binary file, and a symlink
- [ ] Walker test: denylist + gitignore + binary skip + size limit all work
- [ ] Extractor test: known symbols extracted, import edges resolve, nested symbols absent
- [ ] Idempotency test: run twice, second run writes nothing
- [ ] Supersession test: modify a file, re-run, verify episode chain + entity updates
- [ ] Deletion test: remove a file, re-run, verify archival
- [ ] `verifyGraph()` invariant test after each scenario
- [ ] `bun test` passes, `bun run lint` passes, `bun run build` passes

## Out of Scope

- **Cross-file call graph.** Resolving "symbol X calls symbol Y" across files requires a symbol resolver (effectively a partial typechecker). Deferred until the benchmark demonstrates it's needed.
- **Nested symbol entities.** Methods, inner functions, and arrow functions inside variables stay as raw content in the containing file episode. Lowering the granularity later is easy; raising it is painful.
- **Non-TS/JS languages.** Python, Go, Rust, etc. are a fast-follow. The parser and extractor interfaces are designed to accept additional grammars without core changes.
- **Config file.** No `engram.config.json` or project-local config in v1. CLI flags only. If users start wanting per-project defaults, revisit after the baseline reconcile spec lands.
- **Real-time / watch mode.** One-shot ingest only. Watch mode is interesting but orthogonal.
- **Monorepo awareness beyond directory walking.** Bun workspaces, pnpm workspaces, and Nx projects are not recognized as first-class modules in v1 — they're just directories containing files.
- **Docstring extraction, JSDoc parsing, type inference.** The symbol entity has a name and a range. That's it. Semantic enrichment is the projection layer's job.
- **Baseline reconcile phase.** Separate spec. This ingester is a prerequisite, not an implementation, of the wiki-synthesis pass.

## Documentation Required

- [x] README: add `engram ingest source` to the ingestion section with a one-paragraph explanation
- [x] CLAUDE.md: add `packages/engram-core/src/ingest/source/` to the Key Files table and the File Organization tree
- [x] `docs/internal/specs/source-ingestion.md` (this file) — mark as Implemented after shipping
- [x] `docs/internal/specs/source-ingestion-design.md` — design doc (companion to this spec)
