# G2 Pack + Companion — Grades

> G2 tests two improvements over the v3 baseline. Condition B replaces the v3 Discussions section with Phase 1 improvements: a vector episode track, confidence-scored PR/issue entries, structural edge augmentation, and reframed section headers ("Possibly relevant discussions — verify before citing", "Structural signals — verify before citing"). Condition C adds a companion prompt prepended before the question that teaches the agent how to interpret each pack section — when to trust discussions, when to be skeptical, and how to use structural signals as navigation aids rather than authority. The baseline is v3 Condition A (bare Gemini, cwd=Maestro). Q6-Q9 were never run in v3 (quota exhausted); the A-baseline for these questions is estimated from what a capable LLM would produce without any context pack.

---

## Summary Table

| Q  | Size   | Pack verdict (B vs A)         | Companion verdict (C vs B)    | B quality | C quality | Notes |
|----|--------|-------------------------------|-------------------------------|-----------|-----------|-------|
| Q1 | small  | No meaningful difference      | No meaningful difference      | High      | High      | Both correctly derived the O(1)/O(n) rationale from code comments; B cited PR #784 for deduplication but only as supporting color, not as the design rationale; C similarly reasonable |
| Q2 | small  | Pack clearly helps            | No meaningful difference      | High      | High      | Both B and C cited PR #543 and named the infinite-retry loop; C slightly more detailed in the multi-step recovery description but not materially better |
| Q3 | small  | No meaningful difference (improved from v3) | No meaningful difference | Moderate  | Moderate  | Neither B nor C cited off-topic PRs as JSONL design rationale (improvement over v3-B); both fabricated plausible-sounding but unverified explanations instead; parallel failure mode rather than regression |
| Q4 | medium | No meaningful difference      | No meaningful difference      | Moderate  | Moderate  | Both B and C gave structurally correct answers about capture-phase event interception but did not cite the "9+ scattered Escape handlers" detail from ARCHITECTURE.md; pack's Discussions didn't contain the relevant content |
| Q5 | medium | No meaningful difference (improved from v3) | Pack adds noise (regression) | Moderate  | Moderate  | B had a tool error mid-answer but still searched for modalPriorities.ts and cited 6+ priority values; C cited PR #207 (priority 1005) as the anchor and added PR #789's UI-PATTERNS.md reference; neither is as rich as v3-A |
| Q6 | medium | No meaningful difference      | No meaningful difference      | Moderate  | Moderate  | Both produced correct dual-spawner architecture reasoning; B slightly more verbose with concrete file names (PtySpawner.ts, ChildProcessSpawner) but both answers are generic LLM-derivable from architecture knowledge |
| Q7 | large  | No meaningful difference      | No meaningful difference      | Moderate  | Moderate  | Both correctly identified CLI-process boundaries and @mention-as-routing-protocol; C's "observable behavior over internal control" principle framing is a nice touch but not grounded in a cited source |
| Q8 | large  | No meaningful difference      | No meaningful difference      | High      | High      | Both produced strong answers with accurate four-part rationale (ephemeral state, event loop, process-bound lifetime, singleton pattern); pack had no marginal value over code-derived reasoning |
| Q9 | large  | No meaningful difference      | No meaningful difference      | Moderate  | Moderate  | Both produced correct cross-process reasoning; neither cited a PR or issue with the actual design decision; answers are plausible but not verified by pack evidence |

**Score (B vs A): 1/9 clearly helps, 8/9 no meaningful difference, 0/9 B adds noise**
**Companion (C vs B): 0/9 C clearly helps, 8/9 no meaningful difference, 1/9 C hurts**

---

## Per-Question Rationale

### Q1 — Output buffer chunks array [No meaningful difference]

The Phase 1 pack for Q1 contained six PR hits. The top two — PR #784 (chunk deduplication in Cue output extraction) and PR #679 (CLI response capture with JSONL buffer flush) — are the same PRs that appeared in the v3 pack and were correctly ignored by v3-B. The pack also added PR #226 (module extraction that created output-buffer.ts as a distinct file), PR #410 (auto-scroll with MutationObserver), PR #499 (OpenCode text routing), and PR #435 (Gemini CLI integration). The structural signals section added precise module-to-symbol edges for output-buffer.ts. The evidence excerpts included the source comment explaining O(1) append performance directly.

