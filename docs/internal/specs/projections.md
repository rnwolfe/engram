# Projections — Design

**Phase**: 2
**Status**: Accepted (ADR-002)
**Proposed**: 2026-04-09
**Vision fit**: Reframes principle 5 ("structurally sound without AI, queryable with AI") by adding an AI-authored, evidence-backed, temporally-versioned synthesis layer on top of the deterministic substrate. Engram becomes the temporal version of Karpathy's LLM wiki — compounding *and* revisitable.
**Companion specs**: [`format-v0.2.md`](format-v0.2.md) — migration and DDL contract. [`../DECISIONS.md`](../DECISIONS.md#adr-002----ai-authored-projection-layer-with-temporal-versioning) — ADR-002.

> This is the **full design rationale**. The migration and DDL contract lives in
> [`format-v0.2.md`](format-v0.2.md); the architectural decision lives in ADR-002
> ([`../DECISIONS.md`](../DECISIONS.md)); the vision reframe is in [`../VISION.md`](../VISION.md).

## Strategic Rationale

The current vision treats AI as optional polish over a substrate that is "complete" without it. Karpathy's LLM-wiki pattern and graphify both contradict this premise: their value comes from the LLM acting as the *author* of a compounding knowledge artifact, not as a query interface over raw sources. Karpathy is explicit — "the wiki is a persistent, compounding artifact. The cross-references are already there. The contradictions have already been flagged."

Engram has two things neither of those systems has: a temporal model with validity windows, and an evidence-first invariant where every claim traces back to an immutable episode. If the LLM-authored synthesis layer is built *inside* that substrate — same evidence chain, same supersession rules, same temporal queries — then Engram is not competing with graphify on snapshot synthesis. It is the only system that can answer "what did we believe in March about the auth refactor, and when did that change?"

This spec adds the table and operations to make that real. It does not change the existing entity/edge/episode model.

## What It Does

After this ships, the lifecycle of a knowledge artifact looks like this:

```bash
# Ingest, same as today — produces episodes, entities, edges
engram ingest git --path .

# NEW: synthesize the AI-authored layer over the current substrate
engram project --kind entity_summary --anchor entity:auth-module
# → "Generated entity_summary for auth-module from 47 episodes via anthropic:claude-opus-4-6"

# Query the projection
engram show projection entity:auth-module --kind entity_summary
# → Markdown body, evidence list, valid_from=2026-04-09, valid_until=NULL

# NEW: the maintenance loop — reassesses existing projections AND discovers new ones
engram reconcile
# Phase 1: assess existing projections
# → Examined 12 active projections.
# → 9 unchanged (input fingerprint stable).
# → 2 refreshed (new evidence appeared, content still accurate).
# → 1 superseded: entity_summary for auth-module
#     Old projection: valid 2026-04-09 → 2026-04-12
#     New projection: valid 2026-04-12 → NULL
#     Reason: PR #318 reverted the password-reset flow refactor.
#
# Phase 2: discover new projections from the substrate delta
# → Considered 47 new episodes and 3 superseded edges since last reconcile.
# → Proposed 2 new projections:
#     - decision_page for "plugin schema migration" (anchors: 3 PRs, 12 commits)
#     - contradiction_report between entity_summary:auth-module and entity_summary:session-store
# → Authored 2 projections. Phase total: ~18K tokens.

# Temporal query — what did we believe at a point in time?
engram show projection entity:auth-module --kind entity_summary --as-of 2026-04-10
# → Returns the old projection that was active that day.
```

The same projections are exposed via MCP (`engram_get_projection`, `engram_reconcile`) so an agent loop can author, query, and supersede them programmatically.

## Concept

A **projection** is an AI-authored synthesis of substrate elements (episodes, entities, edges, or other projections). It has:

- A **kind** — what type of synthesis (`entity_summary`, `decision_page`, `contradiction_report`, `topic_cluster`, `ownership_report`, etc.). Open string set, defined by convention.
- A **primary anchor** — the main subject. Polymorphic: `(anchor_type, anchor_id)` where `anchor_type` is one of `entity`, `edge`, `episode`, `projection`, or `none` (for global reports).
- A **body** — the synthesized content, currently markdown.
- A **provenance record** — model, prompt template ID, prompt hash, generation timestamp. Same role as `extractor_version` on episodes.
- An **input set** — the substrate elements the LLM read to produce the projection. Stored in `projection_evidence`. Polymorphic, identical structure to a small evidence chain.
- An **input fingerprint** — a hash over the input set's identities and content hashes at generation time. Lets the lint pass detect "did anything I read change?" in O(1) per projection.
- A **temporal window** — `valid_from`, `valid_until`, `invalidated_at`, `superseded_by`. Identical semantics to edges. This is the unification.

Projections are **derived** in the same sense entities and edges already are: deterministic substrate is the source of truth, projections are re-derivable from it. The difference is that projections require an LLM (and a specific model + prompt) to derive, so they are stored, versioned, and can be replayed.

Two non-obvious consequences:

1. **A projection can have another projection as evidence.** A "monthly engineering health report" projection cites entity-summary projections as inputs. Recursion is allowed and useful — and the lint loop handles it naturally because supersession of a leaf projection cascades up via the same fingerprint mechanism.
2. **Manual assertions are projections of `model='human'`.** A human writing a decision page is the same operation as the LLM doing it, just with a different `model` field. No new mechanism needed. This mirrors how `edge_kind='asserted'` works today.

## Schema

Three new tables. No changes to existing tables.

```sql
CREATE TABLE projections (
  _rowid             INTEGER PRIMARY KEY,
  id                 TEXT NOT NULL UNIQUE,            -- ULID
  kind               TEXT NOT NULL,                   -- 'entity_summary' | 'decision_page' | ...
  anchor_type        TEXT NOT NULL,                   -- 'entity' | 'edge' | 'episode' | 'projection' | 'none'
  anchor_id          TEXT,                            -- NULL when anchor_type='none'
  title              TEXT NOT NULL,                   -- short label, used in listings and FTS
  body               TEXT NOT NULL,                   -- markdown with mandatory YAML frontmatter
  body_format        TEXT NOT NULL DEFAULT 'markdown',-- forward-compat: 'markdown' | 'json' | ...
  model              TEXT NOT NULL,                   -- 'anthropic:claude-opus-4-6' | 'human' | 'ollama:llama3.1' | ...
  prompt_template_id TEXT,                            -- name of the prompt used; NULL for human
  prompt_hash        TEXT,                            -- hash of resolved prompt at generation time
  input_fingerprint  TEXT NOT NULL,                   -- sha256(sorted input target_type:target_id:content_hash)
  confidence         REAL NOT NULL DEFAULT 1.0,
  valid_from         TEXT NOT NULL,                   -- generation time, or human-asserted time
  valid_until        TEXT,
  last_assessed_at   TEXT,                            -- last time reconcile ran an LLM assessment; lets soft-refresh track assessment freshness without moving valid_from
  invalidated_at     TEXT,                            -- transactional time the system learned this was stale
  superseded_by      TEXT REFERENCES projections(id),
  created_at         TEXT NOT NULL,
  owner_id           TEXT
);

CREATE INDEX idx_projections_anchor    ON projections(anchor_type, anchor_id);
CREATE INDEX idx_projections_kind      ON projections(kind);
CREATE INDEX idx_projections_valid     ON projections(valid_from, valid_until);
CREATE INDEX idx_projections_active    ON projections(invalidated_at) WHERE invalidated_at IS NULL;

-- At most one *active* projection per (anchor, kind). Multiple kinds per anchor allowed.
CREATE UNIQUE INDEX idx_projections_active_unique
  ON projections(anchor_type, anchor_id, kind)
  WHERE invalidated_at IS NULL;

CREATE TABLE projection_evidence (
  projection_id TEXT NOT NULL REFERENCES projections(id),
  target_type   TEXT NOT NULL,                        -- 'episode' | 'entity' | 'edge' | 'projection'
  target_id     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'input',        -- 'input' | 'anchor'  (allows multi-anchor projections)
  content_hash  TEXT,                                 -- snapshot of target's content hash at read time, NULL if non-content target
  PRIMARY KEY (projection_id, target_type, target_id, role)
);

CREATE INDEX idx_projection_evidence_target ON projection_evidence(target_type, target_id);

CREATE TABLE reconciliation_runs (
  id                    TEXT PRIMARY KEY,             -- ULID
  started_at            TEXT NOT NULL,
  completed_at          TEXT,
  scope                 TEXT,                         -- optional filter (e.g. 'kind:entity_summary')
  phases                TEXT NOT NULL DEFAULT 'assess,discover',  -- comma-separated: 'assess' | 'discover' | 'assess,discover'
  projections_checked   INTEGER DEFAULT 0,            -- assess phase: how many existing projections were examined
  projections_refreshed INTEGER DEFAULT 0,            -- assess phase: input changed, content held
  projections_superseded INTEGER DEFAULT 0,           -- assess phase: LLM authored a new version
  projections_discovered INTEGER DEFAULT 0,           -- discover phase: new projections authored
  dry_run               INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'running',
  error                 TEXT
);
```

FTS over projection bodies:

```sql
CREATE VIRTUAL TABLE projections_fts USING fts5(
  title, body,
  content=projections, content_rowid=_rowid
);
-- Triggers analogous to entities_fts / edges_fts.
```

Embeddings over projections require **no schema change** — the existing `embeddings` table is already polymorphic on `(target_type, target_id)`. New code just writes rows with `target_type='projection'`.

### Body format: markdown with frontmatter

`body_format='markdown'` but with a mandatory YAML frontmatter block at the top of the body. The frontmatter is partially redundant with the row's columns — that redundancy is the point.

```markdown
---
id: 01JRAAXEXQ8K6TNT8XV4PJDC8W
kind: entity_summary
anchor: entity:01HZQK5QY8N4Y2V0W3X5YRE7P3
title: "auth-module"
model: anthropic:claude-opus-4-6
prompt_template_id: entity_summary.v1
prompt_hash: 7a3f...c9e1
input_fingerprint: e2b4...8a17
valid_from: 2026-04-09T14:22:11Z
valid_until: null
inputs:
  - episode:01JR...
  - entity:01HZ...
  - edge:01JA...
---

# auth-module

The auth module handles session creation, token refresh, and password reset...
```

Two consequences worth the convention:

1. **`engram export wiki` is a file copy.** Each projection becomes a standalone `.md` file with self-describing metadata. Jekyll, Hugo, and Obsidian all read YAML frontmatter natively — no transform step needed. The exported folder is a fully-functional static wiki.
2. **Projection bodies round-trip through git.** A user can export the wiki to a folder, commit it alongside the repo, diff changes across reconcile runs, and reimport via `engram import wiki` (future). Frontmatter is what makes that reimport unambiguous.

Generators MUST emit the frontmatter; `project()` validates and normalizes it at write time. Hand-authored (`model='human'`) projections go through the same validator — the frontmatter is the only interface.

### Staleness is always correct

The cost of `reconcile` (see resolved decisions below) means some users will defer it for budget reasons. The system MUST NOT pretend a projection is fresh just because reconcile hasn't run yet. Two-tier check:

- **Cheap (read-time, always on).** Every read of a projection recomputes `current_input_fingerprint` over the projection's recorded `projection_evidence` rows (using each target's *current* content hash) and compares it to the stored `input_fingerprint`. This is O(inputs) with indexed lookups — microseconds. If they differ, the read result carries `stale: true` and a `stale_reason` (`input_content_changed` | `input_deleted`). MCP and CLI surface this visibly; agents see it in tool results.
- **Expensive (reconcile, opt-in cadence).** The full LLM assessment that decides refresh-vs-supersede. Transitions a projection from "known stale" to "resolved." Only the discover phase can detect "new substrate rows that should have been inputs but weren't" — that is a coverage question, not a staleness question, and belongs to reconcile.

