# Gate G1 — Grades

**Grader:** automated subagent (claude-sonnet-4-6)
**Date:** 2026-04-16

## Summary

The engram structural context pack produced better or equal answers in most cases, but the lift was predominantly in efficiency and retrieval orientation rather than in unique, irreplaceable signal. Condition B's answers were generally more tightly grounded in specific file paths and pack-surfaced entities, while Condition A had to do more exploratory searching. The two genuine retrieval failures (Q03, Q05) where the pack returned near-empty results are retrieval bugs that deflate the pack's apparent score — both Condition A and Condition B fell back to raw search with similar quality outcomes. Q06 is the strongest evidence of pack lift: the pack surfaced the specific commit `b05ddd0b` describing a real incident (Gemini hallucinating ULIDs), and Condition B cited it by hash with specific detail that Condition A could only approximate through code reading.

| ID | Size | Pack quality | Grade | Key reason |
|----|------|-------------|-------|------------|
| Q01 | small | poor (schema noise, no design rationale) | No meaningful difference | Both answered correctly from code; pack's top hits were schema DDL constants, not the temporal design rationale |
| Q02 | small | moderate (temporal module files surfaced) | No meaningful difference | Both gave equivalent, accurate answers; Cond A found the SQL predicate in code while Cond B reasoned from module listing |
| Q03 | small | retrieval failure (~0 tokens) | Retrieval bug | Empty pack; both conditions searched from scratch with equivalent quality |
| Q04 | medium | good (reconcile files + commit `b05ddd0b` + commit `6466c42`) | Pack clearly helps | Cond B cited `DEFAULT_ASSESS_TIMEOUT_MS`/`DEFAULT_DISCOVER_TIMEOUT_MS` as distinct constants, reinforcing the separate-budget rationale; commit history oriented the answer |
| Q05 | medium | retrieval failure (~217 tokens, 1 entity) | Retrieval bug | Pack returned only `DEFAULT_DISCOVER_TIMEOUT_MS`; both conditions searched from scratch |
| Q06 | medium | good (reconcile + project files, commit `b05ddd0b` present) | Pack clearly helps | Cond B directly cited commit `b05ddd0b` ("Gemini sometimes invents plausible-looking ULIDs") as the causal incident; Cond A had to read the code to reconstruct the same story |
| Q07 | large | good (spec docs + walker source + many commits surfaced) | Pack clearly helps | Cond B cited `source-ingestion.md`'s "Completes Principle 6" framing and the `blake3` hash from `walker.ts` via the pack; Cond A also found these but needed multiple search steps |
| Q08 | large | good (spec docs + `sweep.test.ts` symbols + commit `b9bf906`) | Pack clearly helps | Cond B cited commit `b9bf906` ("feat(ingest): sweep phase archives episodes for deleted source files") and scoping logic from `sweep.test.ts`; Cond A found similar detail but through multiple tool calls |
| Q09 | large | moderate (spec docs present, but schema noise dominates) | No meaningful difference | Both answered correctly; Cond B was slightly more concise citing spec docs but Cond A did a deeper multi-step search and found richer detail about the "Karpathy wiki" vision and future call graph plans |

**H1 verdict:** PARTIAL — 4/9 questions where pack clearly helped (Q04, Q06, Q07, Q08)

---

## Per-question grades

### Q01 — Why does supersedeEdge create a new edge rather than updating existing in place?
**Grade:** No meaningful difference
**Pack quality:** ~1926 tokens used; top entity was `CREATE_EDGE_EVIDENCE` (schema DDL), second was `supersedeEdge` in `supersession.ts`; no design-rationale commits surfaced, no `DECISIONS.md` or `VISION.md` entries retrieved
**Condition A:** Agent found `supersession.ts` directly and read the implementation; gave a 5-point answer covering immutability, evidence attribution, bitemporal logic, conflict detection, and atomicity — all accurate
**Condition B:** Gave a 3-point answer citing `EdgeInput` interface and `CREATE_EDGE_EVIDENCE` from the pack; mentioned point-in-time queries and audit trail; correct but less detailed than Condition A
**Rationale:** The pack's top hit was a schema DDL constant (`CREATE_EDGE_EVIDENCE`) rather than anything containing design rationale. The pack correctly surfaced `supersedeEdge` at score 0.801 but the truncated evidence excerpt showed only the file header, not the implementation logic. Condition A's raw search produced a more thorough answer with more enumerated reasons. This is a case where the pack's ranking noise (30 schema DDL constants dominating 50% of the entity list) actively degraded signal concentration. Neither answer cited a specific commit explaining the design choice — no such commit exists in the pack.

