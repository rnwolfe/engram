# Engram

**A local-first temporal knowledge graph engine for developer memory.**

Git is for code. Engram is for everything you learned along the way.

-----

## Manifesto

Your company’s most critical knowledge is encoded in `git blame`, Slack threads
that auto-delete, and the head of an engineer who just gave notice. Every
knowledge management tool wants you to manually transcribe that knowledge into
their app. Every AI agent treats your context as ephemeral — brilliant in the
moment, forgotten by the next session.

Engram doesn’t ask you to take notes. It extracts knowledge from where it already
lives — git history, code review discussions, commit messages, documents — and
encodes it as a temporal knowledge graph: entities, relationships, and facts that
track how your understanding evolves over time.

It’s not a note-taking app. It’s the memory layer underneath everything else.

-----

## Design Principles

1. **Embeddable, not monolithic.** Engram is a library first, CLI second, server
   third. Other tools depend on it — it doesn’t depend on them.
1. **Local-first, single-file portable.** The entire knowledge graph lives in one
   `.engram` file. Copy it, `rsync` it, back it up. No external databases. No
   cloud requirements. Collaboration and version-friendly forms come from
   deterministic export and replay logs, not from diffing the binary file.
1. **Temporal by default.** Every fact has a validity window. Knowledge isn’t
   static — people change jobs, APIs break, decisions get reversed. The graph
   remembers what was true and when.
1. **Evidence-first.** Episodes are immutable raw evidence. Entities and edges
   are derived projections supported by evidence chains. Manual additions are
   just another episode type, not a separate truth path. Every claim in the
   graph traces back to the source material that produced it.
1. **Structurally sound without AI, queryable with AI.** The data model
   doesn’t depend on AI: entities, edges, temporal validity, evidence chains,
   and provenance are all computed from deterministic extraction (git log,
   blame, co-change analysis). But the interaction model almost certainly
   does — compositional queries like “show me everything Alice owns that has
   no other recent contributor AND co-changes with the auth module” are where
   the graph earns its keep, and humans won’t compose those queries manually.
   Agents will. The no-AI story isn’t “works offline” as a feature. It’s:
   **the graph is correct and complete without AI, so when AI queries it, the
   answers are grounded.** That’s the actual differentiator versus Copilot
   `@workspace` or Sourcegraph Cody, where retrieval has no provenance and no
   temporal model.
1. **Developer-native.** The first-class ingestors understand git and code. The
   primary interface is a CLI. The integration surface is MCP. This is
   infrastructure for engineers, not a productivity app for everyone.
1. **Format over features.** The `.engram` format is the durable contract. The
   CLI and MCP server are reference implementations over that contract. If the
   format is good enough, the ecosystem builds itself.
1. **Personal today, tribal tomorrow.** Every artifact carries provenance from day
   one. The schema supports multi-author entity resolution without requiring it.
   Tribal merge is a future capability that requires an explicit reconciliation
   model with human oversight — not automatic semantic dedup.

-----

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Consumers                       │
│  ┌─────────┐  ┌───────────┐  ┌───────────────┐ │
│  │   CLI   │  │ MCP Server│  │  Library API  │ │
│  │ (engram)│  │  (stdio)  │  │ (import/embed)│ │
│  └────┬────┘  └─────┬─────┘  └──────┬────────┘ │
│       └─────────────┼───────────────┘           │
│                     ▼                            │
│  ┌─────────────────────────────────────────────┐ │
│  │              engram-core                     │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │  Graph   │ │ Temporal │ │  Retrieval   │ │ │
│  │  │  Engine  │ │  Engine  │ │   Engine     │ │ │
│  │  └──────────┘ └──────────┘ └─────────────┘ │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │Ingestion │ │   AI     │ │  Evidence    │ │ │
│  │  │ Pipeline │ │ Enhancer │ │   Tracker    │ │ │
│  │  └──────────┘ └──────────┘ └─────────────┘ │ │
│  └─────────────────────────────────────────────┘ │
│                     ▼                            │
│  ┌─────────────────────────────────────────────┐ │
│  │          .engram file (SQLite)               │ │
│  │  ┌─────────┐ ┌────────┐ ┌────────────────┐ │ │
│  │  │ Entities│ │ Edges  │ │   Episodes     │ │ │
│  │  │  (nodes)│ │ (facts)│ │(raw evidence)  │ │ │
│  │  └─────────┘ └────────┘ └────────────────┘ │ │
│  │  ┌─────────┐ ┌────────┐ ┌────────────────┐ │ │
│  │  │Evidence │ │  FTS5  │ │  Embeddings    │ │ │
│  │  │  Tables │ │  Index │ │   (separate)   │ │ │
│  │  └─────────┘ └────────┘ └────────────────┘ │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

-----

## The `.engram` File Format

### Overview

An `.engram` file is a SQLite database with a defined schema. It is the single
artifact of the entire system. The file extension is `.engram`.

### Goals

- **Portable:** One file. Any SQLite client can open and inspect it.
- **Self-contained:** Embeddings, full-text indexes, and graph structure all
  live in the same file.
- **Inspectable:** `sqlite3 my.engram "SELECT * FROM entities"` just works.
- **Versioned:** Schema version in metadata enables forward-compatible tooling.
- **Migration-friendly:** The schema is stable enough to build against in v0.1
  but explicitly experimental. Breaking changes are expected before 1.0.
  The `format_version` field enables automated migrations.

### Schema

#### `metadata`

System-level key-value store.

```sql
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Required keys:
-- 'format_version'           — e.g. '0.1.0'
-- 'engine_version'           — e.g. '0.1.0'
-- 'created_at'               — ISO8601 UTC
-- 'owner_id'                 — opaque author identifier
-- 'default_timezone'         — IANA timezone, e.g. 'America/New_York'
--
-- Optional keys (present only when AI/embeddings are active):
-- 'embedding_model'          — model used for current embeddings, e.g. 'nomic-embed-text'
-- 'embedding_dimensions'     — integer as string, e.g. '384'
```

#### `entities`

Nodes in the knowledge graph. An entity is any distinct concept: a person, a
module, a service, a decision, an error class.

Entities are **derived projections**, not ground truth. They are supported by
evidence chains through the `entity_evidence` table. Entities may be updated
(e.g. summary refined), but the evidence trail is append-only.