Read-time helper:

```ts
getProjection(db, id): {
  projection: Projection;
  stale: boolean;
  stale_reason?: 'input_content_changed' | 'input_deleted';
  last_assessed_at: string | null;
}
```

**Why `inputs_added` is not a read-time reason.** The read path only sees the projection's recorded evidence rows, so it can detect when those inputs change or disappear but cannot discover newly relevant substrate rows that were never in the evidence set. That kind of "coverage drift" is exactly what the reconcile discover phase is for. Conflating the two would either require read-time queries over the whole substrate (violating the O(inputs) invariant) or promise something the fingerprint mechanism cannot deliver.

Ranking/filtering stale projections in hybrid search is policy (tune per use case), but **the flag is an invariant** — no read path returns a projection without computing it. This converts cost deferral from a correctness problem into a UX problem: "you have 7 stale projections, run `engram reconcile` to resolve."

### Why polymorphic evidence instead of three FK columns

Considered: separate `projection_episode_evidence`, `projection_entity_evidence`, `projection_edge_evidence` tables, mirroring how `entity_evidence` and `edge_evidence` are split today. Rejected: the existing split exists because there are only two parent types and the FK constraints add real safety. For projections, evidence can target four kinds (including projections themselves), and a projection's value comes from cross-kind synthesis. Polymorphic with `(target_type, target_id)` matches the embeddings table's existing precedent and keeps the operations simple. We lose FK enforcement on the target; we gain by having one evidence chain per projection instead of three to JOIN.

