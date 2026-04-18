# `.engram` Format Specification

**Current format version**: `0.2.0`
**Engine**: `engram-core`
**Storage**: SQLite (WAL mode) via `better-sqlite3`

---

## Canonical on-disk layout

As of **engram v0.5** (issue #185), the canonical layout is a **directory**:

```
.engram/
├── engram.db        # SQLite database (the knowledge graph)
├── engram.db-wal    # WAL journal (managed by SQLite, do not edit)
└── engram.db-shm    # Shared-memory index (managed by SQLite, do not edit)
```

The directory is typically placed at the root of a project and added to `.gitignore`
as `.engram/` (with trailing slash). `engram init` writes this entry automatically.

### Naming the database file

The SQLite file inside the directory is always named `engram.db`. When you pass
`--db .engram` to any command, the engine resolves the path to `.engram/engram.db`
automatically — you never need to spell out the full path.

---

## Path resolution (`resolveDbPath`)

Every CLI command resolves the user-supplied `--db` argument through the following
rules (in priority order):

| Input state | Resolved path | Notes |
|-------------|--------------|-------|
| Input is a **directory** | `<input>/engram.db` | New canonical layout |
| Input is a **file** (exists) | `<input>` (as-is) | Legacy flat-file — emits deprecation warning |
| Input does **not exist** | `<input>/engram.db` | New database will be created in a directory |

This shim is implemented in `packages/engram-core/src/format/graph.ts` as
`resolveDbPath(input: string): string` and exported from `engram-core`.

---

## Legacy flat-file compatibility shim

Older versions of engram stored the knowledge graph as a single SQLite file named
`.engram` (no extension directory). This layout continues to work with all current
commands, but will produce a deprecation warning to `stderr`:

```
warning: .engram is a flat file — run 'engram doctor --fix' to migrate to .engram/engram.db
```

The `engram doctor --fix` migration command is planned for a future release. Until
then, you can migrate manually:

```bash
mkdir -p .engram-dir
cp .engram .engram-dir/engram.db
cp .engram-wal .engram-dir/engram.db-wal 2>/dev/null || true
cp .engram-shm .engram-dir/engram.db-shm 2>/dev/null || true
mv .engram-dir .engram
```

---

## `engram init` behavior

`engram init` with the new layout:

1. Resolves `--db <path>` to `<path>/engram.db` via `resolveDbPath`.
2. Creates the `<path>/` directory if it doesn't exist (`fs.mkdirSync` with `{ recursive: true }`).
3. Writes `<dirName>/` (with trailing slash) to the nearest `.gitignore` if the
   pattern is not already present.
4. Creates the SQLite database at `<path>/engram.db` with full schema and metadata.

---

## SQLite file structure

The `.engram/engram.db` file is a standard SQLite database. WAL mode is always
enabled on open (`PRAGMA journal_mode = WAL`). Foreign keys are always enforced
(`PRAGMA foreign_keys = ON`).

### Core tables

| Table | Purpose |
|-------|---------|
| `metadata` | Key-value store for format version, engine version, owner ID, timezone |
| `entities` | Named nodes in the knowledge graph |
| `entity_aliases` | Alternative names for entities |
| `edges` | Temporal facts between entities (with validity windows) |
| `episodes` | Immutable raw evidence (git commits, PR text, manual notes) |
| `entity_evidence` | Many-to-many: entities ↔ episodes |
| `edge_evidence` | Many-to-many: edges ↔ episodes |
| `embeddings` | Vector embeddings for semantic search |
| `ingestion_runs` | Ingestion cursor tracking for idempotent re-runs |
| `projections` | AI-authored synthesis artifacts (v0.2+) |
| `projection_inputs` | Evidence links for projections (v0.2+) |
| `projection_supersessions` | Supersession chain for projections (v0.2+) |

### FTS5 virtual tables

| Table | Indexes |
|-------|---------|
| `entities_fts` | `canonical_name`, `description` |
| `edges_fts` | `fact` |
| `episodes_fts` | `content` |
| `projections_fts` | `title`, `body` (v0.2+) |

---

## Format version history

| Version | When | What changed |
|---------|------|-------------|
| `0.1.0` | Initial release | Core entity/edge/episode/evidence/embedding schema |
| `0.2.0` | 2026-04-09 | Added projection layer (`projections`, `projection_inputs`, `projection_supersessions`, `projections_fts`) |

Migration from `0.1.0` → `0.2.0` is handled by `migrate_0_1_0_to_0_2_0()` in
`packages/engram-core/src/format/migrations.ts`.

---

## Portability notes

- The `.engram/engram.db` file is self-contained and portable across machines.
- WAL sidecar files (`-wal`, `-shm`) are transient and safe to delete when no
  process has the database open.
- Episode content (commit messages, PR text) may be sensitive — treat the file
  accordingly. Redaction is supported via `status = 'redacted'` on the episode row.