```sql
CREATE TABLE entities (
  _rowid          INTEGER PRIMARY KEY,  -- explicit rowid for FTS5 content-sync binding.
                                        -- TEXT PK tables get implicit rowids, but relying on
                                        -- them is fragile (breaks with WITHOUT ROWID). FTS5
                                        -- content= triggers require stable integer rowids.
  id              TEXT NOT NULL UNIQUE,  -- ULID (sortable, unique, used in all FK references)
  canonical_name  TEXT NOT NULL,        -- display name (may evolve)
  entity_type     TEXT NOT NULL,        -- e.g. 'person', 'module', 'service', 'decision', 'concept'
  summary         TEXT,                 -- description (LLM-generated or manual)
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'merged', 'tentative'
  created_at      TEXT NOT NULL,        -- ISO8601 UTC
  updated_at      TEXT NOT NULL,        -- ISO8601 UTC
  owner_id        TEXT                  -- who created this entity (provenance)
);

CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_name ON entities(canonical_name);
```

#### `entity_aliases`

Temporal identity labels for entities. Modules get renamed, people change
display names, services get rebranded. Aliases track name history with
validity windows.

Note: aliases model **naming changes**, not structural changes. Team
membership belongs in edges (`member_of`). Concept splits belong in future
reconciliation semantics, not aliases.

```sql
CREATE TABLE entity_aliases (
  id          TEXT PRIMARY KEY,     -- ULID
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  alias       TEXT NOT NULL,
  valid_from  TEXT,                 -- ISO8601 UTC, null = unknown
  valid_until TEXT,                 -- ISO8601 UTC, null = current
  episode_id  TEXT REFERENCES episodes(id),
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_aliases_entity ON entity_aliases(entity_id);
CREATE INDEX idx_aliases_name ON entity_aliases(alias);
```

#### `edges`

Relationships between entities. Edges are **temporal facts** — directional,
time-bounded, and invalidatable.

**Critical distinction:** `edge_kind` separates what the system directly
observed from what it inferred from what a human asserted. Without this,
users will read heuristics as truth and the graph loses trust.

**Temporal invariants:**

- `[valid_from, valid_until)` is a **half-open interval**. `valid_from` is
  inclusive, `valid_until` is exclusive.
- `valid_from = NULL` means “unknown start” (not “beginning of time”).
- `valid_until = NULL` means “still current.”
- All timestamps are **ISO8601 UTC**. No local times in the schema.
- `invalidated_at` is the T’ (transactional) timestamp when the system
  learned this fact was superseded. It is independent of `valid_until`.
- `superseded_by` links to the edge that replaced this one, if any.

```sql
CREATE TABLE edges (
  _rowid          INTEGER PRIMARY KEY,  -- explicit rowid for FTS5 content-sync (see entities)
  id              TEXT NOT NULL UNIQUE,  -- ULID
  source_id       TEXT NOT NULL REFERENCES entities(id),
  target_id       TEXT NOT NULL REFERENCES entities(id),
  relation_type   TEXT NOT NULL,      -- e.g. 'owns', 'depends_on', 'decided', 'co_changes_with'
  edge_kind       TEXT NOT NULL,      -- 'observed' | 'inferred' | 'asserted'
                                      -- observed: directly extracted from source (e.g. git blame)
                                      -- inferred: derived by heuristic (e.g. co-change = likely dependency)
                                      -- asserted: manually stated by a human
  fact            TEXT NOT NULL,       -- human-readable: "Alice owns the auth module"
  weight          REAL DEFAULT 1.0,   -- relationship strength (e.g. co-change frequency)
  valid_from      TEXT,               -- ISO8601 UTC, inclusive. NULL = unknown start.
  valid_until     TEXT,               -- ISO8601 UTC, exclusive. NULL = still current.
  created_at      TEXT NOT NULL,      -- ISO8601 UTC, when this edge was recorded (T' timeline)
  invalidated_at  TEXT,               -- ISO8601 UTC, when this edge was superseded (T' timeline)
  superseded_by   TEXT REFERENCES edges(id),  -- the edge that replaced this one
  confidence      REAL DEFAULT 1.0,   -- 0.0-1.0
  owner_id        TEXT                -- who recorded this fact
);

CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(relation_type);
CREATE INDEX idx_edges_kind ON edges(edge_kind);
CREATE INDEX idx_edges_valid ON edges(valid_from, valid_until);
CREATE INDEX idx_edges_active ON edges(invalidated_at) WHERE invalidated_at IS NULL;
```

**Active edge uniqueness (default dedup heuristic):** To prevent dedup drift,
the ingestion pipeline checks before insert that no two active edges share
`(source_id, target_id, relation_type, edge_kind)` with overlapping validity
windows. This is a **default heuristic for v0.1**, not a universal invariant.
It may be too restrictive for cases like: multiple asserted facts with different
wording, different extractors producing parallel inferences, or different owners
contributing independent observations. The dedup key may need to include
`owner_id` or `extractor` in future versions.

**On collision, the pipeline supersedes rather than skips.** If a new edge
collides with an existing active edge, the old edge is superseded via
`supersedeEdge()` — not silently dropped. This handles the critical case of
ownership transitions: if Alice owned auth 6 months ago and Bob owns it now,
the ingestion pipeline supersedes Alice’s `inferred.likely_owner_of` edge
with Bob’s, preserving Alice’s edge in history with correct validity windows.
Skipping would silently drop Bob’s ownership, which is a correctness bug.

#### `episodes`

Raw source data. **Immutable under normal operation.** Every entity and edge
traces back to the episodes that produced it via evidence tables. Episodes are
ground truth — they are never modified after creation.

**Exception: data redaction.** Episodes contain raw content including actor
names and potentially sensitive data. If data deletion is required (GDPR right
to erasure, employee departure scrubbing, security incident), episodes support
a `redacted` status. A redacted episode has its `content` replaced with a
tombstone marker (`[REDACTED]`), its `actor` cleared, and its `content_hash`
recomputed. The episode row itself is preserved so evidence chains remain
structurally intact — downstream entities and edges still reference the episode
ID, but the raw content is gone. The redaction workflow is a v0.2+ feature,
but the schema accommodates it from v0.1 via the `status` column.