## Operations

Three new operations on `engram-core`. CLI and MCP wrap them.

### 1. `project()` — author a new projection

```ts
project(opts: {
  kind: string;
  anchor: { type: AnchorType; id?: string };
  inputs: { type: 'episode'|'entity'|'edge'|'projection'; id: string }[];
  generator: ProjectionGenerator;  // wraps an AI provider + prompt template
}): Promise<Projection>
```

Steps:
1. Resolve and read the input set from the substrate.
2. Compute `input_fingerprint = sha256(sorted("type:id:content_hash"))`.
3. Check whether an active projection already exists for `(anchor, kind)`. If yes and its `input_fingerprint` matches → return existing (idempotent no-op).
4. Otherwise call `generator.generate(inputs)` → markdown body.
5. Insert `projections` row + `projection_evidence` rows in a single transaction.
6. If an existing active projection was present with a different fingerprint → supersede it (see operation 3).

### 2. `reconcile()` — the primary authoring and maintenance loop

Reconcile is the main authoring path. It runs two phases: **assess** (re-evaluate existing projections against the current substrate) and **discover** (propose new projections from the substrate delta since last reconcile). The discover phase is what makes authoring emergent — the LLM decides coverage rather than a heuristic threshold.

Both phases are LLM-calling and both respect a shared budget. Either phase can be skipped with `--phases assess` or `--phases discover`.

