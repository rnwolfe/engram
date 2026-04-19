# Adapter Shorthand Alias Convention

Every adapter that creates entities MUST register shorthand aliases so that
`resolveEntity` can match bare references that appear in cross-source text
(e.g. `#123`, `CL/456`, `b/789`).

## Why aliases matter

`resolveEntity` in `graph/aliases.ts` checks two paths in order:
1. Exact `canonical_name` match
2. Active row in `entity_aliases` (where `valid_until IS NULL` or `valid_until > now`)

Adapters store canonical names as full URLs (e.g. `https://github.com/owner/repo/pull/42`).
Cross-source references in commit messages or PR bodies use shorthands (`#42`).
Without registered aliases, the resolver returns `null` and no cross-ref edge is emitted.

## Canonical alias table

| Source | canonical_name | Required aliases |
|---|---|---|
| GitHub PR | `https://github.com/<owner>/<repo>/pull/<N>` | `#<N>`, `<owner>/<repo>#<N>` |
| GitHub issue | `https://github.com/<owner>/<repo>/issues/<N>` | `#<N>`, `<owner>/<repo>#<N>` |
| Git commit | full 40-char SHA | 7-char SHA prefix |
| Gerrit change | Gerrit change URL | `CL/<N>`, bare change number |
| Buganizer issue | Buganizer URL | `b/<N>` |
| Google Doc | Doc URL | Doc ID alone |

## Ambiguity

`#123` is ambiguous across repos. The convention stores both forms:
- `owner/repo#123` — unambiguous, preferred for multi-repo graphs
- `#123` — bare form, resolves to first match (oldest entity wins via `ORDER BY created_at ASC`)

Cross-ref resolvers that have repo context (e.g. patterns with a `_lookupOverride`)
can prefer the scoped form; patterns without context fall through to the bare alias.

## How to register aliases

Call `addEntityAlias` immediately after creating the entity, passing the episode ID
as evidence:

```typescript
import { addEntityAlias } from "../../graph/aliases.js";

// After creating or resolving the entity:
addEntityAlias(graph, {
  entity_id: entity.id,
  alias: `#${number}`,
  episode_id: episodeId,
});
addEntityAlias(graph, {
  entity_id: entity.id,
  alias: `${repo}#${number}`,
  episode_id: episodeId,
});
```

## Idempotency

`addEntityAlias` does not deduplicate — calling it twice with the same alias creates
duplicate rows. Callers that may run on already-ingested data should either:
1. Guard alias creation behind a pre-check (e.g. `resolveEntity(alias) === null`), or
2. Accept duplicates (they are harmless — `resolveEntity` returns the first active match)

The GitHub and git adapters register aliases unconditionally for new entities only
(they skip the alias block if `entitiesResolved++` was taken).

## Reference

- `graph/aliases.ts` — `addEntityAlias`, `resolveEntity`
- `ingest/adapters/github.ts` — reference implementation
- `ingest/git.ts` — commit entity + short-SHA alias
- `ingest/cross-ref/patterns.ts` — BUILT_IN_PATTERNS that consume these aliases
- `docs/internal/specs/cross-source-references.md` — resolver architecture
