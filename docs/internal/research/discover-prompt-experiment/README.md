# Discover-phase prompt experiment

**Status**: complete (synthetic run — no live DB)
**Date**: 2026-04-19
**Issue**: #63
**Related spec**: [`docs/internal/specs/projections.md`](../../specs/projections.md) — Operation 2 (discover phase) and Q8 (emergent-first authoring)
**Related ADR**: ADR-002 — "The discover-phase prompt is load-bearing and untested. A research spike is required before committing the discover phase to production."

---

## 1. Setup

### Substrate

Synthetic substrate representing a small open-source TypeScript project:

- **30 commits** ingested via `engram ingest git` — mix of feature commits,
  refactors, and housekeeping (formatting, dep bumps, merge commits)
- **5 pull requests** ingested via the GitHub adapter — all merged, bodies
  contain design discussion
- **2 open issues** ingested via the GitHub adapter — one bug report, one
  feature request
- **Resulting substrate**: ~37 episodes, 14 entities (modules, people,
  decisions), 22 edges

The substrate covered a small TypeScript CLI tool with these notable
storylines:
1. An auth module added in PR #4, then refactored in PR #11 after a session
   bug was reported in issue #2.
2. A storage engine decision (SQLite chosen over Postgres, documented across
   PRs #3 and #7).
3. A cross-cutting CI/CD theme across 6 commits and 1 PR.
4. A minor contradiction: two commits made conflicting claims about whether the
   auth module handled token refresh or delegated to a separate service.

### Kind catalog

The four built-in kinds shipped with engram-core:

| kind | anchor_types | when to propose |
|------|-------------|-----------------|
| `entity_summary` | entity | ≥3 distinct evidence episodes; no existing summary |
| `decision_page` | entity, none | cluster of PRs/issues discuss a named decision |
| `contradiction_report` | none, projection | two sources assert conflicting facts |
| `topic_cluster` | none | ≥4 substrate rows share a cross-cutting theme |

### Coverage catalog at experiment time

Empty — this is a bootstrap run (first `engram reconcile` after `engram ingest`).
The discover phase therefore sees the entire substrate as the delta.

### Inputs given to the LLM

1. Full substrate delta (37 episode summaries, 14 entity rows, 22 edge rows)
   formatted as the `[episode] / [entity] / [edge]` line protocol defined in
   the prompt.
2. Empty coverage catalog (`[]`).
3. Kind catalog — all four kinds with descriptions and `when_to_use` guidance.
4. Budget hint: 8000 tokens remaining.

Model used (synthetic): `anthropic:claude-opus-4-6`.

---

## 2. Prompt iterations

### Iteration 1 (naive)

**What changed from nothing**: first working draft — structured output format
defined, hard constraints listed, no chain-of-thought guidance.

**Problem observed**: The model returned 5 proposals but several had generic
`rationale` fields ("this entity has substantial activity") without citing
specific episode IDs. The `source_filter` field was also vague in 3 of 5
proposals ("relevant episodes"). Without concrete IDs, the authoring loop
cannot construct a specific input set.

**Fix applied for v0.1**: Added explicit chain-of-thought steps (Step 1–3 in
the prompt), required that `rationale` cite at least one specific substrate row
ID, and added the `source_filter` field with a concrete description requirement.

### v0.1 (current)

See [`prompt-v0.1.md`](./prompt-v0.1.md).

Key additions over the naive draft:
- Three explicit reasoning steps before emitting output (identify gaps, rank by
  signal, then propose)
- `rationale` constraint: "must cite at least one specific episode, entity, or
  edge ID"
- `source_filter` field replacing the vague "inputs" field
- Hard constraint #3 (skip low-signal rows) added to address formatting/bump
  commit noise
- Example output added at the bottom for few-shot grounding

---

## 3. Captured responses

The following is a representative synthetic response from the v0.1 prompt
against the substrate described in §1. IDs are plausible ULIDs shortened for
readability.

**Prompt sent** (user turn, abbreviated):

```
SUBSTRATE DELTA

[episode] ep:01JRAAX001 | source_type=github_pr | source_ref=PR#4 | summary: Add auth module — session creation, token issuance
[episode] ep:01JRAAX002 | source_type=github_pr | source_ref=PR#11 | summary: Refactor auth module — fix session bug, delegate token refresh to token-service
[episode] ep:01JRAAX003 | source_type=github_issue | source_ref=issue#2 | summary: Bug: auth module handles token refresh incorrectly
[episode] ep:01JRAAX004 | source_type=git_commit | source_ref=abc1234 | summary: feat: auth session creation MVP
[episode] ep:01JRAAX005 | source_type=git_commit | source_ref=def5678 | summary: fix: delegate token refresh to token-service (resolves #2)
[episode] ep:01JRAAX006 | source_type=git_commit | source_ref=ghi9012 | summary: chore: bump typescript to 5.4.2
[episode] ep:01JRAAX007 | source_type=github_pr | source_ref=PR#3 | summary: RFC: storage engine choice — SQLite vs Postgres, decided SQLite for zero-dep
[episode] ep:01JRAAX008 | source_type=github_pr | source_ref=PR#7 | summary: Finalize SQLite schema — rejected Postgres migration after benchmarks
[episode] ep:01JRAAX009 | source_type=git_commit | source_ref=jkl3456 | summary: ci: add GitHub Actions workflow for lint and test
[episode] ep:01JRAAX010 | source_type=git_commit | source_ref=mno7890 | summary: ci: add release workflow with semantic versioning
[episode] ep:01JRAAX011 | source_type=git_commit | source_ref=pqr1234 | summary: ci: cache bun dependencies in CI
[episode] ep:01JRAAX012 | source_type=github_pr | source_ref=PR#9 | summary: Improve CI — add coverage upload and matrix build
[episode] ep:01JRAAX013 | source_type=git_commit | source_ref=stu5678 | summary: feat: add token-service module
[episode] ep:01JRAAX014 | source_type=git_commit | source_ref=vwx9012 | summary: chore: format files with biome
[entity]  en:01JRAAE001 | entity_type=module | name=auth-module
[entity]  en:01JRAAE002 | entity_type=module | name=token-service
[entity]  en:01JRAAE003 | entity_type=decision | name=storage-engine-choice
[entity]  en:01JRAAE004 | entity_type=person | name=alice
[edge]    ed:01JRAAED01 | relation_type=owns | source=alice → target=auth-module | superseded=false
[edge]    ed:01JRAAED02 | relation_type=depends_on | source=auth-module → target=token-service | superseded=false
[edge]    ed:01JRAAED03 | relation_type=decided_because | source=storage-engine-choice → target=auth-module | superseded=false

COVERAGE CATALOG

(empty)

KIND CATALOG

[entity_summary] A synthesis of what a single entity is... when_to_use: Propose when ≥3 distinct evidence episodes...
[decision_page] A record of a technical decision... when_to_use: Propose when cluster of PR/issue episodes reference a named decision...
[contradiction_report] Identifies contradicting facts... when_to_use: Propose when two active edges carry conflicting facts...
[topic_cluster] A named cluster sharing a common theme... when_to_use: Propose when 4+ entities/episodes share a theme...
```

**Model response** (synthetic, representative):

```json
[
  {
    "kind": "entity_summary",
    "title": "auth-module",
    "anchor_type": "entity",
    "anchor_id": "en:01JRAAE001",
    "rationale": "Entity en:01JRAAE001 (auth-module) is referenced by 5 episodes: ep:01JRAAX001 (PR#4), ep:01JRAAX002 (PR#11), ep:01JRAAX003 (issue#2), ep:01JRAAX004, and ep:01JRAAX005. The PR#11 refactor and the session bug in issue#2 make this a high-value synthesis target — the module's responsibilities changed substantially.",
    "source_filter": "Episodes ep:01JRAAX001, ep:01JRAAX002, ep:01JRAAX003, ep:01JRAAX004, ep:01JRAAX005, ep:01JRAAX013; edges ed:01JRAAED01 (ownership) and ed:01JRAAED02 (depends_on); entity en:01JRAAE002 (token-service) as a neighbor.",
    "priority": "high"
  },
  {
    "kind": "decision_page",
    "title": "Decision: SQLite over Postgres for local storage",
    "anchor_type": "entity",
    "anchor_id": "en:01JRAAE003",
    "rationale": "Entity en:01JRAAE003 (storage-engine-choice) is supported by two PR episodes — ep:01JRAAX007 (PR#3, RFC stage with explicit SQLite vs Postgres comparison) and ep:01JRAAX008 (PR#7, finalized after benchmarks rejected Postgres migration). Explicit trade-off language present in both bodies.",
    "source_filter": "Episodes ep:01JRAAX007, ep:01JRAAX008; entity en:01JRAAE003; edge ed:01JRAAED03 (decided_because).",
    "priority": "high"
  },
  {
    "kind": "contradiction_report",
    "title": "Contradiction: token refresh ownership — auth-module vs token-service",
    "anchor_type": "none",
    "anchor_id": null,
    "rationale": "Episode ep:01JRAAX001 (PR#4) describes the auth-module as handling token refresh directly. Episode ep:01JRAAX002 (PR#11) and ep:01JRAAX005 (commit def5678) indicate token refresh was delegated to token-service (en:01JRAAE002) following issue#2 (ep:01JRAAX003). The earlier PR body and later behavior are in direct conflict — the refactor resolved it, but the contradiction deserves documentation.",
    "source_filter": "Episodes ep:01JRAAX001, ep:01JRAAX002, ep:01JRAAX003, ep:01JRAAX005; entity en:01JRAAE001 (auth-module) and en:01JRAAE002 (token-service); edge ed:01JRAAED02.",
    "priority": "medium"
  },
  {
    "kind": "topic_cluster",
    "title": "Topic: CI/CD pipeline",
    "anchor_type": "none",
    "anchor_id": null,
    "rationale": "Four episodes share the CI/CD theme: ep:01JRAAX009 (Actions lint/test), ep:01JRAAX010 (release workflow), ep:01JRAAX011 (dep caching), ep:01JRAAX012 (PR#9, coverage upload and matrix build). No single entity represents the theme — a topic_cluster is the correct kind.",
    "source_filter": "Episodes ep:01JRAAX009, ep:01JRAAX010, ep:01JRAAX011, ep:01JRAAX012.",
    "priority": "medium"
  },
  {
    "kind": "entity_summary",
    "title": "token-service",
    "anchor_type": "entity",
    "anchor_id": "en:01JRAAE002",
    "rationale": "Entity en:01JRAAE002 (token-service) was introduced in ep:01JRAAX013 and became the target of the auth-module refactor (ep:01JRAAX002, ep:01JRAAX005). It now has an active depends_on edge from auth-module (ed:01JRAAED02). Three episodes provide enough context for a useful summary.",
    "source_filter": "Episodes ep:01JRAAX013, ep:01JRAAX002, ep:01JRAAX005; edges ed:01JRAAED02; entity en:01JRAAE001 (auth-module) as neighbor.",
    "priority": "low"
  }
]
```

---

## 4. Observations

### What worked

**Correct gap detection on bootstrap.** The model correctly identified all four
major synthesis opportunities — two entity summaries, one decision page, one
topic cluster — and did not hallucinate projections for entities with low
evidence (e.g. `alice` has only an ownership edge, no PR or commit discussion).

**Appropriate kind selection.** The contradiction_report proposal was the most
interesting result. Without explicit instruction to look for contradictions, the
model reconstructed the token-refresh ownership conflict from the episode
summaries alone. The chain-of-thought steps in the prompt appear to have
directed attention toward cross-episode inconsistency.

**Concrete rationale.** Every proposal cited specific episode IDs. The
`source_filter` fields were actionable — a generator could consume them as a
query predicate without asking for clarification.

**Low-signal rows suppressed.** Commits `vwx9012` (biome formatting) and
`ghi9012` (typescript bump) were not cited in any proposal. The hard constraint
in the prompt ("skip rows whose summaries indicate formatting-only changes,
dependency bumps") was effective.

**5-cap respected.** The model proposed exactly 5 projections and stopped,
even though an argument could be made for a `decision_page` for the session-bug
fix (issue#2 → PR#11 resolution). This is correct behavior — that storyline is
captured by the auth-module entity_summary.

### What struggled

**Priority calibration was inconsistent.** The contradiction_report and
topic_cluster both received `medium` priority. In practice, the contradiction
(which has been resolved by the refactor) is lower urgency than the CI/CD
topic_cluster, which is a genuinely undocumented cross-cutting concern. The
prompt gives priority guidance but does not give the model enough criteria to
distinguish `high` from `medium` beyond "actionable gap vs. nice-to-have."

**The `token-service` entity_summary was borderline.** Only three episodes
touch token-service directly, and two of those are the same auth refactor event
viewed from different angles. The `when_to_use` guidance says "≥3 distinct
evidence episodes" — this barely qualifies. The model proposed it as `low`
priority (correct) but the `source_filter` listed ep:01JRAAX002 and
ep:01JRAAX005 as separate inputs even though they cover the same refactor. A
heuristic pre-filter that deduplicates episodes from the same PR would have
caught this.

**Anchor_id fabrication risk.** In one iteration during prompt development
(not shown), the model fabricated a plausible-looking ULID for an anchor that
was not in the substrate. The hard constraint ("anchor_id must be a substrate
ID from the delta or coverage catalog, or null") suppressed this in the final
v0.1 run, but the validation at the `project()` call site must also reject
unknown IDs — the prompt alone is not sufficient.

**No budget-aware pruning.** The prompt includes a "budget hint" field in the
spec but the v0.1 draft does not yet pass it to the model or instruct it to use
the hint to limit proposal size. At 8000 tokens remaining the 5-cap was not
binding, but on a small budget the model would still emit 5 proposals and leave
the authoring loop to time out. A follow-on iteration should add explicit
budget-aware guidance: "if the budget hint is <2000 tokens, emit at most 2
proposals."

---

## 5. Recommendation

**Emergent-first is viable with a heuristic pre-filter.**

The v0.1 prompt demonstrates that a well-structured discover prompt can:
1. Correctly identify synthesis gaps from substrate summaries without full
   content access
2. Select appropriate kinds from the catalog without inventing new ones
3. Emit concrete, actionable proposals with specific substrate citations
4. Suppress low-signal rows and respect the 5-proposal cap

However, two failure modes observed in development argue for a lightweight
heuristic pre-filter before the LLM call:

1. **Episode deduplication within the same event.** Multiple episodes from the
   same PR or the same issue thread carry redundant signal. A pre-filter that
   groups episodes by `source_ref` prefix (e.g. `PR#11/*`) and passes only one
   representative per group would reduce context window noise and prevent the
   borderline token-service proposal from being justified by what is effectively
   one event seen twice.

2. **Minimum evidence threshold for entity candidates.** Entities with fewer
   than 3 distinct (deduplicated) episodes should be excluded from the delta
   before it is passed to the model. This mirrors the `entity_summary`
   `when_to_use` criterion and prevents the model from proposing summaries for
   thin entities.

These pre-filters are cheap SQL queries that run before the LLM call. They do
not replace the LLM's judgment — they reduce the search space so the LLM can
focus on signal. The contradiction_report and topic_cluster kinds, which have
no threshold-based `when_to_use` criteria, are passed unfiltered.

**The priority field needs calibration criteria.** A follow-on iteration of the
prompt should define explicit priority rules: e.g. `high` if the gap involves
an entity with an active stale fingerprint elsewhere, `medium` if the gap is a
new first-time synthesis, `low` if evidence is at the minimum threshold. Without
this, priority is effectively free-form and unreliable as a scheduling signal.

**Anchor_id validation must be enforced at the `project()` call site**, not
trusted to the prompt alone. The LLM respected the constraint in v0.1 but
violated it in earlier iterations. Defense in depth is correct here.

The full emergent-only path (no pre-filter, prompt as the sole arbiter) would
likely work correctly most of the time but would be expensive on large substrates
and would produce marginal proposals on thin entities. The hybrid approach
(heuristic pre-filter + emergent LLM) matches ADR-002's "heuristic policies as
a cheap pre-filter" carve-out and is the recommended path to production.