```sql
CREATE TABLE episodes (
  _rowid            INTEGER PRIMARY KEY,  -- explicit rowid for FTS5 content-sync (see entities)
  id                TEXT NOT NULL UNIQUE,  -- ULID
  source_type       TEXT NOT NULL,      -- 'git_commit', 'github_pr', 'github_issue', 'gerrit_cl',
                                        -- 'buganizer_bug', 'jira_ticket', 'manual', 'document'
                                        -- (extensible via adapters)
  source_ref        TEXT,               -- external reference (commit SHA, PR URL, file path)
  content           TEXT NOT NULL,      -- raw source text (exact, not normalized)
  content_hash      TEXT NOT NULL,      -- SHA-256 of content. Dedup hint, NOT identity guarantee.
                                        -- Identical content can legitimately appear in multiple episodes
                                        -- (boilerplate commits, issue templates, repeated errors).
  actor             TEXT,               -- who produced this (git author, username)
  status            TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'redacted'
  timestamp         TEXT NOT NULL,      -- ISO8601 UTC, when the source event occurred
  ingested_at       TEXT NOT NULL,      -- ISO8601 UTC, when engram processed it
  owner_id          TEXT,               -- which user triggered ingestion
  extractor_version TEXT NOT NULL,      -- version of the extraction code that processed this
  metadata          TEXT                -- JSON blob for source-specific metadata
);

-- Source-specific idempotency: enforced only where source identity is stable.
-- Git commits have stable SHAs. GitHub PRs have stable URLs. Manual text does not.
-- SQLite treats NULLs as distinct in UNIQUE, so rows with source_ref=NULL are
-- never constrained — which is correct for manual/document episodes.
CREATE UNIQUE INDEX idx_episodes_identity
  ON episodes(source_type, source_ref)
  WHERE source_ref IS NOT NULL;

CREATE INDEX idx_episodes_source ON episodes(source_type);
CREATE INDEX idx_episodes_time ON episodes(timestamp);
CREATE INDEX idx_episodes_hash ON episodes(content_hash);
```

**Content contract:** The `content` field stores **exact raw source text**.
No normalization, no summarization. If the episode came from a git commit
message, it’s the exact commit message. Derived/summarized content belongs
on entities and edges, not episodes. The sole exception is redacted episodes,
where `content` is replaced with `[REDACTED]` and `status` is set to
`'redacted'`.

#### `entity_evidence`

Links entities to the episodes that support them. An entity may be supported
by multiple episodes (e.g. an author entity appears in many commits). An
episode may support multiple entities.

```sql
CREATE TABLE entity_evidence (
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  episode_id  TEXT NOT NULL REFERENCES episodes(id),
  extractor   TEXT NOT NULL,          -- which extraction method produced this link
                                      -- e.g. 'git_author', 'llm_entity_extraction', 'manual'
  confidence  REAL NOT NULL DEFAULT 1.0,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (entity_id, episode_id, extractor)
);
```

#### `edge_evidence`

Links edges to the episodes that support them. Same many-to-many rationale
as entity evidence.

```sql
CREATE TABLE edge_evidence (
  edge_id     TEXT NOT NULL REFERENCES edges(id),
  episode_id  TEXT NOT NULL REFERENCES episodes(id),
  extractor   TEXT NOT NULL,          -- e.g. 'git_cochange', 'github_pr_review', 'llm_fact_extraction'
  confidence  REAL NOT NULL DEFAULT 1.0,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (edge_id, episode_id, extractor)
);
```

**Hard invariant: no unsupported knowledge.** Every entity and every edge must
have at least one evidence link. The `addEntity` and `addEdge` API calls require
evidence input for this reason. Manual assertions create an episode of
`source_type = 'manual'` and link through evidence like any other source. There
is no path to creating “floating” entities or edges without provenance. This
invariant is enforced at the API layer, not via SQL constraint.

#### `embeddings`

Embeddings are stored separately from the objects they describe. This allows:

- Model changes without touching entity/edge rows
- Multiple embedding models coexisting
- Clean invalidation when models are swapped

```sql
CREATE TABLE embeddings (
  id          TEXT PRIMARY KEY,       -- ULID
  target_type TEXT NOT NULL,          -- 'entity' | 'edge'
  target_id   TEXT NOT NULL,          -- references entities.id or edges.id depending on target_type
  model       TEXT NOT NULL,          -- e.g. 'nomic-embed-text'
  dimensions  INTEGER NOT NULL,       -- e.g. 384
  vector      BLOB NOT NULL,          -- raw float32 array, LITTLE-ENDIAN byte order.
                                      -- This is pinned in the format spec for portability.
                                      -- Readers must not assume platform-native byte order.
  source_text TEXT NOT NULL,          -- the text that was embedded (for recomputation)
  created_at  TEXT NOT NULL,
  UNIQUE(target_type, target_id, model)
);

CREATE INDEX idx_embeddings_target ON embeddings(target_type, target_id);
```

**Note:** The `(target_type, target_id)` pair is a polymorphic reference that
SQLite cannot enforce as a true foreign key. Target integrity is enforced at the
application layer: the `addEntity`/`addEdge` methods manage embedding lifecycle,
and `engram verify` (see below) checks for dangling references.

#### `ingestion_runs`

Tracks ingestion sessions for idempotency and debugging. Each run of
`engram ingest` creates a row here. Adapters persist cursors so subsequent
runs only process new data.

```sql
CREATE TABLE ingestion_runs (
  id              TEXT PRIMARY KEY,   -- ULID
  source_type     TEXT NOT NULL,      -- 'git', 'github', 'markdown', etc.
  source_scope    TEXT NOT NULL,      -- identifies the specific source instance:
                                      -- for git: repo path or remote URL
                                      -- for github: 'owner/repo'
                                      -- for markdown: directory path
                                      -- cursors are only meaningful within a scope.
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  cursor          TEXT,               -- adapter-specific checkpoint (e.g. latest commit SHA,
                                      -- last PR number processed)
  extractor_version TEXT NOT NULL,
  episodes_created  INTEGER DEFAULT 0,
  entities_created  INTEGER DEFAULT 0,
  edges_created     INTEGER DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'running',  -- 'running', 'completed', 'failed'
  error           TEXT
);

CREATE INDEX idx_runs_scope ON ingestion_runs(source_type, source_scope);
```

