# Near-Term Plan — Wow Moment

**Status:** proposed.
**Date:** 2026-04-26.
**Scope:** the next concrete cycle of work, sized to deliver one falsifiable
demonstration that engram earns its keep on a complex repository. Sequenced
behind, and consistent with, [`harness-pivot-plan.md`](harness-pivot-plan.md);
this plan picks up where that document deferred D3 behind a workflow
benchmark. (ADR-004 and ADR-005 are referenced historically here and in
`harness-pivot-plan.md`, but their bodies have not yet been backfilled into
[`DECISIONS.md`](DECISIONS.md); treat `harness-pivot-plan.md` as the current
source of truth until the ADRs land.)

## Why this exists

Engram has shipped a strong substrate (episodes, entities, edges, evidence,
temporal validity) and a partial CLI surface, but the user-visible thesis —
*invisible, high-value context injection that lets a coding agent succeed on
prompts it would otherwise fail* — is unvalidated. The harness pivot plan
identified the right shape; the work since has accreted commands and adapters
without closing the loop. This plan is one cycle of execution focused on a
single falsifiable goal, with explicit kill criteria so we can tell whether
the project's center of gravity is correct.

## Strategic frame

1. **Engine decides, model executes.** Inherited from harness-pivot-plan
   thesis #1. The CLI is the deterministic primitive; the harness hook is the
   delivery mechanism; the model is downstream of both.
2. **The CLI is an agent surface, not a human surface.** Sprawl is acceptable
   if every command is uniformly shaped for programmatic invocation
   (stable schemas, machine-readable help, predictable error codes). Compare
   `beads` and `gastown`: many verbs, but each one is a tool an agent can
   reliably pick.
3. **The wow moment is a single frozen prompt.** Not a benchmark suite, not a
   feel-good demo. One real prompt that fails today and one-shots after this
   cycle. If we cannot articulate the prompt, we cannot finish the cycle.
4. **Dogfood substrate must approximate work substrate.** Engram-on-engram is
   too small; Kubernetes is too large but *publicly available* and shaped
   like real institutional code (years of history, dispersed rationale,
   cross-team ownership). The fixture is codified in YAML so the same eval
   harness runs against IP-sensitive private repos by swapping the source
   declaration.

## Wow moment — success criterion

> A specific, named prompt — chosen and frozen before any work in this cycle
> begins — that fails badly when issued to Gemini CLI today and one-shots
> correctly when issued to Gemini CLI with the engram plugin installed.

The prompt must be:
- **Real.** Drawn from the operator's actual experience, or a publicly
  documented Kubernetes issue with a known correct outcome (a closed PR,
  resolved bug, or accepted KEP).
- **Multi-file or rationale-dependent.** A prompt that succeeds purely from
  the file the agent is editing does not exercise the differentiator.
- **Frozen.** Written into the fixture YAML at cycle start. Not edited after
  workstream evaluations begin. If the prompt turns out to be too easy or
  too hard, that is itself a result; we don't move the goal posts mid-cycle.

**Kill criterion.** If after W1–W3 ship and the prompt still fails, the
hypothesis that "evidence-backed context packs unlock failed prompts" is
weakened, and the next cycle prioritises diagnosing why over building more.
This must remain a real possibility; otherwise the goal is not falsifiable.

## Sequencing

```
W1 fixture ─┐
            ├─→ W2 projection ──→ W3 harness ──→ EVALUATE wow moment
W5 CLI shape┘                                          │
                                                       ↓
                                            W4 federation (spec only — gated)
```

Federation (W4) is **spec-only** in this cycle. Implementation depends on
whether single-`.engram` retrieval signal degrades against the fixture.

## Workstreams

### W1 — Fixture: portable evaluation harness

**Goal.** A reproducible large-repo test bed that approximates work-substrate
shape, codified in YAML so the same harness runs against private repos by
substituting the source declaration.

**Scope.**

- New directory `packages/engram-core/test/fixtures/eval/` containing one
  YAML file per fixture and a runner that materialises the fixture into a
  scratch `.engram` file.
