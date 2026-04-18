# Gate G1 Experiment Results — Fastify

**Model:** gemini (via `gemini -p`)
**Date:** 2026-04-15
**Repo:** fastify/fastify (--depth 500)
**Context budget:** 6000 tokens
**Isolation:** Each of 18 model calls is a fresh `gemini -p` subprocess

**Framing:**
- Condition A (bare): agent given only the question — answers via raw file search and/or web search
- Condition B (with context): agent given pre-assembled engram pack + question

**Question:** Does a pre-assembled engram structural pack produce better answers than raw agentic file search on a real-world repo the model was not trained to answer questions about?

---

## Module Map

| Module | Size | Files |
|--------|------|-------|
| Request ID + 404 | Small | `lib/req-id-gen-factory.js`, `lib/four-oh-four.js` |
| Schema/Validation | Medium | `lib/schema-controller.js`, `lib/schemas.js`, `lib/validation.js` |
| Plugin System | Large | `lib/plugin-override.js`, `lib/plugin-utils.js`, `lib/hooks.js`, `lib/decorate.js`, `lib/context.js` |

---

## Q1 — Request ID Bitmask

**Question:** Why does fastify's request ID generator use a bitmask (& maxInt) to reset the counter rather than checking if it exceeds the maximum value with a conditional?

**Module:** Small (req-id-gen-factory.js)

### Context Pack

```
## Context pack
> Query: Why does fastify's request ID generator use a bitmask (& maxInt) to reset the counter rather than checking if it exceeds the maximum value with a conditional?  Budget: 6000 tokens | Used: ~3940 | 50 results

### Entities

- lib/request.js::Request [symbol] — score 1.000
- test/request-port.test.js::Request [symbol] — score 0.900
- test/internals/request.test.js::Request [symbol] — score 0.900
- test/internals/handle-request.test.js::Request [symbol] — score 0.858
- lib/request.js [module] — score 0.825
- fastify.js::Request [symbol] — score 0.825
- test/request-id.test.js [module] — score 0.698
... (50 results, ~3940 tokens)

### Edges
- lib/request.js defines Request [observed]
- Request is defined in lib/request.js [observed]
```

*(Pack retrieved `lib/request.js` as top result; did NOT surface `lib/req-id-gen-factory.js` directly — the bitmask lives in that file.)*

### Condition A — Bare

**Prompt:** Why does fastify's request ID generator use a bitmask (& maxInt) to reset the counter rather than checking if it exceeds the maximum value with a conditional?

**Answer:**
> Fastify's default request ID generator uses a bitmask (`& 2147483647`) to reset its counter for three primary technical reasons:
>
> 1. **Performance (Zero-Cost Abstraction):** A bitwise AND is executed in a single CPU clock cycle, while a conditional check introduces a branch.
> 2. **V8 Optimization (Smi):** By masking at 2147483647 (2^31 - 1), the counter stays within V8's Smi (Small Integer) range, avoiding heap allocation.
> 3. **Implicit Wrapping:** The bitmask provides clean single-line increment-and-wrap: `nextReqId = (nextReqId + 1) & 2147483647`.
>
> The model also recommended `hyperid` for globally unique IDs.

### Condition B — With Context

**Prompt:** [Context pack above + question]

**Answer:**
> Fastify's use of a bitmask (`& maxInt`) is a deliberate micro-optimization:
>
> 1. **Branchless Programming:** Avoids CPU branch prediction overhead vs. a conditional check.
> 2. **V8 SMI Optimization:** Integers within the 31-bit signed range (up to 2147483647) are stored as SMIs ("unboxed" in the pointer itself), avoiding heap allocation/GC overhead.
>
> *Grounded in: `lib/request.js` and `lib/handle-request.js`. Notes this is a "legacy of strict performance engineering."*

**Grade Placeholder:** [see grades.md]

---

## Q2 — Separate 404 Router

**Question:** Why does fastify maintain a separate 404 router instance (four-oh-four.js) using find-my-way rather than handling not-found routes as a special case within the main router?

**Module:** Small (four-oh-four.js)

### Context Pack

```
## Context pack
> Query: Why does fastify maintain a separate 404 router instance...  Budget: 6000 tokens | Used: ~1717 | 50 results

### Entities
- test/router-options.test.js::Fastify [symbol] — score 1.000
- lib/four-oh-four.js [module] — score 0.762
- lib/four-oh-four.js::FindMyWay [symbol] — score 0.707
- lib/four-oh-four.js::fourOhFour [symbol] — score 0.707
- lib/four-oh-four.js::Reply [symbol] — score 0.707
- lib/four-oh-four.js::Request [symbol] — score 0.707
... (50 results, ~1717 tokens)

### Edges
- test/router-options.test.js defines Fastify [observed]
```

