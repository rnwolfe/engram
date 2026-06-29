# Direction & Execution Strategy — 2026 H2

**Status:** accepted (operator decision, 2026-06-29).
**Date:** 2026-06-29.
**Scope:** the controlling strategy document for the next phase of engram. Sets
the bet, the moat, the focused execution path, and the falsifiable gates.
**Relationship to other docs.**
- Supersedes the *breadth* of [`near-term-plan.md`](near-term-plan.md): that plan's
  five parallel workstreams are narrowed here to a single critical path. The
  near-term plan stays as the workstream-level reference; this document is the
  controlling sequence and the kill discipline.
- Refines [`harness-pivot-plan.md`](harness-pivot-plan.md) thesis #1–#4 with a
  2026-mid landscape read and a corrected MCP stance.
- Codifies [ADR-009](DECISIONS.md#adr-009----mcp-as-a-distribution-surface-refines-adr-004)
  (MCP-as-distribution) as the execution sequence around it.

---

## 0. TL;DR — the bet, in five sentences

1. Engram's full intersection — *local-first + bi-temporal + evidence-first +
   developer substrate (git/PR/issue/code) + single SQLite file + projection
   layer with read-time staleness* — is **empty in the mid-2026 market**, but a
   category ("local code-context engine for agents") is converging on it fast,
   with one competitor (Repowise) already at 5 of 6 axes.
2. The defensible moat is exactly **one axis**: bi-temporal validity +
   supersession + enforced evidence chains over developer history. Everything
   else is table stakes.
3. The thesis is **unproven**: the pack helps ~4/9 on engram's own repo, 1/9
   with a regression on Maestro, and the public Kubernetes fixture is
   *training-contaminated* — a public, famous codebase structurally cannot
   demonstrate "rationale the model has never seen."
4. So the entire next phase collapses to one falsifiable proof: **a frozen
   prompt about a reverted decision in engram's own history that bare agentic
   search answers wrongly (because it stops at the superseded ADR) and engram
   one-shots (because the pack carries the supersession chain).** The MCP
   reversal (ADR-004 → ADR-005 → ADR-009) is that fixture — self-referential,
   unseen, and supersession-dependent by construction.
5. On a win, ship the MCP **distribution** surface (ADR-009) to ride the
   category's distribution rail and plant a flag against the flat official
   memory server; on a loss, the diagnosis — not more surface — is the next
   cycle.

---

## 1. Landscape (condensed; full brief 2026-06-29)

### The market bifurcates; engram's cell is the bridge nobody occupies

| | Provenance | Bi-temporal validity | Local single-file | Auto-inject | git+PR+issue+code |
|---|---|---|---|---|---|
| **engram** | ✅ enforced invariant | ✅ as-of + supersession | ✅ one `.engram` | ✅ harness hooks | ✅ all four |
| **Repowise** | ◑ decisions/agent-prov | ◑ decay/staleness, **no as-of** | ◑ SQLite (not 1 file) | ✅ 9 MCP tools | ✅ git+PRs |
| **Graphiti / Zep** | ✅ episode-linked | ✅ **full bi-temporal** | ❌ Neo4j; Zep=SaaS | ◑ MCP | ❌ conversational |
| **Augment** (Context Lineage) | ◑ flat diff summaries | ❌ | ❌ cloud | ◑ | ◑ shallow "why" |
| **Copilot** (agent / Spaces) | ◑ PR/issue text | ❌ | ❌ cloud | ◑ | ◑ live grounding |
| **Cognee** | ❌ | ❌ | ◑ SQLite default | ✅ CC plugin | ❌ AST only |
| **CodeScene** (MCP) | ❌ | ◑ change-coupling (stats) | ◑ local | ✅ (Code Health only) | ✅ stats only |
| Structure-graph crowd (CodeGraph, GitNexus, Serena, `codebase-memory-mcp`) | ◑/❌ | ❌ | ◑/✅ | ✅ MCP | ❌ **current code only** |

Two camps: **structure-graph** tools (own current-code topology, ignore time)
and **temporal-memory** tools (own bi-temporal model, point at conversations,
not code). Engram is the only one reaching for both with developer history as
substrate.

### The four facts that set the strategy

1. **Agentic search beat RAG-on-code, and the leaders said so out loud.** Claude
   Code dropped its vector index over *staleness / privacy / reliability*
   (Cherny); Sourcegraph deprecated embeddings; Cline/Zed never indexed.
   *Implication:* engram must **never** position as "better code retrieval." Bare
   grep wins there. Engram's job starts where the current snapshot ends.
2. **The "why / history" layer is real white space and everyone is groping for
   it now.** Augment Context Lineage (Gemini-summarized diffs), Copilot agent
   (PR/issue grounding), Lore, Git Context Controller, GitKB, Letta Code,
   "bi-temporal memory for coding agents" posts — all 2026, all pre-product,
   all fragmented. Academic rationale-recovery runs ~27% precision (arXiv
   2504.20781), which means the "why" must be presented as **evidence to
   verify, not asserted fact** — i.e. engram's evidence-first invariant is the
   correct shape, working as a feature.
3. **MCP is the distribution rail and the official memory server is the foil.**
   MCP is Linux-Foundation-governed (AAIF, Dec 2025); the category ships via
   MCP; the official `@modelcontextprotocol/server-memory` is a *flat* local
   single-file KG with **zero** temporal/provenance. Engram's exact foil, in a
   registry with built-in discovery.
4. **The closest threat is Repowise** (local SQLite graph, git+PR ingest,
   decay/staleness, 9 MCP tools, commercializing May–Jun 2026). It lacks only
   true as-of/supersession and the enforced evidence invariant — a gap it can
   close fast. **The window is now.**

---

## 2. The moat and the positioning

**Moat (defend this, exclusively):** bi-temporal validity + atomic supersession
+ enforced evidence chains, over git/PR/issue/code. Graphiti has the temporal
rigor but not code; the structure-graph crowd has code but not time; Repowise
has decay but not time-travel or the invariant. The intersection is the moat.

**Positioning (say it everywhere):**

> Everyone graphs your current code. Nobody graphs how it got that way — with
> evidence and time.

Internal framing: *"Graphiti's bi-temporal rigor, native to code history, in
one file."* Lead with **why X / what superseded X**, never with retrieval.
Explicitly **not** RAG-on-current-code — that is solved, and saying otherwise
walks into a fight engram loses.

**On-brand asset.** Engram's "CLI as agent surface" is the
[aclig.dev](https://aclig.dev) thesis made flesh (stable schemas, machine
`--list-tools`, deterministic exit codes, non-interactive). It is the best
*public* proof-of-thesis for agent-native CLI design — a narrative and
distribution asset the pure-OSS competitors lack. Build-in-public surface:
@somewolfe.

---

## 3. Strategic decisions locked

| # | Decision | Rationale | Authority |
|---|----------|-----------|-----------|
| D1 | **Re-aim the wow moment to unseen substrate.** The gating fixture is a reverted decision in engram's own history; public K8s is a reproducibility demo only. | A public famous codebase cannot show "rationale the model never saw"; the bare condition already answers KEP-753. | near-term-plan re-aim (2026-06-29) |
| D2 | **Reverse the blanket MCP ban → distribution-only single-endpoint server.** Keep hooks primary; reject model-driven graph-traversal MCP. | Ride the category's distribution rail without inverting "engine decides, model executes." | [ADR-009](DECISIONS.md#adr-009----mcp-as-a-distribution-surface-refines-adr-004) |
| D3 | **Single critical path, not five parallel workstreams.** | The project "accreted commands and adapters without closing the loop" (its own words); the landscape says ship the proof + positioning, not breadth. | this doc |
| D4 | **Lead the product story with temporal "why," not retrieval.** | Agentic search owns retrieval; the moat is history+evidence+supersession. | this doc |
| D5 | **Hold every kill.** No new adapters, no new projection kinds beyond `module_overview`, no viz, no MCP retrieval tools, no narrative commands. | Competitive pressure rewards focus + speed, not surface. | near-term-plan "Explicit kills" |

---

## 4. The focused execution path

Five phases on one critical path. Each ends with something falsifiable, not a
half-migration. **Phases 3–4 are gated on the Phase 2 verdict.**

```
P0 close-out ─→ P1 fixture (unseen) ─→ P2 hook delivery ─→ EVALUATE
                                                              │ Win
                                              ┌───────────────┼───────────────┐
                                              ↓               ↓               ↓
                                      P3 MCP distribution  positioning     P4 second
                                      + foil comparison    push (public)   harness/kind
                                              │ Loss
                                              ↓
                                      written diagnosis → next cycle re-scoped
```

### P0 — Close out the current cycle (mechanical, do first)

- Land PR #279 (wow-moment cycle: eval fixture, `module_overview`, harness
  layer, CLI polish). Resolve the `subject-case` commitlint failure (cosmetic,
  em-dash title) by squashing to a clean conventional commit; the test job
  already passes.
