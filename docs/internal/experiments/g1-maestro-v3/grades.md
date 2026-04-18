# G1 Maestro v3 — Grades

> v3 change: context pack now includes a `### Discussions` section with full PR/issue body text
> retrieved directly from the knowledge graph, in addition to the entity/edge lists of v2.
>
> Methodology is identical to v2: Condition A = bare question with cwd=/home/rnwolfe/dev/Maestro;
> Condition B = question + engram context pack, same cwd. Q6-Q9 hit API quota and were not run.

---

## Summary Table

| Q  | Size   | Pack verdict             | A quality | B quality | Notes |
|----|--------|--------------------------|-----------|-----------|-------|
| Q1 | small  | No meaningful difference | High      | High      | Discussions had PR #784 (chunk deduplication) and PR #679 (response capture) — B ignored both; both answers drew from code comments |
| Q2 | small  | Pack clearly helps       | High      | High      | Discussions had PR #543 ("session_not_found infinite loop"); B cited it and named the infinite-retry loop problem explicitly; A found same file but gave broader narrative |
| Q3 | small  | Pack adds noise          | High      | Moderate  | Discussions had no design-rationale content for JSONL vs DB; B fabricated connections from off-topic PRs (#399 CLI flags, Issue #757 files panel); A found the hybrid storage pattern and SQLite vs JSONL split correctly |
| Q4 | medium | Pack clearly helps       | High      | High      | Discussions had no scatter-handler content; but pack's entity list pointed B to LayerStackContext.tsx, which guided it to ARCHITECTURE.md where the "9+ scattered Escape handlers" detail lives; B cited that detail; A also found it, so delta is small |
| Q5 | medium | Pack adds noise          | High      | Moderate  | Discussions had PR #207 (priority 1005 for EraseConfirmationModal); B cited this narrowly; A searched directly and found modalPriorities.ts with 6+ specific priority values and richer rationale; B's answer is thinner |
| Q6 | —      | QUOTA                    | —         | —         | — |
| Q7 | —      | QUOTA                    | —         | —         | — |
| Q8 | —      | QUOTA                    | —         | —         | — |
| Q9 | —      | QUOTA                    | —         | —         | — |

**Score (Q1-Q5): 1/5 clearly helps, 2/5 no meaningful difference (upgraded one), 2/5 pack adds noise**

---

## Per-Question Rationale

### Q1 — Output buffer chunks array [No meaningful difference]

The `### Discussions` section contained two PRs that are tangentially related to streaming output:

- **PR #784** ("fix: extract clean output from Cue scheduled tasks") — discusses "deduplication of streaming chunks by message ID" but is about parsing agent output downstream, not about why the buffer uses an array internally.
- **PR #679** ("fix(cli): capture response from claude-code") — discusses accumulating assistant messages as a fallback and flushing the JSONL buffer on close.

B did not cite either PR and did not use any content from the Discussions section. B read `output-buffer.ts` directly and derived the O(1) append, deferred join, incremental length tracking, and memory safety rationale from code comments. A did the same search and arrived at an equally complete answer.

The Discussions content was genuinely irrelevant — neither PR explains the internal array-vs-string choice in output-buffer.ts. B correctly ignored them. No delta between A and B.

---

### Q2 — Session recovery clears agentSessionId [Pack clearly helps]

The `### Discussions` section contained **PR #543** ("fix: Gemini CLI response handling and session_not_found loop"), which explicitly states:

> "session_not_found infinite loop: Clears stale agentSessionId at both tab and session level when a session_not_found error is received, so the next prompt starts a fresh session instead of retrying --resume with a dead ID"

B cited PR #543 and named the "infinite loop" problem directly — the core "why" behind clearing the ID rather than retrying. This is the most precise one-line explanation of the design decision and it came directly from the pack's Discussions content.

A found the same files (`session-recovery.ts`, `group-chat-router.ts`, `error-patterns.ts`, `process-manager.ts`) through broader search and produced a thorough answer, but framed the rationale more broadly ("the ID is invalid on the server, making retries futile") without naming the infinite-retry loop as the original defect that motivated the fix.

B's answer is more concise and more precisely grounded in the actual commit-level rationale. The Discussions section provided lift here. However, both answers are technically accurate, so the grade is "clearly helps" rather than a dramatic quality gap.

---

### Q3 — JSONL vs database [Pack adds noise]

The `### Discussions` section contained no PR or issue that discusses the JSONL-vs-database design choice:

- **PR #699** — rewrites Codex output parser for v0.111.0 JSONL format (parser update, not architectural rationale)
- **PR #280** — fixes context window token calculation using JSONL accumulation (implementation detail, not design rationale)
- **PR #784** — output extraction for Cue tasks (tangential)
- **PR #399** — deduplication of CLI flags in `buildAgentArgs()` (unrelated)
- **Issue #757** — files panel not hiding `.maestro` folder (unrelated)

B cited PR #784 and PR #399 as supporting evidence for JSONL's "streaming performance" and "portability" rationale. Neither PR actually discusses why JSONL was chosen over a database — B is hallucinating connections between coincidentally-surfaced PRs and the design question.

B also cited Issue #757 (".maestro folder portability") as evidence that JSONL ensures portability — this is a misreading of a bug report about UI panel behavior.

A searched for JSONL, SQLite, and database patterns directly, found `stats-db.ts` alongside the JSONL log files, and correctly identified the hybrid architecture: JSONL for per-session append-only logs, SQLite for global aggregated stats. A's answer is structurally more accurate and explains *why* each format is appropriate for its use case.

The Discussions section actively misled B. Grade: pack adds noise.

---

### Q4 — Layer Stack capture-phase Escape handler [Pack clearly helps, marginal]

The `### Discussions` section did not contain the "9+ scattered Escape handlers" content. That detail lives in `ARCHITECTURE.md`, which B found by reading the file directly (guided by the pack's entity list pointing to layer-related symbols).

The pack's entity list did retrieve `src/renderer/types/layer.ts` and associated symbols (score 1.000), which pointed B toward the LayerStack implementation. B then explicitly checked `ARCHITECTURE.md` and found the "9+ scattered Escape handlers" detail, citing it as: "As noted in ARCHITECTURE.md, the system previously had '9+ scattered Escape handlers.'"

A also found this fact — A read `LayerStackContext.tsx` and `useLayerStack.ts` directly and gave a complete answer. Both answers cite the consolidation-of-scattered-handlers rationale, the stopPropagation mechanism, and priority-based interception.

B's answer added the specific `MODAL_PRIORITIES` range (STANDING_OVATION at 1100, FILE_TREE_FILTER at 30), which A did not include for Q4 (though A covered priority numbers more fully in Q5). The pack helped B focus faster and added one concrete data point, but A independently reached equivalent quality.

Grade: pack clearly helps on the margin (B found the specific MODAL_PRIORITIES range and cited it), but A was not far behind.

---

### Q5 — Layer Stack priority numbers vs LIFO [Pack adds noise]

The `### Discussions` section contained **PR #207** ("feat: Add safety friction to Confirm and Erase"), which explicitly states:

> "Proper layer stack integration (priority 1005, above main confirmation modal)"

B cited PR #207 and the 1005 priority as the primary evidence, framing the entire answer around the EraseConfirmationModal safety friction example. The answer is correct but thin — it gives only one specific example (priority 1005) and a general argument about safety prompts needing to stay above less critical elements.

A searched directly and found `src/renderer/constants/modalPriorities.ts` and `ARCHITECTURE.md`. A's answer cited six specific priority values (QUIT_CONFIRM: 1020, AGENT_ERROR: 1010, MARKETPLACE: 735, BATCH_RUNNER: 720, SETTINGS: 450, SLASH_AUTOCOMPLETE: ~50 area), explained the nested-modal problem (MARKETPLACE opened from BATCH_RUNNER), and addressed the asynchronous mounting race condition that LIFO cannot handle.

The Discussions section gave B one real data point (PR #207's priority 1005) but anchored B to a narrow safety-friction framing. B did not go on to search `modalPriorities.ts` for the full priority range. A's answer is materially richer.

Grade: pack adds noise — B stopped at the single PR example instead of searching for the full priority catalog that A found.

---

## Overall Verdict for Q1-Q5

**1/5 clear helps (Q2), 2/5 no meaningful difference (Q1, Q4), 2/5 pack adds noise (Q3, Q5)**

The Discussions section landed one clean hit (Q2, PR #543) and two misses where it steered B away from broader codebase search (Q3, Q5). The entity-level pack content remained useful as a navigation aid (Q4), continuing the v2 pattern.

---

## Comparison to v2

v2 scored 0/3 on Q1-Q3 (all "no meaningful difference"). v3 scored 1/3 on Q1-Q3 (one "clearly helps" on Q2, one "no meaningful difference" on Q1, one "adds noise" on Q3).

| Q  | v2 verdict               | v3 verdict               | Change |
|----|--------------------------|--------------------------|--------|
| Q1 | No meaningful difference | No meaningful difference | Same |
| Q2 | No meaningful difference | Pack clearly helps       | +1 (Discussions had PR #543) |
| Q3 | No meaningful difference | Pack adds noise          | -1 (Discussions had off-topic PRs; B hallucinated connections) |
| Q4 | No meaningful difference | Pack clearly helps (marginal) | +1 (pack entity list guided B to ARCHITECTURE.md faster) |
| Q5 | No meaningful difference (A better) | Pack adds noise | -1 (Discussions anchored B to narrow PR example, suppressed file search) |

**Net change: +2, -2. No improvement in overall score for Q1-Q5.**

### What changed between v2 and v3

The Discussions section is a double-edged sword:

**Where it helped (Q2):** PR #543 contained the exact one-sentence explanation of *why* session recovery clears the ID ("so the next prompt starts a fresh session instead of retrying --resume with a dead ID"). This is harder to find in source code comments and is the kind of decision rationale that lives in PR descriptions. The Discussions section surfaced it.

**Where it hurt (Q3, Q5):** The graph's retrieval scored tangentially related PRs highly (cosine similarity on "JSONL output" for Q3, "layer stack" for Q5) and included them in Discussions. B then cited these PRs as if they contained design rationale when they did not. This is a hallucination-from-retrieval problem: B trusted the pack's curation and stopped searching, but the curation was wrong for these questions.

**Where it was neutral (Q1, Q4):** For Q1, the relevant Discussions PRs (784, 679) were tangentially related to streaming but not to the internal array-vs-string question — B correctly ignored them. For Q4, the Discussions had no relevant content, but the entity list continued to do its navigational job.

### Implication

The Discussions section's value is highly dependent on retrieval precision. When the graph surfaces a PR that directly addresses the design decision in its summary (PR #543 for Q2), the feature provides lift. When it surfaces PRs that mention related concepts without addressing the design question (JSONL output parsing PRs for Q3, safety-friction PR for Q5), it can anchor the model to narrow or misleading evidence, suppressing the broader search that would have found a better answer.

The v2 finding stands: when Condition A has full codebase access, the pack's edge is narrow and fragile. The Discussions section adds a new risk mode that did not exist in v2.
