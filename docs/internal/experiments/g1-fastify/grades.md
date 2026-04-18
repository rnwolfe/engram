# Gate G1 Grades — Fastify

**Experiment:** G1 retrieval experiment on fastify/fastify (--depth 500)
**Date:** 2026-04-15
**Grader:** Claude Sonnet 4.6

## Grading Criteria

- **Pack clearly helps** — Condition B cited specific evidence from the pack (symbol name, file, commit, or doc) that Condition A missed or had to discover through multi-step search.
- **No meaningful difference** — Both conditions reached equivalent quality and specificity.
- **Pack adds noise** — Pack misdirected the agent or was ignored entirely.
- **Retrieval bug** — Pack returned 0 or near-0 relevant results; not gradeable as pack signal.

---

## Summary Table

| ID | Module Size | Question Topic | Pack Quality | Grade | Key Reason |
|----|-------------|----------------|--------------|-------|------------|
| Q1 | Small | Request ID bitmask | Weak — surfaced `lib/request.js` but NOT `lib/req-id-gen-factory.js` where bitmask lives | No meaningful difference | Both conditions gave identical V8 SMI + branchless explanations; A found this independently |
| Q2 | Small | Separate 404 router | Moderate — surfaced `lib/four-oh-four.js` + key symbols | Pack clearly helps | B grounded in `kFourOhFourLevelInstance`, `kFourOhFourContext` symbols; added lifecycle integration + constraint routing detail A missed |
| Q3 | Medium | SchemaController factory | Strong — surfaced `buildSchemaController` in all 3 key files | Pack clearly helps | B cited doc comment "called at every fastify context that is being created" and referenced logger-factory parallel; A relied on generic reasoning |
| Q4 | Medium | Separate validator + serializer | Weak — `lib/error-serializer.js::validator` misleadingly ranked #1; schema-controller.js not surfaced | No meaningful difference | A gave superior answer with full comparison table; B cited `fastify.d.ts` `ValidatorFactory`/`SerializerFactory` but this was marginal |
| Q5 | Medium | Eager schema compilation | Good — `lib/validation.js::compileSchemasForValidation` + `compileSchemasForSerialization` surfaced | Pack clearly helps | B grounded in concrete function names from pack; cited `FST_ERR_SCH_*` constants; $ref resolution detail grounded in `schemaBRefToA` test symbol |
| Q6 | Large | Object.create plugin scoping | Moderate — surfaced `lib/plugin-override.js` + `plugin-utils.js`; ranked child-logger tests higher | No meaningful difference | Both answers covered same ground (prototypal inheritance, zero-copy, fastify-plugin escape hatch); B added `docs/Guides/Write-Plugin.md` reference but substance equal |
| Q7 | Large | Lifecycle vs application hooks | Strong — surfaced `lib/hooks.js::applicationHooks` + `lifecycleHooks` + inferred co-change edge between Hooks.md and Lifecycle.md | Pack clearly helps | B named specific runner functions (`hookRunnerGenerator`, `onSendHookRunner`, `hookRunnerApplication`) from pack; co-change edge between Lifecycle.md and Hooks.md is a genuine insight A lacked |
| Q8 | Large | Decorator reference type error | Good — surfaced `test/throw.test.js` + `test/internals/decorator.test.js`; `lib/decorate.js` (where `checkReferenceType` lives) not surfaced | Pack clearly helps | B mentioned V8 Hidden Class optimization as benefit of `null` initialization — a specific technical depth A didn't reach; grounded in throw test + decorator test |
| Q9 | Large | Prototype chain error handlers | Strong — `lib/error-handler.js::buildErrorHandler` surfaced directly + `test/encapsulated-error-handler.test.js` + `docs/Guides/Prototype-Poisoning.md` | Pack clearly helps | B cited test file names directly; referenced "tricky control flow" from test comments; Prototype-Poisoning.md is a uniquely relevant signal A couldn't find |

**Score: 6/9 pack clearly helped**

---

## Per-Question Rationale

### Q1 — Request ID Bitmask — No Meaningful Difference

The pack retrieved `lib/request.js` (the Request class) as the top result rather than `lib/req-id-gen-factory.js` where the actual bitmask logic lives. This is a retrieval miss — the query matched "request ID" to the Request class broadly, not to the small factory file. Both conditions converged on the same answer: V8 SMI optimization + branchless execution. The question is well-known enough that model training data covers it without needing codebase context.