- Prune merged local branches (`pr-264`, `pr-272`) and the stale remote-only
  `docs/sync-v0.3-surface` once confirmed merged.
- Merge the direction docs (this file, ADR-009, the near-term re-aim, the
  CLAUDE/README positioning) with #279 or as an immediately-following docs PR.
- **Exit:** `main` carries the re-aim; the tree has one open line of work.

### P1 — The unseen-substrate fixture (the proof's foundation)

Build the fixture whose frozen prompt is answerable **only** from engram's own
decision history. The MCP reversal is the primary; engram's own history is a
rich seam of other supersessions for the regression set (see §5.4).

- New fixture `packages/engram-core/test/fixtures/eval/engram-mcp-decision.yaml`:
  source = this repo, ingest `git` + `source` + `markdown`
  (`docs/internal/DECISIONS.md`, `docs/internal/harness-pivot-plan.md`,
  `docs/internal/near-term-plan.md`, this file).
- The substrate must represent the **supersession** explicitly, not just three
  co-present documents: the ADR-004 → ADR-005 → ADR-009 chain should surface in
  the pack with temporal ordering and a supersession signal, so the pack's
  advantage is *structural*, not just recall. (If decision-entity supersession
  edges aren't auto-created from ADR ingest, that is the one piece of fixture
  construction work P1 owns — see §5.3.)