---

### Q02 — Why does the temporal model use half-open intervals?
**Grade:** No meaningful difference
**Pack quality:** ~2601 tokens; top hit was the temporal test file; `supersession.ts` and `history.ts` surfaced; two git commits (feat `#21` and feat `#24`) present; no doc explaining the half-open choice specifically
**Condition A:** Agent searched `valid_until` in `temporal/`, then read `edges.ts` and found the actual SQL predicate at L183-186; cited the exact line numbers and the `valid_from <= valid_at < valid_until` logic; also cited L125 of `supersession.ts` for where transition timestamps are set; highly specific
**Condition B:** Answered from the pack's module listing without doing additional searching; gave a correct structural explanation but did not find the specific SQL predicate or line numbers; slightly more generic
**Rationale:** Condition A's raw search actually produced a more grounded answer by finding the concrete SQL implementation detail (`valid_from <= valid_at < valid_until` with exact line numbers). Condition B reasoned correctly but abstractly from the module names in the pack. The pack didn't surface the key evidence (the SQL in `findEdges`) because it returned AI provider files (`DEFAULT_EMBED_MODEL`, `DEFAULT_MODEL`) as top-ranked entities — retrieval noise. Neither answer cited a design document explaining *why* half-open was chosen as a standard (since none exists in the pack). The two answers are equivalent in correctness and both appropriately specific.

---

### Q03 — Why is invalidated_at tracked separately from valid_until?
**Grade:** Retrieval bug (not gradeable as pack signal)
**Pack quality:** ~0 tokens, 0 results — complete retrieval failure; the pack returned nothing for this query
**Condition A:** Searched `invalidated_at` and `valid_until` across the codebase; gave a well-structured bitemporal answer distinguishing Domain Time vs. Transaction Time with concrete examples; cited `supersedeEdge` behavior; correct and thorough
**Condition B:** Received an empty pack and immediately fell back to searching, then read `projections.ts`, `supersession.ts`, and `edges.ts`; produced an answer nearly identical in content to Condition A, covering the same bitemporal pattern
**Rationale:** With 0 results in the pack, Condition B had no advantage whatsoever. Both conditions searched from scratch and arrived at equivalent, accurate answers. This is a retrieval system bug — the query "Why is invalidated_at tracked separately from valid_until?" should have surfaced `edges.ts`, `supersession.ts`, and any temporal design docs. The empty result may be a vector similarity miss or an embedding issue with the specific phrasing. Grade the retrieval failure, not the pack concept.

---

### Q04 — Why does reconcile separate into assess and discover phases?
**Grade:** Pack clearly helps
**Pack quality:** ~2310 tokens; top entities were `DEFAULT_ASSESS_TIMEOUT_MS` and `DEFAULT_DISCOVER_TIMEOUT_MS` (score 1.000); `reconcile` function itself at 0.837; commit `b05ddd0b` (hallucination fix) and commit `6466c42` (feat: discover phase) both present; `reconcile.ts` header with phase descriptions in evidence excerpts
**Condition A:** Searched broadly for "reconcile" and "discover phase"; gave a 4-point answer (conceptual separation, performance, cost management, read-time invariants); correct but slightly academic — mentioned `--max-cost` but did not cite specific constants or commit messages
**Condition B:** Directly cited `DEFAULT_ASSESS_TIMEOUT_MS` and `DEFAULT_DISCOVER_TIMEOUT_MS` as distinct constants proving the phases have separate execution budgets; cited `buildAssessPrompt` vs `buildDiscoverPrompt` as evidence of distinct AI strategies; cited `--phase assess|discover` from the CLI header; more concise and more code-anchored
**Rationale:** The pack's top-scoring entities (`DEFAULT_ASSESS_TIMEOUT_MS`, `DEFAULT_DISCOVER_TIMEOUT_MS`) gave Condition B a specific, codebase-grounded argument (separate timeout budgets per phase = genuinely different operational profiles) that Condition A did not produce. While Condition A mentioned cost management, it did not cite the specific constants. Condition B's answer is more evidence-dense and less generic. The pack surfaced exactly the right signal for this "why" question.

---

