# EngRAMark — Stale-Knowledge Detection Benchmark — Spec

**Phase**: 2
**Status**: Specified
**Proposed**: 2026-04-10
**Vision fit**: Establishes the benchmark category unique to Engram — stale-knowledge detection over substrate evolution. Static-snapshot tools structurally cannot compete on this axis. ADR-002 names it explicitly as a moat: "author projections at commit X, advance the substrate to commit Y, measure how well `reconcile` identifies what changed."
**Companion specs**: [`projections.md`](projections.md) — full projection-layer design. [`format-v0.2.md`](format-v0.2.md) — DDL contract. [`engramark-ai-benchmarking.md`](engramark-ai-benchmarking.md) — follow this doc's structure.

> This spec is scoped to the benchmark design only. No code changes accompany it.
> Implementation is tracked separately in issue #76.

## Strategic Rationale

EngRAMark v0.1 benchmarks retrieval quality at a single point in time: ingest a repo, ask questions, score Recall@5 and MRR. That measures whether Engram can find things. It does not measure whether Engram knows things have changed.

ADR-002 (AI-authored projection layer) adds a second capability: projections author and version synthesized beliefs over the substrate. The companion staleness invariant — every read of a projection carries `stale: boolean` computed from `input_fingerprint` drift — is only as valuable as its ability to correctly flag real-world changes. A projection that never goes stale is not fresh; it is broken.

The stale-knowledge benchmark measures that correctness. The benchmark is not about recall of the substrate; it is about whether the system correctly identifies that its own synthesized understanding has been invalidated by new events.

Three things distinguish this from any existing benchmark:

1. **Temporal axis.** The test involves two substrate states (X and Y), not one. The gap between them is the signal.
2. **Projection-layer coupling.** What is tested is not raw retrieval but the correctness of synthesized beliefs. A tool that has no projection layer cannot be scored — this benchmark structurally requires Engram or equivalent.
3. **Comparator asymmetry.** Naive RAG over a static snapshot cannot attempt stale-knowledge detection at all. Including it as a comparator makes the gap quantitative, not rhetorical.

## Dataset Shape

### Benchmark Target: Fastify Repository

The initial dataset uses the Fastify repository, consistent with the v0.1 retrieval benchmark. This reuses existing infrastructure (ingestion fixtures, ground-truth familiarity) while adding the temporal axis.

### Commit Pair: X (base), Y (head)

Two commits define the temporal window:

| Label | Git Ref | Description |
|-------|---------|-------------|
| X (base) | `v4.26.2` tag | Stable release prior to the plugin-system refactor window |
| Y (head) | `v4.28.1` tag | Post-refactor stable release (same as current v0.1 benchmark head) |

The X → Y window spans approximately 120 commits. It includes changes to the plugin system (`fastify-plugin`, `lib/pluginUtils.js`), the hooks lifecycle (`lib/hooks.js`), and the validation layer (`lib/validation.js`). These changes are documented in the Fastify changelog and verified by PR merge timestamps in the v0.1 ingest fixture.

An implementer MUST pin both refs exactly. The dataset loader records the resolved SHA at load time alongside the tag name to detect ref movement between benchmark runs.

### Dataset File Location

```
packages/engramark/src/datasets/fastify/stale-knowledge.ts
```

This is a new file alongside the existing `questions.ts`, `keyword-questions.ts`, etc.

### Ground-Truth Schema