```ts
async function reconcile(db, opts: {
  scope?: string;
  phases?: ('assess' | 'discover')[];   // default: ['assess', 'discover']
  maxCost?: number;                     // token budget across both phases
  dryRun?: boolean;                     // print proposals, don't author
}) {
  const run = startReconciliationRun(db, opts);
  const budget = new Budget(opts.maxCost);

  // Phase 1: assess existing active projections
  if (opts.phases?.includes('assess') ?? true) {
    for (const p of listActiveProjections(db, opts.scope)) {
      const currentFingerprint = computeFingerprint(db, p.id);
      if (currentFingerprint === p.input_fingerprint) continue;

      const decision = await p.generator.assess(p, currentInputState(db, p.id), budget);
      const assessedAt = nowIso();

      switch (decision.verdict) {
        case 'still_accurate':
          softRefresh(db, p.id, currentFingerprint, assessedAt);
          run.refreshed++;
          break;
        case 'needs_update':
        case 'contradicted':
          const newProjection = await p.generator.regenerate(p, currentInputState(db, p.id), budget);
          newProjection.last_assessed_at = assessedAt;
          if (!opts.dryRun) supersede(db, p, newProjection);
          run.superseded++;
          break;
      }
      if (budget.exhausted()) break;
    }
  }

  // Phase 2: discover new projections from the substrate delta
  if ((opts.phases?.includes('discover') ?? true) && !budget.exhausted()) {
    const delta          = substrateDeltaSince(db, lastReconcileTime(db, opts.scope));
    const coverage       = activeProjectionCatalog(db, opts.scope); // titles, kinds, anchors — not bodies
    const kindCatalog    = loadKindCatalog();                       // ships with engram-core + XDG overrides

    const proposals = await discoverer.propose({
      delta, coverage, kindCatalog, budget,
    });

    for (const proposal of proposals) {
      if (opts.dryRun) {
        run.discovered++;  // counted but not authored
        continue;
      }
      await project(db, {
        kind:    proposal.kind,
        anchor:  proposal.anchor,
        inputs:  proposal.inputs,
        generator: generatorFor(proposal.kind),
      });
      run.discovered++;
      if (budget.exhausted()) break;
    }
  }

  finishReconciliationRun(db, run);
}
```