- Frozen prompt(s) written into YAML at P1 start (§5.1), with ground-truth
  (the three ADRs, the distinction, the predicted bare-failure).
- **Exit:** `bun run eval --fixture engram-mcp-decision` materialises a
  deterministic `.engram` and runs the frozen prompt bare vs. with-pack,
  capturing both answers to disk.

### P2 — Invisible hook delivery (Gemini CLI) + the verdict

- `packages/harnesses/core/` neutral surface (`on_session_start`,
  `on_user_prompt`) + `packages/harnesses/gemini-cli/` adapter (<200 lines),
  per near-term W3. `on_user_prompt` calls `engram context "$prompt"
  --format=json` and prepends the pack; 1500 ms deadline, skip-on-timeout.
- Run the frozen prompt **through Gemini CLI** in the fixture working dir, both
  conditions, no `engram` in shell history for the with-pack run (invisible).
- **Grade** on the §5.5 rubric. Record the branch decision in
  `docs/internal/experiments/wow-moment-mcp/decision.md`.
- **Exit = the verdict.** Win → P3/positioning. Loss → diagnosis, re-scope.

### P3 — MCP distribution server (gated on Win; ADR-009)

- Thin server under `packages/harnesses/` exposing `engram context` as a
  *single* endpoint (plus at most `why`, `diff`), reusing
  `packages/harnesses/core/` assembly. Scope guards per §6.
- README/landing comparison vs `@modelcontextprotocol/server-memory` — the foil
  comparison *is* the distribution artifact.
- **Exit:** an MCP harness without a force-injection hook (e.g. Cursor) pulls an
  engram pack via the server against the fixture.

### P4 — Earn breadth back (only after a durable win)

A second harness adapter (Claude Code) to prove the neutral layer is neutral,
or the next projection kind, or federation. Not before. Re-scoped per the P2
write-up.

---

## 5. The eval, in depth — the MCP reversal as a testable surface

