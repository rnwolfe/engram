# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by `ingestGitRepo()` — commits, blame attributions, co-change edges. That layer is universal (no API tokens) and produces the structural graph the vision calls for. But none of it reads a source file. A function called `validateToken` only appears in the graph if a commit message or PR body mentioned the string "validateToken". The function's actual definition, imports, and call neighborhood are invisible to the engine.

This design adds a peer ingester — `ingestSource()` — that walks the working tree, parses source files with tree-sitter, and emits file/module/symbol entities with the same evidence-first guarantees as git ingestion. It does not replace git ingestion; it complements it. A mature engram graph will have episodes from both sources and entities that are linked through both — a symbol entity from source ingestion and a commit episode from git ingestion both pointing at the same file.

## Goals

1. **Grounded substrate.** Every symbol, file, and module in the graph is backed by a source episode whose `source_ref` is a content-addressed pointer to an actual file.
2. **Deterministic and offline.** No LLM calls. Parser output is a pure function of file content.
3. **Idempotent and incremental.** Unchanged files are not re-parsed. The expensive step — running tree-sitter over file bodies — only happens for new or modified content.
4. **Language-agnostic architecture, TS/JS in v1.** The parser and extractor layers accept pluggable grammars and extraction queries. Adding Python later is "drop in a grammar + a .scm file + a mapping function", not a refactor.
5. **Respect the user's intent.** `.gitignore` is followed by default. Build artifacts that escape `.gitignore` are caught by a hardcoded denylist. The user can override both.
6. **Fail safely.** A single file that fails to parse does not abort the run. Parse errors are logged and counted, never silent.

## Non-goals (recap from spec)

Call graph resolution, nested symbols, non-TS/JS languages, watch mode, docstring/JSDoc extraction, monorepo awareness. Deferred explicitly and documented in the spec's Out of Scope section.

## Architecture overview

```
ingestSource(graph, opts)
  │
  ├─► walker.walk(root, opts)          ─► yields FileEntry stream
  │     denylist + .gitignore + size/binary filters
  │     each entry: { relPath, absPath, contentHash, size }
  │
  ├─► for each FileEntry:
  │     ├─ episode = upsertEpisode({ source_type: 'source', source_ref: `${relPath}@${contentHash}`, body })
  │     │    ↳ SKIPs parsing if episode already exists (idempotency fast path)
  │     │
  │     ├─ if parseable language (ext in TS_JS_SET):
  │     │     ast = parser.parse(body, language)
  │     │     captures = parser.runQuery(ast, TS_QUERY)
  │     │     extraction = extractors.typescript(captures, relPath, episode)
  │     │     upsertEntities(extraction.entities)
  │     │     upsertEdges(extraction.edges)
  │     │     linkEvidence(extraction.*, episode)
  │     │
  │     └─ else:
  │           upsert file + module entities only (no symbols)
  │
  ├─► sweep: for each previously-ingested source episode NOT visited this run:
  │     archiveEpisode(episode)     # status = 'archived'
  │     (entities stay; stale flag propagates at read time)
  │
  └─► write ingestion_runs row with cursor + counts
```

Each step below digs into the design choices.

## Walker

**File**: `packages/engram-core/src/ingest/source/walker.ts`

The walker is a pure generator: given a root and options, it yields `FileEntry` records. It owns denylist application, `.gitignore` composition, binary detection, and size limits. It does not touch the database.

```typescript
interface FileEntry {
  relPath: string;    // posix-style, relative to root
  absPath: string;
  contentHash: string;  // blake3 of the raw bytes
  size: number;
  body: string;       // utf-8; binary files are filtered upstream
}

interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean;  // default true
  maxFileBytes?: number;       // default 1_048_576 (1 MB)
}

export async function* walk(opts: WalkOptions): AsyncIterable<FileEntry>;
```

### Denylist

Hardcoded, always applied:

```
node_modules/  dist/  build/  .next/  out/  target/  .git/  coverage/
*.min.js  *.min.css  *.map  *.lock  *.lockb
package-lock.json  bun.lock  bun.lockb  yarn.lock  pnpm-lock.yaml
.DS_Store  Thumbs.db
```