*(Pack surfaced `lib/four-oh-four.js` and its key symbols. Low token usage — sparse pack.)*

### Condition A — Bare

**Answer:**
> - **Prefix-Aware Encapsulation:** Fastify allows different 404 handlers for different encapsulated scopes, managed per scope via a separate router instance.
> - **Radix Tree Optimization:** find-my-way uses a Radix Tree optimized for static/parametric routes. Integrating fallback logic would degrade performance.

### Condition B — With Context

**Answer:**
> Grounded specifically in `lib/four-oh-four.js` symbols (`kFourOhFourLevelInstance`, `kFourOhFourContext`):
>
> - **Scoped Not-Found Handlers:** Each encapsulated instance can have a custom 404 handler for its prefix (e.g., `/api` returns JSON, root returns HTML).
> - **Lifecycle Integration:** 404 handler runs full Fastify lifecycle (hooks like `onRequest`, `preHandler`) using correct Context/Request/Reply objects.
> - **Routing Constraints:** Respects version/header constraints even on 404 paths.
> - **Architectural Separation:** Prevents main router from being polluted with catch-all logic.

**Grade Placeholder:** [see grades.md]

---

## Q3 — SchemaController Factory Pattern

**Question:** Why does fastify's SchemaController use a factory pattern (buildSchemaController) and per-plugin-scope inheritance rather than a single global schema registry?

**Module:** Medium (schema-controller.js)

### Context Pack

```
## Context pack
> Query: Why does fastify's SchemaController use a factory pattern...  Budget: 6000 tokens | Used: ~2347 | 44 results

### Entities
- fastify.js::SchemaController [symbol] — score 1.000
- lib/schema-controller.js::buildSchemaController [symbol] — score 0.962
- lib/plugin-override.js::SchemaController [symbol] — score 0.846
- lib/schema-controller.js::SchemaController [symbol] — score 0.846
... (44 results)

### Edges
- lib/schema-controller.js defines buildSchemaController [observed]
- fastify.js defines SchemaController [observed]
- lib/plugin-override.js defines SchemaController [observed]
- lib/schema-controller.js defines SchemaController [observed]
```

*(Pack correctly surfaces all key files: `fastify.js`, `schema-controller.js`, `plugin-override.js` — the three files that collaborate on schema scoping.)*

### Condition A — Bare