Condition B read output-buffer.ts directly, found the source comment explaining O(1) append vs O(n) string concatenation, the 10MB MAX_GROUP_CHAT_BUFFER_SIZE limit, and the deduplication/routing rationale. B cited PR #784 once — but only to color the deduplication point, not as design rationale for the array choice. This is appropriate behavior: B used the Discussions as supporting context rather than as authority. The answer quality is high and matches v3-A.

Condition C produced an almost identical answer. C cited PR #784 and PR #679 briefly for the deduplication and buffer-flush context, and found the same source comment. The companion framing did not change behavior materially — B had already handled the Discussions correctly. C's answer is slightly more concise than B's but equally accurate.

The "verify before citing" framing in the pack header and the companion prompt were both irrelevant here because neither B nor C was at risk of over-citing these PRs. The structural signals section (module-to-symbol edges) provided no lift for this question since the agent navigated directly to output-buffer.ts from the entity list. Grade: no meaningful difference for both B and C.

---

### Q2 — Session recovery clears agentSessionId [Pack clearly helps / No meaningful difference for C vs B]

The Phase 1 pack for Q2 contained six PR hits. PR #543 ("Gemini CLI response handling and session_not_found loop") appeared fifth at confidence 0.881 — lower than in v3 where it was likely near the top. Above it were PR #412 (session restoration hook extraction), PR #435 (Gemini CLI integration), PR #74 (Thinking toggle), PR #224 (preload modularization), and PR #461 (Files panel hang). Only PR #543 is directly relevant to the question. The structural signals section added module-level edges for session-recovery.ts.

Condition B cited PR #543 explicitly and named the "infinite retry loop" as the core motivation. B also read session-recovery.ts and described the three-step recovery process (detect → clear ID → rebuild context via buildRecoveryContext). The answer correctly frames the design decision as preventing infinite failure loops rather than just describing the mechanics. This is the same "clearly helps" pattern observed in v3.

Condition C cited PR #543 as well, providing nearly identical rationale ("retrying the command using the same ID with the --resume flag resulted in continuous failure loop"). C went slightly further in describing the multi-step re-spawning process with numbered steps. The answers are substantively equivalent — C did not gain from the companion prompt because B had already handled this question well.

The critical observation is that PR #543 appeared fifth in the pack (confidence 0.881, not 1.000), yet both B and C still found and used it correctly. This suggests the confidence-scored ranking did not suppress the relevant PR enough to hurt. The pack's framing ("verify before citing") may have encouraged B/C to at least skim multiple discussions rather than stopping at the top hit — though it's unclear whether this mattered since PR #543 was unambiguous. Grade: pack clearly helps (both conditions, same as v3), no meaningful difference between B and C.

---

### Q3 — JSONL vs database [No meaningful difference — improved from v3]

The Phase 1 pack for Q3 contained the same core PRs that caused v3-B to hallucinate: PR #699 (Codex JSONL parser rewrite), PR #280 (context window token calculation), PR #784 (Cue output extraction), PR #399 (CLI flag deduplication), PR #274 (Windows stdin workaround), and PR #270 (inline wizard Windows fix). Issue #757 (.maestro folder hide bug) also appeared. None of these contain design rationale for why JSONL was chosen over a database. The pack header now labels these "Possibly relevant discussions — verify before citing."

This is the critical regression question from v3. In v3-B, the agent cited PR #784 and PR #399 as if they contained JSONL design rationale, and cited Issue #757's .maestro folder visibility as evidence of "portability." That was hallucination-from-retrieval.

Condition B did not repeat v3-B's specific citation errors. B did not cite PR #399 or Issue #757 as design rationale. Instead, B constructed a different answer: citing PR #699 as evidence that agents emit JSONL natively, and making a general argument about streaming resilience, local-file portability, and line-by-line parsing efficiency. These points are plausible but not verified by the pack's contents — PR #699 is about a parser compatibility fix, not an explanation of why JSONL was chosen architecturally. B also cited Issue #757 for a different angle (storing data in `.maestro` folder = JSONL files avoid database overhead), which is still a misreading of a bug report. The failure mode shifted from "cite PRs as rationale they don't contain" to "construct plausible rationale from circumstantial signals." Both are forms of hallucination-from-retrieval, but B's version is less egregiously wrong.

