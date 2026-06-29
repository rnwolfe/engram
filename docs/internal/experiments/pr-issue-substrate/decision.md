# Wow-moment experiment — PR/issue-thread rationale (the corrected hypothesis)

**Date:** 2026-06-29.
**Hypothesis under test** (from `experiments/wow-moment-mcp/decision.md`): engram
beats capable agentic search only when the rationale is **not readable from
files** — e.g. it lives in PR/issue discussions the agent can't grep.
**Harness:** `agy` (Antigravity CLI) `-p`, agentic, `--dangerously-skip-permissions`.
**Isolation:** bare runs in a `.git`-less `git archive` of HEAD with the eval
meta-docs removed, via `--new-project --add-dir` so `agy` cannot follow a
worktree's `.git` back to the real repo (a contamination we caught and fixed).
**Substrate:** engram git + source + **GitHub PRs/issues** (288 episodes) + ADR
docs, built from the sanitized tree.

## Verdict: CONFIRMED — the pack clearly helps when the answer lives in an issue

The substrate seam: **Issue #277** ("discussion: agent-facing freshness UX —
patterns to borrow from beads") is a brainstorm proposing five commands
(`engram ready`, `engram resume`, reconcile claim/lease, `engram observe`,
`engram daemon`). None are implemented or documented **in the tree** — the plan
exists only in the issue thread.

| Q | bare (file+code only) | with_pack (engram pack surfaces #277) |
|---|---|---|
| **Q1** "plan for a single command for what's actionable/stale now?" | "No unified command exists" — **fabricated** `engram brief repo` / `status --json`; never found #277. | "Yes — tracked in **Issue #277** (beads-inspired freshness UX, agents lose context every ~10 min)." |
| **Q2** "lightweight command to quickly file a fact mid-task?" | found `engram add` + a planned `engram relate` from the format spec — **missed** the actual proposal. | "**Idea #4 (`engram observe`)** in #277: `engram observe "<fact>" --link …`; still proposed; focus was `engram ready`/`engram resume`." — exact and correct. |

In both cases the bare agent, with full file + code access, **does not know the
relevant issue exists**, so it confidently fabricates a different answer. The
pack surfaces the non-obvious issue and the agent then answers correctly. This is
the differentiation P1's MCP fixture could not show (there the answer was
co-located in a tree file). **The differentiator is real when the rationale is
genuinely off-tree.**

## The honest caveat: retrieval precision is the gating factor

The pack surfaced #277 for the "ready"/"observe" phrasings but **not** for a
"reconcile lease/claim concurrency" phrasing of the same issue's Idea #3 — a
PR/commit about reconcile out-ranked it. So the win is contingent on retrieval
reliably surfacing the relevant episode, and `engram context` retrieval is
**phrasing-sensitive**. The differentiator is only delivered when the right
episode is in the pack; improving discussion-retrieval precision (issue ranking,
recall for natural-language questions that don't share the issue's vocabulary) is
the highest-leverage next investment — more than another fixture.

## Note on `with_pack` fetching

For Q2, `agy` (which had network) fetched the full #277 web content **after the
pack pointed it there**. The pack's load-bearing value was surfacing *which*
issue is relevant; the agent did the rest. In a no-network scenario the pack's
own #277 episode excerpt carries the content, so the result holds — but it
underlines that the value is **assembly/pointing**, not exclusive access.

## Implications for `direction-2026-h2.md`

- The corrected hypothesis (§ "PR/issue threads, not files") is **confirmed**.
- The next gating wow-moment fixture should be **off-tree-rationale**, not
  in-tree-doc-rationale. `engram-pr-rationale.yaml` is that fixture.
- New top priority surfaced by this run: **discussion-retrieval precision/recall**
  for natural-language questions, since it gates the entire differentiator.
