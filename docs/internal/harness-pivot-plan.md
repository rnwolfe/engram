# Harness Pivot Plan

**Status:** partially executed — Phase 1 experiments ran; ADRs 004 and 005 captured the outcomes; Phase 2+ sequencing superseded (see update below).
**Date:** 2026-04-15 (original); 2026-04-17 (status refresh).
**Scope:** repositions engram from "CLI + MCP + benchmark suite" to "CLI + harness plugins," with narrative projections added as a new kind.

**Status update (2026-04-17).**
- Phase 1 Gate G1 (narrative-projection viability experiment) ran as `experiments/g1-narrative-projection/` — pack clearly helps 4/9. A second experiment (`experiments/g2-pack-companion/`) ran on Maestro — pack helps 1/9, companion regresses 1/9. Both feed ADR-004.
- ADR-004 reframes engram as a context provider (not answer engine). The workflow benchmark becomes the new gating primary validation. To disambiguate: this plan's "Gate G1" is the **narrative viability experiment** (now complete); `VISION.md` and `pack-companion-spec.md`'s "Gate G1" is the **workflow benchmark** (tracked as issue #116). They are distinct artifacts; the experiments informed the gate.
- D1 (delete `engram-mcp`) and D2 (delete `engramark`, preserve stale-knowledge scenarios) are formalized as ADR-005 and tracked as issues #117, #118.
- D3 (harness plugin layer) is deferred behind the workflow benchmark per ADR-004. However, **ingest plugin formalization** (stable `EnrichmentAdapter` contract — not the same as harness lifecycle plugins) stays prioritized for internal-Google portability; tracked as #119.
- D5 (narrative projection kinds) is gated on the workflow benchmark showing pack earns its keep on multi-file tasks.
- Embedding-model independence and semantic entity embeddings were added after this plan — see ADR-003 and `specs/retrieval-embedding.md`.

## Why this exists

A market scan of adjacent tools (lossless-claw / LCM, Blitzy, Graphiti, Aider repomap, Cursor, Cody, Greptile, Letta, Mem0) produced a clear picture of where engram is ahead, where it is behind, and where its architecture has unoccupied territory. This plan commits to a pivot that leans into the differentiators and sheds surfaces that dilute the thesis.

Full market analysis lives in the conversation that produced this document; the load-bearing findings are summarized below.

## Strategic thesis

1. **Engine decides, model executes.** The LCM thesis from Voltropy's paper is the right frame: the engine deterministically assembles and bounds context; the model only runs inference. MCP-style tool exposure inverts this by handing retrieval decisions to the model. CLI invocation from a harness plugin keeps the engine in control.
2. **Temporal validity + evidence + staleness is the moat.** Half-open validity intervals, atomic supersession, `observed`/`inferred`/`asserted` edge kinds, and read-time `stale` + `stale_reason` on projections are capabilities no code-focused competitor ships. Graphiti is the only architectural sibling, and it is conversational-memory scoped.
3. **Local-first, harness-agnostic, lifecycle-integrated.** The closest competitor (lossless-claw) is locked to OpenClaw. A plugin layer that works across Claude Code, Gemini CLI, and OpenCode against a single-file SQLite substrate is genuinely unoccupied.
4. **Narrative is a projection kind, not a product.** Codebase-wiki incumbents (DeepWiki, Mutable.ai, Sourcegraph generated docs) all have the same failure mode: prose rots silently when code changes. Engram's projection model already solves this — narrative explanations carried as projections inherit the staleness plumbing for free.

## Decisions

### D1. Decommission `engram-mcp`

**Decision:** delete `packages/engram-mcp/` entirely.

**Why:** MCP exposes retrieval as model-callable tools, which is the opposite of engine-deterministic control. Any harness that natively speaks MCP (Claude Code, Gemini CLI, OpenCode) can shell out to `engram context` from a skill/prompt with equivalent reach and stricter control.

**How to apply:** remove the package, drop MCP tool references from docs (`CLAUDE.md`, `README.md`), and update the three-layer architecture section to `engram-core` + `engram-cli` + `engram-plugins`.

**Sequencing:** do not delete until `engram context` and at least one harness plugin are working end-to-end. See phases below.

### D2. Decommission `engramark`, preserve stale-knowledge scenarios

**Decision:** delete `packages/engramark/` as a package. Relocate the stale-knowledge dataset, loader, and scoring code to `packages/engram-core/test/stale-knowledge/` as integration tests.

**Why:** benchmark suites are infrastructure for proving claims to external buyers. With one user (dogfood), that investment doesn't pay. But the stale-knowledge scenarios are regression scaffolding for one of engram's strongest differentiators; losing them would leave the invariant unguarded. The Fastify retrieval benchmark is not tied to a unique capability and can go entirely.

**How to apply:**
- Move `packages/engramark/src/datasets/stale-knowledge/` → `packages/engram-core/test/stale-knowledge/`
- Move `packages/engramark/src/runners/stale-*.ts` → `packages/engram-core/test/stale-knowledge/runners/`
- Move `packages/engramark/src/scoring/stale-knowledge.ts` → `packages/engram-core/test/stale-knowledge/scoring.ts`
- Wire stale-knowledge runs into `bun test` as regular integration tests (not a separate harness).
- Drop everything else: Fastify dataset, report formatting, CLI harness, AI benchmarking spec.
- Remove `docs/internal/specs/engramark-ai-benchmarking.md` and `docs/internal/specs/engramark-stale-knowledge.md` (or consolidate their still-relevant invariants into `docs/internal/specs/projections.md`).

### D3. Build a harness-neutral plugin layer

**Decision:** add a plugin architecture with one harness-neutral core and per-harness adapters.

**Package layout after pivot:**

```
packages/
  engram-core/              # unchanged (the product)
  engram-cli/               # unchanged surface, extended with `engram context`
  engram-plugin-core/       # NEW — harness-neutral lifecycle events + context assembly helpers
  engram-plugin-gemini-cli/ # NEW — first adapter (dogfood)
  engram-plugin-claude-code/# NEW — second adapter
  # engram-plugin-opencode/ # FUTURE — community or later
```

**Harness-neutral hook surface** (exposed by `engram-plugin-core`):

| Event | Engram action |
|-------|---------------|
| `on_session_start` | Run reconcile in background; inject compact staleness brief (what's stale, what's new since last session). |
| `on_user_prompt` | Call `engram context <prompt>`; prepend grounded context pack to the system/user prompt. |
| `on_before_compact` | Snapshot conversation as episode (`source_type = 'conversation'`), run entity extraction, promote to substrate. |
| `on_file_edit` | Eagerly mark affected projections stale (don't wait for next reconcile). |
| `on_session_end` | Emit session summary episode linking touched entities for next-session continuity. |

Adapters are thin translation layers from each harness's native hook API to these events. Target: under 200 lines per adapter.

**First adapter:** Gemini CLI. Dogfood path, and forces the neutral abstraction to actually be neutral rather than Claude-Code-shaped.

### D4. Source code as a first-class substrate

**Decision:** elevate source code from "one ingest adapter" to a peer substrate alongside git history.

**Current state:** `packages/engram-core/src/ingest/source/` exists (walker, parser, extractors, tree-sitter grammars) and recent commits (`b05ddd0`, `ed5be2e`, `7efd2c2`) have been hardening its reconcile path.

**What "first-class" means concretely:**

1. **Default on.** `engram init` walks the working tree and ingests source on first run, not behind an opt-in flag.
2. **Ranked alongside commit-derived entities.** Retrieval must not filter by source type; symbol entities compete on the same axes as commit entities for context assembly.
3. **Projection kinds can target source entities directly.** A question like "what does `supersedeEdge` actually do today" should resolve through source entities joined to blame-linked commits, not through either substrate in isolation.
4. **Incremental ingest on file change.** The `on_file_edit` harness hook triggers incremental re-ingest for the changed file(s), bounded by the settings in D6.

**How to verify:** run `engram context "what does reconcile do"` against this repo after the pivot. The result must include both the source entity for `reconcile()` and the commit history that shaped it, assembled in one pack.

### D5. Narrative projections as new kind-catalog entries

**Decision:** add narrative projection kinds to the existing kind catalog at `packages/engram-core/src/ai/kinds/`. Do not build a wiki product.

**New kinds:**

| Kind | Inputs | Output |
|------|--------|--------|
| `module_overview` | Source entities in a module + blame-linked commits + touching PRs | 2-3 paragraph explanation: what the module does, why it exists, known tradeoffs |
| `architectural_role` | A service/subsystem entity + its cross-module edges | How this fits the larger system |
| `change_rationale` | A set of commits + linked PR discussions for a subsystem | Narrative of why things are the way they are |
| `concept_explanation` | Entities tagged with a concept (e.g. "supersession") | How the concept works in this codebase specifically |

**Trust discipline:** narrative projections are `inferred`, not `observed`. `engram context` output must mark them as generated and surface the grounding episodes. Never present narrative as fact.

**Differentiator:** the projection staleness plumbing already built catches narrative rot automatically. `module_overview` whose input fingerprint stops matching source entities returns `stale: true, stale_reason: 'input_content_changed'`. Nobody in the wiki space ships this.

**Explicit non-goals:**
- No browsable HTML UI.
- No exhaustive coverage mandate. Generate on demand, cache, regenerate only when stale.
- No "render the whole wiki" as a product surface. A `engram render --kind=module_overview > wiki.md` one-liner can exist for users who want to dump the corpus, but it is a convenience, not a feature.

### D6. Cost and performance bounds

**Observation:** initial reconcile over a codebase (especially with narrative projections enabled) is the dominant cost. Incremental reconcile is manageable but must be bounded to avoid pathological cases (e.g. a rename sweep invalidating hundreds of narrative projections at once).

**Settings to add** (surfaced in `engram init` config and overridable per-command):

| Setting | Purpose | Default |
|---------|---------|---------|
| `reconcile.maxNarrativeRegenerations` | Max narrative projections regenerated per reconcile run; remainder queued for subsequent runs | `5` |
| `reconcile.narrativeBudgetTokens` | Upper bound on LLM tokens spent per reconcile run on narrative generation | `50000` |
| `reconcile.initial.generateNarrative` | Whether initial reconcile generates narrative projections at all, or defers them to lazy-on-first-read | `false` (defer) |
| `context.assembleTokenBudget` | Token budget for `engram context` output | `8000` |

**Lazy-on-first-read** is the most important knob. Narrative projections should default to generate-on-demand: the first `engram context` query that touches a module triggers generation of its `module_overview`. Subsequent queries hit the cache until staleness flips it. This turns the "expensive initial reconcile" problem into "slightly slower first query for a new module," which is a much better UX tradeoff.

### D7. Elevate `engram context` as the single stable primitive

**Decision:** `engram context <query>` becomes the one CLI entry point that harness plugins, skills, and humans all route through.

**Contract** (proposed, to be pressure-tested in Phase 1):

```
engram context <query> [options]

Options:
  --token-budget N      Max tokens in the assembled pack (default from config)
  --include-narrative   Include narrative projections when available (default: true)
  --format <json|md>    Output format (default: md)
  --anchors <ids>       Pre-selected entity IDs to anchor assembly on
```

**Output contents:**
- Ranked entities (observed, inferred, asserted distinguished)
- Relevant edges with validity windows
- Evidence excerpts with episode source refs
- Narrative projections for anchor modules, when available
- Per-item `stale` and `stale_reason` flags
- An explicit budget accounting block (tokens used, items truncated)

This is the primitive. Everything — harness plugins, skills, ad-hoc CLI use — calls this one command.

## Out of scope / explicit nos

- **No HTML wiki UI.** Markdown output through `engram context` only.
- **No MCP layer of any kind.** Not just `engram-mcp`; no new MCP server is on the roadmap.
- **No exhaustive narrative coverage.** Lazy on demand, cached, stale-aware.
- **No changes to the temporal model.** Half-open intervals, atomic supersession, and edge kinds are the existing foundation and are correct.
- **No new benchmark package.** Stale-knowledge scenarios live as integration tests.
- **No Claude Code-only plugin.** The plugin-core abstraction must exist before the first adapter lands, even if only one adapter exists at first.

## Sequencing

Order matters. Deletions come last. Each phase should end with something working end-to-end, not in a half-migrated state.

### Phase 1 — Foundation

1. Audit source ingest against the D4 "first-class" criteria. Close any gaps (e.g. retrieval filters, `init` default behavior).
2. Implement `engram context <query>` as the single assembly primitive. Pressure-test its contract against this repo and one external repo.
3. **Execute the narrative projection experiment (see Gate G1 below).** This is a blocking gate on Phase 2. The experiment produces a go/no-go/adjust decision on D5 before any plugin work begins.

## Gate G1 — Narrative projection viability experiment

A blocking experiment on the path from Phase 1 to Phase 2. Its output is a decision that either confirms D5 as designed, adjusts D5 in a pre-specified way, or drops D5 from the plan entirely.

### Framing note — agents always have file access

All real harnesses (Gemini CLI, Claude Code, Cursor, Copilot) are agentic: they will search and read files when answering a question regardless of what else is in the prompt. Testing "engram context vs. no codebase access" is a straw man — that condition never exists in production. The meaningful comparison is:

- **Condition A**: agent answers from scratch via raw file search (grep, glob, read)
- **Condition B**: agent is handed a pre-assembled, ranked, evidence-linked engram pack and can optionally still search

### Primary hypothesis

For "why" questions (why does this exist, how does it fit the system, what tradeoffs does it make), a pre-assembled engram structural pack produces noticeably better answers than raw agentic file search alone — specifically by surfacing commit-history rationale and design decision evidence that grep-based search buries or misses entirely.

If this hypothesis is false, `engram context` is just a slower grep. If it is true, the pack is load-bearing for the harness integration and narrative projections (D5) will compound the lift further.

### Secondary hypotheses

| # | Hypothesis | Measurement |
|---|------------|-------------|
| H2 | Generation cost is justifiable | <$0.10, <30s latency, <8k output tokens per `module_overview` on a representative module |
| H3 | Output is grounded | Every substantive sentence in the narrative traceable to an input episode or source entity; no hallucinated claims |
| H4 | Generation is stable enough to cache | Two generations against the same input fingerprint produce semantically equivalent outputs |
| H5 | Staleness flips correctly | Modifying one input source file + running reconcile flips the affected `module_overview` to `stale: true` with `stale_reason: 'input_content_changed'` |

H2–H5 are necessary but not sufficient. H1 is the one that matters. H2–H5 apply to the narrative projection (D5) layer; H1 must first be confirmed for the structural pack before D5 is worth building.

### Method

1. **Select 3 modules of varying complexity** from this repo:
   - Small: `packages/engram-core/src/temporal/`
   - Medium: `packages/engram-core/src/graph/reconcile.ts` and immediate neighborhood
   - Large: `packages/engram-core/src/ingest/source/`
2. **Write 3 "why" questions per module** — questions a coding agent would plausibly need to answer to work in that area. ~9 questions total. Record them before any prompting, so the evaluator can't unconsciously tune the experiment to favor the pack.
3. **For each question, make two calls to Gemini CLI** — each a fresh subprocess with no shared context window:
   - **Condition A**: bare question only (agent uses raw file search)
   - **Condition B**: question + engram structural pack prepended (agent may also search, but pack is already in context)
4. **Side-by-side grading** of each answer pair on a 3-point scale: pack clearly helps / no meaningful difference / pack adds noise. Focus on whether the pack surfaces commit-history rationale or design decisions that raw search would have missed or taken longer to find.
5. **Note pack retrieval failures** — questions where `engram context` returns 0 or near-0 results are retrieval bugs, not evidence that the pack concept fails.

All experiment outputs — questions, packs, answers, grades — get captured in `docs/internal/experiments/g1-narrative-projection/` for later reference. Not committed to the plan; committed to the experiment folder.

### Decision branches

The experiment produces one of five outcomes. Each has a pre-specified response so the post-experiment debate is about "which branch did we land in" rather than "what should we do now."

**Branch A — Full success.** H1 confirmed on ≥6 of 9 questions. H2–H5 all pass.
→ **Commit to D5 as designed.** Proceed to Phase 2. The kind catalog gets all four narrative kinds from D5.

**Branch B — Partial: narrative helps selectively.** H1 confirmed on <6 of 9 questions but with a clear pattern (e.g. helps on large modules but not small ones, helps on "why" but not "what"). H2–H5 all pass.
→ **D5 stays but narrative is conditional.** Add routing logic to `engram context`: narrative is suppressed for question classes where it doesn't help. Kind catalog still gets the four kinds. The `--include-narrative` flag becomes nuanced rather than a simple on/off. Retrieval ranking learns from the question shape.

**Branch C — Cost problem.** H1 confirmed but H2 fails (cost >3x budget).
→ **D5 ships as opt-in, not default.** Kind catalog still gets the four kinds. `engram context` does not auto-include narrative; users request it explicitly. The harness-plugin `on_user_prompt` hook does not call narrative by default. Revisit automatic inclusion when models get cheaper.

**Branch D — Grounding problem.** H1 confirmed and H2 passes but H3 fails (hallucinations outside evidence).
→ **Block D5 for one round of fixes.** Try: stronger prompt constraints on the narrative kinds, post-generation verification pass that checks each claim against input evidence, or stricter binding of the input fingerprint set. If a second round of grounding checks still fails, demote to Branch E. This is the branch that also raises broader questions about `inferred` edge-kind trust — a grounding failure here is a signal about the projection model generally.

**Branch E — Full failure.** H1 false across the board, or unfixable H3 failures, or H2 fundamentally wrong.
→ **Drop D5.** Remove narrative kinds from the plan. Delete the experimental kind catalog entries. Update the strategic thesis section to remove the "narrative as a projection kind" pillar. Ship temporal + evidence + staleness as the whole differentiator story — still a defensible position. Phase 2 proceeds without narrative.

### Exit criteria

The gate is cleared (in any branch A–D) when:
- All 9 questions have been graded
- Cost/latency instrumentation has produced numbers for at least 3 projections across the three module sizes
- Grounding spot-check has been run on at least 3 projections
- Staleness smoke test has been run
- A branch decision is recorded in `docs/internal/experiments/g1-narrative-projection/decision.md` with evidence

Branch E short-circuits Phase 2: the plan gets amended before any plugin work begins.

### Time budget

This experiment should take 1–2 focused sessions, not a week. If it's taking longer, the design is wrong or the infrastructure isn't ready (e.g. `engram context` itself isn't producing stable output). In that case, stop and fix the infrastructure first — don't let gate execution drift into infrastructure work.

### Phase 2 — Plugin core + Gemini CLI adapter

1. Design `engram-plugin-core` hook API in concrete TypeScript types. Names, payloads, return semantics.
2. Build `engram-plugin-gemini-cli` as the first adapter. Dogfood it for real work for at least a week.
3. Capture friction in the hook abstraction while building the adapter; refine the neutral API before any second adapter begins.

### Phase 3 — Decommission

1. Delete `packages/engram-mcp/`. Update `CLAUDE.md`, `README.md`, and any spec references.
2. Delete `packages/engramark/`. Relocate stale-knowledge scenarios per D2. Drop the two engramark specs.
3. Remove `docs/internal/specs/mcp-graph-traversal-tools.md`.
4. Ensure `bun test` and `bun run build` pass clean against the trimmed workspace.

### Phase 4 — Second harness adapter

1. Build `engram-plugin-claude-code` against the already-hardened hook API.
2. Ship both plugins through the release process once the abstraction has survived two real adapters.

OpenCode is a "when someone asks or contributes" item, not scheduled work.

## Open questions (to resolve via experiment, not debate)

1. **Narrative projection viability.** Covered by Gate G1. Not re-listed here.
2. **Gemini CLI hook surface.** Does Gemini CLI expose enough lifecycle events to implement all five harness-neutral hooks, or will the first adapter land partial? Affects the Phase 2 shape.
3. **`engram context` pack size.** At what token budget does the assembled pack stop adding signal and start adding noise? The right default comes from measurement, not guess.
4. **Staleness propagation latency.** When `on_file_edit` fires, how fast does the eager stale-marking actually propagate? If it's slow enough to matter, projections might need a debounced in-memory staleness overlay.
5. **Kind catalog override ergonomics.** Narrative kinds will want per-project tuning. Does the existing `$XDG_CONFIG_HOME/engram/kinds/` override path handle prompt customization well, or does it need a second override layer for per-project templates?

## Success criteria

This pivot has worked if, by the end of Phase 2:

1. `engram context "<any question about this repo>"` returns a pack that is actually what a coding agent needs, grounded in evidence, with correct stale flags — better than what Gemini CLI produces without engram.
2. Gemini CLI with the engram plugin installed produces demonstrably better answers on at least three real tasks in this repo than Gemini CLI without it. "Demonstrably" = side-by-side comparison, subjective but clear.
3. Initial reconcile on a fresh clone completes in under 5 minutes for this repo with narrative generation deferred, and in under 20 minutes with narrative generation eager (generous ceiling — aim lower).
4. Incremental reconcile on a single file edit completes in under 10 seconds and correctly flips only the affected projections to stale.
5. Stale-knowledge integration tests still pass after the engramark relocation, with the F1 score documented somewhere stable (probably `docs/internal/STATUS.md`).

The pivot has failed if, at the end of Phase 1, narrative projections are either unusably expensive or unusably generic. In that case: keep the plugin work, drop D5, ship temporal + evidence + staleness without narrative as the whole story.

## Documentation changes this pivot requires

When the pivot executes, the following docs need updates:

- `CLAUDE.md` — three-layer architecture section, file organization tree, MCP tools table (deleted), ingestion architecture (source code elevated), key files table.
- `README.md` — remove MCP references, update quick start, frame source code ingestion as default.
- `docs/internal/VISION.md` — reconcile with the "engine decides, model executes" framing if not already there.
- `docs/internal/DECISIONS.md` — add ADRs for D1–D7.
- `docs/internal/LIFECYCLE.md` — add harness plugin lifecycle events.
- `docs/internal/specs/projections.md` — add narrative projection kinds section.
- `docs/internal/specs/source-ingestion.md` — reflect first-class status.
- New: `docs/internal/specs/harness-plugin-core.md` — full API spec once Phase 2 stabilizes.
- Deleted: `docs/internal/specs/mcp-graph-traversal-tools.md`, `docs/internal/specs/engramark-ai-benchmarking.md`, `docs/internal/specs/engramark-stale-knowledge.md` (or merged into projections spec).

## One-line summary

Rip MCP and engramark, add a harness-neutral plugin layer starting with Gemini CLI, elevate source code to a peer substrate, add narrative projections as a new kind with staleness built in, and make `engram context` the single stable primitive everything routes through.