- Ship one public fixture against a historical Kubernetes issue. Selection
  criteria: closed issue or merged PR with rich rationale (linked KEP, design
  discussion, multiple reviewers), bounded blast radius (≤ ~15 files
  touched), pinned to the parent commit so the fixture represents the world
  *before* the resolution.
- Ingestion declared in YAML: git slice, GitHub PRs/issues filtered by path,
  optional markdown sources (KEPs).
- Frozen evaluation prompt(s) in YAML. Optional ground-truth section
  (expected files touched, rationale source URLs) for future automated
  scoring; manual eyeball verdict is sufficient this cycle.

**YAML schema (proposed, pressure-test in the first fixture).**

```yaml
fixture:
  name: k8s-<subsystem>-<issue-id>
  description: One-line human description.
  source:
    type: git
    repo: https://github.com/kubernetes/kubernetes.git
    pin: <40-char-sha>          # state immediately before resolution
  slice:
    paths:
      - <path glob>
ingest:
  - kind: git
    since: <iso8601 or commit>  # bound history depth
  - kind: github
    scope:
      owner: kubernetes
      repo: kubernetes
      paths: [<path glob>]
    include: [issues, prs, review_threads]
  - kind: markdown
    source: https://github.com/kubernetes/enhancements.git
    paths: [keps/sig-<area>/**]
evaluation:
  prompts:
    - id: prompt-001
      text: |
        <verbatim prompt as a developer would type it>
      ground_truth:
        files: [<path>]                 # files a correct fix touches
        commits: [<sha>]                # commit(s) that resolved it
        rationale_sources: [<url>]      # PR/issue/KEP carrying the "why"
```

**Definition of done.**

- `bun run eval --fixture k8s-<name>` produces a deterministic
  `.engram` file from a clean checkout (cached across runs).
- Evaluation harness runs the frozen prompt against Gemini CLI twice — once
  with the engram plugin disabled, once enabled — and captures both
  responses to disk for side-by-side inspection.
- The YAML schema is documented in `docs/internal/specs/eval-fixtures.md`
  with one private-repo example (with placeholder values) showing
  IP-sensitive substitution.

**Out of scope.** Automated scoring; multi-model evaluation; statistical
significance over many prompts. One prompt, one model, one verdict.

**Open decisions.**
- Which historical Kubernetes issue. Ideally one the operator has read
  enough to recognise a "good" answer when they see it.
- Whether to vendor a shallow clone of the slice into the test fixture or
  rely on a clone-on-demand step. Vendor wins on reproducibility but bloats
  the repo; clone-on-demand wins on size but adds CI flakiness.

---

### W2 — Projection layer: ship `module_overview` end-to-end

**Goal.** Validate the AI-projection-with-stale-plumbing thesis by shipping
exactly one kind, end-to-end, against the fixture.

**Scope.**

- Kind file: `packages/engram-core/src/ai/kinds/module_overview.yaml`.
- Inputs: source-code entities in a module, blame-linked commits for those
  files, PRs/issues touching those files, linked rationale documents
  (KEPs / design docs) when available.
- Hard input cap so a single overview costs <$0.05 to generate.
- Output: 2–3 paragraph synthesis stored as a projection with full input
  fingerprint.
- Stale plumbing wired against the existing read-time invariant; surfaced in
  `engram context` packs marked `inferred` with grounding episode IDs.
- Generate-on-demand (lazy-on-first-read per pivot plan D6 default).

**Definition of done.**

- `engram context "<query about a module in the fixture>"` returns a pack
  containing a `module_overview` projection of the relevant module, marked
  `inferred`, with citations.