```typescript
/** A single stale-knowledge scenario. */
export interface StaleKnowledgeScenario {
  /** Unique stable identifier for this scenario. Never reused after deletion. */
  id: string;
  /**
   * Human label for the scenario — used in reports and error messages.
   * Format: "<kind>/<anchor-slug>"
   */
  label: string;
  /** Projection kind under test. Open string set matching the kind catalog. */
  kind: string;
  /**
   * Anchor description for the implementer. The anchor is an entity, edge, or
   * topic anchor resolved from the substrate at X. The loader resolves the
   * actual anchor_id from the substrate at runtime — this field is a stable
   * human-readable description so the loader can locate the right entity.
   */
  anchor_description: string;
  /**
   * Whether this projection SHOULD be stale at Y given a projection authored at X.
   *
   * true  → should_be_stale: the projection authored at X is expected to be
   *         invalidated or superseded by Y's substrate.
   * false → should_be_fresh: the projection authored at X is expected to remain
   *         accurate at Y.
   */
  should_be_stale: boolean;
  /**
   * For should_be_stale=true: the expected stale_reason the system should surface.
   * 'input_content_changed' — a recorded input's content hash drifted.
   * 'input_deleted'         — a recorded input was redacted or invalidated.
   * 'superseded'            — reconcile should author a new version.
   * null for should_be_stale=false scenarios.
   */
  expected_stale_reason: 'input_content_changed' | 'input_deleted' | 'superseded' | null;
  /**
   * The concrete substrate change that drives staleness. Implementer uses this
   * to verify the scenario is correctly set up.
   * Format: "<type>/<ref>: <brief description>"
   * Examples: "commit/abc123: hooks refactor removes onSend filter"
   *           "entity/lib/hooks.js: co-change weight to lib/reply.js drops below threshold"
   */
  driving_change: string;
  /**
   * Optional: which reconcile phase is expected to catch this.
   * 'read_time'  — fingerprint mismatch surfaces at getProjection() without reconcile
   * 'assess'     — reconcile assess phase catches it
   * 'discover'   — only the reconcile discover phase can detect it (coverage gap)
   */
  detection_tier: 'read_time' | 'assess' | 'discover';
  /** Annotation method used to establish ground truth. */
  annotation_method: 'manual' | 'script_assisted' | 'hybrid';
  notes?: string;
}
```

### Initial Dataset: 10 Stale-Knowledge Scenarios

The following 10 scenarios constitute the initial Fastify stale-knowledge dataset. Stale and fresh scenarios are mixed to enable both precision and recall scoring.

#### Stale Scenarios (7)

| ID | Label | Kind | Anchor description | Driving change | Detection tier |
|----|-------|------|--------------------|----------------|----------------|
| `sk-001` | `entity_summary/lib-hooks.js` | `entity_summary` | Entity for `lib/hooks.js` | Multiple commits in the X→Y window refactor the hooks lifecycle, adding `onRequestAbort` hook and reorganizing the execution order. The entity summary authored at X does not mention `onRequestAbort`. | `read_time` |
| `sk-002` | `entity_summary/lib-pluginUtils.js` | `entity_summary` | Entity for `lib/pluginUtils.js` | Plugin timeout and encapsulation handling changed; several co-change relationships with `fastify.js` were added. Summary authored at X describes the pre-refactor API surface. | `read_time` |
| `sk-003` | `ownership_report/lib-validation.js` | `ownership_report` | Entity for `lib/validation.js` | Primary contributor shifts: `behemoth89@gmail.com` (Manuel Spigolon) acquires significantly more commits in the validation layer in the X→Y window, changing the ownership distribution authored at X. | `read_time` |
| `sk-004` | `entity_summary/fastify.js` | `entity_summary` | Entity for `fastify.js` (the main entry point) | Core file receives the largest number of cross-cutting changes in the window; summary authored at X describes the pre-refactor lifecycle initialization. At Y, plugin boot sequencing and `addHook` contract differs. | `read_time` |
| `sk-005` | `entity_summary/lib-reply.js` | `entity_summary` | Entity for `lib/reply.js` | Reply serialization changes in the window; `hey@gurgun.day`'s ownership footprint grows significantly. Summary's description of the serialization path is outdated by Y. | `read_time` |
| `sk-006` | `decision_page/hooks-execution-order` | `decision_page` | `decision_page` projection anchored on `lib/hooks.js` with subject "hooks execution order" | Commits in the window directly reverse the ordering of `onError` relative to `onSend` in the lifecycle. A decision page authored at X that describes the ordering is contradicted at Y. | `assess` |
| `sk-007` | `topic_cluster/plugin-system` | `topic_cluster` | `topic_cluster` projection covering the plugin subsystem (`lib/pluginUtils.js`, `fastify-plugin` interactions, encapsulation) | The cluster's coverage at X is missing `onLoad` hook interactions that become central by Y. The projection should be superseded, not just soft-refreshed. | `assess` |

#### Fresh Scenarios (3)

