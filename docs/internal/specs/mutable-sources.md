# Revision-Aware Episodes for Mutable Sources

> Spec for issue #201 — episode supersession for mutable sources (Google Docs, Linear, Jira).
> Implementation tracked in the same issue.

## Overview

Engram's episode model was designed around immutable sources: a git commit is a
permanent, unchangeable artifact. Its `(source_type, source_ref)` pair identifies it
uniquely and forever. The current unique index on that pair enforces this invariant and
makes ingestion idempotent — re-ingesting the same commit is a no-op.

Mutable sources break this assumption. A Google Doc has one canonical URL (`source_ref`)
but its content changes every time someone edits it. A Linear issue has one issue ID but
its description, status, and assignee evolve over time. A Jira ticket accumulates
comments and state changes that are not reflected in the original episode.

Under the current schema, re-ingesting a mutable source silently skips the new revision
because the `(source_type, source_ref)` pair already exists. The knowledge graph stagnates:
it reflects only the first ingestion, not the current state of the source.

This spec defines **episode supersession** — the mechanism by which adapters for mutable
sources capture new revisions without losing the history of prior revisions.

Cross-references: edges already use `superseded_by` and `invalidated_at` for temporal
transitions (see `docs/internal/DECISIONS.md` ADR-001 and the temporal model in
`CLAUDE.md`). This spec applies a parallel pattern to episodes.

---

## 1. The Problem in Detail

### 1.1 Current schema

```sql
CREATE TABLE episodes (
  id           TEXT NOT NULL UNIQUE,
  source_type  TEXT NOT NULL,
  source_ref   TEXT,
  content      TEXT NOT NULL,
  -- ... other fields
);
CREATE UNIQUE INDEX idx_episodes_identity
  ON episodes(source_type, source_ref)
  WHERE source_ref IS NOT NULL;
```

The unique index on `(source_type, source_ref)` is the right design for immutable sources.
For mutable sources it produces a silent skip on re-ingestion — the adapter calls
`addEpisode(...)`, the INSERT hits the unique constraint, and the new revision is discarded.

### 1.2 What "mutable" means

A source is mutable if the same `source_ref` (canonical identifier) can legitimately
produce different `content` at different points in time. Examples:

| Source | `source_ref` example | Mutation |
|---|---|---|
| Google Docs | `doc:1BxiMVs0XRA...` | Any edit creates a new revision |
| Linear | `linear:issue:ENG-42` | Title, description, status, assignee changes |
| Jira | `jira:issue:ENG-42` | Description edits, field updates, comments |
| Confluence | `confluence:page:12345678` | Page edits |
| Notion | `notion:page:abc123` | Any page content change |

Contrast with immutable sources: git commits (`git:abc123`), GitHub PRs (`github:pr:42`),
Gerrit changes (`gerrit:change:12345`). These are write-once and never change once merged.

### 1.3 Why silent skips are harmful

The evidence-first invariant requires that every entity and edge traces back to an episode.
If the most recent revision of a document is never ingested, edges derived from that
revision cannot exist. Queries that ask "who owns this document?" or "what is the current
status of this issue?" return answers anchored to the first ingestion, not the present.

---

## 2. Decision: Episode Supersession (Option B)

### 2.1 Schema change

Add a nullable `superseded_by` column to the `episodes` table, mirroring the pattern
already used in the `edges` table:

```sql
ALTER TABLE episodes ADD COLUMN superseded_by TEXT REFERENCES episodes(id);
```

Add a partial index for efficient "current episode" queries:

```sql
CREATE INDEX idx_episodes_current
  ON episodes(source_type, source_ref)
  WHERE superseded_by IS NULL;
```

The existing `idx_episodes_identity` unique index remains unchanged. Its role shifts:
it prevents two *non-superseded* episodes from sharing the same `(source_type, source_ref)`.
Because `superseded_by` is not part of the index predicate, superseded episodes with the
same pair are permitted — they are historical revisions, not duplicates.

This is a purely additive schema change. The column is nullable with no default constraint.
Existing rows are unaffected. No format-version bump is required.