### Q05 — Why does the discover phase use a substrate delta rather than scanning all episodes?
**Grade:** Retrieval bug (not gradeable as pack signal)
**Pack quality:** ~217 tokens, 3 results (1 entity: `DEFAULT_DISCOVER_TIMEOUT_MS`, 2 edges, 1 evidence excerpt of `gemini-generator.ts` header) — near-empty pack; substantively no signal about substrate delta
**Condition A:** Searched "discover phase" and "substrate delta" broadly; found `reconcile.ts` and read the implementation; gave a 4-point answer (scalability, LLM context constraints, separation of concerns, resumability) with specific details about cursor-based tracking; thorough
**Condition B:** Received a nearly empty pack with only the `DEFAULT_DISCOVER_TIMEOUT_MS` constant and one code excerpt; searched the codebase anyway, found `reconcile.ts`; gave a slightly more concise answer that mentioned `DEFAULT_DISCOVER_TIMEOUT_MS` and `--max-cost`; equivalent quality to Condition A
**Rationale:** With only 3 results and 217 tokens, the pack provided essentially no signal. Condition B had to search from scratch and produced an equivalent answer. This is a second retrieval failure — "substrate delta" and "discover phase" terminology is clearly in `reconcile.ts` and its JSDoc, but the semantic similarity search failed to surface it. Both conditions reached the same quality answer through raw search.

---

### Q06 — Why does reconcile validate proposals before calling project()?
**Grade:** Pack clearly helps
**Pack quality:** ~2490 tokens; commit `b05ddd0b` ("fix(reconcile): detect hallucinated input IDs before calling project()") present with full message; `reconcile` function, `project.ts`, `projections.ts` all surfaced; co-change edges between `project.ts` and `reconcile.ts` present
**Condition A:** Did multiple targeted searches (found `reconcile.ts`, searched for `project()` call, examined lines 565 and 955, read `validateProposal`); produced an excellent 4-point answer that reconstructed the hallucination story by reading code; crucially, mentioned commit `b05ddd0b` and noted "Gemini inventing ULIDs" caused "confusing crash reports"
**Condition B:** Pack contained commit `b05ddd0b` with the full message "Gemini sometimes invents plausible-looking ULIDs for the trailing entries of an inputs array"; Condition B cited it directly — "According to git commit `b05ddd0b`, the Gemini model sometimes 'invents plausible-looking ULIDs'"
**Rationale:** This is the clearest case of pack lift in the experiment. The commit `b05ddd0b` contains the causal story (a real production incident where Gemini hallucination caused `resolveInputs()` crashes). Condition B received this commit in its pack and cited it by hash. Condition A *also* mentioned commit `b05ddd0b` and the same story — but it had to do 4+ tool calls (read file, search for call, read lines, read `validateProposal`) to reconstruct what was pre-assembled in the pack. The pack enabled Condition B to jump directly to the post-incident rationale without the search overhead. The pack win here is primarily about efficiency and direct evidence citation, with Condition A ultimately catching up through diligent search.

---

