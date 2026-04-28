# Federation Spec

> Status: spec-only. No implementation in this cycle.
> This document defines the architecture for multi-scope federation of `.engram` databases.

---

## What Federation Means

Federation is the ability for multiple `.engram` databases — one per repo, team, or
organisational unit — to answer queries as if they were a single unified graph.

Two hard problems arise:

**Cross-scope entity resolution.** A `reconcile function` entity in repo A and a
`reconcile function` entity in repo B may or may not be the same concept. Conservative
v0.1 entity resolution (exact canonical name or alias match within one database) has no
way to express inter-repo identity. A federated system needs a mechanism to assert that
two entities across scopes are the same, or to present them as distinct without silently
collapsing them.

**Projection trust.** An inferred projection assembled from repo A's substrate should not
be presented as authoritative in repo B's context pack. The `edge_kind` field
(`observed`, `inferred`, `asserted`) already encodes this at the edge level; federation
must extend this discipline to projections that cross scope boundaries.

---

## Recommended Architecture: Single `.engram` + Scope Tags

Add a nullable `scope TEXT` column to the `entities`, `edges`, and `projections` tables.
A scope is a short, slash-separated identifier: `k8s/kubernetes`, `engram/core`,
`team/platform`. Null scope means local (current behaviour; backward compatible).

A single `.engram` database is shared across scopes. The ingestion pipeline tags each
entity, edge, and projection with the scope from which it was ingested. A federated query
assembles results across all scopes present in the database, ranking items by their
relevance to the query and, secondarily, by scope proximity to the query's originating
scope.

Admins who require physical isolation (compliance, access control) can run separate
`.engram` databases with a thin proxy layer that fans out read-only `engram context`
calls and merges the results. However, the preferred default is one database with scope
tags.

### Why a single database is preferred

- Entity resolution across scopes can be implemented as a standard alias or merge
  operation within one SQLite transaction. No external registry is needed.
- The ranking step for federated results is identical to the intra-scope ranking problem;
  the existing retrieval layer already solves it.
- Operational simplicity: one backup target, one schema migration, one integrity check.

---

## Rejected Alternative: Separate Databases with a Query Proxy

Keep separate `.engram` files per repo and introduce a federation proxy that fans out
`engram context` calls and merges the results.

**Rejected because:**

1. Cross-scope entity resolution requires a global namespace (to know that entity X in
   database A equals entity Y in database B). A proxy cannot maintain this without a
   centralised registry, which reintroduces the coordination problem the local-first model
   was designed to avoid.
2. The merge step at the proxy is a ranking problem identical to the intra-database
   ranking problem. Implementing it correctly in the proxy duplicates core retrieval logic
   that already exists in `engram-core`.
3. Operational complexity doubles: two schema migration paths, two integrity checkers, and
   a proxy process that must be deployed, versioned, and kept in sync with the database
   schema.

The proxy layer remains a valid *access pattern* on top of the recommended architecture
(e.g. for compliance isolation), but it should not be the canonical path for federation.

---

## Substrate Changes Required

The recommended architecture requires the following additive changes. All are nullable or
have defaults, so no existing row is broken.

### Schema migrations

```sql
-- entities table
ALTER TABLE entities ADD COLUMN scope TEXT;

-- edges table
ALTER TABLE edges ADD COLUMN scope TEXT;

-- projections table
ALTER TABLE projections ADD COLUMN scope TEXT;
```

Indexes on `scope` are advisable once more than a handful of scopes are active:

```sql
CREATE INDEX IF NOT EXISTS idx_entities_scope ON entities(scope);
CREATE INDEX IF NOT EXISTS idx_edges_scope    ON edges(scope);
CREATE INDEX IF NOT EXISTS idx_projections_scope ON projections(scope);
```

### Type changes

- `EnrichedEntity` gains an optional `scope?: string` field.
- `EnrichedEdge` gains an optional `scope?: string` field.
- Projection result types (`ProjectionResult`, `ActiveProjection`) gain an optional
  `scope?: string` field.

### CLI flags

- `engram context --scope <pattern>` — filter the assembled context pack to entities,
  edges, and projections whose scope matches the glob pattern (e.g.
  `engram/core`, `k8s/*`).
- `engram sync --scope <tag>` — tag all entities, edges, and projections produced by a
  sync run with the given scope identifier.

### Ingestion contract

When `--scope` is passed to `engram sync` (or the sync config includes a top-level
`"scope"` key), the ingestion pipeline propagates the scope to every entity, edge, and
projection it creates or supersedes. Scope is immutable after creation; a supersession
event inherits the scope of the edge it replaces.

---

## Appendix: Is W2/W3 Work Federation-Friendly?

This section verifies that the current cycle's deliverables do not foreclose the
recommended architecture.

### module_overview kind

The YAML kind files in `packages/engram-core/src/ai/kinds/` (including `entity_summary`,
`decision_page`, `topic_cluster`, `contradiction_report`) do not reference scope. When
federation lands, projections will carry a `scope` field in their stored metadata, but
the kind YAML itself defines only prompt templates and input selectors — it does not need
to know about scope. **No regression.**

### `engram context --format=json` output

The `ContextPack` assembled by `packages/engram-cli/src/commands/context.ts` does not
currently include a `scope` field on entities or projections. Adding `scope?: string` to
each item in the JSON output is a strictly additive, non-breaking change under the stable
schema discipline defined in `docs/internal/specs/cli-as-agent-surface.md`. **No
regression.**

### Harness adapters

`packages/harnesses/core/src/context-assembly.ts` shells out to `engram context` via
`execSync`. Adding `--scope <pattern>` to that invocation requires no changes to the
adapter interface or the harness plugin contract. The flag is simply appended to the
command string. **No regression.**

### Conclusion

The W2/W3 work does not foreclose the recommended architecture. The `scope` column is the
only substrate change; it is additive and can land in a future cycle without breaking any
current output contract. The three surfaces examined (kind YAML, JSON output schema,
harness adapter) are all scope-agnostic by design and require only additive changes when
federation lands.