### 2.2 Supersession algorithm

Re-ingesting a mutated source is a two-step atomic transaction:

```
BEGIN TRANSACTION;
  -- 1. Insert the new episode
  INSERT INTO episodes (id, source_type, source_ref, content, ...)
    VALUES (new_id, 'google_docs', 'doc:abc123', new_content, ...);

  -- 2. Mark the prior episode as superseded
  UPDATE episodes
    SET superseded_by = new_id
    WHERE id = prior_id;
COMMIT;
```

Error conditions that cause the transaction to roll back:
- `prior_id` does not exist in the episodes table
- `prior_id` already has a non-NULL `superseded_by` (would create a fork in the chain)
- The INSERT collides with an existing non-superseded episode for the same
  `(source_type, source_ref)` (indicates a logic error in the adapter)

### 2.3 "Current version" query

The current (non-superseded) episode for a given source is:

```sql
SELECT * FROM episodes
WHERE source_type = 'google_docs'
  AND source_ref  = 'doc:abc123'
  AND superseded_by IS NULL;
```

This query is served by `idx_episodes_current` (the partial index added above). It returns
at most one row for any `(source_type, source_ref)` pair, enforced by the fact that the
supersession algorithm always supersedes the prior row before the new one is visible.

Full revision history is available by dropping the `superseded_by IS NULL` predicate and
ordering by `ingested_at`:

```sql
SELECT * FROM episodes
WHERE source_type = 'google_docs'
  AND source_ref  = 'doc:abc123'
ORDER BY ingested_at;
```

---

## 3. Why Option B

### 3.1 Alternatives considered

**Option A — revision-suffixed source_ref**

Encode the revision into the `source_ref` itself:
`doc:abc123@rev_N`, `doc:abc123@rev_N1`, etc.