**Pack issue:** Wrong file retrieved. `lib/req-id-gen-factory.js` should have ranked #1 but didn't appear in the top entities shown.

### Q2 — Separate 404 Router — Pack Clearly Helps

The pack surfaced `lib/four-oh-four.js` and its key symbols (`kFourOhFourLevelInstance`, `kFourOhFourContext`, `fourOhFour`). Condition B used these symbols to make specific claims about per-prefix scoping and lifecycle integration that Condition A treated generically. B's mention of routing constraints (versioning/header constraints applying even on 404 paths) went beyond A's answer and is grounded in the code structure of `four-oh-four.js`.

### Q3 — SchemaController Factory Pattern — Pack Clearly Helps

The pack identified `buildSchemaController` across all three relevant files: `fastify.js`, `lib/schema-controller.js`, and `lib/plugin-override.js`. This gives Condition B evidence to reason about the function's cross-file role. The doc comment "Called at every fastify context that is being created" cited in B comes directly from `lib/schema-controller.js` — a specific textual anchor that grounds the answer. B also drew the logger-factory parallel (same pattern used for scoped loggers), which is visible in the pack via `lib/logger-factory.js` entities.

### Q4 — Separate Validator and Serializer — No Meaningful Difference

The pack's top hit was `lib/error-serializer.js::validator` — tangentially related (error serialization) but not the core mechanism. `lib/schema-controller.js` and `@fastify/ajv-compiler`/`@fastify/fast-json-stringify-compiler` were not prominently surfaced. Condition A gave a notably richer answer with a full comparison table (data flow direction, optimization type, output type, security role) and explicitly named the security/output-filter benefit. Condition B cited `fastify.d.ts` `ValidatorFactory` and `SerializerFactory` imports, which is a genuine pack-derived detail, but B's answer was shallower overall. A wins on depth here — the question is answerable from general knowledge of the Ajv/fast-json-stringify ecosystem.

### Q5 — Eager Schema Compilation — Pack Clearly Helps

The pack surfaced `lib/validation.js::compileSchemasForValidation` and `compileSchemasForSerialization` directly, along with `lib/schemas.js` error constants. Condition B grounded its answer in those specific function names and used `schemaBRefToA` (a test symbol) to evidence the `$ref` resolution claim. The error constants (`FST_ERR_SCH_DUPLICATE`, `FST_ERR_SCH_MISSING_ID`) gave B concrete evidence for the "catch errors at startup" claim rather than relying on generic reasoning. Both answers hit the same themes, but B's grounding is measurably tighter.

### Q6 — Object.create Plugin Scoping — No Meaningful Difference

Both conditions gave substantively equivalent answers covering the four main points: prototype-based inheritance, zero-copy efficiency, encapsulation mechanics, and the `fastify-plugin` escape hatch. The pack surfaced `lib/plugin-override.js` and `lib/plugin-utils.js` (where `skip-override` lives), which B used to mention the escape hatch. But A independently mentioned `fastify-plugin` wrapper as well. The pack's higher-ranked results were `test/child-logger-factory.test.js` — a weaker signal that didn't add much. Neither condition reached into commit history for this question.

### Q7 — Lifecycle vs Application Hooks Separation — Pack Clearly Helps

The pack did something uniquely useful here: it surfaced the **inferred co-change edge** between `docs/Reference/Hooks.md` and `docs/Reference/Lifecycle.md` (4 shared commits). Condition B named specific runner functions from the pack (`hookRunnerGenerator`, `onSendHookRunner`, `hookRunnerApplication`) as evidence for the AOT compilation claim. The co-change edge is an insight engram derives from git history that a bare model cannot reproduce. B's answer also correctly distinguished the signatures of the two hook categories with specific function names, while A reasoned about the same distinction more abstractly.

### Q8 — Decorator Reference Type Error — Pack Clearly Helps

The pack surfaced `test/throw.test.js` (which specifically tests throwing behavior) and `test/internals/decorator.test.js`. Condition B used these as evidence anchors and added a V8 Hidden Class optimization point — the benefit of using `null` as the initial decoration value allows V8 to create a stable Hidden Class for Request/Reply objects. This is a specific performance insight A didn't articulate. `lib/decorate.js` itself wasn't surfaced (where `checkReferenceType` lives), which is a retrieval miss, but the test files provided enough context for B to outperform A.

