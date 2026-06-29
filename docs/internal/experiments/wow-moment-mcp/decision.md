# Wow-moment experiment — engram MCP decision (ADR-004 → 005 → 009)

**Date:** 2026-06-29.
**Fixture:** `packages/engram-core/test/fixtures/eval/engram-mcp-decision.yaml`.
**Model (harness):** `claude -p` (agentic, file access). Gemini CLI was intended
per the fixture but its individual free tier was decommissioned mid-run
(`IneligibleTierError`); `claude` is an equivalent agentic harness for the
eyeball verdict.
**Conditions:** `bare` = agent searches a *sanitized* worktree (real code +
`DECISIONS.md` with all ADRs + git history, minus the eval meta-docs and the
`fixtures/eval` dir). `with_pack` = same, plus the `engram context` pack
prepended.

## Verdict: NO MEANINGFUL DIFFERENTIATION (informative negative result)

Both conditions produced a **fully correct** answer: ADR-004/005 rejected MCP
wholesale and deleted `engram-mcp`; ADR-009 (2026-06-29) reversed the *blanket*
ban into MCP-as-distribution (single `engram context` endpoint, "engine decides
what, model elects when") while keeping MCP-as-retrieval rejected; Cursor is the
named motivation; the server is gated and unbuilt. See `answer-bare.md` and
`answer-with-pack.md`.

The only delta: `with_pack` cited line numbers (`DECISIONS.md:404/:455/:494`)
and a commit SHA the pack surfaced. The *substance* was identical. The predicted
bare failure (§5.2 of `direction-2026-h2.md`: "bare stops at ADR-005, says MCP
was removed, don't") **did not occur.**

## Why bare succeeded (the load-bearing finding)

The answer is **co-located in one grep-discoverable file** (`DECISIONS.md`), and
a capable agentic model simply reads it top-to-bottom — it does not "stop at
ADR-005." The §5.2 prediction modeled a lazy keyword-grepper; real harnesses
read the whole decision record. **For documented, co-located rationale, capable
agentic search is a strong baseline that the pack does not beat.**

This is consistent with ADR-004's own framing note ("agents always have file
access; pack-vs-no-access is a straw man") — and sharpens it: the pack also does
not beat agentic search when the rationale lives in **readable files**.

## What this does and does not invalidate

- **Does NOT invalidate the engine work.** Verifying this fixture surfaced three
  real retrieval bugs, now fixed and the reason the pack *can* carry the current
  decision at all: (1) design-doc/`document` episodes were excluded from the
  "discussions" surface; (2) excerpts were file-head slices, never the relevant
  section; (3) whole-file markdown episodes are poor retrieval units. See
  `direction-2026-h2.md` §5.3 and the commit. These are general improvements to
  engram's "surface the rationale" thesis regardless of this fixture.
- **DOES invalidate this fixture as a wow-moment.** Self-referential ADR
  rationale in one file cannot defeat a capable bare agent. Keep the fixture as a
  **retrieval/pack-quality regression** (the pack must lead with ADR-009), not as
  the differentiator gate.

## Corrected hypothesis for the next cycle

Engram beats capable agentic search only when the rationale is **not readable
from files in the working tree** — i.e. it lives in:

1. **PR / issue discussions** (GitHub/Gerrit API) that are *not* in the repo —
   the agent cannot grep them; engram ingested them as episodes.
2. **Co-change / ownership / supersession across many commits** — derivable only
   by traversing history, which bare search does expensively or not at all.

The next fixture must target a question whose answer depends on (1) or (2), on
unseen substrate. Engram-on-engram is too small and too well-documented in-tree;
the K8s shape (dispersed PR/KEP rationale) is right but needs the *private*-repo
variant to stay unseen. Candidate: a "why does X depend on Y / who owns the
decision behind Z" question answerable only from PR threads + co-change, not from
any single file.

## Status of `direction-2026-h2.md` claims

- §5.1 frozen prompt — **kept** (it is a fair question; the substrate just makes
  it answerable by bare search too).
- §5.2 "bare fails" prediction — **falsified** for capable agentic harnesses;
  annotated in the doc.
- §5.3 "supersession not surfaced; minimal addition needed" — **confirmed and
  resolved** (section ingestion + discussions-include-document + windowing).
- Open question #1 — **answered**: whole-file doc episodes cannot surface the
  current ADR; per-section ingestion is required and now implemented.