- No schema change.
- Requires every adapter to synthesize a stable revision suffix, which is source-specific
  and not uniformly available (Jira's `updated` timestamp is not stable under concurrent
  edits; Linear's `updatedAt` can repeat across rollbacks).
- Makes "current version" queries significantly harder: the adapter must record the latest
  `source_ref` externally, or the query must use `MAX(ingested_at)` with a prefix scan —
  neither of which is index-friendly.
- Pushes complexity into every mutable-source adapter, not into the engine.
- `source_ref` format drift across adapter versions becomes a maintenance hazard.

**Option C — hybrid: new rows + `is_current` flag**

Add an `is_current BOOLEAN` column; new rows are inserted with `is_current = TRUE` and
prior rows are flipped to `FALSE`.

- Combines Option A's adapter complexity (adapter must flip the flag) with Option B's
  schema change (new column), strictly worse than either alone.
- `is_current` is a derived truth (equivalent to `superseded_by IS NULL`) stored
  redundantly, risking inconsistency if not updated atomically.
- Does not compose with the existing projection and edge supersession patterns, which use
  `superseded_by` for DAG traversal and cycle detection.

### 3.2 Why Option B is correct

1. **Parallels the edge model.** Edges already use `superseded_by` + `invalidated_at`.
   Adding `superseded_by` to episodes unifies the temporal language of the schema. A reader
   familiar with one table immediately understands the other. The `verifyGraph()` cycle
   detector already handles this pattern and can be extended to episodes with one new check.

2. **Preserves the immutable-content invariant.** Episodes are raw evidence; their
   `content` column should never be mutated in place. `superseded_by` is linkage metadata
   — it does not change what the episode said, only whether it is still current. The
   historical record is preserved in full.

3. **Trivial "current version" query.** `WHERE superseded_by IS NULL` is a single
   inequality predicate, index-friendly, and unambiguous. No aggregation, no subqueries,
   no adapter-specific cursor logic.

4. **Small additive schema change.** A nullable column with no default requires no
   migration of existing rows. Existing databases open without modification. The column
   is added to `ADDITIVE_DDL` so `openGraph()` applies it safely on any v0.1 or v0.2 file.

5. **New `verifyGraph` invariant is cheap.** Fan-in uniqueness on `superseded_by` (each
   episode has at most one successor) is a single GROUP BY / HAVING query. It does not
   require recursive traversal unless cycle detection is also added (which is optional in
   v0.1 of this feature).

---

## 4. Schema Change Details

### 4.1 DDL

```sql
-- Additive column — nullable, no default, safe on existing databases
ALTER TABLE episodes ADD COLUMN superseded_by TEXT REFERENCES episodes(id);

-- Partial index for O(1) "current version" lookup
CREATE INDEX idx_episodes_current
  ON episodes(source_type, source_ref)
  WHERE superseded_by IS NULL;
```

Both statements are added to `ADDITIVE_DDL` in `packages/engram-core/src/format/schema.ts`
so they are applied by `openGraph()` on first open of any existing database, and by
`createGraph()` for new databases.

### 4.2 Impact on existing unique index

The existing index:

```sql
CREATE UNIQUE INDEX idx_episodes_identity
  ON episodes(source_type, source_ref)
  WHERE source_ref IS NOT NULL;
```

This index applies to *all* rows where `source_ref IS NOT NULL`, regardless of
`superseded_by`. Two rows with the same `(source_type, source_ref)` will both be covered
by this index — so a superseded episode and its successor would collide.

To resolve this, the unique index should be tightened to only non-superseded episodes:

```sql
-- Drop and replace the existing unique index
DROP INDEX idx_episodes_identity;
CREATE UNIQUE INDEX idx_episodes_identity
  ON episodes(source_type, source_ref)
  WHERE source_ref IS NOT NULL AND superseded_by IS NULL;
```

This preserves the idempotency invariant for the current episode while allowing historical
revisions to coexist. The implementation should apply this index replacement in the same
migration step as the column addition.

---

## 5. verifyGraph Invariants

Two new checks are added to `verifyGraph()` in `packages/engram-core/src/format/verify.ts`:

### 5.1 `checkEpisodeSupersededByRefs`

Every `superseded_by` value must reference a valid episode id. Dangling references
indicate a partial write or data corruption.

```sql
SELECT e.id, e.superseded_by
FROM episodes e
LEFT JOIN episodes e2 ON e.superseded_by = e2.id
WHERE e.superseded_by IS NOT NULL
  AND e2.id IS NULL
```

Severity: **error** (not warning). A dangling supersession ref breaks the revision chain
and cannot be recovered without the missing row.

### 5.2 `checkEpisodeSupersessionFanIn`

Each episode must have at most one successor — `superseded_by` must be unique among all
rows where it is non-NULL. A violation means two revisions claim the same predecessor,
creating a fork in the chain.

```sql
SELECT superseded_by, COUNT(*) AS cnt
FROM episodes
WHERE superseded_by IS NOT NULL
GROUP BY superseded_by
HAVING cnt > 1
```

Severity: **error**. A fork indicates a transaction isolation failure or adapter bug. The
graph cannot determine which successor is authoritative.

Both checks mirror the existing `checkSupersededByRefs` check for edges and follow the
same pattern.

---

## 6. Revision Identifier Convention

The `superseded_by` column tracks *linkage* between episode rows. The actual revision
identifier from the source system is stored in the `episodes.metadata` JSON column —
there is no top-level `revision` field.

Adapter authors should use the following keys by convention:

| Source | `metadata` key | Example value |
|---|---|---|
| Google Docs | `revisionId` | `"ABCdef123"` (Drive API revision ID) |
| Linear | `updatedAt` | `"2025-03-15T12:00:00.000Z"` (ISO timestamp) |
| Jira | `updated` | `"2025-03-15T12:00:00.000+0000"` (Jira field name) |
| Confluence | `version` | `42` (integer page version) |
| Notion | `last_edited_time` | `"2025-03-15T12:00:00.000Z"` (ISO timestamp) |

Adapters use `metadata.revisionId` (or the equivalent) to detect whether re-ingestion
is needed — if the stored revision matches the fetched revision, skip (the content has
not changed). If the revision differs, call `supersedeEpisode()`.

---

## 7. New API: `supersedeEpisode()`

The graph layer exposes a new function alongside the existing `addEpisode()`:

```typescript
/**
 * Create a new episode revision and atomically supersede the prior one.
 *
 * @param priorId   - ID of the current (non-superseded) episode to supersede
 * @param newEpisode - New episode data (source_type, source_ref, content, ...)
 * @returns The newly created episode ID
 *
 * @throws if priorId does not exist
 * @throws if priorId is already superseded (superseded_by IS NOT NULL)
 * @throws if a non-superseded episode already exists for the same (source_type, source_ref)
 */
function supersedeEpisode(
  graph: EngramGraph,
  priorId: string,
  newEpisode: EpisodeInput,
): string;
```

The implementation wraps both the INSERT and the UPDATE in a single SQLite transaction
to guarantee atomicity. No partial state is visible between the two statements.

For first ingestion (no prior episode exists), adapters continue to use `addEpisode()`
unchanged. `supersedeEpisode()` is only called when a prior episode is known to exist
and the source content has changed.

A helper `getCurrentEpisode(graph, sourceType, sourceRef)` is also provided to retrieve
the current (non-superseded) episode or `null` if none exists, without the adapter needing
to write the SQL directly.

---

## 8. Adapter Authoring Guide

### 8.1 Decision tree for mutable-source adapters

```
On each ingest run for a (source_type, source_ref):

  current = getCurrentEpisode(graph, source_type, source_ref)

  if current is null:
    → addEpisode(graph, { source_type, source_ref, content, metadata })
      (first ingestion, no prior episode)

  else if current.metadata.revisionId == fetchedRevisionId:
    → skip (content unchanged)
      log at debug level: "episode up to date, skipping"

  else:
    → supersedeEpisode(graph, current.id, { source_type, source_ref, content, metadata })
      (new revision detected)
      log at debug level: "superseding episode ${current.id} with new revision"
```

### 8.2 Entity identity vs. episode revision

The entity associated with a mutable document (its "document identity" in the graph) is
not superseded when the episode is. The entity represents the document as a persistent
object; episodes represent specific revisions of its content.

The entity's `updated_at` field should be bumped when a new revision is ingested, but the
entity itself is not replaced. Evidence links from the entity to the new episode are added;
the old evidence links remain (they trace the history of what the entity said at each
revision).

### 8.3 Entity types for mutable sources

Mutable-source adapters should use (or declare in their vocab extensions) entity types
that reflect document identity, not content:

| Source | Entity type | Canonical name |
|---|---|---|
| Google Docs | `document` | `google_docs:doc:abc123` |
| Linear | `linear_issue` | `linear:issue:ENG-42` |
| Jira | `jira_issue` | `jira:issue:ENG-42` |

These are registered in the vocabulary registry (`packages/engram-core/src/vocab/`) for
built-in adapters, or declared in `vocab_extensions` for plugin adapters.

---

## 9. Cross-Source Reference Resolution

Cross-source references (from issue #197 / `docs/internal/specs/cross-source-references.md`)
resolve to the *entity* representing document identity, not to a specific episode revision.

When a git commit message references a Jira issue (`fixes ENG-42`), the cross-ref resolver
creates an edge from the commit entity to the `jira_issue` entity for `ENG-42`. The edge's
`valid_from` is the commit timestamp.

To reconstruct "which revision of ENG-42 was current at the time of this commit," a query
joins the edge's `valid_from` against the episode chain's `ingested_at` timestamps:

```sql
-- Find the revision of jira:issue:ENG-42 that was current when commit abc123 was made
SELECT ep.*
FROM episodes ep
WHERE ep.source_type = 'jira'
  AND ep.source_ref  = 'jira:issue:ENG-42'
  AND ep.ingested_at <= :commit_timestamp
ORDER BY ep.ingested_at DESC
LIMIT 1
```

This is a retrieval-time query, not a new mechanism. No additional schema changes are
needed to support this pattern.

---

## 10. Worked Example: Google Docs Adapter

### 10.1 First ingest (revision N)

```typescript
// No prior episode exists — use addEpisode
const episodeN = await addEpisode(graph, {
  source_type: 'google_docs',
  source_ref:  'doc:abc123',
  content:     docContentRevN,
  metadata:    JSON.stringify({ revisionId: 'rev_N', title: 'Architecture Notes' }),
  timestamp:   revNTimestamp,
  actor:       editorEmail,
});

// Create or update the document entity
const entity = await addEntity(graph, {
  entity_type:    'document',
  canonical_name: 'google_docs:doc:abc123',
  summary:        'Architecture Notes',
}, { episode_id: episodeN });

// Register an alias for the document title
await addEntityAlias(graph, entity.id, 'Architecture Notes', episodeN);
```

State after first ingest:

```
episodes:
  id=episodeN, source_ref='doc:abc123', content=..., superseded_by=NULL  ← current
```

### 10.2 Re-ingest (revision N+1)

```typescript
// Fetch current state from the source
const fetched = await fetchGoogleDoc('doc:abc123');  // revisionId: 'rev_N1'

// Find the current episode
const current = await getCurrentEpisode(graph, 'google_docs', 'doc:abc123');
// current.metadata.revisionId === 'rev_N'

if (current.metadata.revisionId === fetched.revisionId) {
  // No change — skip
  return;
}

// New revision detected — supersede
const episodeN1 = await supersedeEpisode(graph, current.id, {
  source_type: 'google_docs',
  source_ref:  'doc:abc123',
  content:     fetched.content,
  metadata:    JSON.stringify({ revisionId: 'rev_N1', title: fetched.title }),
  timestamp:   fetched.modifiedTime,
  actor:       fetched.lastModifyingUser.emailAddress,
});

// Link the entity to the new episode
await addEntityEvidence(graph, entity.id, episodeN1);
```

State after re-ingest:

```
episodes:
  id=episodeN,  source_ref='doc:abc123', content=contentN,  superseded_by=episodeN1
  id=episodeN1, source_ref='doc:abc123', content=contentN1, superseded_by=NULL  ← current
```

The revision chain is preserved. `episodeN.superseded_by = episodeN1.id`. A query with
`WHERE superseded_by IS NULL` returns only `episodeN1`.

### 10.3 Third ingest (content unchanged)

```typescript
const fetched = await fetchGoogleDoc('doc:abc123');  // revisionId still 'rev_N1'
const current = await getCurrentEpisode(graph, 'google_docs', 'doc:abc123');
// current.metadata.revisionId === 'rev_N1' — matches

// No change detected — skip silently
```

State is unchanged. Idempotency is preserved.

---

## 11. Interaction with Existing Invariants

### 11.1 Evidence-first invariant

`supersedeEpisode()` creates a new episode in the same transaction. The adapter is
responsible for adding entity and edge evidence pointing to the new episode after
supersession. The old evidence links remain valid (they describe what was known at the
time of the prior revision). No evidence is deleted.

### 11.2 Episode redaction

Episode redaction (`status = 'redacted'`) clears content while preserving the row.
Redacted episodes remain in the supersession chain — a redacted episode can still have
a `superseded_by` value pointing to its successor, and a successor can be created after
redaction. The `getCurrentEpisode()` helper returns the current episode regardless of
redaction status; adapters that need to check for redacted content should inspect `status`.

### 11.3 Content hash dedup

The existing `content_hash` column is used to detect content identity. When
`supersedeEpisode()` is called with content whose hash matches the prior episode, the
implementation should log a warning — this indicates the adapter is calling supersession
when the content has not actually changed, which is a logic error. (The revision identifier
check in §8.1 is the preferred guard against this.)

---

## 12. Related

- Issue #201 — tracks this spec and its implementation
- Issue #197 / `docs/internal/specs/cross-source-references.md` — cross-source reference resolver
- `packages/engram-core/src/format/schema.ts` — episodes table DDL
- `packages/engram-core/src/format/verify.ts` — `verifyGraph()` invariants
- `docs/internal/DECISIONS.md` — ADR-007 records the final decision
- `docs/internal/specs/vocabulary.md` — entity_type registry (document, linear_issue, jira_issue)
