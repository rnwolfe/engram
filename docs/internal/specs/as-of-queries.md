# as-of queries — temporal time travel for `engram context`

> Spec status: implemented in issue #259

## Overview

`engram context "<q>" --as-of <when>` assembles a context pack that reflects what
the knowledge graph knew at a past point in time. This is "time travel" over the
*learn-time* dimension of the graph — not the validity-window dimension.

## Learn-time filter (semantic)

The `--as-of` filter is applied as:

```sql
created_at <= T AND (invalidated_at IS NULL OR invalidated_at > T)
```

This means:
- **Included**: edges that were created at or before T and had not yet been
  invalidated at T (i.e. the graph knew about them and still believed them).
- **Excluded**: edges created after T (the graph hadn't learned them yet).
- **Excluded**: edges invalidated at or before T (the graph had superseded them).

The validity window (`valid_from` / `valid_until`) is **not** used to filter
results in as-of mode. Those fields describe *when the fact was true in the world*,
not *when the system learned it*. An edge with `valid_until < T` is still included
if it passes the learn-time predicate — it appears in output with its original
validity window so the consumer can interpret it correctly.

### Why learn-time, not validity-window?

Validity windows are authored to describe real-world temporal scope (e.g. "Alice
owned module X from 2024-01 to 2024-06"). They are not reliably backfilled and
may be absent (NULL) even for historical facts. The `created_at` / `invalidated_at`
pair is always populated by the system and reliably tracks *when the graph learned
or unlearned a fact* — making it the correct dimension for "what did the graph know
at T?" queries.

`--active-only` filtering (i.e. filtering edges where `valid_until < T`) is
deferred to a future flag. Conflating learn-time and validity-window filtering
would require coordinated semantics that do not yet exist in the graph model.

## Relative-string grammar

The `--as-of` flag accepts the following forms (case-insensitive, whitespace
collapsed):

### Named aliases

| Input | Resolution |
|-------|------------|
| `yesterday` | now − 24 hours |
| `last week` | now − 7 days |
| `last month` | now − 30 days |
| `last year` | now − 365 days |

Month = 30 days, year = 365 days (not calendar-aware).

### Relative expressions

```
<N> <unit> ago
```

Where `<N>` is a positive integer and `<unit>` is one of:
`second`, `minute`, `hour`, `day`, `week`, `month`, `year`
(singular or plural, e.g. `1 day ago`, `3 days ago`).

### Absolute forms

- **ISO8601 UTC**: `2026-01-15T14:22:00Z` or with offset `2026-01-15T16:22:00+02:00`
- **Bare date**: `2026-01-15` → interpreted as `2026-01-15T00:00:00.000Z` (start of UTC day)

### Validation

- Future timestamps are rejected with: `--as-of cannot be in the future (received: "<input>")`
- Unrecognised forms throw `InvalidAsOfError` with the received value and a hint
  listing all accepted forms.
- N=0 is rejected (would be "now", which is not a valid past reference).

## Stale flag semantics in as-of mode

When `--as-of` is used, the stale flag on projections is computed against the
substrate *at T* rather than current substrate. Projections authored after T are
not included. This ensures the stale signal is consistent with the temporal scope
of the query.

## Pack header

The pack header (markdown and JSON output) includes:

- `as_of` — resolved ISO8601 UTC timestamp (e.g. `2026-01-15T00:00:00.000Z`)
- `as_of_input` — the raw user input (e.g. `"6 months ago"` or `"2026-01-15"`)

In markdown output, the header line is extended with:
```
| As-of: 2026-01-15 (6 months ago)
```

## Composability

`--as-of` composes with all other `engram context` flags:
- `--token-budget` — applied after temporal filtering
- `--max-entities`, `--max-edges` — applied after temporal filtering
- `--min-confidence` — applied after temporal filtering
- `--format md|json` — output format is unchanged; header gains `as_of` fields

## Implementation notes

### resolveAsOf (packages/engram-core/src/temporal/as-of.ts)

The `resolveAsOf(input, now?)` function performs all parsing. It is pure (no I/O)
and injectable with a reference time for testing.

`InvalidAsOfError` is a typed error class with a usage hint message.

Both are exported from `engram-core` public API surface.

### Edge filtering (packages/engram-core/src/graph/edges.ts)

`FindEdgesQuery.asOf?: string` — when set, replaces the default
`invalidated_at IS NULL` filter with the learn-time predicate. The two filters
are mutually exclusive: `asOf` takes precedence.

### Context assembly (packages/engram-cli/src/commands/context.ts)

Three query sites are gated on `opts.asOf`:

1. `searchEdgesFts()` — FTS edge search uses the learn-time predicate
2. `fetchStructuralEdges()` — structural edge fetch uses the learn-time predicate
3. `assembleContextPack()` return value — includes `as_of` + `as_of_input` fields

Episode and entity queries are currently **not** filtered by learn-time predicate
in this implementation. This is intentional: episodes are immutable (never
invalidated), and entity `created_at` filtering would require additional schema
changes. The edge layer is where temporal supersession is tracked, making it the
primary benefit of as-of filtering.

## Rationale for deferring `--active-only`

A future `--active-only` flag would additionally filter edges where `valid_until < T`.
This was deferred because:

1. Many edges lack `valid_until` (NULL = still current) — blanket filtering would
   silently drop facts that should be shown.
2. The semantic is underspecified: does `valid_until = NULL` at time T mean "current
   at T" or "no known end date"? Without a clear answer, filtering is unsafe.
3. The learn-time filter already handles the primary use case (what did the system
   know at T?) without requiring validity-window interpretation.