Condition C produced a very similar answer to B. C cited PR #699 and PR #784 as evidence of JSONL's streaming alignment with agents. C also cited Issue #205 (conversation forking) as evidence that JSONL enables event-stream replay for forking — which is a plausible point but Issue #205 is a feature request, not design documentation. C's citation of PR #270's `--input-format stream-json` flag as evidence that JSONL is an architectural requirement is the same kind of circumstantial reasoning B employed.

The companion prompt's "verify before citing" instruction appears to have reduced the most egregious misreadings (neither B nor C cited Issue #757 as "portability rationale" in the same way v3-B did), but did not prevent both conditions from confabulating an architectural narrative from circumstantially related PRs. The improvement is real but the underlying problem — no PR in the pack actually addresses the design question — persists. Grade: no meaningful difference (improved from v3's "adds noise" but still not correct). C offers no additional improvement over B.

---

### Q4 — Layer Stack capture-phase Escape handler [No meaningful difference]

The Phase 1 pack for Q4 contained six PR hits: PR #789 (agent guides documentation, confidence 1.000), PR #742 (Cue UI hardening), PR #312 (Zustand modal store migration), PR #240 (process listener extraction), PR #823 (canonical shared hooks migration), and PR #559 (group chat enhancements). None of these directly explains why capture-phase event listening was chosen for the Escape handler. The entity list correctly pointed to `src/renderer/types/layer.ts` and `src/renderer/global.d.ts`. The structural signals section added module-to-symbol edges for layer.ts.

Condition B searched the codebase directly — notably stating "I will search for the word 'capture' in ARCHITECTURE.md" and "I will read src/renderer/hooks/keyboard/useMainKeyboardHandler.ts." B produced a correct answer: capture phase intercepts before bubbling-phase child listeners, preventing "Escape leak," enabling centralized delegation to `layerStack.getTopLayer()`, and consuming the event via `stopPropagation`. B did not cite any of the Discussions PRs as relevant to this answer — the pack's Discussions section had no applicable content, so the "verify before citing" framing was irrelevant.

However, B did not cite the "9+ scattered Escape handlers" detail from ARCHITECTURE.md that v3-B found. This is a regression within B's own performance relative to v3. The pack's entity list pointed to layer.ts symbols (Layer, LayerType, ModalLayer, etc.) but apparently did not guide B to LayerStackContext.tsx or ARCHITECTURE.md's history section. The answer is structurally correct but missing the historical motivation that the capture-phase handler replaced 9+ scattered handlers.

Condition C produced an almost identical answer to B. C also read LayerStackContext.tsx directly and described capture-phase interception, `getTopLayer()` delegation, and `stopPropagation`. C's answer is slightly shorter but covers the same points. Neither B nor C cited any of the Discussions PRs (PR #789's UI-PATTERNS.md reference would have been the closest to useful here, since it explicitly covers the modal layer stack — but neither B nor C used it).

The pack's Discussions section remains unhelpful for this question. The structural signals section (module-to-symbol edges for layer.ts) did not guide either condition to the architectural history of why capture-phase was chosen. Both answers are correct mechanically but miss the historical context. Grade: no meaningful difference for both B and C; both are slightly weaker than v3-B on this question.

---

### Q5 — Layer Stack priority numbers vs LIFO [No meaningful difference (B improved from v3) / Pack adds noise (C regressed vs B)]

The Phase 1 pack for Q5 contained the same leading PR as v3: PR #207 ("Add safety friction to Confirm and Erase," confidence 1.000) with priority 1005 for EraseConfirmationModal. Additional hits were PR #224 (preload modularization), PR #789 (agent guides with UI-PATTERNS.md covering the layer stack), PR #502 (SettingsModal decomposition with ShortcutsTab "escape coordination"), PR #742 (Cue UI hardening), and PR #364 (CSV table rendering). The entity list pointed to layer.ts symbols. Evidence excerpts included the layer.ts source and layer.test.ts with `priority: 100` in the test fixture.