#### Full-Text Search

FTS indexes are maintained via SQLite triggers that fire on INSERT/UPDATE/DELETE
to the source tables. This ensures FTS is always current without requiring
manual rebuild. A `engram rebuild-index` command exists for recovery.

```sql
CREATE VIRTUAL TABLE entities_fts USING fts5(
  canonical_name, summary,
  content=entities, content_rowid=_rowid
);

CREATE VIRTUAL TABLE edges_fts USING fts5(
  fact,
  content=edges, content_rowid=_rowid
);

CREATE VIRTUAL TABLE episodes_fts USING fts5(
  content,
  content=episodes, content_rowid=_rowid
);

-- Triggers for entities_fts (identical pattern applied to edges_fts and episodes_fts —
-- all three FTS tables have INSERT/DELETE/UPDATE triggers, shown here once for brevity)
CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(_rowid, canonical_name, summary)
  VALUES (new._rowid, new.canonical_name, new.summary);
END;
CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, _rowid, canonical_name, summary)
  VALUES ('delete', old._rowid, old.canonical_name, old.summary);
END;
CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, _rowid, canonical_name, summary)
  VALUES ('delete', old._rowid, old.canonical_name, old.summary);
  INSERT INTO entities_fts(_rowid, canonical_name, summary)
  VALUES (new._rowid, new.canonical_name, new.summary);
END;
```

#### Vector Search

Vector similarity search uses `sqlite-vec` when available, with fallback to
brute-force cosine similarity scan for small graphs (<50k embeddings). The
engine abstracts this behind an `EmbeddingProvider` interface:

- `OllamaProvider` — local models (nomic-embed-text, etc.)
- `OpenAIProvider` — cloud API
- `NullProvider` — no-op, disables semantic features gracefully

-----

## Engine API Surface (`engram-core`)

The core library exposes these operations. Every operation takes an optional
`scope` parameter that defaults to `"local"`.

**Why `scope` exists in v0.1 despite being a no-op:** This is a deliberate
API stability decision, not premature abstraction. The personal→tribal path
is a core design principle, and adding `scope` to every function signature
later is an API-breaking change for every consumer, plugin, and MCP client.
The cost of including it now is one optional parameter with a default value.
The cost of retrofitting it is a semver major bump. It stays.

### Graph Operations

```typescript
// Lifecycle
createGraph(path: string, opts?: CreateOpts): EngramGraph
openGraph(path: string): EngramGraph
closeGraph(graph: EngramGraph): void

// Entities
addEntity(graph, entity: EntityInput, evidence: EvidenceInput | EvidenceInput[]): Entity
getEntity(graph, id: string): Entity | null
findEntities(graph, query: EntityQuery): Entity[]
addEntityAlias(graph, entity_id: string, alias: AliasInput): EntityAlias

// Entity resolution: find existing entity by name/alias match.
// Conservative and deterministic in v0.1: exact canonical_name or alias match.
// Does NOT auto-create. Returns null if no match. Caller decides whether to
// create new or merge.
resolveEntity(graph, name: string, type?: string): Entity | null

// Edges (Facts)
addEdge(graph, edge: EdgeInput, evidence: EvidenceInput | EvidenceInput[]): Edge
getEdge(graph, id: string): Edge | null
findEdges(graph, query: EdgeQuery): Edge[]
getFactHistory(graph, source_id: string, target_id: string): Edge[]  // temporal fact evolution

// Supersede: atomic operation that invalidates old edge and creates new edge
// in a single transaction. Never leaves partially invalidated state.
supersedeEdge(graph, old_edge_id: string, new_edge: EdgeInput, evidence: EvidenceInput | EvidenceInput[]): Edge

// Episodes (immutable — no update/delete)
addEpisode(graph, episode: EpisodeInput): Episode
getEpisode(graph, id: string): Episode | null

// Evidence
getEvidenceForEntity(graph, entity_id: string): EvidenceChain[]
getEvidenceForEdge(graph, edge_id: string): EvidenceChain[]

// Integrity
verifyGraph(graph): VerifyResult  // checks all invariants (see engram verify)
```

### Retrieval Operations

```typescript
// Hybrid search: combines FTS5 + vector similarity + graph traversal
search(graph, query: string, opts?: SearchOpts): SearchResult[]

interface SearchOpts {
  scope?: string           // 'local' (default) | future: 'team', 'org'
  limit?: number           // default 10
  min_confidence?: number  // 0.0-1.0, default 0.0
  valid_at?: string        // ISO8601 — only return facts valid at this time
  entity_types?: string[]  // filter by entity type
  edge_kinds?: EdgeKind[]  // filter by 'observed', 'inferred', 'asserted'
  include_invalidated?: boolean  // default false
  mode?: 'semantic' | 'fulltext' | 'hybrid'  // default 'hybrid'
}

interface SearchResult {
  type: 'entity' | 'edge'
  id: string
  score: number            // composite relevance score
  score_components: {      // for debugging and benchmark credibility
    fts_score: number
    vector_score: number
    graph_score: number    // proximity to query-relevant nodes
    temporal_score: number // recency/validity bonus
    evidence_score: number // evidence strength:
                           //   prefers directly supported claims over heuristically inferred ones
                           //   boosts claims with multiple supporting episodes
                           //   boosts higher-confidence evidence chains
                           //   may apply source-specific trust weighting
                           // This is a core differentiator vs generic semantic search.
  }
  content: string          // rendered result text
  provenance: Provenance   // who, when, from what source
  edge_kind?: EdgeKind     // if type is 'edge'
}

// Graph traversal
getNeighbors(graph, entity_id: string, depth?: number): SubGraph
getPath(graph, from_id: string, to_id: string): Edge[]

// Temporal queries
getSnapshot(graph, at: string): TemporalSnapshot  // graph state at a point in time
getDecayReport(graph, opts?: DecayOpts): DecayReport

interface DecayReport {
  items: DecayItem[]
  generated_at: string    // ISO8601
}

interface DecayItem {
  type: 'entity' | 'edge'
  id: string
  name: string            // entity name or edge fact
  decay_category: DecayCategory
  severity: 'low' | 'medium' | 'high' | 'critical'
  details: string         // human-readable explanation
  last_evidence_at: string   // most recent supporting evidence timestamp
}

// Typed decay categories — not a grab bag.
type DecayCategory =
  | 'stale_evidence'        // no supporting evidence updated in N time
  | 'contradicted'          // later evidence contradicts this fact
  | 'concentrated_risk'     // high centrality + single/few contributors (bus factor)
  | 'dormant_owner'         // primary contributor inactive for N time.
                            // "Primary contributor" is computed as: the author with the most
                            // commits weighted by recency (exponential decay, half-life 90 days)
                            // to the entity's associated files. This is NOT most-total-commits
                            // (which over-weights ancient history) and NOT most-recent-commit
                            // (which is noisy). The weighted-recency approach identifies who
                            // has been the sustained active owner, not just who touched it last.
  | 'orphaned'              // entity with no active edges — structurally isolated,
                            // may indicate stale projection OR simply underlinked knowledge
```