| ID | Label | Kind | Anchor description | Why fresh | Detection tier |
|----|-------|------|--------------------|-----------|----------------|
| `sk-008` | `entity_summary/lib-logger.js` | `entity_summary` | Entity for `lib/logger.js` | The logger module is stable across the X→Y window. No commits in the window touch `lib/logger.js` content. A projection authored at X should remain accurate. | `read_time` |
| `sk-009` | `ownership_report/test-types.test-d.ts` | `ownership_report` | Entity for `test/types/index.test-d.ts` | Type-test file has a single stable owner across the window; ownership projection authored at X remains accurate. | `read_time` |
| `sk-010` | `entity_summary/lib-wrapThenable.js` | `entity_summary` | Entity for `lib/wrapThenable.js` | Small utility with no changes in the X→Y window. Fingerprint at Y matches fingerprint at X. | `read_time` |

### Loader Contract

The dataset loader (`packages/engramark/src/datasets/fastify/stale-knowledge-loader.ts`) MUST:

1. Accept two `EngramDb` handles: `dbX` (substrate at commit X) and `dbY` (substrate at commit Y). Both are produced by `ingestGitRepo()` from the same Fastify repo clone at their respective revisions.
2. Resolve `anchor_description` to a concrete `anchor_id` from `dbX` using `resolveEntity()` by canonical name. Throw `StaleScenarioSetupError` if resolution fails — the scenario cannot be evaluated.
3. Author a projection in `dbX` for each scenario using `project()` with the scenario's `kind` and resolved anchor. The generator for the initial dataset is `anthropic:claude-opus-4-6` (configurable via `ENGRAM_BENCHMARK_MODEL`).
4. Advance the substrate: copy or re-ingest to produce `dbY`. The fingerprint check runs against `dbY`'s substrate content.
5. Return an array of `PreparedScenario` objects, one per scenario, containing the authored projection ID plus the ground-truth `should_be_stale` and `expected_stale_reason`.

The loader is deterministic given the same commit refs and model. If `SKIP_AI_BENCHMARK=1`, the loader substitutes a mock projection generator that produces fixed bodies — this allows CI to run the scoring harness without Ollama or Anthropic API access.

## Scoring Metrics

All metrics are computed from a `BenchmarkRunResult` produced by running each comparator against the same `PreparedScenario[]` array.

### Primary Metrics

#### Stale Recall

```
stale_recall = |correctly_flagged_stale| / |should_be_stale|
```

- Numerator: scenarios where `should_be_stale=true` AND the system returned `stale=true`.
- Denominator: total scenarios where `should_be_stale=true`.
- Range: [0, 1]. Target: ≥ 0.85 for the "Engram with full reconcile" comparator on the initial dataset.
- Failure mode: low recall means the system misses real staleness. This is the primary risk for end users.

#### Stale Precision

```
stale_precision = |correctly_flagged_stale| / |flagged_stale|
```

- Numerator: scenarios where `should_be_stale=true` AND the system returned `stale=true`.
- Denominator: total scenarios where the system returned `stale=true` (regardless of ground truth).
- Range: [0, 1]. Target: ≥ 0.80 for the "Engram with full reconcile" comparator.
- Failure mode: low precision means the system raises false alarms, degrading user trust.

#### Stale F1

```
stale_f1 = 2 * (stale_precision * stale_recall) / (stale_precision + stale_recall)
```

The harmonic mean. Used as the single headline metric when reporting against a baseline. CI regression threshold: ≥ 0.75 F1.

#### Reconcile Accuracy

Applies only to comparators that run `reconcile()`. For each scenario where `should_be_stale=true` and the system superseded the projection:

```
reconcile_accuracy = |correct_supersessions| / |supersession_attempts|
```

A supersession is "correct" if:
1. The new projection body correctly reflects the state at Y (assessed by the LLM grader, see Ground-Truth Construction).
2. The new projection's `valid_from` is within the ingest window of Y.
3. The old projection's `valid_until` equals the new projection's `valid_from` (half-open window invariant, same check as `verifyGraph()`).

Range: [0, 1]. Target: ≥ 0.80 for the "Engram with full reconcile" comparator.

#### Cost Per Staleness Resolved

```
cost_per_staleness_resolved = total_tokens_spent / |correctly_resolved_stale_scenarios|
```

- `total_tokens_spent`: sum of `prompt_tokens + completion_tokens` across all LLM calls made by the comparator run, as reported by the AI provider response metadata.
- `correctly_resolved_stale_scenarios`: scenarios where `should_be_stale=true` AND the system either flagged `stale=true` (for read-time comparators) OR produced a correct supersession (for reconcile comparators).
- Unit: tokens per resolved scenario. Lower is better.
- This metric does not apply to the naive-RAG comparator (no LLM projection layer).