This is the second critical regression question from v3. In v3-B, the agent anchored on PR #207's priority 1005 and stopped searching, producing a thin answer that missed `modalPriorities.ts` with 6+ specific values.

Condition B experienced a `read_file` tool error mid-answer but recovered. Despite the error, B searched for "priority" and "LIFO" in ARCHITECTURE.md, read `src/renderer/constants/modalPriorities.ts`, and read `src/renderer/hooks/ui/useLayerStack.ts`. The answer cited six specific priority values (`QUIT_CONFIRM: 1020`, `CONFIRM: 1000`, `DIRECTOR_NOTES: 848`, `MARKETPLACE: 735`, `BATCH_RUNNER: 720`, `SETTINGS: 450`, `SLASH_AUTOCOMPLETE: 50`, `FILE_TREE_FILTER: 30`, `STANDING_OVATION: 1100`), explained the stable-sort-within-priority-tier behavior, and mentioned the safety friction motivation from PR #207. This is materially better than v3-B. The "verify before citing" framing on PR #207 appears to have prevented B from anchoring — B used PR #207 as one data point and kept searching for the full priority catalog. The tool error (470 words produced despite it) may have interrupted what would otherwise have been an even more complete answer.

Condition C did not search for `modalPriorities.ts`. C cited PR #207 (priority 1005) as the anchor, then cited PR #789's UI-PATTERNS.md reference as documentation of the priority system. C's answer described standard modals (priority 100), high-priority overlays (>1000), and ephemeral UI (lower priority) as abstract categories derived from the layer.ts type comment rather than from the actual priority catalog. C did not cite any specific priority values from `modalPriorities.ts`. This is a regression vs B — C stopped at PR #207 and PR #789 rather than searching for the full catalog, which is exactly the failure mode from v3-B.

The companion prompt appears to have backfired here. C's companion-mediated interpretation of the pack may have led the agent to treat PR #789's UI-PATTERNS.md reference (which covers the modal layer stack in its agent guides) as sufficient documentation of the priority system, suppressing the direct file search that B conducted. The companion prompt's instruction to "use structural signals as navigation" or "trust confident discussions" may have anchored C to PR #207 + PR #789 as a complete picture. Grade: B is improved over v3 (no meaningful difference vs A, rather than adds noise); C regresses vs B (companion adds noise on this question specifically).

---

### Q6 — PTY vs child_process.spawn for AI agents [No meaningful difference]

The pack for Q6 carried 663 lines of discussions with six confidence scores (1.00, 0.93, 0.92, 0.89, 0.89, 0.85) — the densest discussion pack among Q6-Q9. The top-confidence hit almost certainly covered PTY or process spawning infrastructure. Despite the volume of context, neither B nor C produced answers that are distinctly better than what a capable LLM with general Electron/Node.js knowledge would generate.

Condition B identified `PtySpawner.ts` and `ChildProcessSpawner` by name and described the dual-spawner architecture correctly. The core reasoning — that TTY detection controls output format (NDJSON for Claude Code, stream-JSON for Gemini CLI) — is accurate and specific to Maestro. B also correctly identified signal handling and process management as secondary motivations. However, the answer runs to ~530 tokens and repeats itself across four numbered points; the extra length does not add proportionally more signal. Crucially, B does not cite any PR number or issue that contains the actual design decision — the answer is constructed from reading the source files rather than from pack discussions.

Condition C produced the same architectural reasoning in roughly half the tokens (~385). C explicitly named `@anthropic-ai/claude-code` and `gemini` as the process targets, mentioned ANSI escape sequence support as a tertiary motivation, and added the observation that consistency is "critical in Maestro's context because it orchestrates multiple heterogeneous AI agents in parallel." This closing framing is a useful synthesis, but it is generic Electron-architecture reasoning, not evidence from a PR or issue.