### Ingestion Operations

Ingestion is split into two layers:

1. **VCS layer (universal):** git commits, blame, co-change analysis. Works
   with any git repo regardless of hosting. This is the foundation that
   produces structural knowledge without any external API calls.
1. **Enrichment adapters (pluggable):** code review discussions, linked
   issues, CI signals. These are platform-specific and require API tokens.
   Each adapter implements a common interface so the entity/edge extraction
   pipeline is shared — only the data fetching differs.

This separation matters because git is universal but the enrichment context
varies wildly: GitHub PRs vs. Gerrit CLs vs. GitLab MRs, GitHub Issues vs.
Buganizer vs. Jira vs. Linear. The structural graph from git alone must be
compelling. Enrichment adapters make it richer.

```typescript
// === VCS Layer (universal, no API tokens needed) ===

ingestGitRepo(graph, repo_path: string, opts?: GitIngestOpts): IngestResult

interface GitIngestOpts {
  since?: string           // ISO8601 or relative ('6 months ago')
  branch?: string          // default: current branch
  include_blame?: boolean  // default false (expensive but valuable)
  path_filter?: string[]   // glob patterns to include
}

// === Enrichment Adapters (pluggable, require credentials) ===

interface EnrichmentAdapter {
  name: string                       // 'github', 'gerrit', 'gitlab', 'jira', etc.
  kind: 'code_review' | 'issue_tracker' | 'ci'

  // Fetch review/issue data linked to commits already in the graph
  enrich(graph: EngramGraph, opts: EnrichOpts): IngestResult
}

interface EnrichOpts {
  since?: string
  token?: string           // API token / credential
  endpoint?: string        // API base URL (for self-hosted instances)
}

// v0.1 ships with:
//   GitHubReviewAdapter    — PRs, review comments, linked issues
//   GitHubIssueAdapter     — Issues, labels, cross-references
//
// Future adapters (same interface, different data source):
//   GerritAdapter          — CLs, review comments, submit messages
//   BuganizerAdapter       — bugs, hotlists, priority changes
//   GitLabAdapter          — MRs, issues
//   JiraAdapter            — tickets, epics, transitions
//   LinearAdapter          — issues, projects, cycles

// === Manual Ingestion ===

ingestMarkdown(graph, path: string): IngestResult
ingestText(graph, content: string, source_ref?: string): IngestResult

// === Result ===

interface IngestResult {
  episodes_created: number
  episodes_skipped: number   // already existed (idempotency)
  entities_extracted: number
  entities_resolved: number  // matched to existing
  entities_potential_duplicates: Array<{  // entities that may be duplicates but
    new_id: string                        // couldn't be confidently resolved.
    candidate_id: string                  // e.g. git sees alice@corp.com, GitHub
    reason: string                        // sees @alicewonderland. Surfaced so the
  }>                                      // user can reconcile manually.
  edges_created: number
  edges_superseded: number   // replaced by new info via supersedeEdge()
  run_id: string             // references ingestion_runs table
}
```

### Idempotent Ingestion

Running `engram ingest git` twice on the same repo must produce the same graph.
This is enforced through:

- **Episode dedup (source-specific):** For sources with stable identifiers
  (git commits by SHA, PRs by URL, issues by ID), a partial unique index on
  `(source_type, source_ref) WHERE source_ref IS NOT NULL` prevents duplicate
  ingestion. For sources without stable refs (manual text, pasted content),
  the ingestion layer uses `content_hash` as an advisory dedup signal —
  the pipeline warns on hash collision but does not block insert, because
  identical content can legitimately appear in multiple episodes.
- **Ingestion cursors:** Each `ingestion_run` records a `cursor` (e.g. latest
  commit SHA processed). Subsequent runs resume from the cursor.
- **Extractor versioning:** `extractor_version` on episodes and ingestion_runs
  enables re-extraction when the extraction logic improves. A future
  `engram reingest --extractor-version X` command can re-process episodes
  without re-fetching source data.
- **Edge dedup:** Before creating a new edge, the pipeline checks for existing
  active edges with the same dedup key (see Active Edge Uniqueness in the
  schema section above) and overlapping validity windows. Duplicates are
  skipped or merged.

### Provenance Model

Every artifact carries provenance. This is the mechanism that enables
personal → tribal knowledge evolution.

```typescript
interface Provenance {
  owner_id: string        // opaque identifier for the author
  source_type: string     // 'git_commit', 'manual', etc.
  source_ref?: string     // commit SHA, file path, URL
  recorded_at: string     // ISO8601
  confidence: number      // 0.0-1.0
}

type EdgeKind = 'observed' | 'inferred' | 'asserted'
```

Entity identity is **not owner-scoped**: the model is designed so multiple
authors can eventually reconcile knowledge about the same concept. However,
v0.1 resolution remains conservative and explicit — exact canonical name or
alias matching only. A future merge operation would recognize shared entities
through an **explicit reconciliation model** — canonical entity, candidate
matches, merge suggestions, provenance-preserving resolution. Automatic
semantic merge is explicitly out of scope; accidental over-merging poisons a
graph faster than duplicates.

Future reconciliation may also require modeling **merge/split semantics**
(one concept splitting into two, or two being reconciled as identical). For
v0.1, the `status = 'merged'` field on entities is reserved for this purpose,
and future typed edges like `merged_into`, `split_from`, `same_as_candidate`
are anticipated but not implemented.

-----

## CLI (`engram`)

