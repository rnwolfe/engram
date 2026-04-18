# Epic #111 — Execution Strategy

> **Scope:** retrieval precision + context-provider viability (epic #111).
> **Audience:** autodev pipeline and any human dispatching work against this epic.
> **Date:** 2026-04-17.

The forge-loop has no native dependency ordering. This doc pins down what can run in parallel, what must wait, and when to re-label gated issues back to `backlog/ready`.

## Current `backlog/ready` — safe to run in parallel

All five touch different files or subsystems. No serialization needed.

| # | Issue | Surface |
|---|-------|---------|
| #114 | embedding model as independent per-db config | `packages/engram-core/src/format/` |
| #117 | decommission engram-mcp + `engram serve` placeholder | delete `packages/engram-mcp/`, edit `maintenance.ts`, docs |
| #118 | decommission engramark, relocate stale-knowledge | move `packages/engramark/` tests to `engram-core/test/` |
| #119 | ingest plugin contract (D3 Deliverable 1) | `packages/engram-core/src/ingest/adapter.ts` + stub |
| #112 | retrieval fix — **Phase 0 diagnosis first** | depends on diagnosis outcome |

**Priority order if the dispatcher must pick one:** #114 first (unblocks the largest chain), then any of the others in parallel.

### Pre-flight for #117

Before merging: verify `engram context` works end-to-end against this repo's `.engram`. Run at least one representative query and confirm non-empty pack. If `engram context` is broken, do not delete MCP until it is fixed.

### Pre-flight for #118

Before deleting `packages/engramark/`: relocate stale-knowledge tests to `packages/engram-core/test/stale-knowledge/` and confirm `bun test` passes. One PR, sequential within it.

### Special handling for #112

Phase 0 (reproduce + diagnose + commit findings to `experiments/g1-narrative-projection/retrieval-bug-diagnosis.md`) must land before Phase 1 (the fix). If the diagnosis shows the root cause is fully subsumed by #113 (semantic entity embeddings), close #112 as a duplicate and skip Phase 1.

## Sequential chain — gated on #114

These four issues are `backlog/needs-refinement` right now. **Re-label to `backlog/ready` only after #114 merges to main.**

```
#114 ──┬── #113  (semantic entity embeddings)
       ├── #115  (engram init UX)
       ├── #120  (engram status)
       └── #121  (engram embed — also depends on #113)
```

Once #114 is merged:
- Re-label #113, #115, #120 to `backlog/ready` simultaneously — they touch different files and can run in parallel.
- Hold #121 until #113 merges; it needs the semantic entity index to exist before `engram embed --reindex` can index it.

## Help-text sweep — three sequential phases

```
#115 ──> #122  (Phase 1: root + init + ingest + companion)
#120 ──┬── #124  (Phase 2: query commands)
#122 ──┘
#121 ──┬── #125  (Phase 3: maintenance + export)
#122 ──┘
```

Re-label triggers:
- #122 → `backlog/ready` when #115 merges.
- #124 → `backlog/ready` when #120 and #122 both merge.
- #125 → `backlog/ready` when #121 and #122 both merge.

## Manual-only — do not dispatch via autodev

| # | Issue | Reason |
|---|-------|--------|
| #116 | workflow benchmark (Gate G1) | Labeled `type/manual`. Requires real agent execution + subagent grading, not a code PR. |
| #123 | harness plugin core (D3 Deliverable 2) | Gated on #116 branch decision; has open questions in the issue body. Refine first, then reconsider. |

## Quick-reference unblocking flow

```
start ──> parallel { #112, #114, #117, #118, #119 }
#114 merges ──> unblock { #113, #115, #120 };  hold #121 until #113
#115 merges ──> unblock #122
#113 + #114 merge ──> unblock #121
#120 + #122 merge ──> unblock #124
#121 + #122 merge ──> unblock #125
#116 resolves manually ──> revisit #123 (requires refinement before ready)
```

## Things the forge-loop must NOT do

- Do not pick `backlog/needs-refinement` issues, even if dependencies look satisfied. A human must re-label after verifying the merge.
- Do not skip the #117 pre-flight (`engram context` end-to-end check). Deleting MCP before the replacement is verified is the scenario ADR-005's sequencing constraint exists to prevent.
- Do not combine #112 Phase 0 and Phase 1 into a single PR. Phase 0 commits the diagnosis; Phase 1 implements the fix informed by it. Separate PRs produce a reviewable trail.
- Do not treat #119 as implying a new `packages/engram-plugins/` layout. The ingest-plugin work stays inside `engram-core` where `EnrichmentAdapter` already lives — that layout question is part of #123's refinement.

## Re-label playbook

When an unblocking event fires, the human or automation runs:

```sh
gh issue edit <n> --remove-label "backlog/needs-refinement" --add-label "backlog/ready"
gh issue comment <n> --body "Unblocked by #<merged>. Ready for autodev."
```

Update this doc if the chain changes or an issue's gating is revised.
