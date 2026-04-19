# Cross-Source Reference Edge Resolution

**Status**: Implemented (v0.1)
**Location**: `packages/engram-core/src/ingest/cross-ref/`

---

## Overview

Cross-source reference resolution scans episode content for textual references to other
source objects (commits, PRs, issues, Jira tickets, etc.) and emits `references` edges
in the knowledge graph. This connects knowledge silos that would otherwise remain
isolated (e.g., a commit message that cites a GitHub PR, or an issue body that cites a
commit SHA).

---

## Pattern Registry Shape

Each entry in the pattern registry is a `ReferencePattern`:

```typescript
interface ReferencePattern {
  sourceType: string;        // Target episodes.source_type
  pattern: RegExp;           // Regex, capture group 1 = identifier
  normalizeRef: (match: string) => string;  // Normalise captured group
  confidence: number;        // Edge confidence, 0..1
  _lookupOverride?: (graph: EngramGraph, normalizedRef: string) => { id: string } | null;
}
```

Built-in patterns are in `BUILT_IN_PATTERNS` (ordered most-specific first):

| Pattern | source_type | Confidence |
|---------|-------------|------------|
| Full GitHub PR URL | `github_pr` | 0.95 |
| Full GitHub Issue URL | `github_issue` | 0.95 |
| Full Gerrit CL URL | `gerrit_change` | 0.95 |
| Full Google Doc URL | `google_doc` | 0.95 |
| Full Linear Issue URL | `linear_issue` | 0.95 |
| Full Jira Issue URL | `jira_issue` | 0.95 |
| `b/NNNNNN` (Buganizer) | `buganizer_issue` | 0.90 |
| `go/cl/NNN` (Gerrit shorthand) | `gerrit_change` | 0.90 |
| Full 40-char commit SHA | `git_commit` | 0.90 |
| Short SHA (7–11 chars) | `git_commit` | 0.75 |
| `#N` (repo-scoped issue/PR) | `github_issue` | 0.85 |

---

## Resolution Algorithm

```
for each episodeId in episodeIds:
  1. Load episode content. Skip if status = 'redacted'.
  2. Find the primary entity for this episode (highest-confidence entity_evidence link).
  3. For each pattern in the registry:
     a. Reset pattern.lastIndex (global flag safety).
     b. Exec pattern against episode.content.
     c. For each match:
        - Normalize captured group → normalizedRef
        - Deduplicate: skip if (sourceType, normalizedRef) already seen in this episode
        - Lookup target entity:
            - If _lookupOverride: call it with (graph, normalizedRef)
            - Else: findTargetEntityBySourceRef(graph, sourceType, normalizedRef)
            - If not found: also try with fullMatch (for URL patterns)
        - If target not found: record in unresolved_refs; continue
        - Self-reference guard: skip if sourceEntity.id == targetEntity.id
        - emitReferenceEdge(source, target, episode, confidence, fact, timestamp)
  4. Call drainUnresolvedForEpisode to resolve any pending refs that match this episode's source_ref.
```

The lookup chain:

```
episode.source_ref == normalizedRef  →  find via entity_evidence JOIN episodes
  └─ fallback: episode.source_ref == fullMatch (capture may be partial)
```

---

## Ambiguity Handling

When the same normalized ref could match multiple target entities (e.g., a short SHA
that matches two commit entities), the current implementation resolves to the **first
match** via `LIMIT 1` SQL queries. This is intentional conservatism for v0.1.

Future work: when multiple entities match a single ref, emit N edges each at
`confidence * 0.6` to signal reduced certainty. This is tracked in the backlog.

---

## Self-Reference Guard

Before emitting an edge, the resolver checks:

```
if sourceEntity && targetEntity.id === sourceEntity.id: skip
```

This prevents a commit from referencing itself when its own SHA appears in its content
(e.g., `commit abcdef1234...` in the git log header).

---

## Deduplication Semantics

**Within a single episode**: the `seenRefs` set (keyed by `sourceType:normalizedRef`)
prevents the same reference from being processed twice even if it appears multiple times
in the episode content.

**Across episodes (same source/target pair)**: `emitReferenceEdge` checks for an
existing active edge with the same `(source_id, target_id, relation_type, edge_kind)`.
If found, it adds an `edge_evidence` link (`INSERT OR IGNORE`) rather than creating a
duplicate edge. This means the same logical reference can accumulate multiple evidence
links from different episodes.

---

## Plugin Contribution Format

Plugins can contribute additional patterns via `PluginReferencePattern` (manifest-safe;
no closures):

```typescript
interface PluginReferencePattern {
  source_type: string;          // Target source_type
  pattern: string;              // Regex source (no delimiters)
  flags?: string;               // Regex flags (default: "g")
  normalize_template: string;   // "$1" is replaced by capture group 1
  confidence: number;           // 0..1
}
```

Compile with:

```typescript
const myPattern = compilePluginPattern(manifest, BUILT_IN_PATTERNS);
resolveReferences(graph, episodeIds, [...BUILT_IN_PATTERNS, myPattern]);
```

`compilePluginPattern` throws `Error` if the `(source_type, pattern.source)` pair
collides with any existing registry entry. This prevents duplicate resolution paths.

Plugin patterns **cannot** use `_lookupOverride` (closures are not serializable in
manifest form). They use the default `findTargetEntityBySourceRef` lookup.

---

## `unresolved_refs` Lifecycle

When a reference target is not yet in the graph at scan time, the ref is recorded in
`unresolved_refs`:

```sql
CREATE TABLE unresolved_refs (
  id                 TEXT PRIMARY KEY,
  source_episode_id  TEXT NOT NULL REFERENCES episodes(id),
  target_source_type TEXT NOT NULL,
  target_ref         TEXT NOT NULL,
  detected_at        TEXT NOT NULL,
  resolved_at        TEXT        -- NULL until resolved
);
```

**Drain on arrival**: when a new episode is ingested, `drainUnresolvedForEpisode` runs
immediately to check if any pending refs match the new episode's `(source_type,
source_ref)`. If so, the edge is emitted and `resolved_at` is set.

**Batch drain**: `drainUnresolved(graph)` performs a two-phase scan:
1. Attempt to resolve all `resolved_at IS NULL` rows.
2. Full re-scan of all active episodes (catches patterns that were added after initial
   ingest).

Returns `{ edgesCreated, unresolved }` — `unresolved` is the count of rows still
unresolved after the run. These represent dangling references to content not yet
ingested.

---

## CLI: `engram reconcile --cross-refs`

```sh
engram reconcile --cross-refs [--db <path>]
```

Runs `drainUnresolved()` over the entire graph. Use this after ingesting a new data
source to wire up references that were previously unresolvable.

Output:
```
Edges created: 42
Still unresolved: 7
```

This flag bypasses the normal assess/discover reconciliation phases.

---

## Edge Contract

All emitted edges satisfy the engram evidence invariant:

- `relation_type`: `"references"` (from `RELATION_TYPES.REFERENCES`)
- `edge_kind`: `"observed"`
- Evidence: at least one `edge_evidence` link pointing to the source episode
- `extractor`: `"cross-ref-resolver"`

The `fact` field describes the relationship:
```
Episode <id> (<source_type>) references <target_source_type> <normalizedRef>
```