Rationale: these patterns are universally unwanted and `.gitignore` is unreliable at covering them (plenty of real repos commit `dist/` for library distributions, for example, and we still don't want to parse it as source). Denylist wins over `.gitignore` — if `.gitignore` un-ignores `node_modules`, we still skip it.

### .gitignore composition

Use the [`ignore`](https://www.npmjs.com/package/ignore) package — the same library Prettier, ESLint, and every other JS code tool uses. It handles nested `.gitignore` files, negations (`!pattern`), and the weird gitignore edge cases correctly.

Implementation:

1. At walk start, discover all `.gitignore` files under the root (`fs.readdir` recursively, filtered to `.gitignore`).
2. Build one `ignore` instance per directory, chained from the root downward.
3. For each candidate file, walk the chain from root to the file's parent, passing its relative path through each `ignore` instance. If any returns `true`, skip.
4. User-supplied `--exclude` patterns are added to the root `ignore` instance so they layer on top of `.gitignore`.

### Binary detection

Standard trick: read the first 4KB of the file. If it contains a null byte (`0x00`), it's binary. Skip silently — no log, binary skip is expected behavior. Applied before the size check so we don't reject large images by virtue of their size.

### Size limit

Default 1MB. Files above the limit are skipped with a warning log. Rationale: a 10MB generated SQL dump or a committed CSV fixture should not be parsed as source, and no legitimate TS/JS source file approaches this size. User can override via `maxFileBytes` if they have a repo with absurd source files.

### Content hashing

`blake3` via `@noble/hashes` or equivalent. Faster than SHA-256, cryptographically secure, and widely supported in pure-JS environments (no native deps). Alternative considered: SHA-1 is faster but cryptographically broken — we don't need the security, but the graph is a durable artifact and using a broken hash function in the key schema would be a future embarrassment.

## Parser

**File**: `packages/engram-core/src/ingest/source/parser.ts`

Thin wrapper around `web-tree-sitter`. Initializes once at the start of a run, loads grammar WASM files from the package's `grammars/` directory, and exposes a simple `parse(body, language)` and `runQuery(ast, queryText)` API.

```typescript
export class SourceParser {
  private parsers: Map<Language, Parser>;  // Parser instances per language
  private queries: Map<Language, Query>;

  static async create(): Promise<SourceParser>;

  parse(body: string, lang: Language): Tree;
  runQuery(tree: Tree, lang: Language): QueryCapture[];
  dispose(): void;
}

type Language = 'typescript' | 'tsx';
```

### Why web-tree-sitter (WASM) over native

| Option | Pro | Con |
|---|---|---|
| `tree-sitter` (native N-API) | Faster (~2–3x) | Native build per platform. Bun had intermittent N-API issues. Autodev pipeline would need platform-specific wheels. |
| **`web-tree-sitter` (WASM)** | **One binary, all platforms. No build step. Bun-friendly. Portable to a hypothetical browser target.** | **Slower parsing, but parsing is not the bottleneck — IO and DB writes are.** |
| `@ast-grep/napi` | Nicer query DSL | Native. Same portability concern. |

The slowdown is real (benchmarks put WASM at roughly 40% of native throughput for TypeScript) but the walker + DB write dominates the total runtime. On engram's own repo — ~200 source files — a full parse finishes in well under a second either way. Choosing WASM trades speed we don't need for portability we do need.

### Grammar WASM files

Shipped inside the package under `src/ingest/source/grammars/`. Sources:

- `tree-sitter-typescript.wasm` — built from https://github.com/tree-sitter/tree-sitter-typescript
- `tree-sitter-tsx.wasm` — same repo, TSX variant

Build is offline and one-shot (documented in the design doc for future grammar additions): `tree-sitter build-wasm` in a Docker container with emscripten. The resulting WASM is vendored and checked in. Not downloaded at runtime. Rationale: runtime fetching introduces network dependency + supply-chain risk for a dep that changes essentially never.

Grammar version is pinned in a `grammars/MANIFEST.json` alongside the blobs for provenance.

### Parser lifecycle

`SourceParser.create()` is called once per `ingestSource()` run. WASM init for tree-sitter takes ~200ms — paying it per file would be unacceptable. Paying it once per run is fine. The parser instance is disposed at the end of the run to release WASM memory.

## Extractor

**File**: `packages/engram-core/src/ingest/source/extractors/typescript.ts`

Takes the query captures produced by the parser and maps them into the extraction result:

```typescript
interface ExtractedFile {
  entities: Array<{
    kind: 'file' | 'module' | 'symbol';
    canonicalName: string;
    attributes: Record<string, unknown>;
  }>;
  edges: Array<{
    source: string;
    target: string;
    relation: 'contains' | 'imports' | 'defined_in';
  }>;
  imports: string[];  // unresolved raw import specifiers, for the resolver pass
}
```

### Tree-sitter query

**File**: `packages/engram-core/src/ingest/source/queries/typescript.scm`

The query is the complete specification of what counts as a "top-level symbol." Roughly:

```scheme
(program
  (function_declaration
    name: (identifier) @symbol.function))

(program
  (class_declaration
    name: (type_identifier) @symbol.class))

(program
  (interface_declaration
    name: (type_identifier) @symbol.interface))

(program
  (type_alias_declaration
    name: (type_identifier) @symbol.type))

(program
  (enum_declaration
    name: (identifier) @symbol.enum))

(program
  (lexical_declaration
    (variable_declarator
      name: (identifier) @symbol.const)))

(program
  (export_statement
    declaration: (function_declaration
      name: (identifier) @symbol.function.exported)))

; ... same pattern for class/interface/type/enum/const under export_statement ...

(import_statement
  source: (string) @import.source)
```

Anchoring captures to `(program …)` is the key trick — it restricts to top-level declarations without walking into class bodies or function bodies, which is exactly the v1 scope. Nested symbols match deeper rules we don't write.

### Import resolution

Imports land as raw specifiers: `'./foo'`, `'../bar/baz'`, `'@engram/core'`, `'fs'`. The resolver pass converts these into graph edges where possible:

1. **Relative imports** (`./`, `../`): resolve against the importing file's directory. Try each of these extensions in order: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`, `/index.ts`, `/index.tsx`, `/index.js`. If one resolves to a file we ingested, emit `file → imports → file` edge. If none match, drop silently.
2. **Package imports** (`fs`, `react`, `@engram/core`): drop silently in v1. Resolving these requires reading `tsconfig.json` path mappings, `package.json` exports, and the node resolution algorithm — a rabbit hole. Deferred.
3. **Absolute imports**: extremely rare; treat as package imports and drop.

The resolver runs after the walker completes and all files are in the episode store, so it has full knowledge of which targets are ingestable.

### Why no cross-file call graph

This is the biggest deliberate omission. "Function X calls function Y across files" is the most useful code-graph edge imaginable, and it's also a partial compiler. To resolve it correctly you need:

- Symbol table per file
- Import resolution (already planned)
- Scope analysis inside each function body
- Type resolution for method calls (`obj.method()` — what's the type of `obj`?)
- Handling of re-exports, aliases, and barrel files

Each of those is its own project. `ts-morph` or the TypeScript compiler API would solve it in one shot but drag in a 50MB dependency and slow ingestion by 10x. We will not cross this bridge until the benchmark shows retrieval suffers for lack of it.

**Intra-file call tracking** is much easier (no resolution required — it's just a walk of the function body looking for `call_expression` nodes whose callee is an identifier defined in the same file) and could be added in v1.1 without waiting for the cross-file resolver.

## Data flow + idempotency

The idempotency story hinges on `(source_type, source_ref)` being a unique index on the episodes table — which it already is. The walker computes `contentHash = blake3(body)` and constructs `source_ref = '${relPath}@${contentHash}'`. On upsert:

- **Unchanged file**: `source_ref` already exists. The upsert is a no-op — the existing episode row is returned. Crucially, we skip parsing entirely in this case. The walker emits the `FileEntry`, we compute the `source_ref`, the database lookup returns `exists`, and we move on to the next file. No tree-sitter invocation, no entity writes. This is the fast path and it dominates wall-clock time on re-runs.
- **Changed file**: `source_ref` is new (content changed → hash changed). A new episode is inserted. The old episode (same `relPath`, different hash) is located via a secondary lookup and superseded via the standard supersession path. The extractor runs on the new body and emits fresh entity/edge writes. Entities are keyed by canonical name (`<relPath>::<symbol>`), so symbol renames look like a delete of the old symbol + an insert of the new one — the old one becomes an orphan entity until the next reconcile pass flags it stale.
- **New file**: new `source_ref`, new episode, extractor runs, entities inserted.
- **Deleted file**: handled in the sweep phase at the end of the run (see next section).

### Sweep phase for deletions

After the walk completes, we query: "which source episodes exist in the database that were NOT visited in this run?" Those correspond to files that no longer exist (or were newly gitignored/excluded). For each:

1. Update the episode's `status` to `'archived'`.
2. Do **not** delete the episode's entities. The evidence chain would be broken if we did. Instead, the stale-projection invariant described in CLAUDE.md will flag anything downstream (projections, derived edges) at the next read.
3. Log the archival at INFO level.

This is intentionally conservative. A user might rename `foo.ts` → `bar.ts` and the entities named `foo.ts::X` become orphans while new `bar.ts::X` entities are created. That's the correct behavior in a content-addressed system — names are identifiers, not identities, and we don't guess at rename detection in v1. If this turns out to be painful in practice, rename detection is a standalone feature that could be layered on top without touching this design (git rename detection is the model to copy).

### Cursor

Reuse `ingestion_runs` table. One row per `ingestSource()` invocation with:

- `source_type = 'source'`
- `scope = root` (absolute path)
- `status = 'completed' | 'partial' | 'failed'`
- `started_at`, `completed_at`
- Counts matching `SourceIngestResult`

The cursor is less important for source ingestion than for git ingestion because the walk is always full (no delta cursor makes sense for a file tree — you have to list everything to know what exists). The cursor's purpose here is history and auditability, not performance.

## Error handling

| Error | Handling |
|---|---|
| Denied file (denylist or gitignore) | Silently skipped |
| Binary file | Silently skipped |
| File exceeds size limit | Skipped with WARN log |
| Unreadable file (permission denied, disappeared mid-walk) | Skipped with WARN log, counted in `errors` |
| Parse failure (malformed source) | Skipped with WARN log, counted in `errors`, run continues |
| Missing WASM grammar at init | Hard error — fail fast at `SourceParser.create()` |
| DB write failure | Propagates up and aborts the run; `ingestion_runs` row marked `failed` |

No fallback to regex-based extraction if tree-sitter fails on a file. The file simply gets a file entity and an episode but no symbol children. This is an honest degradation — better than wrong extraction.

## Alternatives considered

### 1. Regex-based symbol extraction

**Rejected.** The first instinct for a v1 is "just grep for `export function`". It's tempting because it has no dependencies and works on any file. It was rejected because:

- It gets TypeScript wrong. Template literals, JSX, and decorators all confuse regexes. A regex extractor would either miss real symbols or extract false positives, and the user would learn to distrust the graph.
- It doesn't generalize. The moment you add Python, you rewrite the extractor. tree-sitter generalizes.
- The extraction accuracy bar for "this is what the graph says about your code" is high. Silently wrong is worse than slow.

### 2. TypeScript compiler API (`ts-morph` / `typescript`)

**Rejected for v1, considered for v1.1.** `ts-morph` gives you a full semantic model: types, symbol resolution, cross-file references, the works. If v1 needed cross-file call graphs, this would be the right choice. It wasn't chosen because:

- It's TypeScript-only. Adding Python means a second parser. Adding Go means a third. The architecture calcifies around TS.
- Dependency weight: ~30MB installed.
- Parse speed: 5–10x slower than tree-sitter. On a large repo that's the difference between "ingest runs while you make coffee" and "ingest runs overnight".
- v1 doesn't need the semantic model. Top-level symbols + imports are structural, not semantic.

If the benchmark later shows that cross-file call edges materially improve retrieval quality, a separate `symbol-resolver` pass using `ts-morph` can run *after* tree-sitter ingestion and add edges. That keeps the fast path fast and makes the expensive pass opt-in.

### 3. `@ast-grep/napi`

**Rejected.** Lovely query DSL, built on tree-sitter, faster than `web-tree-sitter`. Native module. Same portability concern that ruled out the native `tree-sitter` binding. If `web-tree-sitter` proves painfully slow in practice, revisit.

### 4. Language Server Protocol (LSP) clients

**Rejected.** Using the TypeScript language server would give us semantic accuracy for free. But LSP is a stateful protocol requiring a long-running subprocess, and engram is a one-shot ingest tool. Conceptual mismatch + deployment complexity.

### 5. Storing the AST in the database

**Rejected.** Tempting because "what if we want to query the AST later?" — but ASTs are enormous (10x the source size in JSON form), version-locked to the grammar, and re-parseable from the episode body at any time. Store the source, re-derive the AST on demand if ever needed. The episode body is already the source of truth; re-deriving the AST is pure and cheap.

## Implementation sequence

1. **Scaffolding + walker.** Create the directory structure, wire up `web-tree-sitter` and `ignore` as dependencies, build the walker with denylist, gitignore, binary, and size handling. Ship with a standalone test over the fixture directory. (no DB integration yet — walker is pure)
2. **Parser integration.** Load tree-sitter WASM, write the TS query file, run it against a single fixture file, assert captures match expectations. Test with `bun test`.
3. **Extractor.** Map captures to entities and edges. Test with multi-file fixture. Still no DB.
4. **DB integration.** Wire the extractor into `graph/episodes.ts` + `graph/entities.ts` + `graph/edges.ts` + evidence helpers. Implement upsert semantics and verify idempotency with a real SQLite file.
5. **Sweep phase.** Implement archival of unvisited episodes. Test with a fixture where a file is added then removed across two runs.
6. **CLI surface.** Add `engram ingest source` command. Wire options. Dry-run mode. Verbose mode.
7. **End-to-end test against engram itself.** Run on the engram repo, verify the result graph passes `verifyGraph()`, spot-check that known symbols (`ingestSource`, `ProjectionGenerator`, etc.) appear as entities with the right file linkage.
8. **Acceptance criteria sweep.** Walk the spec's acceptance checklist, tick each box, add tests where needed.
9. **Docs.** Update README and CLAUDE.md. Mark the spec as Implemented.

Each step is a separate commit. Step 4 is the highest-risk commit — it's where the idempotency contract meets real SQLite. Budget extra time for it.

## Risks

- **WASM parse speed on very large repos.** Tree-sitter WASM is ~40% the throughput of native. On a 10k-file monorepo this could add noticeable minutes. Mitigation: idempotency fast path means re-runs are cheap, only the first run is slow. If it becomes a real complaint, the parser layer's interface is compatible with a native fallback that can be swapped in behind a feature flag.
- **.gitignore edge cases.** The `ignore` package handles most of them, but `.gitignore` has surprising corners (negation + nested files, directory-only patterns, case-insensitive filesystems on macOS). Mitigation: explicit test fixtures for each corner, plus a `--verbose` flag that explains why each file was included or excluded.
- **Symbol naming collisions within a file.** Tree-sitter will happily capture two `function foo` declarations in the same file if the source has them (which is invalid TS but valid JS). Canonical names would collide. Mitigation: the extractor de-duplicates captures by name, keeping the first and logging a WARN for the rest. We don't support files that abuse this.
- **WASM init cost blocking the first file.** ~200ms startup delay. Mitigation: accept it — the user sees one message ("loading grammars") and nothing else matters. For tests, the parser can be cached across test cases.
- **Entity explosion on huge files.** A 500-line file might have 30 exports. Times 1000 files = 30k symbol entities on a medium repo. Graph can handle it (SQLite), but reconcile's downstream cost scales with entity count. Mitigation: top-level only is already the main constraint on explosion. Revisit if benchmark shows the graph gets unwieldy.

## Open questions

1. **Do we emit `module` entities for every directory walked, or only for directories that contain ingested files?** Leaning toward "only directories with files" to avoid empty module entities. Flag for review during implementation.
2. **Canonical naming for symbols:** is `<relPath>::<name>` the right format, or should it be `<relPath>#<name>` (URL-fragment style) or `<relPath>:<name>` (grep-navigable)? Minor but worth settling before writing tests. Leaning toward `::` because it matches Rust/C++ conventions and grep-navigation isn't the primary use case.
3. **Should the sweep phase be opt-out?** A user running `engram ingest source --path src/ai` might not intend to archive episodes from files outside `src/ai`. Almost certainly yes — scope the sweep to the walked root, not the whole graph. Flag during implementation.
4. **Progress reporting granularity.** Should `--verbose` print every file, or every N files, or only errors? `--verbose` = every file is probably right for v1 given the "dev infrastructure" personality.

## What the benchmark should say

Before merging, run a manual benchmark against the engram repo (or the fastify benchmark target) with source ingestion enabled vs disabled and compare:

- Retrieval precision / recall on queries about specific functions or classes
- Number of entities in the graph (expected: roughly 5–10x larger with source ingestion)
- Stale-knowledge benchmark: does source-grounded evidence reduce stale projection rates?
- End-to-end ingest time on a fresh database

If retrieval doesn't improve noticeably, the feature is still valid — it unblocks the baseline wiki — but we should flag that signal quality may need the cross-file call graph or the nested symbol work to pay off.
