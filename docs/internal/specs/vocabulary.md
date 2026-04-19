# Vocabulary Registries

Engram uses three controlled vocabulary registries to enforce consistent
`entity_type`, `source_type`, and `relation_type` values across all ingesters
and adapters. All code MUST import values from `packages/engram-core/src/vocab/`
rather than inlining string literals.

## Registry files

| File | Export | Purpose |
|---|---|---|
| `vocab/entity-types.ts` | `ENTITY_TYPES` + `EntityType` | Entity classifications |
| `vocab/source-types.ts` | `INGESTION_SOURCE_TYPES`, `EPISODE_SOURCE_TYPES`, `INGESTION_TO_EPISODE_SOURCES` | Source type vocabulary (two columns) |
| `vocab/relation-types.ts` | `RELATION_TYPES` + `RelationType` | Edge relation labels |
| `vocab/index.ts` | barrel | Re-exports all of the above |

All three follow the same pattern:

```ts
export const ENTITY_TYPES = {
  PERSON: "person",
  MODULE: "module",
  // ...
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];
```

This gives both a runtime constant (for writes and iteration) and a compile-time
union type (for function signatures and parameter narrowing).

## Entity types (`ENTITY_TYPES`)

| Key | Value | Notes |
|---|---|---|
| `PERSON` | `"person"` | Author, reviewer, developer |
| `MODULE` | `"module"` | Directory or package |
| `SERVICE` | `"service"` | Deployed service |
| `FILE` | `"file"` | Source file |
| `SYMBOL` | `"symbol"` | Function, class, interface |
| `COMMIT` | `"commit"` | Git commit |
| `PULL_REQUEST` | `"pull_request"` | GitHub/Gerrit/GitLab PR or CL |
| `ISSUE` | `"issue"` | Bug tracker issue |

## Source types — two registries

`ingestion_runs.source_type` and `episodes.source_type` carry **different semantics**:

- `ingestion_runs.source_type` identifies the ingestion **pass** (who did the work).
- `episodes.source_type` identifies the **episode kind** (what was stored).

One ingestion pass may emit multiple episode kinds. The asymmetry is machine-readable
via `INGESTION_TO_EPISODE_SOURCES`.

### `INGESTION_SOURCE_TYPES`

| Key | Value | Used by |
|---|---|---|
| `GIT` | `"git"` | `ingest/git.ts` |
| `GITHUB` | `"github"` | `ingest/adapters/github.ts` |
| `SOURCE` | `"source"` | `ingest/source/index.ts` |
| `MARKDOWN` | `"markdown"` | `ingest/markdown.ts` |
| `TEXT` | `"text"` | `ingest/text.ts` |

### `EPISODE_SOURCE_TYPES`

| Key | Value | Produced by |
|---|---|---|
| `GIT_COMMIT` | `"git_commit"` | Git ingestion |
| `GITHUB_PR` | `"github_pr"` | GitHub adapter |
| `GITHUB_ISSUE` | `"github_issue"` | GitHub adapter |
| `MANUAL` | `"manual"` | text ingestion |
| `DOCUMENT` | `"document"` | markdown ingestion |
| `SOURCE_FILE` | `"source"` | source ingestion |

## Relation types (`RELATION_TYPES`)

| Key | Value | Semantics |
|---|---|---|
| `AUTHORED_BY` | `"authored_by"` | File or module was authored by person |
| `LIKELY_OWNER_OF` | `"likely_owner_of"` | Inferred ownership (recency-weighted) |
| `CO_CHANGES_WITH` | `"co_changes_with"` | Files frequently change together |
| `REVIEWED_BY` | `"reviewed_by"` | PR reviewed by person |
| `REFERENCES` | `"references"` | Cross-source reference (from resolver) |
| `CONTAINS` | `"contains"` | Module/dir contains file or sub-module |
| `DEFINED_IN` | `"defined_in"` | Symbol is defined in file |
| `IMPORTS` | `"imports"` | File imports another file |

## Adding a new value

1. Add the constant to the appropriate registry file with a `SCREAMING_SNAKE_CASE` key.
2. Document it in this file.
3. Re-export from `vocab/index.ts` if it's a new type export.
4. Do NOT remove old values — mark as `@deprecated` until a major version.

## Enforcement

**Compile time**: ingester code imports from `vocab/`; TypeScript rejects unknown
literals at the type boundary (when functions accept `EntityType`, not `string`).

**Runtime (strict mode)**: `verifyGraph(graph, { strict: true })` flags rows with
unknown vocab values as `warning`-severity violations. Normal mode is unchanged.

## Closed registry policy (v0.1)

The built-in registry in `packages/engram-core/src/vocab/` is the single source of
truth. Third-party adapters cannot extend it at load time in v0.1. Revisit when the
plugin-loading architecture (#204) lands.