The A-baseline counterfactual: a capable LLM without any context pack, given only the question and Maestro's codebase, would likely produce the same dual-spawner/TTY-detection reasoning. The PTY pattern for wrapping interactive CLI tools is well-known in the Electron ecosystem. The specific file names (PtySpawner.ts vs ChildProcessSpawner) would be discovered by codebase search regardless. The pack's discussions, however numerous, do not appear to have supplied design rationale that wasn't already derivable from reading the source.

The notable token dynamic: B ran 8404 tokens total while C ran only 7745 — C is cheaper on this question. B's answer was verbose (535 tokens in the answer portion alone vs C's 385); the companion appears to have imposed discipline without anchoring. This is the one question where the companion saved tokens without sacrificing quality. Grade: no meaningful difference for pack; no meaningful difference for companion (C is more concise without being less accurate).

---

### Q7 — Group chat router: @mention absence vs stop tokens [No meaningful difference]

The pack for Q7 carried 542 lines (discussions + structural signals) with six confidence scores ranging from 1.00 to 0.79 — a moderately confident pack with structural edges included. The routing architecture for group chat is a sufficiently unique design that genuine pack signal (a PR explaining why stop tokens were rejected) could have added value. Neither condition cited such a PR.

Condition B correctly identified three independent reasons for @mention-based routing: (1) no shared stop-token protocol among heterogeneous CLI agents, (2) @mention as a natural-language routing signal that agents and humans can both use, (3) process lifecycle events (process exit) as the fundamental "done" signal for CLI-wrapped agents. B explicitly named `src/main/group-chat/group-chat-router.ts` as the source file and described the `agentGuides` system prompt injection. The answer is structurally accurate and Maestro-specific rather than generic.

Condition C produced the same three-part answer with sharper framing: the "observable behavior over internal control" design principle that C attributes to Maestro is a compelling synthesis — but it is not cited from a file or PR. C added the point that stop tokens "can't be injected into a spawned CLI process's generation loop," which is a correct and specific constraint. C's answer is slightly more concise and tightly argued than B's.

Neither B nor C cited a PR or issue explaining why stop tokens were specifically rejected as an alternative. If the pack's top-confidence hit contained a PR discussion with explicit reasoning about stop tokens vs @mention, neither condition used it. The answers read as derived from reading the group-chat-router.ts source and reasoning about the CLI spawning architecture, not from pack discussions.

The A-baseline counterfactual: a capable LLM with codebase access would arrive at the same reasoning from reading group-chat-router.ts and understanding that CLI tools don't expose stop sequence injection. The pack's structural signals (co-change edges for the group chat router module) would have been useful for navigation but not for the design rationale itself. Grade: no meaningful difference for both pack and companion. C is slightly better argued but not because of pack evidence.

---

### Q8 — pendingParticipantResponses as module-level Map [No meaningful difference]

The pack for Q8 carried 526 lines with the highest confidence scores of any Q6-Q9 question (1.00, 0.98, 0.94, 0.92, 0.91, 0.90 — six scores, all above 0.90). This is a pack with unusually high confidence across all six discussions, suggesting strong lexical overlap between the query and the retrieved episodes. Despite this, neither B nor C produced answers that are materially better than what a capable LLM would derive from the source code alone.

Condition B produced a four-part answer: (1) ephemeral turn state, (2) single-threaded event loop atomicity, (3) no cross-restart recovery value, (4) process-scope singleton pattern. The answer correctly identified that entries are deleted after `finalizeParticipantTurn` runs. B named `const pendingParticipantResponses = new Map<string, string>()` as the actual definition and keyed by `conversationId`. This level of specificity comes from reading the source file directly, not from the pack discussions.

Condition C produced the same four-part answer with nearly identical reasoning. C added the observation that "the Map's module-level scope is the simplest correct solution" as a concluding synthesis, which is an appropriate epistemic summary. C also mentioned `markParticipantDone` as a lifecycle call and checked `src/main/ipc/handlers/groupChat.ts` for corroboration — showing slightly broader file coverage than B. However, the substantive content of the two answers is equivalent.

Neither condition cited a PR or issue with design rationale for why module-level Map was chosen over, say, a database or a class property. The high confidence scores in the pack likely reflect PRs that modified group-chat-router.ts (hence high lexical overlap with the filename/function names), but not PRs that discussed the data structure choice specifically.