### Computed-From Contract

For an implementer to compute these metrics from run output, the comparator runner MUST emit one `ScenarioResult` per scenario:

```typescript
interface ScenarioResult {
  scenario_id: string;
  /** Ground truth from the dataset. */
  should_be_stale: boolean;
  /** What the system returned. */
  flagged_stale: boolean;
  flagged_stale_reason?: 'input_content_changed' | 'input_deleted' | null;
  /** Whether reconcile() was called and superseded the projection. */
  superseded: boolean;
  /** Whether the supersession is correct per the LLM grader. Null if not superseded. */
  supersession_correct: boolean | null;
  /** Total tokens spent on this scenario. Null if no LLM calls were made. */
  tokens_spent: number | null;
}
```

The scoring harness in `packages/engramark/src/metrics.ts` gains a `computeStaleKnowledgeMetrics(results: ScenarioResult[])` function that computes all five metrics above from this shape. The function is pure (no I/O) and must be covered by unit tests.

### Aggregation

The benchmark report emits metrics per-comparator and per-`detection_tier`. Tier breakdown lets implementers see whether read-time detection and reconcile detection are both working, separately:

```
Comparator                    Stale Recall  Stale Precision  F1     Reconcile Acc.  Cost/Resolved
engram-full-reconcile            0.86           0.83          0.85      0.81           4,200 tok
engram-read-time-only            0.57           1.00          0.73       n/a            n/a
naive-rag                        0.00           n/a           n/a        n/a            n/a

  By tier (engram-full-reconcile):
    read_time     Recall 1.00  Precision 1.00  F1 1.00
    assess        Recall 0.50  Precision 0.50  F1 0.50
    discover      (no discover scenarios in initial dataset)
```

## Ground-Truth Construction

### Method: Hybrid (Script-Assisted + Manual Annotation)

Pure manual annotation is slow and subjective. Pure script-based annotation (e.g., "any entity whose file was touched in the X→Y window is stale") produces false positives — a comment fix touching `lib/logger.js` does not invalidate the entity summary's factual content. The initial dataset uses a hybrid approach.

#### Step 1: Script-Assisted Candidate Generation

A helper script (`packages/engramark/src/datasets/fastify/gen-stale-candidates.ts`) performs:

1. Run `git log --name-only v4.26.2..v4.28.1` to collect all files modified in the window.
2. For each modified file, look up the entity in `dbX` by canonical name.
3. Output a candidate list: `{entity_canonical_name, commit_count_in_window, files_changed_in_window}`.
4. Sort descending by `commit_count_in_window` to prioritize high-churn entities.

This produces a ranked candidate pool of ~30–50 entities. It does NOT make staleness judgments — it only surfaces candidates for the annotator to evaluate.

#### Step 2: Manual Annotation

For each top-N candidate entity (N ≈ 20 for the initial pass):

1. Author a projection at X using `engram project --kind entity_summary --anchor <entity>`.
2. Read the generated body.
3. Diff the entity's substrate state at Y (new episodes, changed edges, new co-change edges).
4. Assess: does the X-era projection body make claims that are factually wrong or significantly incomplete at Y?
   - **Yes, content wrong or substantially incomplete** → `should_be_stale=true`, `expected_stale_reason='input_content_changed'`, `detection_tier='read_time'` or `'assess'` depending on whether the inputs changed.
   - **No, projection remains accurate** → `should_be_stale=false`.
5. Record the `driving_change` field as evidence for the annotation decision.

#### Step 3: Negative Example Selection

To build the 3 fresh scenarios, manually inspect the candidate list's low end (entities with 0 commits in the window) and confirm the substrate has no changes to those entities' evidence sets. This is the ground-truth basis for `should_be_stale=false`.

#### Step 4: Annotation Review

The annotated dataset is reviewed by running `engram reconcile --dry-run` over `dbY` and checking whether the proposed supersessions align with the manually-annotated `should_be_stale=true` entries. Mismatches are investigated and used to improve either the annotation or the reconcile prompt. This is not a scoring step — it is a calibration step before the dataset is frozen.

#### Annotation Stability

