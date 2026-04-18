# G1 Maestro v2 — Grades

> Corrected methodology: Condition A runs from cwd=/home/rnwolfe/dev/Maestro so Gemini can
> search the actual codebase. Condition B runs from same cwd with a pre-assembled engram pack prepended.

## Grading Criteria

- **Pack clearly helps** — B answer is materially more accurate, specific, or grounded than A
- **No meaningful difference** — both answers are equivalent in quality and accuracy
- **Pack adds noise** — B answer is worse, more confused, or less specific than A
- **Retrieval bug** — pack retrieved wrong entities or missed the key source

---

## Summary Table

| Q  | Size   | Pack verdict              | A quality | B quality | Notes |
|----|--------|---------------------------|-----------|-----------|-------|
| Q1 | small  | No meaningful difference  | High      | High      | A searched and found the source file directly; B had structural pack but also searched |
| Q2 | small  | No meaningful difference  | High      | High      | Pack had JSDoc with rationale; both answers near-identical |
| Q3 | small  | No meaningful difference  | High      | Moderate  | A gave fuller hybrid-storage answer; B slightly less complete |
| Q4 | medium | No meaningful difference  | High      | High      | Both searched codebase despite pack; A found docs reference ("9+ scattered handlers") B didn't |
| Q5 | medium | No meaningful difference  | High      | Moderate  | A found modalPriorities.ts with specific numbers; B gave vaguer answer without those details |
| Q6 | medium | Pack clearly helps        | Moderate  | High      | Pack pointed to PtySpawner.ts JSDoc; B correctly attributed PTY to AI agents; A misframed PTY as "mainly for terminal" |
| Q7 | large  | No meaningful difference  | High      | High      | Both good; pack too shallow to help (no implementation details); both inferred from architecture |
| Q8 | large  | Pack clearly helps        | High      | High      | B found "synchronization barrier" rationale (batch-mode coordination) not in A; pack pointed to router |
| Q9 | large  | Pack clearly helps        | High      | High      | Pack contained the exact JSDoc SSOT comment; B immediately grounded in that evidence |

**Score: 3/9 — Pack clearly helps on 3 questions (Q6, Q8, Q9)**

---

## H1 Verdict: 3/9

The engram context pack provided meaningful lift on 3 of 9 questions when Gemini had full access to Maestro's 1185 TypeScript files.

---

## Per-Question Rationale

### Q1 — Output buffer chunks array [Pack: No meaningful difference]

Condition A searched and found `output-buffer.ts` directly, giving the same O(1) append, deferred join, and incremental size tracking rationale. The pack's top-ranked entity was the correct file but included no source code excerpt explaining the *why*. Both answers are accurate and similarly detailed. The pack reduced search steps for B but did not improve answer quality.

### Q2 — Session recovery clears agentSessionId [Pack: No meaningful difference]

This is the strongest near-tie. The pack's evidence excerpt contained the module JSDoc which states exactly: "Clears the participant's stored agentSessionId" and "Re-spawns the participant with this context." B grounded its answer in this evidence. However, A also found the same file directly and gave an equally accurate answer. The "~30 messages" detail in B is one small advantage, but overall the answers are equivalent.

### Q3 — JSONL vs database [Pack: No meaningful difference, slight edge to A]

The pack's top-ranked entity was `docs/screenshots/git-logs.png` (score 1.000) — a retrieval artifact. The actual relevant evidence (`src/main/preload/files.ts` with `HistoryApi`, `src/cli/output/jsonl.ts`) was present but thin on rationale. Condition A searched more broadly and identified the hybrid SQLite + JSONL architecture (a key insight B missed). Condition B produced a competent answer grounded in the HistoryApi symbols, but A's answer was somewhat fuller. No clear pack advantage.

### Q4 — Capture-phase global Escape [Pack: No meaningful difference]

Both conditions searched for `LayerStackContext.tsx` directly. The pack retrieved only the type definition file (`layer.ts`) — not the implementation. A actually found a documentation reference ("9+ scattered Escape handlers") that B did not mention. B's answer hit the same core points. The pack was unhelpful here — neither hurt nor helped meaningfully.

### Q5 — Priority numbers vs LIFO [Pack: No meaningful difference, slight edge to A]

The pack again retrieved type definitions but not `modalPriorities.ts` or `useLayerStack.ts`. Condition A found the priority constants file and gave specific priority ranges (CONFIRM: 1000, SLASH_AUTOCOMPLETE: 50) with concrete examples of where LIFO fails (background notification stealing Escape from a confirmation dialog). Condition B gave a conceptually correct but vaguer answer. A's answer was superior, but the pack was not the cause — A simply searched better.