Callable from CLI (`engram reconcile`), MCP (`engram_reconcile`), and as a post-ingest hook (`engram ingest --reconcile`).

**The discover phase in detail.** `discoverer.propose()` is a single structured LLM call whose inputs are:

1. **Substrate delta** — episodes/entities/edges added or superseded since the last reconcile, with short summaries (not full content) to keep the context small. Cursor tracked per scope in `reconciliation_runs`.
2. **Coverage catalog** — a compact listing of every active projection: `{kind, anchor_type, anchor_id, title, last_assessed_at, stale}`. No bodies, just the map of what exists.
3. **Kind catalog** — the registry of available projection kinds, each with a name, description, and "when to use" guidance. Ships with engram-core; users override via XDG.
4. **Budget hint** — remaining tokens, so the LLM can propose fewer/smaller projections if the budget is tight.

It returns a structured list of `{kind, anchor, inputs, rationale}` proposals. The authoring loop then calls `project()` for each, which runs the full generate/validate/insert pipeline — no special-case path. `--dry-run` stops before the `project()` call and prints the proposals for human review.

**Bootstrap.** On a fresh `.engram` after `engram ingest`, assess has nothing to check and discover sees the entire substrate as the delta. The first reconcile is the initial authoring pass. This is the Karpathy-wiki primitive: ingest fills `/raw`, reconcile populates the wiki.

### 3. `supersede()` — atomic transition

Identical pattern to edge supersession. In one transaction:

```sql
UPDATE projections
   SET invalidated_at = :now,
       valid_until    = :now,
       superseded_by  = :new_id
 WHERE id = :old_id;

INSERT INTO projections (..., valid_from, ...) VALUES (..., :now, ...);
INSERT INTO projection_evidence ...;
```

The supersession chain is queryable: `SELECT * FROM projections WHERE id IN (recursive walk via superseded_by)` gives the full history of what we believed about a subject and when each belief was overwritten.

### Query patterns

```sql
-- Current entity summary for a module
SELECT * FROM projections
 WHERE anchor_type = 'entity' AND anchor_id = :id
   AND kind = 'entity_summary'
   AND invalidated_at IS NULL;

-- "What did we believe on 2026-03-15?"
SELECT * FROM projections
 WHERE anchor_type = 'entity' AND anchor_id = :id
   AND kind = 'entity_summary'
   AND valid_from <= '2026-03-15T00:00:00Z'
   AND (valid_until IS NULL OR valid_until > '2026-03-15T00:00:00Z');

-- Belief history for a subject (most recent first)
SELECT * FROM projections
 WHERE anchor_type = 'entity' AND anchor_id = :id
   AND kind = 'entity_summary'
 ORDER BY valid_from DESC;

-- Find projections affected by a specific episode update
SELECT DISTINCT p.* FROM projections p
  JOIN projection_evidence pe ON pe.projection_id = p.id
 WHERE pe.target_type = 'episode' AND pe.target_id = :episode_id
   AND p.invalidated_at IS NULL;
```