This is the load-bearing insight: **the very decision to reverse the MCP ban is
the cleanest possible fixture for engram's differentiator.** It is unseen
(engram's private history), supersession-dependent by construction, falsifiable
(bare *will* find the superseded ADR), and dogfooding (engram proving its thesis
on its own decisions is the build-in-public story).

### 5.1 The frozen prompt (candidate — finalize at P1 start)

> *"I want coding agents to pull engram's context over MCP so it shows up in
> tools like Cursor. Has this been considered here, and is exposing engram over
> MCP the right move — or was it deliberately rejected?"*

Real (a developer would type this), rationale-dependent, multi-document, and —
critically — its correct answer **inverts** between the superseded and current
states of the graph.

### 5.2 Why bare agentic search fails (the prediction, recorded before running)

Bare grep/glob/read in this repo hits, in rough recency-blind order:
`ADR-005 "Decommission engram-mcp"`, `harness-pivot-plan` "No MCP layer of any
kind," README/CLAUDE history with MCP removed, `mcp-graph-traversal-tools.md`
(a deleted-tool spec). The high-confidence, **wrong** synthesis: *"MCP was
deliberately removed and is off the roadmap; don't do it."* The agent has no
recency signal telling it ADR-009 (2026-06-29) reversed the *blanket* ban, nor
the retrieval-vs-distribution distinction. **If the bare agent gets this right,
that is itself a result** (it means the supersession was discoverable by date
sort alone) — and a signal to pick a harder chain from §5.4.

### 5.3 Why the pack wins (the mechanism that must hold)

`engram context "expose engram over MCP"` should return a pack in which the
ADR-004 → ADR-005 → ADR-009 chain appears **temporally ordered with a
supersession marker**, so the model sees not three opinions but one *evolving*
decision whose current state is ADR-009. The correct one-shot answer:

> *Yes — but specifically as a **single-endpoint distribution server** (ADR-009,
> 2026-06-29), not the model-driven graph-traversal tools that were removed
> (ADR-005). The blanket "no MCP" (ADR-004/005) was reversed for distribution
> while still rejecting MCP-as-retrieval. For Cursor specifically — whose
> `beforeSubmitPrompt` hook is block/inform-only — the MCP distribution surface
> is the intended path.*

This answer is **impossible** without recency + supersession awareness. That is
the differentiator, isolated.

**Fixture construction work P1 owns:** confirm the ADR ingest produces either
(a) a `decision`/episode supersession chain the retriever orders temporally, or
(b) failing that, ranked episodes whose `created_at` ordering + an explicit
"superseded by" signal is rendered in the pack. If neither exists today, the
minimal addition is representing ADR supersession as episode/edge supersession
on markdown ingest — *not* a new feature, an application of the existing
supersession primitive to the docs substrate. Keep it minimal; resist building
a "decision graph" product.

### 5.4 Regression set — engram's own reverted decisions (all unseen)

Engram's history is unusually rich in documented supersessions; each is a clean,
private, supersession-dependent fixture seed. Use 2–3 as a regression set so the
verdict isn't a single-prompt fluke:

| Reverted decision | Superseded → current | Source |
|---|---|---|
| **MCP exposure** (primary) | removed → distribution-only | ADR-004/005 → ADR-009 |
| Harness package naming | `packages/engram-plugin-*` → `packages/harnesses/` | near-term-plan W3 |
| `.engram` layout | flat file → `.engram/` directory | #187 |
| Benchmark suite | engramark package → relocated integration tests | ADR-005 |
| Gerrit adapter delivery | built-in → in-repo plugin | ADR-008 |
| The wow-moment gate itself | public K8s fixture → unseen substrate | this re-aim |

The last row is delicious: engram can answer "is the K8s fixture the wow-moment
gate?" correctly *because of this very document* — maximal dogfooding.

### 5.5 Grading rubric (per prompt, both conditions)

Three-point, side-by-side, recorded with the answers:
- **Pack clearly helps** — with-pack surfaces the supersession / current state;
  bare asserts the stale or incomplete answer.
- **No meaningful difference** — both reach the current state (investigate: was
  the supersession trivially date-discoverable? pick a harder chain).
- **Pack adds noise** — with-pack misleads or buries the answer (a retrieval or
  assembly bug; diagnose, don't discard the concept).

Secondary (necessary, not sufficient): generation cost of any `module_overview`
in the pack <$0.05; pack assembly <1500 ms; staleness flips correctly when a
fixture ADR is edited; no hallucinated claims outside the evidence.

**Win bar:** the primary MCP prompt is "pack clearly helps," and ≥2 of 3
regression prompts are "pack clearly helps," through **Gemini CLI** (not raw
`engram context`), with the with-pack run leaving no `engram` invocation in
shell history.

---

## 6. MCP distribution server — design (P3, gated)

Per ADR-009. The point is **distribution without control inversion.**

- **Surface:** one primary tool/resource `engram_context(query, [as_of],
  [token_budget])` returning the same bounded pack as `engram context
  --format=json`. At most add `engram_why(target)` and `engram_diff(from, to)`
  — all read, all engine-bounded. The model elects *when*; the engine decides
  *what*.
- **Reuse, don't fork:** the server calls `packages/harnesses/core/` assembly —
  the hook path and the MCP path share one assembler so they cannot drift.
- **Hard scope guards (so it never becomes `engram-mcp` again):**
  - No graph-traversal tools (`neighbors`, `shortest_path`, `get_edge`, …).
    Those were the deleted package and stay dead (ADR-005). Adding them is a new
    ADR.
  - Lives under `packages/harnesses/`, not a resurrected `packages/engram-mcp/`.
  - Secondary to the hook path; never the path engram recommends to
    hook-capable harnesses (Claude Code, Gemini CLI, OpenCode).
- **The foil comparison is the deliverable.** Ship a side-by-side vs the
  official flat memory server: *same single-file local shape, plus time +
  evidence + supersession.* That sentence is the registry pitch.

---

## 7. Risks, and the honest kill criteria

| Risk | Why it bites | Mitigation / kill |
|---|---|---|
| **The pack still doesn't help through the harness** | The whole thesis. G1/G2 already showed weak/inconsistent lift. | This is the *point* of P2. A Loss → written diagnosis (insufficient pack? present-but-unused? not answerable from substrate?) → re-scope. A null result is a result. |
| **Bare grep answers the MCP prompt correctly** | Supersession may be date-discoverable without engram. | Pick a harder chain from §5.4 where the superseding doc doesn't name the superseded one; if *all* are easy, the differentiator is weaker than claimed — record that honestly. |
| **Repowise adds as-of/supersession first** | Closes the moat gap. | Speed: the proof + positioning + MCP foil are weeks, not quarters. Lead with the enforced evidence invariant + single-file, which are harder to copy than a decay tweak. |
| **MCP server drifts back into retrieval tools** | Re-inverts control; re-creates `engram-mcp`. | §6 scope guards; new-ADR gate on any traversal tool. |
| **Self-referential fixture reads as a gimmick** | "You only proved it on your own repo." | The §5.4 regression set + the public K8s repro demo + a private non-engram repo (operator's choice) generalize the claim beyond self-reference. |
| **Positioning pivot confuses existing framing** | VISION/README still emphasize the projection "wiki." | Keep the substrate/projection story; sharpen the *lead* to temporal "why." The projection layer is how the moat compounds, not the headline. |

**Cycle kill (unchanged from near-term-plan):** if P1–P2 ship and the prompt
still fails through the harness, the "evidence-backed packs unlock failed
prompts" hypothesis is weakened; the next cycle diagnoses *why* before building
more. This must remain a real possibility or the goal isn't falsifiable.

---

## 8. Definition of done for the phase

The phase has succeeded when **all** hold:
1. PR #279 and the direction docs are on `main`; the tree has one line of work
   (P0).
2. `bun run eval --fixture engram-mcp-decision` is deterministic and reproducible
   from a clean checkout (P1).
3. The frozen MCP prompt, typed unmodified into Gemini CLI with the engram hook
   installed, one-shots the ADR-009 distinction; the bare run gives the stale
   "MCP was removed" answer; both captured to disk (P2).
4. ≥2/3 regression prompts also show "pack clearly helps" (P2).
5. On that win: the MCP distribution server pulls a pack into one hook-less
   harness, and the README carries the foil comparison (P3).
6. The win is written up; the next cycle is scoped from it (P4 trigger).

If (3) fails, the phase still "succeeds" in the falsifiable sense: it produces a
documented diagnosis and a corrected hypothesis. That is the contract.

---

## 9. Open questions (resolve by doing, not debating)

1. **Does ADR/markdown ingest already yield a supersession-ordered pack, or is
   minimal supersession-on-docs representation needed?** (P1 blocker; §5.3.)
2. **Final frozen prompt wording** — lock at P1 start; do not tune after grading
   begins.
3. **Gemini CLI hook surface** as of the targeted release — `BeforeAgent` /
   `additionalContext` is the assumed force-injection point; confirm before P2.
4. **Which 2 regression prompts** from §5.4 join the primary — pick before
   grading, ideally one where the superseding doc does *not* mention the
   superseded one (hardest case).
5. **Private non-engram fixture** — does the operator have a repo whose history
   carries a good "why/what-superseded" question, to generalize beyond
   self-reference? (Optional; strengthens §7's gimmick risk.)