Once the initial 10 scenarios are frozen (committed to `stale-knowledge.ts`), scenario IDs are stable. A scenario may be deprecated (with `deprecated: true`) but its ID is never reused. This ensures that metric trends over time are comparable.

#### LLM Grader for Reconcile Accuracy

The `reconcile_accuracy` metric requires assessing whether a newly generated projection body is factually correct given Y's substrate. This is done by an LLM grader:

- Input: the original projection at X (body text), the new projection at Y (body text), and the top-5 episodes added between X and Y for the anchor entity.
- Prompt: "Given the new evidence, does the revised projection accurately reflect the current state? Answer YES or NO with a one-sentence rationale."
- Grade: YES → `supersession_correct=true`, NO → `supersession_correct=false`.
- The grader model is configurable (default: `anthropic:claude-opus-4-6`). The grader prompt hash is recorded alongside the `ScenarioResult` so grader-prompt changes are detectable in the audit trail.
- The grader is mocked when `SKIP_AI_BENCHMARK=1`.

## Comparator Strategy

Four comparators are defined. Each implements the `StaleKnowledgeBenchmarkRunner` interface and must produce a `ScenarioResult[]` for the same `PreparedScenario[]` input.

### Comparator 1: Engram with Full Reconcile (Headline)

**File**: `packages/engramark/src/runners/stale-knowledge-full-reconcile.ts`

**What it does**:
1. Advance substrate from X to Y by ingesting the new commits.
2. Call `reconcile({ phases: ['assess', 'discover'], maxCost: configuredBudget })`.
3. For each scenario: read the projection via `getProjection()`. Record `flagged_stale` from the returned `stale` flag, and `superseded` from whether the projection has a `superseded_by` chain.
4. For superseded projections, run the LLM grader to compute `supersession_correct`.

**What it tests**: The full two-tier system — read-time fingerprint staleness plus LLM-based assessment and re-authoring.

**Weakness**: LLM cost. The `--max-cost` budget cap limits runaway spend. Cost is tracked and reported as `cost_per_staleness_resolved`.

### Comparator 2: Engram Read-Time Staleness Only (Cheap Tier)

**File**: `packages/engramark/src/runners/stale-knowledge-read-time.ts`

**What it does**:
1. Advance substrate from X to Y by ingesting the new commits.
2. For each scenario: read the projection via `getProjection()` WITHOUT calling `reconcile()`.
3. Record `flagged_stale` from the returned `stale` flag. `superseded` is always `false`. No LLM calls.

**What it tests**: The O(inputs) fingerprint check alone. This is the "cheap tier" described in ADR-002 — always-on, no LLM cost, but cannot assess whether the flagged staleness means the content is actually wrong or just cosmetically changed.

**Expected performance**: High precision on read-time-tier scenarios (sk-001 through sk-005, sk-008 through sk-010); cannot detect assess-tier scenarios (sk-006, sk-007) because those require LLM assessment to identify supersession need.

**Why include it**: Measures the value of the LLM reconcile pass. The delta in stale_recall between this comparator and the full-reconcile comparator quantifies what the LLM assessment phase contributes.

### Comparator 3: Naive RAG over Substrate Snapshot

**File**: `packages/engramark/src/runners/stale-knowledge-naive-rag.ts`

**What it does**:
1. For each scenario: run a hybrid search over `dbY` using the scenario's `anchor_description` as the query string.
2. Return top-5 substrate results (episodes and entities).
3. Record `flagged_stale=false` for all scenarios unconditionally. A snapshot RAG tool has no projection layer — it cannot answer "is my synthesized understanding stale?" It can only answer "what does the current substrate say?"

**What it tests**: Demonstrates that the stale-knowledge detection capability requires a projection layer. This comparator structurally cannot flag staleness, so it will always score `stale_recall=0.0` and `stale_precision=n/a` (no positives to evaluate). That is the intended result.

**Why include it**: Makes the benchmark's moat quantitative. The gap in stale_recall (0.00 vs. 0.86) between naive-RAG and full-reconcile is the number that distinguishes Engram from static-snapshot tools. Including it avoids the moat being rhetorical.

**Note**: Naive RAG's `stale_recall=0.0` is not a "failure" — it reflects the comparator's capabilities honestly. The benchmark report notes this explicitly to prevent misreading.

### Comparator 4 (Optional): Graphify Rebuild at Y

