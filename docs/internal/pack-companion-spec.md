# Engram as Context Provider — Implementation Spec

> **Status:** Phases 1 and 2 shipped. Phase 3 (workflow benchmark) is deferred and tracked as issue #116.
> **Date:** 2026-04-16 (original); 2026-04-17 (status refresh).
> **Supersedes:** Parts of `harness-pivot-plan.md` that framed engram as a direct-Q&A retrieval benchmark.
> **Extended by:** ADR-003 (embedding-model independence), ADR-004 (engram as context provider), ADR-005 (MCP/engramark decommission), `specs/retrieval-embedding.md` (semantic entity embeddings + `engram init` UX).
> **Outcome of Phases 1–2:** experiment G2 (Maestro, 9 Q&A) showed pack helps 1/9 and companion prompt adds ~10% overhead with 0 wins and 1 regression. See `experiments/g2-pack-companion/grades.md`. That result drove ADR-004 and the Phase 3 gating change.

## Background

Gate G1 experiments (Fastify 6/9, Maestro v2 3/9, Maestro v3 1/5 on the subset that ran) revealed three things:

1. When an agent has file-search tools, entity-centric retrieval mostly duplicates what the agent can find itself.
2. A naïve Discussions track (BM25 on episode bodies) surfaces tangentially-related PRs that the agent then treats as authoritative, causing it to stop its own search and cite noise (Q3, Q5 in v3).
3. The wins come from two narrow modes: (a) the pack contains a specific textual anchor (JSDoc, comment, commit subject) that answers the question; (b) the pack contains relational signal (co-change edges, supersession chains) that file search cannot derive.

The reframe: **engram is a context provider, not an answer engine.** The agent decides when to reach for engram's signals. Our job is to make those signals precise and to teach the agent how to use them — via a companion prompt that ships with the CLI.

## Scope of this spec

Three independently shippable phases. Each phase has its own acceptance criteria so the work can pause between phases if needed.

---

## Phase 1 — Retrieval precision

**Goal:** Reduce the false-positive rate in the Discussions track; prefer silence to noise; shift pack framing from authoritative evidence to agent-verifiable hypotheses.

### Changes in `packages/engram-cli/src/commands/context.ts`

1. **Semantic episode retrieval (vector).** Add a vector track alongside the existing BM25 track for episode search. Query embedding computed once from the full query string. Candidate set = BM25 top-K ∪ vector top-K; final ranking = weighted combination (tune weights after initial replay). This distinguishes "why JSONL was chosen" from "updated the JSONL parser."

2. **Confidence thresholds — omit instead of include.**
   - Compute a normalized confidence score per result (BM25 + vector + source-type prior).
   - Below threshold → do not include. An empty Discussions section is strictly better than a misleading one.
   - Threshold calibrated against the v2/v3 result sets; tunable via `--min-confidence` flag.

3. **De-emphasize raw code entities when structural signals are stronger.**
   - If the top entity hits are all files a simple grep would find, deprioritize them in favor of:
     - Co-change edges (already inferred, underused)
     - Supersession chains (entities that replaced/were replaced)
     - Cross-source evidence (entities with both git and PR/issue provenance)
   - Keep a short entity list for orientation, but shift token budget toward relational sections.

4. **Pack framing shift — hypotheses, not evidence.**
   - Rewrite section headers and the lead-in blurb:
     - `### Discussions` → `### Possibly relevant discussions` with an explicit note: "These may or may not address your question — verify by reading the source."
     - `### Edges` → `### Structural signals (verify before citing)`
   - This small framing change reduces the hallucination-from-retrieval failure mode.

### Acceptance criteria

- Replay Maestro v3 Q1-Q5 with the new pack. Q3 and Q5 should either flip to "no meaningful difference" or have their Discussions section omitted (below threshold). Q2 should continue to surface PR #543 above threshold.
- Pack token usage should drop for low-signal queries (observable proxy: the 35% discussion budget goes unused on vague queries).
- No regression on the three v2 wins (Q6 PTY, Q8 Map, Q9 themes).

---

## Phase 2 — Agent companion prompt

**Goal:** Ship a reusable system-prompt fragment that teaches an agent when and how to reach for engram's pack signals. Output via CLI so users can append to `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/*.md`, or similar.

### New CLI command

```
engram companion [--harness generic|claude-code|cursor|gemini] [--db .engram]
```

- Writes the companion prompt to stdout.
- User appends: `engram companion >> AGENTS.md` (or similar).
- `--harness` switches a few phrasings (tool names, file references) but the core content is shared.

### Content structure (single source, with harness-specific adapters)

The prompt teaches the agent four things:

1. **When to call `engram context <query>`.** Heuristics:
   - Before changing unfamiliar code, to check prior rationale and co-change footprint.
   - When a user asks "why is this written this way" — to check PR/issue history the agent can't grep.
   - Before proposing a refactor — to check if the current shape was chosen over an alternative that was reverted.
   - NOT for questions answerable by reading one file; file search is faster.

