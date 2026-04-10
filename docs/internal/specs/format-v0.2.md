# `.engram` Format — v0.2 Delta

**Phase**: 2
**Status**: Specified
**Proposed**: 2026-04-09
**Predecessor**: [`format-v0.1.md`](format-v0.1.md)
**Companion spec**: [`projections.md`](projections.md) — full design rationale, operations, and resolved decisions
**ADR**: [`docs/internal/DECISIONS.md`](../DECISIONS.md#adr-002----ai-authored-projection-layer-with-temporal-versioning) — ADR-002

> This is a **delta document**. It specifies what changes from format v0.1 → v0.2.
> The v0.1 spec remains the authoritative reference for everything not listed here.
> The full design rationale for the additions lives in [`projections.md`](projections.md);
> this doc is the migration-and-DDL contract.

## Summary

v0.2 adds an **AI-authored projection layer** on top of the v0.1 substrate. Three new tables, one new FTS5 virtual table, no changes to any existing table or index. Schema version metadata bumps from `0.1.0` to `0.2.0`.

The projection layer introduces a deterministic, evidence-backed, temporally-versioned synthesis model — first-class artifacts that an LLM authors over the substrate, governed by the same supersession and validity-window rules as edges.

## Schema version

```sql
UPDATE metadata SET value = '0.2.0' WHERE key = 'schema_version';
```

The migration runner (`packages/engram-core/src/format/migrations.ts`) gains a `migrate_0_1_0_to_0_2_0` step that runs the DDL below in order, then updates the version.

## New tables

### `projections`

```sql
CREATE TABLE projections (
  _rowid             INTEGER PRIMARY KEY,
  id                 TEXT NOT NULL UNIQUE,            -- ULID
  kind               TEXT NOT NULL,                   -- 'entity_summary' | 'decision_page' | 'contradiction_report' | 'topic_cluster' | ...
  anchor_type        TEXT NOT NULL,                   -- 'entity' | 'edge' | 'episode' | 'projection' | 'none'
  anchor_id          TEXT,                            -- NULL when anchor_type='none'
  title              TEXT NOT NULL,                   -- short label, used in listings and FTS
  body               TEXT NOT NULL,                   -- markdown with mandatory YAML frontmatter
  body_format        TEXT NOT NULL DEFAULT 'markdown',
  model              TEXT NOT NULL,                   -- 'anthropic:claude-opus-4-6' | 'human' | 'ollama:llama3.1' | ...
  prompt_template_id TEXT,                            -- name of the prompt used; NULL for human
  prompt_hash        TEXT,                            -- hash of resolved prompt at generation time
  input_fingerprint  TEXT NOT NULL,                   -- sha256(sorted "type:id:content_hash" entries)
  confidence         REAL NOT NULL DEFAULT 1.0,
  valid_from         TEXT NOT NULL,                   -- generation time, or human-asserted time
  valid_until        TEXT,
  last_assessed_at   TEXT,                            -- last LLM assessment timestamp; soft-refresh updates this
  invalidated_at     TEXT,                            -- transactional time the system learned this was stale
  superseded_by      TEXT REFERENCES projections(id),
  created_at         TEXT NOT NULL,
  owner_id           TEXT
);
```

Indexes:

```sql
CREATE INDEX idx_projections_anchor ON projections(anchor_type, anchor_id);
CREATE INDEX idx_projections_kind   ON projections(kind);
CREATE INDEX idx_projections_valid  ON projections(valid_from, valid_until);
CREATE INDEX idx_projections_active ON projections(invalidated_at) WHERE invalidated_at IS NULL;

-- At most one *active* projection per (anchor, kind). Multiple kinds per anchor allowed.
CREATE UNIQUE INDEX idx_projections_active_unique
  ON projections(anchor_type, anchor_id, kind)
  WHERE invalidated_at IS NULL;
```

**Body format.** `body_format='markdown'` is the only supported value in v0.2. The body MUST begin with a YAML frontmatter block carrying `id`, `kind`, `anchor`, `title`, `model`, `prompt_template_id`, `prompt_hash`, `input_fingerprint`, `valid_from`, `valid_until`, and `inputs` (list of `type:id` strings). The frontmatter is partially redundant with row columns by design — it makes `engram export wiki` a literal file copy and the resulting folder directly consumable by Jekyll/Hugo/Obsidian. See [`projections.md` § Body format](projections.md#body-format-markdown-with-frontmatter) for the canonical example.

**Temporal semantics.** Identical to `edges`:
- `valid_from` is required (set to generation time on author).
- `valid_until = NULL` means currently active.
- `invalidated_at` is the transactional moment the system learned the projection was superseded; it MUST equal the new projection's `valid_from` to keep windows half-open and contiguous.
- `superseded_by` points to the replacement projection.
- `last_assessed_at` is independent of the temporal window — it tracks reconcile assessment freshness without mutating `valid_from`.

### `projection_evidence`

```sql
CREATE TABLE projection_evidence (
  projection_id TEXT NOT NULL REFERENCES projections(id),
  target_type   TEXT NOT NULL,                        -- 'episode' | 'entity' | 'edge' | 'projection'
  target_id     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'input',        -- 'input' | 'anchor'
  content_hash  TEXT,                                 -- snapshot of target's content hash at read time, NULL if non-content target
  PRIMARY KEY (projection_id, target_type, target_id, role)
);

CREATE INDEX idx_projection_evidence_target ON projection_evidence(target_type, target_id);
```

**Polymorphic by intent.** Unlike `entity_evidence` and `edge_evidence`, this table does not enforce the FK on `(target_type, target_id)`. The polymorphic shape matches the existing `embeddings` table precedent and accommodates the four target kinds (including projections themselves) without three separate tables. The verify pass (see below) checks evidence integrity.

**Roles.** `role='input'` marks an element the LLM read to produce the projection. `role='anchor'` marks an additional anchor when a projection is *about* multiple things (the primary anchor lives on the row itself). The two roles share the same primary key namespace so an element can appear in both — useful when an entity is both anchor and input.

### `reconciliation_runs`

```sql
CREATE TABLE reconciliation_runs (
  id                     TEXT PRIMARY KEY,            -- ULID
  started_at             TEXT NOT NULL,
  completed_at           TEXT,
  scope                  TEXT,                        -- optional filter (e.g. 'kind:entity_summary')
  phases                 TEXT NOT NULL DEFAULT 'assess,discover',  -- 'assess' | 'discover' | 'assess,discover'
  projections_checked    INTEGER DEFAULT 0,           -- assess phase: existing projections examined
  projections_refreshed  INTEGER DEFAULT 0,           -- assess phase: input changed, content held
  projections_superseded INTEGER DEFAULT 0,           -- assess phase: LLM authored a new version
  projections_discovered INTEGER DEFAULT 0,           -- discover phase: new projections authored
  dry_run                INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'running',
  error                  TEXT
);
```

**Cursor semantics.** The discover phase resumes from "substrate delta since the last *non-dry-run* reconcile completed within the same scope." Dry runs do not advance the cursor; partial runs (interrupted by `--max-cost` exhaustion) advance the cursor to whatever was successfully authored before exhaustion, recorded in `completed_at`.

## New FTS5 virtual table

```sql
CREATE VIRTUAL TABLE projections_fts USING fts5(
  title, body,
  content=projections, content_rowid=_rowid
);
```

Plus triggers analogous to `entities_fts` / `edges_fts`:

```sql
CREATE TRIGGER projections_ai AFTER INSERT ON projections BEGIN
  INSERT INTO projections_fts(rowid, title, body) VALUES (new._rowid, new.title, new.body);
END;
CREATE TRIGGER projections_ad AFTER DELETE ON projections BEGIN
  INSERT INTO projections_fts(projections_fts, rowid, title, body) VALUES ('delete', old._rowid, old.title, old.body);
END;
CREATE TRIGGER projections_au AFTER UPDATE ON projections BEGIN
  INSERT INTO projections_fts(projections_fts, rowid, title, body) VALUES ('delete', old._rowid, old.title, old.body);
  INSERT INTO projections_fts(rowid, title, body) VALUES (new._rowid, new.title, new.body);
END;
```

## Embeddings — no schema change

The existing `embeddings` table is already polymorphic on `(target_type, target_id)`. Projection bodies embed by writing rows with `target_type='projection'`. Hybrid retrieval (FTS + vector + graph) returns projections in result sets alongside entities and edges.

## DDL application order

The migration appends these statements after the existing v0.1 DDL list in `packages/engram-core/src/format/schema.ts`. Order matters because of FK references:

1. `CREATE TABLE projections` (self-references via `superseded_by`)
2. `CREATE INDEX ... idx_projections_*` (5 indexes)
3. `CREATE TABLE projection_evidence` (FK → `projections.id`)
4. `CREATE INDEX idx_projection_evidence_target`
5. `CREATE TABLE reconciliation_runs`
6. `CREATE VIRTUAL TABLE projections_fts`
7. `CREATE TRIGGER projections_ai / ad / au`
8. `UPDATE metadata SET value = '0.2.0' WHERE key = 'schema_version'`

## Migration semantics

**v0.1 → v0.2 is purely additive.** No `ALTER TABLE`, no data backfill, no break in any v0.1 query path. A v0.1 reader on a v0.2 file sees the new tables as foreign and ignores them; existing reads, writes, and verify checks continue to function. (But: a v0.1 reader will refuse to open a v0.2 file unless it advertises forward compatibility — see "Compatibility window" below.)

**v0.2 reader on v0.1 file.** Opens cleanly. Projection-layer queries return empty result sets. `engram reconcile` is a no-op. `engram project` works (it bootstraps the projection layer on first author).

**Compatibility window.** Schema version is checked at open time against a `MIN_READABLE_VERSION` and `MIN_WRITABLE_VERSION` in `format/version.ts`. v0.2 sets `MIN_READABLE_VERSION='0.1.0'` (we can read v0.1 files) and `MIN_WRITABLE_VERSION='0.2.0'` (writes upgrade to v0.2). v0.1 readers do not advertise forward compatibility and will refuse to open v0.2 files; users must upgrade `engram-core` to read v0.2.

## Verify invariants

`verifyGraph()` adds three new invariants:

1. **Projection has evidence.** Every row in `projections` has at least one row in `projection_evidence` with `role='input'`.
2. **Supersession chains terminate.** Walking `superseded_by` from any projection terminates without revisiting a node. Cycles are an integrity violation.
3. **Projection-dependency DAG.** The directed graph induced by `projection_evidence` rows where `target_type='projection'` is acyclic. Cycles are rejected at insert time via a recursive CTE check inside `project()`, and checked again as a full-graph invariant in `verify`.

The fingerprint integrity check (does `input_fingerprint` match the recomputation from the current evidence rows + their content hashes at insert time?) is **not** a verify-time invariant. Read-time fingerprint mismatch is the staleness signal, not a corruption signal — the substrate is allowed to drift away from a projection's recorded fingerprint between reconciles, and this is exactly what surfaces as `stale: true` on read.

## Read-time staleness API

A new helper, `getProjection(db, id)`, is the canonical read path. Its return shape is:

```ts
{
  projection: Projection;
  stale: boolean;                  // current_input_fingerprint !== projection.input_fingerprint
  stale_reason?:                   // populated when stale=true
    | 'inputs_added'               // a new substrate row matches the discover delta but isn't in projection_evidence
    | 'input_content_changed'      // an existing input's content_hash changed
    | 'input_deleted';             // an input is no longer in the substrate (or status='redacted')
  last_assessed_at: string | null; // ISO8601
}
```

The fingerprint recomputation runs on every projection read. It is O(inputs) with indexed lookups — measured in microseconds for typical projections. **The stale flag is an invariant of the read path** — no API surface returns a projection without computing it. Hybrid search results that include projections carry the same flag per row. Ranking and filtering on staleness is consumer policy.

## Out of scope for v0.2

These are tracked in [`projections.md` § Out of Scope](projections.md#out-of-scope-for-this-sketch) and remain deferred:

- Tribal merge of projections across multiple `.engram` files
- Per-token cost reporting on `reconciliation_runs`
- An `engram status` "undiscovered projections waiting" indicator
- A `prompt_templates` in-database table (XDG override path covers user-defined templates)
- A `projection_policies` in-database table (heuristic authoring is deferred indefinitely; if needed it ships as a pre-filter for the discover phase, not a separate path)
- Cross-projection contradiction-detection generators (the schema *enables* `contradiction_report` projections; the actual generator is a follow-on spec)
- The kind catalog content itself (separate spec — see backlog)

## References

- [`projections.md`](projections.md) — full design rationale, operations, resolved decisions
- [`../DECISIONS.md`](../DECISIONS.md) — ADR-002
- [`../VISION.md`](../VISION.md) — principle 5 reframe and Phase 2 roadmap
- [`format-v0.1.md`](format-v0.1.md) — predecessor; everything not listed here is unchanged