### Q9 — Prototype Chain Error Handlers — Pack Clearly Helps

The strongest pack performance in the experiment. `lib/error-handler.js::buildErrorHandler` was surfaced directly (score 0.908), along with `test/encapsulated-error-handler.test.js` and `docs/Guides/Prototype-Poisoning.md`. The Prototype-Poisoning guide is uniquely relevant — it explains why Fastify is specifically careful about prototype chains and their security implications, giving Condition B context A couldn't access. B cited "tricky control flow" from test comments as a direct textual anchor. B's answer about "shadowing over mutation" is more precise than A's generic "child gets its own handler."

---

## Verdict

**6/9 — Pack clearly helped (Decision Branch A: ≥ 6/9)**

The pre-assembled engram context pack produced meaningfully better answers on 6 of 9 questions. The signal is consistent enough to proceed with the pack-assisted approach as the default.

### Wins (6): Q2, Q3, Q5, Q7, Q8, Q9
All in medium-to-large modules where engram surfaced the right symbols + edges. Common pattern: **pack named specific internal symbols (function names, constants, test file names) that gave the model grounding that web search alone couldn't reproduce without access to the exact codebase.**

### No Meaningful Difference (3): Q1, Q4, Q6
- **Q1:** Retrieval miss — wrong file surfaced for a small-module question.
- **Q4:** Retrieval noise — `lib/error-serializer.js::validator` ranked first for a schema-compiler question; A independently outperformed B on depth.
- **Q6:** Parity — both conditions converged; the question's answer is inferable from public fastify documentation.

### Patterns

1. **Pack helps most when it surfaces the exact module file + internal symbols.** Q9 is the clearest example: `lib/error-handler.js::buildErrorHandler` at score 0.908 gave B a direct anchor.

2. **Pack fails on small, single-file modules when the wrong file is retrieved.** Q1 retrieved `lib/request.js` (the Request class) instead of `lib/req-id-gen-factory.js` (where the bitmask lives). Keyword matching on "request ID" didn't disambiguate "Request class" from "request ID generator."

3. **Inferred edges (co-change) provide genuine signal.** The Q7 co-change edge between Hooks.md and Lifecycle.md (4 shared commits) was derived from git history and not inferable from code alone. This is engram's structural advantage over raw file search.

4. **The Prototype-Poisoning guide appearing in Q9 is a good retrieval.** The pack found an architecturally relevant doc that addresses exactly why fastify treats prototype chains carefully. This is the kind of oblique but relevant signal that pure code search would miss.

---

## Comparison to Engram Self-Ingest Results

On the engram self-ingest experiment (not directly comparable), the pack helped in cases where the model had no prior training exposure to the codebase. The fastify experiment tells a different story: **Gemini likely has some training exposure to fastify's source code** (it's a popular, open-source Node.js framework), which reduces the performance gap between bare and context-assisted conditions.

The 6/9 result on fastify suggests:
- Even on a "known" codebase, the pack helped in 2/3 of cases.
- The marginal gain is lower than expected for a "new" codebase (hypothesis: ~7-8/9 for truly novel code).
- The cases where pack didn't help (Q1, Q4, Q6) are instructively different: retrieval miss, ranking noise, and parity from public documentation — not "model already knew it."

**Pack helps MORE on novel codebases, but still provides net value on known ones.** The structural signal (symbol names, co-change edges, cross-file relationships) is complementary to training knowledge, not just a substitute for it.

---

## Recommendations

1. **Fix retrieval for single-file small modules:** Q1's miss suggests the FTS query "request ID generator" needs to match `req-id-gen-factory.js` more directly. Consider adding file-name matching weight or fuzzy module matching.

2. **De-weight error serializer symbols for schema/compiler queries:** Q4's top hit (`lib/error-serializer.js::validator`) was misleading. The `validator` symbol there is used for config validation (Ajv compiling the Fastify options schema), not the user-facing schema compiler system.

3. **Surface co-change edges more prominently in the pack header:** The Q7 co-change edge (Hooks.md ↔ Lifecycle.md) was a standout structural insight. Consider listing inferred co-change edges in a dedicated section above the symbol list.

4. **Proceed to Gate G2:** 6/9 confirms the pack approach is viable. Next gate should test with a larger token budget (12K) and measure whether additional context (git commit messages, doc content) pushes score to 7-8/9.