2. **How to interpret pack sections.**
   - Discussions → "PRs/issues that mention your query terms; verify they actually address the design question before citing."
   - Edges → "Structural facts from git history (co-change, supersession) — trustworthy signal, cite freely."
   - Entities → "Navigation aid — use as a file list, not as authority."
   - Evidence excerpts → "Raw source text; citable if you verify it matches current code."

3. **How to handle low-confidence or empty sections.** A missing Discussions section means the graph had no strong hit — fall back to file search rather than treating absence as signal.

4. **When to prefer pack signal over current code.** Co-change edges and supersession chains reflect historical patterns that current code may not reveal. Use these when reasoning about multi-file changes or recurring patterns.

### Deliverables

- New file: `packages/engram-cli/src/commands/companion.ts`
- Templates in `packages/engram-cli/src/templates/companion/` — one base template + harness-specific overrides
- Wire-up in `packages/engram-cli/src/cli.ts`
- Test: `packages/engram-cli/test/companion.test.ts` verifying each harness variant produces valid markdown

### Acceptance criteria

- `engram companion` writes a base template; `--harness claude-code` / `--harness cursor` / `--harness gemini` produce harness-specific variants.
- Appending the output to an agent instruction file is a lossless operation (valid markdown, no template markers leak).
- Manual smoke test: run Claude Code with the companion prompt appended to `CLAUDE.md`, ask a historical question, observe it invoke `engram context` before answering.

---

## Phase 3 — Workflow benchmark

**Goal:** Replace Gate G1's direct-Q&A benchmark with one that measures real task outcomes. The G1 score was measuring the wrong thing.

### Design

- **Tasks, not questions.** ~8-10 realistic workflow tasks against Maestro:
  - "Refactor `X` without breaking `Y`"
  - "Add feature `Z`, following existing patterns"
  - "Debug regression introduced in commit range `A..B`"
  - "Explain why this code path exists and whether it's still needed"
- **Three conditions:**
  - A: bare agent (Claude Code / Gemini CLI with file-search only)
  - B: agent + pack (no companion prompt — pack is injected once at task start)
  - C: agent + pack + companion prompt (the intended shipping configuration)
- **Scoring:** subagent-graded rubric on task completion quality (correctness, scope discipline, evidence grounding). Not a binary "helped/hurt" but a rubric score per task.
- **Token accounting:** record tokens spent in each condition to test the "fewer tokens to right answer" ROI.

### Deliverables

- `docs/internal/experiments/g2-workflow/`
  - `tasks.ts` — task definitions (prompt + graded rubric)
  - `run.ts` — three-condition runner
  - `results.md` / `results.json`
  - `grades.md` (subagent-produced)

### Acceptance criteria

- Clear signal separating B from A (pack provides value when used) and C from B (companion prompt improves pack usage).
- Token-cost-per-task decreases from A to C, or quality increases at same cost.
- If C ≤ A, engram is not ready to ship as a context provider — reopen Phase 1.

---

## Non-goals for this spec

- **No new ingestion adapters.** GitHub enrichment already exists and the Maestro .engram has 402 PRs + 355 issues — data coverage is not the blocker.
- **No schema changes.** All work is in retrieval and presentation layers.
- **No MCP tool changes.** The MCP surface is orthogonal; companion-prompt pattern can extend to MCP later. *(Superseded: `engram-mcp` is being decommissioned per ADR-005.)*
- **No embedding infra rewrite.** Reuse the existing embedder (`OllamaProvider` / `GeminiProvider`) for episode vector indexing. *(Extended: embedding model is now committed per-`.engram` and independent of generation provider — see ADR-003 and `specs/retrieval-embedding.md`.)*

---

## Open questions to resolve during implementation

- **Vector model choice for episodes.** Reuse the existing entity embedder (default `nomic-embed-text` via Ollama) or use a larger model for PR/issue bodies specifically? Probably reuse for consistency; revisit if precision is insufficient.
- **Confidence threshold calibration.** Needs a small labeled set; Maestro v2/v3 questions can serve as initial calibration data.
- **Companion prompt length budget.** A few hundred lines or a tight one-pager? Probably start tight; expand based on observed agent behavior.
- **Should the companion prompt include example transcripts?** Might help agents pattern-match. Risks increasing token cost of the prompt itself.

---

## Starting point for implementation session

Open a new Claude Code session in this repo. Reference this spec (`docs/internal/pack-companion-spec.md`) and the two prior planning docs (`docs/internal/harness-pivot-plan.md` for historical context on the framing shift, `docs/internal/experiments/g1-maestro-v3/grades.md` for the specific failure modes to fix).

Recommended order: Phase 1 first (retrieval precision is a prerequisite for the companion prompt to deliver value), then Phase 2 (companion prompt), then Phase 3 (benchmark) only after Phases 1 and 2 are landed — otherwise we're benchmarking a half-built system.