Both answers are high quality — the four-part rationale is correct, Maestro-specific, and accurately describes the architectural constraints. But the pack did not contribute to this quality. The reasoning is derivable directly from reading group-chat-router.ts and understanding Node.js/Electron process architecture. Grade: no meaningful difference for both pack and companion. Both B and C are high quality from code-derived reasoning alone.

---

### Q9 — Theme colors in TypeScript vs CSS custom properties [No meaningful difference]

The pack for Q9 carried 653 lines of discussions with six confidence scores (1.00, 0.98, 0.96, 0.81, 0.81, 0.65). The top three scores are extremely high; the bottom two scores drop to 0.81 and 0.65, indicating that the pack contains a mix of highly relevant and marginally relevant discussions. A PR about Electron cross-process theme color requirements at the top of the pack would be the clearest possible pack win — but neither condition cited such a PR.

Condition B produced a four-point answer: cross-process access (Main Process can't read CSS variables), type safety at compile time, programmatic manipulation (contrast ratios, opacity calculations), and single source of truth for CSS-in-JS injection. B mentioned `modalPriorities.ts` as a parallel example of "centralizing architectural decisions in TypeScript" — this is a relevant analogy but not direct evidence for the theme color question. B did not cite any PR or issue.

Condition C produced the same four-point answer with cleaner framing. C added WCAG contrast checking (`getContrastRatio()`, `meetsWCAG()`) as a specific example of programmatic accessibility validation — a concrete use case B did not name. C also stated that CSS values "can be injected as custom properties at boot" (the hybrid approach), which is a more complete description of how the TypeScript-first approach works in practice. C's answer is marginally more concrete than B's on the CSS injection pattern.

Neither condition cited a PR, issue, or commit with the actual design decision. The answers are plausible and Electron-architecture-correct, but they are generic — any LLM with knowledge of Electron's two-process model would produce similar reasoning. The cross-process boundary explanation (Main Process needs theme values for native window chrome) is the most Maestro-specific point, but it is derivable from Electron architecture knowledge rather than from any pack discussion.

The A-baseline counterfactual: a bare LLM answering this question about an Electron app that manages AI agents would likely produce the same cross-process reasoning. The TypeScript-for-cross-process-constants pattern is well-established in Electron codebases. The pack's high-confidence discussions do not appear to have contained a PR explaining the decision; if they had, at least one condition would have cited it.

Grade: no meaningful difference for both pack and companion. C is marginally more concrete on the accessibility validation use case, but not materially better.

---

## Comparison to v3

| Q  | v3-B verdict          | g2-B verdict                  | g2-C verdict                  | Change (B) | Change (C vs B) |
|----|-----------------------|-------------------------------|-------------------------------|------------|-----------------|
| Q1 | No meaningful diff    | No meaningful difference      | No meaningful difference      | Same       | Same            |
| Q2 | Pack clearly helps    | Pack clearly helps            | No meaningful difference      | Same       | C not better    |
| Q3 | Pack adds noise       | No meaningful difference      | No meaningful difference      | +1 (improved) | Same         |
| Q4 | Pack clearly helps (marginal) | No meaningful difference | No meaningful difference   | -1 (slightly weaker) | Same  |
| Q5 | Pack adds noise       | No meaningful difference      | Pack adds noise (vs B)        | +1 (improved) | -1 (C regressed) |
| Q6 | N/A (not run)         | No meaningful difference      | No meaningful difference      | —          | Same            |
| Q7 | N/A (not run)         | No meaningful difference      | No meaningful difference      | —          | Same            |
| Q8 | N/A (not run)         | No meaningful difference      | No meaningful difference      | —          | Same            |
| Q9 | N/A (not run)         | No meaningful difference      | No meaningful difference      | —          | Same            |

**Net B change vs v3 (Q1-Q5): +2 improvements (Q3 and Q5 no longer add noise), -1 regression (Q4 slightly weaker)**
**Net C change vs B (all questions): 0 improvements, 1 regression (Q5)**

---

## Token Cost Analysis

| Q  | Size   | B total tok | C total tok | C overhead |
|----|--------|-------------|-------------|------------|
| Q1 | small  | 7131        | 8004        | +873 (+12%) |
| Q2 | small  | 6963        | 7761        | +798 (+11%) |
| Q3 | small  | 6650        | 7449        | +799 (+12%) |
| Q4 | medium | 6737        | 7938        | +1201 (+18%) |
| Q5 | medium | 5602        | 6351        | +749 (+13%) |
| Q6 | medium | 8404        | 7745        | -659 (-8%)  |
| Q7 | large  | 6917        | 7693        | +776 (+11%) |
| Q8 | large  | 6609        | 7575        | +966 (+15%) |
| Q9 | large  | 7038        | 7916        | +878 (+12%) |
| **Total** | | **62051** | **68432** | **+6381 (+10%)** |

**Median overhead (excluding Q6): +799 tokens (+12%)**
**Total overhead: +6381 tokens (+10%)**

### Q6: the notable exception

Q6 is the only question where C cost less than B. B produced a 535-token answer with four numbered points and visible self-repetition across sections; the companion appears to have imposed concision discipline without causing the anchoring regression seen in Q5. C's 385-token answer covered the same substantive ground in a tighter structure. This is the companion's best performance across all nine questions — it reduced cost without sacrificing quality and without over-anchoring on pack discussions.

The Q6 reversal does not represent a general pattern. Across the other eight questions, C consistently adds 10-18% overhead from the companion prompt itself (the companion text counts against the context budget even before the question is processed). The Q6 savings come from B's unusual verbosity, not from a structural advantage in C's design.

### Is the ~10% overhead worth it?

The companion adds a consistent 10% token overhead (median 799 tokens, total 6381 tokens over nine questions) to context windows that already average 6900-8400 tokens. The accuracy tradeoff:

- C produced no improvements over B across all nine questions
- C produced one regression (Q5: anchored on PR #207 + PR #789, missed `modalPriorities.ts`)
- C produced one token saving (Q6: disciplined B's verbosity)

At the aggregate level, C pays ~10% more and gets nothing in return — one regression cancels the one token saving, and the remaining seven questions are statistically identical. The companion prompt as currently written does not earn its overhead.

The more specific finding: the companion appears to teach agents how to interpret pack sections at the cost of teaching them to trust pack sections. On Q5, the companion's framing — "use structural signals as navigation, treat high-confidence discussions as strong signal" — caused C to stop at two confident-sounding PRs rather than searching the codebase. This is the opposite of the intended "verify before citing" behavior. A revision that explicitly instructs agents to continue file-searching even when the pack has a high-confidence hit might recover the Q5 quality without the anchoring cost.

---

## Overall Verdict

### Pack (B vs A)

Across nine questions, the pack clearly helped on exactly one (Q2, where PR #543 contained the precise design rationale in its summary). On eight questions, the pack produced no meaningful improvement over what a capable LLM with codebase access would generate. The pack never added noise in G2 (compared to v3's two noise cases on Q3 and Q5), which represents genuine improvement from the "verify before citing" reframing. But the signal/noise ratio remains governed almost entirely by whether the graph happens to contain a PR with verbatim design rationale — a condition that held for Q2 and no other question across both G1 and G2.

**Pack verdict: marginal positive. Earns its keep only when exact-match PR rationale exists in the graph.**

### Companion (C vs B)

Across nine questions, the companion produced no improvements, one regression (Q5), and one coincidental token saving (Q6). The 10% average overhead is not justified by outcomes. The companion's framing causes agents to treat high-confidence discussions as near-authoritative, which risks anchoring on pack content instead of searching the codebase directly.

**Companion verdict: neutral-to-negative as currently designed. Needs a revision that explicitly teaches when to abandon pack content and search directly.**

### What Phase 1 accomplished

Phase 1 framing (confidence scores + "verify before citing" headers) fixed the two v3 regressions (Q3, Q5 for B) without creating new ones. This is a genuine improvement. The companion concept is sound in principle but the current implementation over-trusts the pack. A more aggressive "pack as navigation aid only, codebase as authority" framing might recover the companion's value proposition without the anchoring penalty.