### Q6 — PTY vs child_process.spawn [Pack: clearly helps]

The pack retrieved `PtySpawner.ts` with the JSDoc "Used for terminal mode and AI agents that require TTY support" — the key evidence. Condition B read PtySpawner.ts directly (guided by the pack), gave the correct framing (PTY is used FOR AI agents), and cited the specific commit (`32d7b7d`) that added SIGTERM escalation. Condition A searched extensively but ultimately concluded PTY was "primarily for the terminal" with AI agents using regular child_process.spawn — a mischaracterization of the actual dual architecture. The pack's retrieval of PtySpawner.ts oriented B toward the correct answer.

### Q7 — Stop tokens vs @mention turn-taking [Pack: No meaningful difference]

The pack retrieved the router's module file but only the JSDoc and a git commit about SSH wrapping — no implementation details about stop tokens. Both conditions searched the codebase and found no explicit "stop token" references; the concept is implicit in the batch-mode architecture. Both answers correctly identified parallel execution, contextual completeness, and batch-mode architecture as reasons. The pack provided no meaningful advantage here because the relevant evidence wasn't in the knowledge graph at the right granularity.

### Q8 — pendingParticipantResponses module-level Map [Pack: clearly helps]

Both answers were high quality, but B identified the "synchronization barrier" framing — that the Map coordinates the transition from participant response phase to moderator synthesis, and that the moderator runs in batch mode (one-shot per message). This is a more precise mechanistic explanation than A's answer, which correctly identified ephemeral/process-bound state but missed the specific batch-mode coordination role. The pack's retrieval of the router file and `pendingParticipantResponses` symbol (score 0.937) helped B navigate directly to the relevant implementation.

### Q9 — TypeScript themes vs CSS custom properties [Pack: clearly helps]

The pack contained the exact text: "IMPORTANT: This is the single source of truth for theme colors" from `src/shared/themes.ts`, plus evidence showing `src/main/themes.ts` and `src/renderer/constants/themes.ts` are both re-exports. B immediately grounded its answer in this multi-process cross-portability rationale. A also reached the correct answer through code search, but B's answer was more precisely grounded in the "why" (canonical comment visible in the evidence). Both high quality, but B's alignment with the explicit source evidence gives it a marginal edge that counts as pack helping.

---

## Comparison to Previous Runs

| Experiment | Score | Conditions | Notes |
|---|---|---|---|
| Fastify g1-fastify | 6/9 | A=engram only, B=pack+engram | Open source, Gemini has training exposure |
| Maestro v1 (invalid) | 9/9 | A=engram dir (WRONG codebase!), B=pack+Maestro | Invalid — A searched engram, not Maestro |
| **Maestro v2 (this run)** | **3/9** | **A=Maestro dir, B=pack+Maestro** | **Valid — both conditions search Maestro** |

## Key Finding

When Condition A has full access to Maestro's 1185 TS/TSX files and can search freely, the pre-assembled engram pack provides meaningful lift on only **3/9 questions** (Q6, Q8, Q9). On the remaining 6 questions, Gemini's native file search produces answers of equivalent or better quality.

The 9/9 result from Maestro v1 was entirely an artifact of the invalid methodology — Condition A was searching the engram codebase (a different project with ~50 files), so it had no relevant context. The collapse from 9/9 to 3/9 when A searches the right codebase confirms that the pack's value is marginal for a developer-grade model with direct file access.

**Pattern analysis for the 3 where pack helped:**
- Q6: Pack retrieved a specific JSDoc that correctly attributed PTY use to AI agents; A searched but misattributed.
- Q8: Pack oriented B to the batch-mode synchronization barrier framing; a nuance A missed.
- Q9: Pack contained the exact canonical comment ("single source of truth"); B grounded answer immediately.

**Why pack did not help on 6 questions:**
- Questions with widely-scattered evidence (Q3 JSONL rationale, Q4/Q5 Layer Stack implementation) saw A search more broadly and find better evidence.
- Questions where the key rationale lives in JSDoc of well-named files (Q1 output-buffer, Q2 session-recovery) saw A find the same file directly.
- Questions where the answer must be inferred from architecture (Q7 stop tokens) saw both conditions produce equivalent inference-based answers.

**Implication:** Engram's pack provides the most value when (1) the pack contains the exact canonical comment or JSDoc that answers the "why," and (2) the target files have non-obvious names or are deeply nested. For questions where the relevant file name matches the question keywords, Gemini's native search is sufficient.