## Interaction with existing systems

- **Episode redaction**: when an episode is redacted (`status='redacted'`), all projections with that episode in `projection_evidence` are flagged for reconciliation on next run. This is the GDPR / data-deletion path. The projection body is not auto-deleted — `reconcile` re-runs the generator without the redacted input and supersedes naturally, leaving an auditable trail.
- **Edge supersession**: projections cite edges by ID. When an edge is superseded, projections that cited it have a stale fingerprint on next reconcile and re-evaluate.
- **Entity merges**: out of scope for v0.1, but: when an entity is merged into another, projections anchored to the old ID need re-anchoring. Punt to v0.2 with the rest of entity merge.
- **Embeddings**: projection bodies embed via the existing `embeddings` table with `target_type='projection'`. Hybrid search (FTS + vector + graph) returns projections in results alongside entities and edges.
- **Verify**: `verifyGraph()` adds three invariants — (1) every projection has at least one input in `projection_evidence`, (2) `superseded_by` chains terminate (no cycles), and (3) the projection-dependency graph induced by `projection_evidence` rows where `target_type='projection'` is a DAG. The DAG check runs on insert (cheap rejection at `project()` time via a recursive CTE from the candidate input set) and also as a background invariant in `verify`.
- **Backlinks are free.** A projection citing another projection *is* the link; the reverse lookup ("what cites this?") is a single index seek on `projection_evidence(target_type='projection', target_id=X)`. No separate `projection_edges` or backlink table — the evidence chain doubles as the wiki link graph, which matches how Obsidian/Roam think about it.

## Resolved Decisions

These were the open questions in the first draft. All resolved; recording both the decision and the context here so the ADR can inherit them directly.

### 1. Body format — markdown with YAML frontmatter