- Editing a substrate file in that module and re-running flips the
  projection's `stale` flag to `true` with `stale_reason:
  'input_content_changed'`. Verified in an integration test.
- The wow-moment prompt's pack contains the projection. (This is the only
  W2 output that matters for the cycle goal.)

**Out of scope this cycle.** Other projection kinds (`change_rationale`,
`architectural_role`, `concept_explanation`). They are designed in
harness-pivot-plan D5 and remain queued — but adding them dilutes the
falsifiability of the cycle. Ship one kind well first.

**Open decisions.**
- Which AI provider for the cycle: Gemini, Anthropic, or local. Default to
  Gemini for vendor alignment with the harness; the provider abstraction
  already supports swapping.
- Whether `module_overview` includes ownership signals (blame attribution
  summaries) or stays purely structural. Structural is simpler and tests the
  thesis more cleanly.

---

### W3 — Gemini CLI plugin & hooks (primary harness)

**Goal.** Invisible delivery: the developer types a prompt into Gemini CLI
and the engram pack lands in context automatically. No commands, no
remembering, no prompt-engineering instructions.

**Scope.**

- New package `packages/harnesses/core/`: harness-neutral hook surface
  (`on_session_start`, `on_user_prompt`) plus a context-assembly helper
  that wraps `engram context --format=json`.
- New package `packages/harnesses/gemini-cli/`: thin adapter (target
  <200 lines) translating Gemini CLI's native hook API to the neutral
  surface.
- **Why a new `packages/harnesses/` subtree rather than `packages/plugins/`.**
  ADR-008 reserved `packages/plugins/<name>/` for first-party *ingest*
  adapters loaded through the plugin loader (Gerrit, Google Workspace).
  Harness adapters are a different mechanism: they are loaded by the host
  agent harness (Gemini CLI, Claude Code) at session lifecycle boundaries,
  not by the engram plugin loader, and they extend runtime *delivery*
  rather than data input. Co-locating them under `packages/plugins/` would
  collide with doc tooling and plugin discovery globs and conflate two
  unrelated extension points. `packages/harnesses/` matches the term of
  art already used in `harness-pivot-plan.md` and keeps the boundary
  explicit. (Earlier drafts of the pivot plan used
  `packages/engram-plugin-*` naming; this plan supersedes that
  choice — when those packages are created they should be created under
  `packages/harnesses/`.)
- Two events implemented (others from harness-pivot-plan D3 deferred):
  - `on_session_start` — emit a compact staleness brief (what's stale,
    what's new since last session). Skipped silently if no `.engram` is
    present in the working directory.
  - `on_user_prompt` — call `engram context "$prompt"` and prepend the
    assembled pack to the model's context.
- **Slowness behaviour: skip.** A configurable deadline (default 1500 ms)
  bounds `on_user_prompt` injection. If the call does not return within
  the deadline, the injection is dropped silently and the prompt proceeds
  unmodified. Latency must never degrade the interactive experience —
  invisibility cuts both ways.
- Plugin install path documented in the README and via
  `engram companion --harness gemini-cli`. The companion command continues
  to exist as a fallback for harnesses without native plugin support.

**Definition of done.**

- The wow-moment prompt, typed unmodified into Gemini CLI inside the fixture
  working directory, produces a one-shot correct answer because the engram
  pack landed automatically. No `engram` invocation appears in the user's
  shell history during the test.
- A second test where `engram context` is artificially throttled past the
  deadline confirms the prompt still proceeds (without the pack) and the
  user sees no error.
- A third test confirms the plugin loads cleanly when no `.engram` exists,
  and emits no spurious context.

**Out of scope.** Claude Code, Antigravity, Jetski, OpenCode adapters.
The neutral layer must stay neutral — a second adapter is the cleanest way
to test that — but is deferred to the next cycle. `on_before_compact`,
`on_file_edit`, `on_session_end` are deferred behind validation that the
two-event surface delivers the wow moment.

**Open decisions.**
- Exact Gemini CLI hook surface as of current release. The plan assumes
  some `UserPromptSubmit`-equivalent exists; if not, fallback is a wrapper
  shell function and a documented "not yet native" caveat.
- Whether the plugin auto-discovers the working `.engram` or requires
  explicit configuration. Auto-discovery is more invisible; explicit config
  is more predictable. Default to auto-discovery with an env-var override.

---

### W4 — Federation spec (spec only, no implementation)

**Goal.** Decide on paper how engram serves "many teams, one monorepo"
before substrate decisions in W2/W3 foreclose the answer.

**Scope.**

- New doc `docs/internal/specs/federation.md`.
- Decide between two architectures:
  - **Per-package `.engram` files** with a manifest at repo root listing
    them. `engram context` fans out to relevant files based on query →
    file-path heuristics.
  - **Single `.engram` with scope tags** on every entity, edge, and episode.
    Packs filter by scope at retrieval time.
- Resolve, in writing:
  - Cross-team queries (e.g. "who owns X" where X is in another team's
    package).
  - Ownership of the `.engram` file(s): committed to repo, per-developer,
    or hybrid.
  - How temporal queries (`--as-of`) compose across federated files.
  - How projections (W2) reference inputs that may live in another file.

**Definition of done.**

- Spec ships with a recommendation, the rejected alternative documented,
  and an explicit list of substrate changes required to implement.
- Substrate changes (if any) are enumerated as candidate v0.4 work items
  but not started.
- A short "is the substrate as-of this PR federation-friendly" review of
  W2/W3 changes is appended; if anything in W2/W3 forecloses the
  recommended architecture, raise it before merging the projection PR.

**Out of scope.** Implementation. Tribal merge / multi-author conflict
resolution. Cross-developer `.engram` synchronisation.

---

### W5 — CLI as agent surface

**Goal.** Treat the CLI as a programmatic API consumed by agents. Sprawl is
fine; *uneven shape* is not. Existing commands stay; uniformity becomes
required.

**Scope.**

- Every command supports `--format=json` with a documented stable schema.
- Standard exit codes across commands:
  - `0` success
  - `1` user error (bad input, missing arg)
  - `2` system error (substrate corrupted, dependency missing)
  - `3` retry-recommended (transient: rate limit, network)
- `engram --list-tools` returns a machine-readable command catalogue:
  name, description, args, flags, output schema reference. This becomes
  the discovery surface for agents that don't scrape `--help`.
- A short style guide `docs/internal/specs/cli-as-agent-surface.md`
  capturing the conventions, applied as a lint check in CI for new
  commands.

**Definition of done.**

- Agent given only `engram --list-tools` output composes an
  ingest → context → show sequence against the fixture without reading
  prose docs. Verified once manually with Gemini CLI.
- New-command lint check in CI rejects commands missing
  `--format=json` or stable exit-code mapping.

**Out of scope.** Adding new commands. Removing existing commands.
Renaming. The shape work is mechanical; the catalogue is the deliverable.

## Explicit kills for this cycle

These remain valuable in the abstract; they actively dilute the cycle:

- **No new top-level narrative commands.** `brief`, `why`, `onboard`,
  `whats-new`, `update` exist; they are not extended. Future narrative
  surfaces fold into `engram context --mode=...` or projection kinds.
- **No new ingestion adapters.** Adapter coverage without the synthesis
  layer is dilution. Buganizer / Jira / Linear / Confluence stay queued.
- **No web UI / `engram visualize` work.** Zero contribution to the wow
  moment.
- **No MCP server work.** ADR-005 settled this; restating to forestall
  drift.
- **No projection kinds beyond `module_overview`.** Pivot plan D5 lists four;
  three of them wait.

## Open questions across the plan

1. **Frozen prompt — what is it?** Without this, W1 evaluation is
   hand-wavy and the cycle has no scoreboard. This must be answered
   before W1 starts.
2. **Historical Kubernetes issue — which one?** Ideally one the operator
   has enough context on to judge the agent's answer correctly.
3. **Exact Gemini CLI hook surface** as of the targeted release.
4. **AI provider for `module_overview`** — Gemini for vendor alignment,
   Anthropic for capability, local for cost. The decision affects W2's
   prompt engineering choices.

## Cycle exit

This cycle exits when one of:

- **Win.** The wow-moment prompt one-shots through Gemini CLI with the
  engram plugin against the fixture. Followed by: write up what worked,
  pick the next prompt, plan the next cycle (likely a second harness
  adapter or the next projection kind).
- **Loss.** Workstreams W1–W3 ship and the prompt still fails. Followed
  by: a written diagnosis of which step broke (insufficient pack content?
  pack present but unused? prompt not actually answerable from the
  available substrate?) and a corrected hypothesis for the next cycle.
  Federation, additional projection kinds, and additional harnesses are
  re-prioritised against the diagnosis.

Either outcome is informative. A null result is a result.