The CLI is the primary user-facing interface. It wraps `engram-core`.

### Core Commands

```
engram init [--from-git <path>]     # Create .engram file, optionally ingest a repo
engram add <content>                # Add a manual note/fact (creates episode; may extract entities)
engram add --file <path>            # Ingest a file
engram search <query>               # Hybrid search
engram relate <entity> <rel> <entity>  # Manually relate two entities (edge_kind = 'asserted')
engram show <entity>                # Display entity with edges, aliases, evidence
engram history <entity> [<entity>]  # Temporal fact evolution
engram decay                        # Show knowledge decay/risk report
engram ingest git [<path>]          # Ingest/update from git history (universal)
engram ingest enrich github         # Enrich with GitHub PRs/issues (requires token)
engram ingest md <glob>             # Ingest markdown files
engram export [--format jsonl|md]   # Deterministic export for diff/collaboration
engram stats                        # Graph statistics and health
engram rebuild-index                # Rebuild FTS indexes (recovery)
engram verify                       # Validate .engram file integrity (see below)
engram serve                        # Start MCP server (stdio transport)
```

### Integrity Verification (`engram verify`)

Since the format is the durable contract, the file itself must be
self-validating. `engram verify` runs a suite of integrity checks:

- Every entity has at least one row in `entity_evidence`
- Every edge has at least one row in `edge_evidence`
- Every `superseded_by` references an existing edge
- Every `entity_aliases.episode_id` references an existing episode
- Every `edge_evidence.episode_id` and `entity_evidence.episode_id` exists
- No embedding `target_id` references a nonexistent entity or edge
- No active edges violate the current dedup heuristic
- All required metadata keys are present
- `format_version` is recognized by the current engine

Exits 0 if clean, nonzero with a report of violations. Also available
as `verifyGraph(graph): VerifyResult` in the library API. Recommended to
run automatically on `openGraph()` in a non-blocking advisory mode.

### The Money Command

```
engram init --from-git .
```

This single command uses the **VCS layer only** — no API tokens, no cloud:

1. Creates a new `.engram` file in the current directory
1. Walks git history (configurable depth, default 6 months)
1. Extracts entities: authors, files/modules, issue references (by regex pattern)
1. Extracts edges with explicit `edge_kind`:
- `observed.authored_by` — git blame/log attribution
- `observed.modified` — file change records
- `inferred.co_changes_with` — files that frequently change together
- `inferred.likely_owner_of` — most frequent recent author (NOT definitive ownership)
- `inferred.concentrated_in` — single-author modules (bus factor signal)
1. If AI is available: generates summaries, resolves entity aliases, extracts
   higher-confidence facts from commit message text
1. If AI is not available: still builds the full structural graph from git
   metadata alone

**Without AI, the structural graph is correct and complete:**

- `observed.authored_by`, `observed.modified` edges from git log/blame
- `inferred.co_changes_with`, `inferred.likely_owner_of`, `inferred.concentrated_in`
  edges from statistical analysis
- Evidence chains linking every edge back to specific commits
- Temporal validity windows on all inferred relationships
- Full-text search over all episodes and entity summaries

**The `engram decay` report surfaces dashboard-style outputs:** bus factor
maps, co-change hotspots, inactive-but-central files, ownership topology.
These are real and useful, but — honestly — they’re the outputs of a script,
not a knowledge engine. Tools like `git-fame` and `hercules` produce
comparable static reports.

**The graph justifies itself when queries compose across those signals.** Not
“what’s the bus factor of auth?” but “show me everything Alice owns that has
no other recent contributor AND co-changes with the auth module AND has had
no enrichment from code review discussions.” That compositional query is
where the temporal graph earns its keep — and it’s where `git-fame` can’t
follow. But humans won’t compose those queries manually. Agents will.

**The no-AI audience is the agent, not the human.** The VCS-only graph’s
real value is that it gives a locally-running agent (Claude Code via MCP,
Cursor, or Ollama-backed workflows) a **grounded, evidence-backed, temporally
valid** knowledge substrate to query. When the agent says “Alice owns auth,”
it can cite the commits, show the validity window, and distinguish between
`observed` and `inferred`. That’s the differentiator versus Copilot workspace
search, where retrieval has no provenance and no temporal model.

**Enrichment is a separate, optional step:**

```
engram ingest enrich github --token $GITHUB_TOKEN
```

This pulls PR discussions, linked issues, review comments, and merges them
into the existing graph — adding decision context and discussion threads that
commit messages alone don’t capture. Future adapters (Gerrit, Buganizer, Jira)
use the same `engram ingest enrich <adapter>` pattern.

With enrichment + AI, the tool unlocks:

- **Decision archaeology:** why was X changed to Y?
- **Rationale search:** find the discussion that led to this architecture
- **Contextual summaries:** synthesized explanations of complex changes

-----

## MCP Server

The MCP server exposes the engram graph to AI agents. It runs as a **stdio
transport** for Claude Code and Cursor integration.

### Design Bias: Read-Heavy, Evidence-Based Writes

The MCP surface is intentionally biased toward **read/search/context assembly**.
Agents should mostly ingest evidence (episodes), not directly author ontology
(entities and edges). Direct entity/edge creation is available for manual
assertions but is not the primary agent workflow.

### Tools

```
# Read / Search (primary agent workflow)
engram_search       — Hybrid search across the knowledge graph
engram_get_entity   — Retrieve entity with relationships and evidence chain
engram_get_context  — Assemble relevant context for a query (see below)
engram_get_decay    — Surface stale or at-risk knowledge
engram_get_history  — Temporal fact evolution for an entity pair

# Write (evidence-first)
engram_add_episode  — Ingest raw content as evidence (preferred agent write path)
engram_add_entity   — Create or resolve an entity with evidence (for manual assertions)
engram_add_edge     — Create a relationship/fact with evidence (for manual assertions)
```

### `engram_get_context` (detailed specification)

This is the tool agents call 95% of the time. It assembles a context window
from the knowledge graph that gives the agent the information it needs to
answer a question or complete a task.

**Assembly strategy:**

```
query
  → hybrid search (FTS + vector + graph)
    → top-K initial results (entities + edges)
      → fan-out: 1-hop graph traversal from each result
        → collect neighboring entities, supporting edges, evidence episodes
          → rank by composite score (relevance × evidence strength × recency)
            → budget-aware truncation to fit token limit
              → formatted context string
```