`body_format='markdown'` with a **mandatory** frontmatter block carrying kind, anchor, model, prompt_template_id, prompt_hash, input_fingerprint, valid_from/until, and the input list. See [Body format](#body-format-markdown-with-frontmatter) above for the shape. Frontmatter is validated and normalized by `project()` at write time. No JSON sidecar in v1 — if a future kind needs structured extraction, it can define its own frontmatter keys.

### 2. Soft refresh vs always-supersede — keep soft refresh

The `still_accurate` branch in `reconcile()` updates `input_fingerprint` and `last_assessed_at` without supersession, preserving `valid_from`. The new `last_assessed_at` column captures the assessment freshness separately from the temporal window. Always-supersede was rejected because it would generate churn in the supersession history for projections that were never actually wrong, and the belief-history query (which is the primary consumer of supersession chains) would become noisy.

### 3. Generator nondeterminism — assessment is the authority

Byte-equality of bodies is not a supersession signal. If `generator.assess()` returns `still_accurate`, the projection is refreshed in place even if a hypothetical re-run of `generate()` would produce a byte-different body. This makes reconcile cost-bounded (one LLM call per changed-fingerprint projection) and means reproducibility is scoped to `(model, prompt_hash, input_fingerprint)` — not to "rerun and get the same bytes."

### 4. Projection-of-projection cycles — enforced DAG

The projection-dependency graph is a DAG. Cycle detection runs on insert via a recursive CTE over the candidate input set (rejected with a typed `ProjectionCycleError`) and as a full-graph check in `verifyGraph()`. Backlinks come for free: the evidence chain *is* the link graph, queryable via `projection_evidence(target_type='projection', target_id=X)`. No separate backlink table. This matches how Obsidian/Roam model wikilinks and keeps a single source of truth for "what cites what."

### 5. Cost / cadence — configurable, with an always-correct staleness floor

`reconcile` is manual by default, with opt-in triggers:

- `engram reconcile` (explicit)
- `engram reconcile --dry-run` (print discoveries and proposed supersessions without authoring — the human-in-the-loop path)
- `engram reconcile --phases assess` or `--phases discover` (run only one phase)
- `engram ingest --reconcile` (post-ingest hook)
- `ENGRAM_RECONCILE_ON_INGEST=true` (env/config default)
- `--max-cost <tokens>` and `--scope <filter>` flags for budget control

Reconcile is now a **two-phase LLM operation** (assess + discover, see Q8), so the cost ceiling matters more than in the original sketch. The shared `--max-cost` budget is checked between operations and short-circuits cleanly if exceeded — partial progress is recorded in `reconciliation_runs` and the next run resumes from the cursor. The `dry_run` column on `reconciliation_runs` lets you re-query "what would have been authored" without committing.

The non-negotiable: **staleness is always correct at read time**, regardless of cadence. The cheap read-time fingerprint check (see [Staleness is always correct](#staleness-is-always-correct) above) runs on every projection read and surfaces `stale: true` + reason. Deferring reconcile is a cost/UX tradeoff, never a correctness tradeoff. Users who skip reconcile for a week see stale flags accumulate; users who reconcile on every ingest see them resolve quickly. Either way, no read ever returns "fresh" when the underlying inputs have drifted. (Discover does not have a symmetric "you have undiscovered projections" indicator — the substrate delta cursor is the closest analog. We could surface "n new episodes since last discover" in `engram status`; out of scope for this spec.)

### 6. Wiki export — yes, via frontmatter round-trip

`engram export wiki --out ./wiki` materializes each active projection to a standalone `.md` file with frontmatter. Directory layout is `./wiki/<kind>/<anchor_slug>.md`. The frontmatter makes the output directly consumable by Jekyll, Hugo, Obsidian, and git-tracked snapshots — no transform step. Future `engram import wiki` reverses the operation for human-edited content (covered by `model='human'` + frontmatter validation).

### 7. Prompt template storage — codebase with XDG override path

Default templates ship with `engram-core` in `packages/engram-core/src/ai/prompts/` and are versioned with the package. User overrides are loaded from `$XDG_CONFIG_HOME/engram/prompts/` (fallback `~/.config/engram/prompts/`) at library init. Override resolution is by `prompt_template_id` match; the user copy wins when present. The `prompt_hash` stored on each projection references the **resolved** template at generation time, so reproducibility survives override changes — if a user swaps an override, old projections still know the exact prompt text they were generated from, and a subsequent reconcile will detect the mismatch as a `prompt_hash` change and re-evaluate those projections. `prompt_templates` as an in-database table is deferred; the XDG path handles user-defined templates without coupling them to a `.engram` file's portability.

### 8. Authoring scope — emergent first, with explicit as the deterministic escape hatch

Brief comparison of the prior art first:

- **Karpathy's LLM wiki — emergent authoring.** Humans drop sources into `/raw`. The LLM reads each new source and decides which existing wiki pages to update and which new pages to create. From the gist: *"the LLM doesn't merely index them — it integrates findings across 10–15 existing wiki pages."* The scope of which pages get touched is a per-ingest LLM judgment call.
- **graphify — blanket authoring.** A single `graphify .` run is a full rebuild. Every discovered "god node" gets a summary in `GRAPH_REPORT.md`. No partial or incremental scope — an all-or-nothing snapshot build, not a maintenance model. Easy to reason about; wasteful for large repos and stale the moment the build finishes.

Engram is **emergent-first**, layered against an explicit primitive:

1. **Emergent (v0.2, primary).** The discover phase of `reconcile()` is the default authoring path. The LLM is given the substrate delta since last reconcile, the catalog of existing active projections (titles + kinds + anchors, no bodies), the kind catalog, and a budget. It returns proposals; each proposal becomes a `project()` call. This matches Karpathy's mental model — the LLM is the author, deciding what should exist based on what's there. `engram reconcile` is therefore the primary authoring command, not a maintenance afterthought.
2. **Explicit (v0.2, primitive).** `engram project --kind X --anchor Y` and the MCP equivalent. Used for: scripted/tested scenarios, reproducible benchmark runs, and the human escape hatch when the discover phase missed something or got something wrong. `project()` is also what the discover phase calls under the hood — there is exactly one authoring code path, with two callers.
3. **Heuristic policies (deferred).** The "author for any entity with ≥N evidence episodes" approach is an *optimization* of what the LLM does in the discover phase. Optimizations come after the naive path is shaped right. If discover proves too expensive at scale, we add policies as a cheap pre-filter — the LLM only sees candidates that pass the heuristic. But we do not start there, because the policy schema would otherwise calcify around assumptions the LLM doesn't share.

**Why emergent first.** The earlier draft put emergent in v0.3+ behind concerns about cost, control, and schema-awareness. Working through the operations:

- *Cost* is handled by the shared `--max-cost` budget, the cursor-resumable `reconciliation_runs` table, and `--dry-run` for human review. None of these are unique to emergent; they apply equally to assess.
- *Control* is handled by the explicit `project()` primitive (deterministic when you need it) and `--dry-run` (preview before commit). The LLM is not given write access in any sense — it returns proposals, and the same idempotent `project()` validates and commits them.
- *Schema-awareness* is a one-shot prompt-engineering exercise: ship a kind catalog with name, description, when-to-use guidance. The LLM doesn't need to invent kinds, it picks from a list.

What you lose by starting with explicit/heuristic: you build the wrong shape. Heuristic policies are a map of *which entities deserve summaries* — but the more interesting projections (`decision_page`, `contradiction_report`, `topic_cluster`) don't anchor to single entities and don't fit the threshold model at all. Those kinds only get authored by something that can read the substrate and notice patterns. Starting with emergent forces the design to handle them from day one.

What you lose by starting with emergent: you spend tokens on a bootstrap pass that a human could have scripted. Acceptable, especially with `--dry-run` and `--max-cost` as guardrails.

**Bootstrap behavior.** On a fresh `.engram` after `engram ingest`, `engram reconcile` sees the entire substrate as the discover delta and authors the initial projection set. This is the Karpathy primitive: ingest fills `/raw`, reconcile populates the wiki. No explicit author commands required for the common path.

A `projection_policies` table in `.engram` is deferred indefinitely. If the LLM is the authoring decider, per-file policy data has no consumer.

## Out of Scope (for this sketch)

- The actual prompt templates for each `kind` and the discover-phase system prompt. Both are follow-on specs.
- The initial **kind catalog** content (which kinds ship in v0.2 and their when-to-use guidance). The mechanism is specified here; the catalog is a follow-on spec — at minimum it needs `entity_summary`, `decision_page`, `contradiction_report`, and `topic_cluster` to be useful.
- A UI for browsing projections. CLI `show` and MCP tool are enough for v1.
- Tribal merge of projections across multiple `.engram` files. Same rule as the rest: out of scope until v0.2.
- Per-token cost reporting on `reconciliation_runs`. The `--max-cost` budget is enforced; line-item accounting is a follow-on.
- An "undiscovered projections waiting" indicator in `engram status`. Mentioned in Q5 as the asymmetric counterpart to the read-time stale flag; deferred.
- Cross-projection contradiction detection. The schema *enables* it (a `contradiction_report` projection cites other projections as inputs and the LLM identifies disagreements), but the actual generator and prompt are a follow-on spec.

## What this sketch buys us

If this lands, three things become true that aren't true today:

1. **Engram has a compounding artifact.** Not just a graph to query — a body of synthesized writing that grows and improves between queries, exactly like Karpathy's wiki but with provenance.
2. **The temporal model becomes load-bearing.** Today validity windows are mostly used for edges, which is useful but niche. Once projections inherit the same model, "what did we believe at time T" becomes a first-class capability — and it's the one capability nobody else in this space has.
3. **EngRAMark gets a benchmark category nobody can compete on.** Stale-knowledge detection: author projections at commit X, advance the substrate to commit Y, measure how well `reconcile` identifies what changed. Static-snapshot tools structurally cannot attempt this. That's a moat with a number attached.

The cost is one more table family, one more operation (`reconcile`), and a reframing of principle 5 in the vision doc. Schema-wise, it composes cleanly with what already exists — no migration of existing tables, no rewrite of the evidence model.