**Answer:**
> - **Encapsulation and Isolation:** Global registry would cause schema ID collisions between independent plugins.
> - **Context-Aware Inheritance:** Top-down availability (global schemas reach children) with bottom-up isolation (local schemas don't leak).
> - **Granular Configuration (Compilers):** Different plugins may need different validator settings (e.g., `coerceTypes: true/false`).
> - **Performance:** Scoped resolution is deterministic and faster than searching a global registry.

### Condition B — With Context

**Answer:**
> *Directly grounded in `lib/schema-controller.js` comment: "Called at every fastify context that is being created."*
>
> - **Scope Isolation:** Factory creates per-context controllers preventing name collisions.
> - **Inheritance via `parentSchemaCtrl`:** Child inherits parent schemas (seen in `plugin-override.js`) without leakage.
> - **Consistency with Internal Patterns:** Mirrors how hooks, decorators, and loggers work (seen in `lib/plugin-override.js` + `lib/logger-factory.js`).
> - **Performance:** Tree-like hierarchy over flat global map enables predictable lookups matching the plugin graph structure.

**Grade Placeholder:** [see grades.md]

---

## Q4 — Separate Validator and Serializer Compilers

**Question:** Why does fastify separate the validator compiler (ajv) from the serializer compiler (fast-json-stringify) into two distinct pluggable compiler factories instead of using a single JSON schema processor for both?

**Module:** Medium (schema-controller.js, validation.js)

### Context Pack

```
## Context pack
> Query: Why does fastify separate the validator compiler (ajv) from the serializer compiler...  Budget: 6000 tokens | Used: ~2443 | 50 results

### Entities
- lib/error-serializer.js::validator [symbol] — score 1.000
- lib/error-serializer.js::Serializer [symbol] — score 0.670
- lib/config-validator.js [module] — score 0.549
- test/input-validation.js::Ajv [symbol] — score 0.472
- test/schema-feature.test.js::Ajv [symbol] — score 0.438
... (50 results)
```

*(Pack pulled `lib/error-serializer.js::validator` as top hit — weak signal for the question. Did NOT surface `lib/schema-controller.js` or `lib/validation.js` as top-ranked results. Pack provides some tangential signal.)*

### Condition A — Bare

**Answer:**
> Detailed answer covering:
> - **Opposing Data Flows:** Validation = non-destructive check (bool/errors). Serialization = destructive transformation (string).
> - **Specialized Optimizations:** Ajv compiles branching verification; fast-json-stringify compiles string-building ("2-5x faster").
> - **Security:** Serializer acts as output filter preventing accidental data leakage.
> - **Pluggability:** Swap validation (TypeBox, Joi, Zod) independently from serialization (Protocol Buffers, MessagePack).
> *(Included a full comparison table)*

### Condition B — With Context

**Answer:**
> *Grounded in `fastify.d.ts` confirming distinct `ValidatorFactory` and `SerializerFactory` imports from `@fastify/ajv-compiler` and `@fastify/fast-json-stringify-compiler`. Cites `test/input-validation.js` showing Joi/Yup can replace Ajv. References `kSchemaController` from `test/schema-feature.test.js`.*
>
> - Validation = complex constraint checking; Serialization = pre-compiled string-building (~faster than JSON.stringify).
> - Independent extensibility: swap validator without touching serializer.
> - Managed via `kSchemaController`, maintaining "low overhead" while enabling customizable developer experience.

**Grade Placeholder:** [see grades.md]

---

## Q5 — Eager Schema Compilation

**Question:** Why does fastify's schema validation system compile schemas at route registration time (during ready phase) rather than lazily on first request?

**Module:** Medium (schemas.js, validation.js, schema-controller.js)

### Context Pack

```
## Context pack
> Query: Why does fastify's schema validation system compile schemas at route registration time...  Budget: 6000 tokens | Used: ~2030 | 50 results

### Entities
- lib/schemas.js::Schemas [symbol] — score 1.000
- test/schema-validation.test.js::Schema [symbol] — score 0.995
- lib/schemas.js::normalizeSchema [symbol] — score 0.756
- lib/schemas.js::getSchemaSerializer [symbol] — score 0.756
- lib/validation.js [module] — score 0.562
- lib/validation.js::compileSchemasForValidation [symbol] — score 0.515
- lib/validation.js::compileSchemasForSerialization [symbol] — score 0.515
... (50 results)
```

*(Pack correctly surfaces `lib/schemas.js`, `lib/validation.js`, and the `compileSchemasForValidation`/`compileSchemasForSerialization` functions that are directly relevant.)*

### Condition A — Bare

**Answer:**
> - **Runtime Performance:** Pre-compilation removes heavy AOT overhead (new Function() calls) from hot request path.
> - **Predictability and Fail-Fast:** Schema errors caught at startup, not on first production request.
> - **Consistent Latency:** No "first request penalty."
> - **Security:** Schema compilation happens in controlled environment, not at runtime from potentially untrusted input.
> - **Trade-off:** Noted Serverless cold-start problem; mentioned Standalone Mode.

### Condition B — With Context

**Answer:**
> *Grounded in `lib/validation.js::compileSchemasForValidation` and `compileSchemasForSerialization`. Cites `lib/schemas.js` error constants (`FST_ERR_SCH_DUPLICATE`, `FST_ERR_SCH_MISSING_ID`) for early config validation. References `schemaBRefToA` test for $ref resolution at startup.*
>
> - Pre-compilation removes CPU-intensive overhead from request/response path.
> - Error constants confirm catch-at-startup philosophy.
> - `$ref` resolution requires full schema graph consistency before handling requests.

**Grade Placeholder:** [see grades.md]

---

## Q6 — Object.create for Plugin Scoping

**Question:** Why does fastify use Object.create(old) to create child plugin instances in plugin-override.js instead of using a deep-clone or constructor-based approach?

**Module:** Large (plugin-override.js)

### Context Pack

```
## Context pack
> Query: Why does fastify use Object.create(old) to create child plugin instances...  Budget: 6000 tokens | Used: ~3840 | 50 results

### Entities
- test/child-logger-factory.test.js::Fastify [symbol] — score 1.000
- test/encapsulated-child-logger-factory.test.js::Fastify [symbol] — score 0.937
- lib/plugin-override.js [module] — score 0.488
- lib/plugin-utils.js [module] — score 0.488
... (50 results)
```

*(Pack surfaces `lib/plugin-override.js` and `lib/plugin-utils.js` but ranks encapsulated-child-logger tests higher. The `skip-override` symbol mentioned in condition B answer is visible in `lib/plugin-utils.js`.)*

### Condition A — Bare

**Answer:**
> - **Inheritance without Leakage:** Child plugins see parent decorators/hooks via prototype chain; own additions don't propagate up.
> - **Zero-Copy Efficiency:** `Object.create` is constant-time vs. expensive deep-clone of complex server instance.
> - **Scoped Lifecycle:** Creates DAG of server instances where hooks strictly descend.
> - **Live Prototype Chain:** Parent changes before child init are naturally accessible.
> - **`fastify-plugin` escape hatch:** Explicitly mentioned as the way to bypass encapsulation for shared state.

### Condition B — With Context

**Answer:**
> *References `docs/Guides/Write-Plugin.md` (from pack) for "performance and low overhead" principle. Cites `lib/plugin-utils.js::skip-override` as escape hatch.*
>
> - `Object.create` = lightweight + avoids deep-clone cost.
> - Encapsulation: child adds own-properties that shadow parent without modifying it.
> - Automatic inheritance without manual property copying.
> - `fastify-plugin` wrapper bypasses this when global sharing intended.

**Grade Placeholder:** [see grades.md]

---

## Q7 — Lifecycle vs Application Hooks Separation

**Question:** Why does fastify's hook system separate lifecycle hooks (per-request, e.g. onRequest, preParsing) from application hooks (server-level, e.g. onRegister, onClose) into two distinct lists rather than using a single unified hook registry?

**Module:** Large (hooks.js)

### Context Pack

```
## Context pack
> Query: Why does fastify's hook system separate lifecycle hooks...  Budget: 6000 tokens | Used: ~2676 | 50 results

### Entities
- docs/Reference/Lifecycle.md [module] — score 1.000
- test/internals/hook-runner.test.js [module] — score 0.857
- lib/hooks.js::Hooks [symbol] — score 0.475
- lib/hooks.js [module] — score 0.392
- lib/hooks.js::applicationHooks [symbol] — score 0.359
- lib/hooks.js::lifecycleHooks [symbol] — score 0.359
- lib/hooks.js::hookRunnerApplication [symbol] — score 0.359
- lib/hooks.js::onRequestHookRunner [symbol] — score 0.359
... (50 results)

### Edges
- docs/Reference/Hooks.md and docs/Reference/Lifecycle.md co-change frequently (4 shared commits) [inferred]
```

*(Pack surfaces `lib/hooks.js::applicationHooks` and `lib/hooks.js::lifecycleHooks` directly — plus the inferred co-change edge between Hooks.md and Lifecycle.md is a real insight.)*

### Condition A — Bare

**Answer:**
> - **Encapsulation:** Lifecycle hooks follow strict prototypal inheritance (child-only); application hooks have different propagation rules (e.g., `onRoute` must trigger for all child route registrations).
> - **Performance (AOT Compilation):** Lifecycle hooks pre-flattened into arrays per-route at boot time. Application hooks are cold-path.
> - **Signature/Context Binding:** Lifecycle hooks → `(request, reply, done)`; Application hooks → Fastify instance.
> - **avvio Integration:** Application hooks tie into avvio's plugin loader state machine.

### Condition B — With Context

**Answer:**
> *Grounded in `lib/hooks.js` with named symbols (`hookRunnerGenerator`, `onSendHookRunner`, `hookRunnerApplication`). References `test/internals/hook-runner.test.js`. Cites inferred co-change edge between Lifecycle.md and Hooks.md.*
>
> - Lifecycle hooks use specialized runners (evidence: `hookRunnerGenerator`, `onSendHookRunner`) compiled for request hot-path.
> - Application hooks deal with instance state (`onRegister` = new plugin; `onClose` = cleanup).
> - Distinct signatures: lifecycle uses `(request, reply, next)`; application uses Fastify instance or config objects.
> - Separation avoids runtime type-checking overhead.

**Grade Placeholder:** [see grades.md]

---

## Q8 — Decorator Reference Type Error

**Question:** Why does fastify's decorator system throw an error when decorating with a plain object reference (checkReferenceType) instead of silently allowing it or deep-cloning the object?

**Module:** Large (decorate.js)

### Context Pack

```
## Context pack
> Query: Why does fastify's decorator system throw an error when decorating with a plain object reference...  Budget: 6000 tokens | Used: ~2634 | 50 results

### Entities
- test/throw.test.js [module] — score 1.000
- test/internals/decorator.test.js::decorator [symbol] — score 0.947
- fastify.js::decorator [symbol] — score 0.867
- test/decorator.test.js [module] — score 0.795
- lib/error-handler.js [module] — score 0.504
... (50 results)

### Edges
- test/throw.test.js defines Fastify [observed]
- test/internals/decorator.test.js defines decorator [observed]
```

*(Pack surfaced `test/throw.test.js` and `test/internals/decorator.test.js` — both directly test this behavior. Also surfaced `fastify.js::decorator`. Did NOT surface `lib/decorate.js` directly, where `checkReferenceType` lives.)*

### Condition A — Bare

**Answer:**
> - **Core Reason: Shared Reference Vulnerability** — all requests share same object in memory; mutations from one request are visible to others (security/race conditions).
> - **Why not deep-clone:** CPU/memory overhead per request; ambiguity about what developer intended.
> - **Recommended patterns:** Initialize with `null` + `onRequest` hook; use getter function; decorate Fastify instance for truly global state.
> - **Error code:** `FST_ERR_DEC_REFERENCE_TYPE`

### Condition B — With Context

**Answer:**
> *Grounded in `test/throw.test.js` (throws test suite) and `test/internals/decorator.test.js`. References `lib/error-handler.js` (where `FST_ERR_DEC_REFERENCE_TYPE` is catalogued).*
>
> - **Shared state contamination** — reference shared across all requests on Request/Reply prototype.
> - **Not deep-cloned** for performance + complex types (circular refs, class instances would fail).
> - **Correct pattern:** `decorateRequest('context', null)` to pre-define shape for V8 Hidden Class optimization, then assign fresh object per request in hook.
> - V8 Hidden Classes optimization explicitly mentioned as benefit of `null` initialization.

**Grade Placeholder:** [see grades.md]

---

## Q9 — Prototype Chain for Error Handler Inheritance

**Question:** Why does fastify use a prototype chain (Object.create(parent)) for error handler inheritance in buildErrorHandler rather than composing error handlers as an array or middleware stack?

**Module:** Large (error-handler.js)

### Context Pack

```
## Context pack
> Query: Why does fastify use a prototype chain (Object.create(parent)) for error handler inheritance in buildErrorHandler...  Budget: 6000 tokens | Used: ~2833 | 50 results

### Entities
- test/encapsulated-error-handler.test.js::Fastify [symbol] — score 1.000
- test/set-error-handler.test.js::Fastify [symbol] — score 1.000
- lib/error-handler.js [module] — score 0.984
- lib/error-handler.js::buildErrorHandler [symbol] — score 0.908
- lib/error-handler.js::handleError [symbol] — score 0.908
- lib/error-handler.js::defaultErrorHandler [symbol] — score 0.908
- lib/error-handler.js::rootErrorHandler [symbol] — score 0.908
- docs/Guides/Prototype-Poisoning.md [module] — score 0.894
... (50 results)

### Edges
- test/encapsulated-error-handler.test.js defines Fastify [observed]
- test/set-error-handler.test.js defines Fastify [observed]
```

*(Pack is highly relevant: surfaces `lib/error-handler.js::buildErrorHandler` directly, plus the `encapsulated-error-handler` test and `docs/Guides/Prototype-Poisoning.md`. The Prototype-Poisoning guide is uniquely useful context.)*

### Condition A — Bare

**Answer:**
> - **Hierarchical Encapsulation:** `Object.create` creates scoped override without polluting parent.
> - **Automatic Fallback:** Native JS prototype lookup vs. manual array iteration.
> - **Performance:** `Object.create` is native + highly optimized vs. array management.
> - **Implementation Detail:** `buildErrorHandler` uses `kErrorHandlerAlreadySet` flag on the child object.

### Condition B — With Context

**Answer:**
> *Grounded in `test/encapsulated-error-handler.test.js` and `test/set-error-handler.test.js` (evidenced from pack). References `lib/error-handler.js::buildErrorHandler` directly. Notes "tricky control flow" mentioned in test comments.*
>
> - **Hierarchical Resolution:** JS engine traverses prototype chain natively — mirrors nested plugin tree perfectly.
> - **Memory Efficiency:** Children share parent handler by reference; only shadow when `setErrorHandler` called.
> - **Shadowing over Mutation:** `setErrorHandler` adds own-property to child, doesn't mutate parent.
> - Engine-optimized property lookup = faster than middleware stack iteration.

**Grade Placeholder:** [see grades.md]