**Parameters:**

```typescript
engram_get_context(query: string, opts?: {
  max_tokens?: number      // target context budget, default 2000
  depth?: number           // graph traversal hops, default 1
  include_evidence?: boolean  // include raw episode excerpts, default true
  valid_at?: string        // temporal filter, default now
  edge_kinds?: EdgeKind[]  // filter, default all
})
```

**Returns:** A formatted text block containing:

- Relevant entities with summaries
- Connecting edges (facts) with validity windows and edge_kind labels
- Supporting episode excerpts (when `include_evidence` is true)
- Provenance annotations (source type, confidence, last evidence date)

**Token budget contract:** The returned context string will not exceed
`max_tokens`. When the graph contains more relevant material than fits,
results are truncated by composite score. The response includes a
`truncated: boolean` flag and `total_relevant: number` so the agent
knows if it should narrow its query.

**Why this matters:** Without `get_context`, an agent must call `search`,
then `get_entity` for each result, then reason about which edges to
follow. `get_context` collapses that into one round-trip with a
pre-assembled, budget-aware context window — the same pattern that makes
Zep’s memory retrieval effective.

### Resources

```
engram://stats      — Graph statistics
engram://recent     — Recently added/modified knowledge
```

All tools accept an optional `scope` parameter (default: `"local"`).

-----

## Evaluation Framework (EngRAMark)

A benchmark suite for measuring engram’s effectiveness. This is the publishable
artifact — the paper that validates the approach.

### Benchmark: Codebase Knowledge Retrieval (CKR)

**Test Repositories:**

Two public repositories representing the two extremes of the target audience:

1. **Fastify** (`fastify/fastify`) — the primary v0.1 benchmark. Mid-size,
   tighter contributor set, clearer ownership topology, rich GitHub PR/issue
   history. Tests: practical utility at the scale 90% of developers work in.
   Full GitHub enrichment available. Manageable benchmark-design effort.
1. **Kubernetes** (`kubernetes/kubernetes`) — the stretch benchmark. Thousands
   of contributors, massive churn, KEPs, SIG ownership structures, multi-year
   decision arcs. Tests: scale, temporal complexity, cross-cutting knowledge
   synthesis. Added after CKR methodology is validated on Fastify.

Future addition (v0.2+): an **archived/dead project** where key contributors
have all left — validating the claim: “Engram can answer questions about this
codebase that nobody alive on the team can answer.”

**Question categories** (applied to both repos):

1. **Ownership queries:** “Who is the primary author of the plugin system?”
   (answerable from git blame)
1. **Decision archaeology:** “Why was the ORM switched from Sequelize to Prisma?”
   (answerable from PR descriptions and commit messages)
1. **Temporal reasoning:** “Was the rate limiter added before or after the
   incident in March?” (requires temporal graph)
1. **Bus factor analysis:** “Which modules have only one contributor in the last
   year?” (structural graph query)
1. **Co-change inference:** “Which files most frequently change together?”
   (co-change analysis — note: co-change, not dependency)
1. **Knowledge decay detection:** “Which documented decisions are contradicted
   by subsequent code changes?” (temporal invalidation)

**Baselines:**

- Raw `git log` + `grep` (no structure)
- Full repo context in LLM context window (expensive, limited by window size)
- AI-native codebase Q&A (at least one of: GitHub Copilot `@workspace`,
  Sourcegraph Cody, or Cursor codebase chat — these are the tools a developer
  would actually compare against, not Zep or academic systems)
- Engram graph, VCS-only (no enrichment adapters, no AI) — validates structural value
- Engram graph, VCS + GitHub enrichment — validates adapter value
- Engram graph, VCS + enrichment + AI — validates full pipeline

This three-tier Engram comparison is critical: it quantifies the marginal
value of each layer independently. If VCS-only already beats `git log + grep`
significantly, the tool is useful even in air-gapped environments with no
API access and no LLM.

**Metrics — retrieval and answering measured separately:**

*Retrieval quality* (does the system find the right evidence?):

- Recall@k of relevant episodes/edges
- MRR (Mean Reciprocal Rank) for retrieval
- nDCG (normalized Discounted Cumulative Gain)
- Context size returned (tokens)

*Answer quality* (given retrieved context, does a fixed reader model answer correctly?):

- Accuracy (correct answers / total questions)
- Latency (time to retrieve relevant context)
- Token efficiency (tokens needed vs. full-context baseline)

Separating these ensures failures can be attributed to retrieval vs. synthesis.

### Benchmark: Knowledge Decay Detection (KDD)

**Setup:** Given a repository at time T, predict which documentation and
knowledge artifacts will be stale by time T+6months. Validate against actual
changes.

**Metrics:**

- Precision/recall of staleness prediction
- Lead time (how early the system detected decay)

### Publication Target

Structure findings as a short paper:

- “Engram: Temporal Knowledge Graphs for Developer Memory”
- Compare against: raw git search, full-context LLM, Zep/Graphiti (on developer tasks)
- Publish on arXiv, submit to MSR (Mining Software Repositories) or ICSE workshop track

-----

## Technology Decisions

|Decision          |Choice                                                     |Rationale                                                                                                                               |
|------------------|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
|Language          |TypeScript (Bun)                                           |Author expertise, fast iteration, npm ecosystem for MCP, broad contributor pool. Rust rewrite justified only after format stabilization.|
|Storage           |SQLite via `better-sqlite3`                                |Zero dependency, single file, proven at scale, FTS5 built in                                                                            |
|Vector search     |`sqlite-vec` or in-process brute force                     |No external vector DB. Embeddings stored separately. Brute force fine for <50k embeddings.                                              |
|IDs               |ULIDs                                                      |Sortable, unique, no coordination needed. Enables merge without ID collision.                                                           |
|Embedding model   |Pluggable (`nomic-embed-text` default via Ollama, 384 dims)|Local-first default, cloud optional, configurable                                                                                       |
|LLM for extraction|Pluggable (Ollama local, Anthropic/OpenAI cloud)           |AI enhances but isn’t required                                                                                                          |
|CLI framework     |`commander` + `@clack/prompts`                             |Simple, proven, interactive when needed                                                                                                 |
|MCP transport     |`@modelcontextprotocol/sdk` (stdio)                        |Reference implementation, stdio for Claude Code/Cursor                                                                                  |