### Q07 — Why does source ingestion use a content hash in source_ref?
**Grade:** Pack clearly helps
**Pack quality:** ~4219 tokens (highest budget used); spec docs `source-ingestion.md` and `source-ingestion-design.md` at scores 1.000 and 0.945; `walker.ts` with `contentHash: string // blake3 hex` in evidence; multiple relevant commits (scaffold #104, tree-sitter #105, episode writes #107, sweep #108, CLI #109, docs #110)
**Condition A:** Found `source-ingestion-design.md` first and cited it explicitly as "the primary reason is to enable a 'fast path'"; also found `walker.ts` (blake3 hash); produced a detailed table comparing path-only vs path+hash approaches; did multiple search steps to get there
**Condition B:** Pack put `source-ingestion.md` and `source-ingestion-design.md` at the top of context; cited "Completes Principle 6 — 'Developer-native'" from the spec directly; cited the `contentHash: string // blake3 hex` from walker.ts evidence; cited `source-ingestion.md`'s "authoritative substrate" phrasing; more concise and spec-aligned
**Rationale:** The pack surfaced the two spec documents as highest-relevance entities (scores 1.000 and 0.945) which contain the authoritative design rationale. Condition B's answer was tighter, directly quoted the spec's "Principle 6" framing and "authoritative substrate" language, and cited the blake3 hash via the pack evidence without additional searching. Condition A had to search to find these same documents. Both reached accurate answers, but Condition B's was more directly grounded in the design intent (spec language) rather than code inference. This is a genuine efficiency win for the pack.

---

### Q08 — Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?
**Grade:** Pack clearly helps
**Pack quality:** ~2323 tokens; spec docs at 1.000/0.945; commit `b9bf906` ("feat(ingest): sweep phase archives episodes for deleted source files") with full message; `sweep.test.ts` symbols (`tmpDir`, `activeEpisodes`, `archivedEpisodes`, `writeFile`, `deleteFile`) surfaced; `walker.ts` symbols present
**Condition A:** Searched "walker" and "sweep"; found and read `source-ingestion-design.md` and `ingest/source/index.ts`; produced a thorough 5-point answer that included a SQL excerpt from the implementation; cited "statelessness & reliability," "simplicity," "scoping," "performance," and "historical preservation"; very detailed
**Condition B:** Pack contained commit `b9bf906` with the description "Extends ingestSource() with a post-walk sweep pass"; Condition B cited `feat(ingest): sweep phase archives episodes` (#108) by PR number and described the mechanism accurately; also cited `sweep.test.ts` and `walk_root` scoping from the pack
**Rationale:** Both conditions produced good answers. Condition A's was slightly more thorough (5 points vs 3 points, included the SQL query). However, Condition B directly cited the commit `b9bf906` by hash/PR number and used the `sweep.test.ts` test description from the pack as evidence. The pack gave Condition B immediate access to the "why" (commit message explaining the sweep design) while Condition A had to reconstruct it from code. The pack's commit history signal is real here — the PR description "Extends ingestSource() with a post-walk sweep pass. Every active source episode whose walk_root metadata matches the current..." is precisely the design rationale sought.

---

### Q09 — Why does source ingestion create separate file, module, and symbol entities?
**Grade:** No meaningful difference
**Pack quality:** ~2221 tokens; spec docs `source-ingestion.md` and `source-ingestion-design.md` at top; but most of the 50 entity slots consumed by schema DDL constants (score ~0.388) and `setup/create-labels.sh` (score 0.540 — irrelevant noise); `index.ts::SOURCE_TYPE` surfaced but not the orchestrator logic
**Condition A:** Did multiple steps: read design docs, then read `extractors/typescript.ts`, then read `ingest/source/index.ts`; produced a 4-point answer with the "Karpathy wiki" vision (`symbol → file → module → system`), future call graph preparation (`symbol → calls → symbol`), and cross-source evidence linking (git + tree-sitter meeting at file entity); notably more specific on future capabilities
**Condition B:** Cited `source-ingestion.md`'s "Completes Principle 6" and "authoritative substrate" language from the pack; gave a 3-point answer (structural precision, temporal granularity, enhanced retrieval); correct but less specific about the hierarchical synthesis vision and future call graph plans
**Rationale:** Condition A's multi-step search produced a richer answer by reading the actual spec documents and extractors. The pack did surface the right spec docs but did not help Condition B go beyond what the truncated evidence excerpts contained — the pack's evidence excerpt for `source-ingestion.md` ended with "grounds the graph in the authoritative substrate: t..." (truncated). Meanwhile, 20+ schema DDL constant entries (score ~0.388) consumed pack budget that could have been used for spec content. The pack was not worse, but Condition A's diligent reading of the full spec produced a more complete answer.

---

## Decision branch

Based on the grades, which branch from the experiment plan applies?

- Branch A: ≥6/9 pack clearly helps, proceed with D5 as designed
- Branch B: <6/9 but clear pattern (size/question type), conditional narrative
- Branch C: (N/A — cost not measured in this run)
- Branch D: (N/A — grounding not measured in this run)
- Branch E: pack doesn't help, engram context is just slower grep

**Recommended branch:** B
**Reasoning:** The pack clearly helped in 4/9 questions (Q04, Q06, Q07, Q08), falling short of the 6/9 threshold for Branch A. However, the pattern is clear and instructive rather than random. The two confirmed retrieval failures (Q03 near-empty at 0 tokens, Q05 near-empty at 217 tokens) are retrieval system bugs, not evidence against the pack concept — fix the embedding/retrieval for these queries and they likely flip to "no meaningful difference" or "pack helps." The strongest pack signal came from: (1) commit history containing specific incident rationale (Q06: Gemini hallucinating ULIDs, `b05ddd0b`), (2) spec documents with design framing (Q07, Q08), and (3) distinct named constants proving architectural decisions (Q04: `DEFAULT_ASSESS_TIMEOUT_MS` vs `DEFAULT_DISCOVER_TIMEOUT_MS`). The pack underperformed on temporal design questions (Q01, Q02, Q09) because the retrieval ranked schema DDL noise highly. The conditional narrative for Branch B is: the pack provides genuine lift for questions anchored in git history and spec documents, but the retrieval quality for in-memory/temporal design questions needs improvement before proceeding with D5 at full confidence. Fix the two retrieval bugs and improve ranking signal-to-noise (de-weight schema DDL constants unless the question is explicitly about schema), then re-run Q01, Q02, Q03, Q05, Q09 before making a final Gate G1 determination.