**File**: `packages/engramark/src/runners/stale-knowledge-graphify.ts`

**What it does**:
1. Run `graphify` (or an equivalent "rebuild the graph from scratch at Y") to produce a fresh summary of the repo at Y.
2. For each stale scenario: compare the Y-era graphify output for the anchor entity to the X-era projection body. Ask the LLM grader whether the content changed.
3. Record `flagged_stale=true` for any scenario where the grader detects content difference.

**What it tests**: A "full rebuild" comparator. Graphify-style tools detect staleness by definition (they rebuild everything), but at O(full-repo LLM) cost per run. This comparator quantifies the cost difference between "rebuild everything" and "targeted reconcile."

**Why optional**: Requires a working graphify integration and incurs high LLM cost. Excluded from CI. Run manually for comparison blog posts or competitive analyses.

**Expected performance**: High stale_recall (rebuilds everything so nothing is stale by construction), zero stale_precision by the same logic (it doesn't track what it used to believe — it just overwrites), and very high `cost_per_staleness_resolved`.

## Dataset Versioning and Stability

- The dataset file exports a `STALE_KNOWLEDGE_DATASET_VERSION = '0.1.0'` constant.
- Scenarios with `deprecated=true` are excluded from scoring but kept in the file for audit purposes.
- When a scenario is added, it gets a new stable ID. When retired, it is marked deprecated. IDs are never reused.
- The benchmark runner records `dataset_version` alongside `recorded_at` in the baseline JSON:

```json
{
  "recorded_at": "2026-04-10T00:00:00Z",
  "dataset_version": "0.1.0",
  "base_ref": "v4.26.2",
  "head_ref": "v4.28.1",
  "strategies": {
    "engram-full-reconcile": {
      "stale_recall": 0.86,
      "stale_precision": 0.83,
      "stale_f1": 0.85,
      "reconcile_accuracy": 0.81,
      "cost_per_staleness_resolved": 4200
    },
    "engram-read-time-only": {
      "stale_recall": 0.57,
      "stale_precision": 1.00,
      "stale_f1": 0.73,
      "reconcile_accuracy": null,
      "cost_per_staleness_resolved": null
    }
  }
}
```

## Dependencies

- **Internal**: projections layer (ADR-002, issue #67–#71) must be shipped. The benchmark requires `project()`, `reconcile()`, and `getProjection()` with staleness.
- **Internal**: `engramark-ai-benchmarking.md` spec infrastructure (runner registry, baseline.ts) from issue #32 — the stale-knowledge runners plug into the same runner registry.
- **External**: Anthropic API or Ollama (configurable) for projection authoring and LLM grading.
- **Blocked by**: #76 (implementation issue). This spec does not implement; it specifies.

## Acceptance Criteria (from issue #65)

- [x] Spec doc exists at `docs/internal/specs/engramark-stale-knowledge.md`
- [x] References ADR-002, projections.md, format-v0.2.md, engramark-ai-benchmarking.md
- [x] Dataset shape concrete enough for implementer to build loader without further questions
- [x] Metrics defined rigorously enough to compute from run output
- [x] Ground-truth construction method specified for initial Fastify dataset
- [x] At least one comparator runner besides "Engram with full reconcile" specified (three specified: read-time only, naive RAG, optional graphify)

## Out of Scope

- Implementation code (tracked in #76)
- `CLAUDE.md` update (deferred to implementation issue per issue #65)
- Second dataset (e.g. Kubernetes) — tracked separately
- Automatic ground-truth refresh when the Fastify repo advances beyond v4.28.1
- Benchmarking the discover phase specifically (discover scenarios are deferred to a subsequent dataset version because authoring discover-tier ground truth requires manual inspection of coverage gaps, which is a separate annotation workflow)
- Per-kind metric breakdowns beyond the tier breakdown already specified

## References

- [`docs/internal/DECISIONS.md`](../DECISIONS.md) — ADR-002: AI-authored projection layer with temporal versioning
- [`docs/internal/specs/projections.md`](projections.md) — § What this sketch buys us; stale-knowledge detection as EngRAMark moat
- [`docs/internal/specs/format-v0.2.md`](format-v0.2.md) — DDL contract for the projection layer
- [`docs/internal/specs/engramark-ai-benchmarking.md`](engramark-ai-benchmarking.md) — benchmark infrastructure this spec builds on