-----

## v0.1 Scope Boundary

### In scope

- `.engram` file format (stable enough to build against, migration-friendly)
- `engram-core` library: graph, temporal, retrieval, evidence, provenance APIs
- `engram init --from-git .` (the money command)
- `engram add`, `engram search`, `engram show`, `engram decay`, `engram history`
- `engram ingest git` for VCS-layer ingestion (universal, no API needed)
- `engram ingest enrich github` for GitHub PR/issue enrichment
- `engram ingest md` for markdown files
- `EnrichmentAdapter` interface (so community can build Gerrit, Jira, etc.)
- Idempotent ingestion with cursors and content hashing
- MCP server (stdio) with read-heavy tool surface
- AI-enhanced mode (entity extraction, semantic search) when LLM available
- Graceful no-AI fallback (structural graph, FTS, temporal queries)
- EngRAMark v0.1 against Fastify (CKR subset: ownership, bus factor, co-change)
- `engram export --format jsonl` for deterministic, diffable output
- `engram verify` for file integrity validation

### Out of scope (v0.2+)

- Team/tribal knowledge merging (format supports it, features don’t)
- EngRAMark against Kubernetes (after methodology validated on Fastify)
- Web UI or Tauri desktop app
- Enrichment adapters beyond GitHub (Gerrit, Buganizer, Jira, Linear, GitLab)
- Non-git ingestors (Slack, Confluence)
- Terminal session capture
- Community detection (label propagation, topic clustering)
- Rich TUI beyond basic interactive explorer
- Graph visualization beyond ASCII
- Authentication / access control
- `.engram` file encryption
- SSE MCP transport

### Out of scope (long-term vision, not committed)

- Tribal merge: centralized reconciliation of personal engram files
- Organizational knowledge topology dashboards
- Real-time ingestion from CI/CD pipelines
- VS Code / JetBrains extensions
- Obsidian plugin (read/write `.engram` files)

-----

## Project Structure

```
engram/
├── packages/
│   ├── engram-core/          # The engine library (THE product)
│   │   ├── src/
│   │   │   ├── graph/        # Entity, edge, alias, evidence CRUD
│   │   │   ├── temporal/     # Validity windows, supersession, snapshots
│   │   │   ├── retrieval/    # Hybrid search (FTS + vector + graph traversal)
│   │   │   ├── ingest/       # Ingestion pipeline
│   │   │   │   ├── git.ts           # VCS layer (universal, no API needed)
│   │   │   │   ├── adapter.ts       # EnrichmentAdapter interface
│   │   │   │   ├── adapters/
│   │   │   │   │   └── github.ts    # GitHub PRs + Issues (v0.1)
│   │   │   │   ├── markdown.ts
│   │   │   │   └── text.ts
│   │   │   ├── ai/           # LLM integration (entity extraction, embeddings)
│   │   │   │   ├── provider.ts        # Abstract interface
│   │   │   │   ├── ollama.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   └── null.ts            # No-AI fallback
│   │   │   ├── evidence/     # Evidence chain tracking
│   │   │   ├── format/       # .engram file I/O, schema, migrations
│   │   │   └── index.ts      # Public API surface
│   │   ├── test/
│   │   └── package.json
│   ├── engram-cli/           # CLI application
│   │   ├── src/
│   │   │   └── commands/     # init, add, search, show, decay, ingest, serve, export
│   │   └── package.json
│   ├── engram-mcp/           # MCP server
│   │   ├── src/
│   │   │   ├── tools/        # MCP tool implementations
│   │   │   └── server.ts     # stdio transport
│   │   └── package.json
│   └── engramark/            # Benchmark suite
│       ├── src/
│       │   ├── datasets/     # Ground-truth Q&A for test repos
│       │   │   └── fastify/  # v0.1 benchmark target
│       │   ├── runners/      # Benchmark execution
│       │   └── report.ts     # Results formatting (retrieval + answer metrics)
│       └── package.json
├── docs/
│   ├── format-spec.md        # .engram format specification (standalone, versioned)
│   └── architecture.md       # Architecture decision records
├── package.json              # Workspace root
└── README.md
```

-----

## Open Questions for v0.1

1. **VCS-only graph quality:** When no LLM is available, entity extraction
   from git is limited to: file paths as entities, authors as entities, co-change
   as inferred edges, issue/ticket references parsed from commit messages via
   regex. **Needs validation against Fastify repo.** The question is NOT “are
   the dashboard outputs (bus factor, decay report) impressive on their own” —
   those are script-level outputs that `git-fame` can match. The question IS:
   “is the resulting graph rich and correct enough that an agent querying it
   via MCP produces grounded, compositional answers that Copilot/Cody can’t?”
   If yes, the structural foundation holds. If no, the product is just a
   prompt-stuffing pipeline with extra steps.
1. **sqlite-vec availability:** Is `sqlite-vec` reliably available across
   platforms (macOS, Linux, Windows) via npm? Fallback plan: brute-force cosine
   similarity scan with BLOB embeddings, which is fine for graphs under ~50k
   embeddings.
1. **Enrichment adapter auth patterns:** GitHub tokens are straightforward
   (PAT or GitHub App). The adapter interface needs to be generic enough
   that a Gerrit adapter authenticating via `.gitcookies` or a Buganizer
   adapter using corp SSO can fit the same `EnrichOpts` shape. The `token` +
   `endpoint` fields cover most cases — validate when building the first
   non-GitHub adapter.
1. **Episode content size limits:** Git commit messages are small, but PR
   descriptions and issue threads can be large. Define a max episode content
   size and a chunking strategy for oversized sources. Recommendation: 32KB
   per episode, with `parent_episode_id` for chunked sources (deferred to v0.2
   unless needed).
1. **Embedding recomputation on model change:** When the user switches embedding
   models, all existing embeddings are invalid. Strategy: clear and recompute
   (`engram rebuild-embeddings`), or keep old embeddings and mark with model name
   (already handled by `embeddings` table design). Recommendation: keep old,
   recompute lazily on next search.

-----

*Format version: 0.1.0-draft*
*Last updated: 2026-04-06*
