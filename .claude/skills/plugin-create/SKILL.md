---
name: plugin-create
description: "Guide the creation of a high-quality engram enrichment plugin — js-module or executable transport — with correct manifest, auth, scope, vocab, aliases, cursor, and tests"
disable-model-invocation: true
---

# Plugin Create — Interactive Guidance for Engram Adapter Authors

You are helping the user design, implement, and test a new engram enrichment plugin. The
output must be a correct, idempotent adapter that respects engram's evidence-first,
vocabulary-controlled, temporally-aware data model — not a generic "write a REST client"
exercise.

This skill assumes the reader is an arbitrary LLM with no prior knowledge of the engram
plugin contract. Use it as the single source of truth for the conversation; cross-check
only the files it cites.

## Input

```
/plugin-create                      — Full interactive flow (all phases)
/plugin-create --transport=js       — Skip the transport question, pick js-module
/plugin-create --transport=exec     — Skip the transport question, pick executable
/plugin-create --review <dir>       — Run the quality checklist against an existing plugin
```

Arguments: `$ARGUMENTS`

---

## Authoritative files — read these first if unsure

Do not paraphrase these from memory. Re-read before quoting specifics:

| File | Why |
|---|---|
| `packages/engram-core/src/ingest/adapter.ts` | `EnrichmentAdapter`, `AuthCredential`, `ScopeSchema`, `applyCompatShim`, `assertAuthKind`, `EnrichmentAdapterError` |
| `packages/engram-core/src/ingest/cursor.ts` | `readIsoCursor`, `readNumericCursor`, `writeCursor` |
| `packages/engram-core/src/vocab/` | `ENTITY_TYPES`, `EPISODE_SOURCE_TYPES`, `INGESTION_SOURCE_TYPES`, `RELATION_TYPES` — **always import, never inline** |
| `packages/engram-core/src/plugins/manifest.ts` | The enforced manifest schema + validation rules |
| `packages/engram-core/src/plugins/transport/js-module.ts` | How a js-module is dynamically imported; what the default export must look like |
| `packages/engram-core/src/plugins/transport/executable.ts` | The actual wire shape the loader reads from subprocess stdio (see §8 — this diverges from the spec doc) |
| `packages/engram-core/src/plugins/discover.ts` | Where plugins are found (XDG / project-local / bundled) |
| `packages/plugins/gerrit/` | Reference in-repo js-module plugin (manifest, index, helpers, tests) |
| `docs/internal/specs/adapter-contract.md` | Full v2 contract prose |
| `docs/internal/specs/adapter-aliases.md` | Required shorthand alias registration |
| `docs/internal/specs/plugin-loading.md` | Loader precedence, manifest JSON-schema, vocab-extension merge rules |
| `docs/internal/specs/vocabulary.md` | How to add a new vocab value |
| `docs/internal/specs/cross-source-references.md` | How aliases feed the cross-ref resolver |

If any of these are missing, fall back to file search — do not fabricate. Flag the gap to
the user.

---

## Overview — six phases

| Phase | Name | Key decision |
|---|---|---|
| 1 | Intent | What external source, what entities/edges, what is enrichment vs. ingestion? |
| 2 | Transport | `js-module` (in-process TS/JS) vs. `executable` (subprocess, any language) |
| 3 | Contract surface | Auth kinds, scope format, cursor semantics, vocab extensions |
| 4 | Scaffolding | Manifest + entry file + package wiring (js-module) or executable script |
| 5 | Implementation | Walk through the enrich loop: episode → entity → alias → edge → cursor |
| 6 | Testing + review | Unit tests with mocked I/O, idempotency assertion, `verifyGraph`, checklist |

Each phase produces a concrete artifact. Stop between phases for user confirmation — this
is a design conversation, not a template renderer.

---

## Phase 0 — Prerequisites

Before starting, verify:

```bash
# Plugin machinery is present
ls packages/engram-core/src/plugins/            # must exist
ls packages/engram-core/src/ingest/adapter.ts   # must exist
ls packages/plugins/                            # reference plugins (gerrit)

# Required tooling
bun --version
```

If any are missing, stop and surface to the user. Do not proceed on guesses.

Also confirm the working directory is the engram repo root. A plugin can live **inside**
this repo (bundled) or **outside** (user-authored) — ask the user:

```
Where will this plugin live?

  1. Inside this repo, as a bundled first-party plugin at
     packages/plugins/<name>/. Shipped with engram; installable via
     `engram plugin install <name>`.

  2. Outside this repo, as a standalone user plugin dropped into
     ~/.local/share/engram/plugins/<name>/ or .engram/plugins/<name>/.

Choose (1) if you're upstreaming the plugin. Choose (2) for private
integrations or experimentation.
```

Record the answer — it affects §4 scaffolding.

---

## Phase 1 — Intent

Ask 3–4 questions at a time. This is the highest-leverage phase; an unclear intent
produces low-quality plugins regardless of how carefully the rest is done.

### Round 1 — What is the source?

1. **Source system** — what upstream system are you pulling from? (e.g. Gerrit, GitLab,
   Jira, Notion, an internal REST API, a local SQLite file, a gRPC service.)
2. **Access pattern** — REST with pagination? WebSocket? SSE? Local file tail? CLI scrape?
   Bulk export? This drives whether cursor-based resume is even meaningful.
3. **Auth model** — personal access token? OAuth2? HTTP Basic? mTLS? Service account JSON?
   Map to one of the `AuthCredential` variants (see §3.1).

### Round 2 — What gets into the graph?

4. **Episodes** — what is the smallest immutable unit you would call "an observation"?
   (e.g. a Gerrit change = 1 episode. A PR with 30 comments — is that 1 episode or 31?
   The v0.1 convention is 1 episode per top-level item, with comments folded into
   metadata or separate child episodes. Follow the GitHub/Gerrit precedent.)
5. **Entities** — which `ENTITY_TYPES` members apply? (`person`, `module`, `service`,
   `file`, `symbol`, `commit`, `pull_request`, `issue`.) If none fit, that's a vocab
   extension — see §3.4, and be prepared to justify why the existing set is insufficient.
6. **Edges** — which `RELATION_TYPES` members apply? (`authored_by`, `reviewed_by`,
   `references`, `likely_owner_of`, `co_changes_with`, `contains`, `defined_in`,
   `imports`.) Same vocab-extension question.
7. **Edge kind** — is each edge `observed` (extracted directly), `inferred` (heuristic),
   or `asserted` (human-stated)? Adapters almost always emit `observed`. Never mislabel.

### Round 3 — Provenance

8. **Cross-source references** — does this source reference items from other sources
   (e.g. a Gerrit commit message containing `Fixes #123`)? If yes, the plugin must
   register shorthand aliases so the cross-ref resolver can find its entities. See §3.5.
9. **Privacy** — does the source contain PII, secrets, or other sensitive content that
   should be redactable? Remind: episode content is stored verbatim. Note this for the
   PR body.

### Red flags — push back on any of these

- "Let's just dump everything into one giant episode." → Episodes must be atomic units
  of evidence. Multi-item dumps break supersession and redaction.
- "Let's skip evidence on the edge." → Evidence is a hard invariant. Every `addEdge`
  call requires `EvidenceInput`.
- "We'll store the token as an entity property so we can reuse it." → **Never.** Tokens
  are passed via `opts.auth` and never written to the graph.
- "Let's use a string literal for the source_type." → Never. Import from
  `vocab/source-types.ts`. If the value doesn't exist, either it belongs in the
  registry (and you should propose it) or it is a namespaced vocab extension.

At the end of Phase 1, **write a short design note** (inline in the conversation, no
file) capturing: source name, transport (guess is fine), auth kind, the entity/edge
types that will be emitted, whether cursor is supported, whether vocab extensions are
needed. This becomes the structured input for the remaining phases.

---

## Phase 2 — Transport

Two transports are supported. Pick one; mixing is not allowed.

### 2.1 `js-module` transport

**Choose when**: The author writes TypeScript/JavaScript and is comfortable with Bun's
workspace model. Wants access to the `EngramGraph` object directly and to use
engram's graph helpers (`addEntity`, `addEdge`, `resolveEntity`) in-process.

**Implications**:
- Runs in the engram process. No IPC overhead.
- Must `import` from `engram-core` (or `../../packages/engram-core/...` for in-tree dev).
- Default export must satisfy the `EnrichmentAdapter` interface (see §5.1).
- Supports the full `AuthCredential` union, including `oauth2.refresh` callbacks.
- Shares the process's SQLite connection. Careful with long-running loops: yield
  control back with `await` so progress callbacks fire.

### 2.2 `executable` transport

**Choose when**: The author prefers a non-JS language (Python, Go, Rust, shell), wants
isolation, or needs to reuse an existing binary. The plugin is spawned per `enrich()`
call and speaks newline-delimited JSON over stdin/stdout.

**Implications**:
- Engram owns all SQLite writes. The subprocess **must not** attempt to open the
  `.engram` file.
- Credentials are serialized over stdin — if your executable logs stdin, **tokens will
  leak into logs**. Tell the user explicitly.
- OAuth refresh callbacks cannot cross the process boundary. Refresh must be handled
  inside the plugin (e.g. it calls its own refresh endpoint on 401).
- The current loader (`transport/executable.ts`) enforces a 60-second timeout per run
  and a 10MB per-line cap. Plan pagination accordingly.
- **The wire shape in the loader code diverges from the prose spec.** See §8 for what
  the loader actually reads. When they disagree, the loader wins — that is the code
  the plugin actually talks to.

If the user is unsure, recommend `js-module` for first-party integrations and tight
loops, `executable` for integrations with existing non-JS tooling or when isolation
matters more than throughput.

---

## Phase 3 — Contract surface

Walk the user through each axis of the adapter contract and record the chosen value.
Every item here maps directly to a field in the manifest or the adapter object.

### 3.1 AuthCredential kinds

The `AuthCredential` union is defined in `packages/engram-core/src/ingest/adapter.ts`:

```ts
type AuthCredential =
  | { kind: "none" }
  | { kind: "bearer"; token: string }
  | { kind: "basic"; username: string; secret: string }
  | { kind: "service_account"; keyJson: string }
  | { kind: "oauth2"; token: string; scopes: string[]; refresh?: () => Promise<string> };
```

Pick **only** the kinds your source actually needs. Declare them in `supportedAuth` on
the adapter object. `assertAuthKind(this, opts)` at the start of `enrich()` enforces it.

**Guidance per variant**:

| Variant | Use when | Pitfalls |
|---|---|---|
| `none` | Public endpoints, local filesystem sources | Still declare it — `supportedAuth` must not be empty |
| `bearer` | Personal access tokens (GitHub, GitLab) | Do not log the token; mask it in error messages |
| `basic` | Legacy APIs (Gerrit HTTP password, Jira cloud with email + token) | `username:secret` is the concatenation format — don't forget the colon |
| `service_account` | Google APIs, some GCP services | `keyJson` is a full JSON string, not a file path |
| `oauth2` | Sources with short-lived tokens | `refresh` callback only works in `js-module` — document clearly |

For `executable` transport, the loader currently sends `auth` as a plain string
(`opts.token`) — not as an `AuthCredential` object. The v2 object shape is not yet
implemented in `transport/executable.ts`. Executable plugins receive a bare token
string in the `enrich.auth` field and should treat it as a bearer token until the
wire shape is upgraded.

### 3.2 Scope schema

Every adapter declares a `ScopeSchema`. Shape:

```ts
interface ScopeSchema {
  description: string;              // human-readable format hint
  validate(scope: string): void;    // throws on invalid input
}
```

Write the validator defensively — an adapter that accepts garbage scope values will
write garbage to `ingestion_runs.source_scope`, polluting the cursor lookups.

Good validators:
- Reject empty strings
- Reject leading/trailing slashes (Gerrit pattern)
- Match a format regex where possible (GitHub `owner/repo`)
- Throw a plain `Error` with a clear message that shows the received value via
  `JSON.stringify(scope)` — this prevents user confusion when the value has invisible
  whitespace.

### 3.3 Cursor semantics

If your source supports incremental pulls, set `supportsCursor: true` and use the
helpers from `cursor.ts`:

```ts
// Read at the start of enrich()
const lastSeen = readNumericCursor(graph, SOURCE_TYPE, scope);   // or readIsoCursor
// ... process items newer than lastSeen ...
writeCursor(graph, runId, cursor);   // at the end, before marking run completed
```

Choose **numeric** cursors for monotonically-increasing IDs (PR numbers, Gerrit change
numbers, offset pagination). Choose **ISO8601** cursors for timestamp-based resume.
Do not invent a third encoding — use the existing helpers.

`supportsCursor: false` is acceptable for sources that do not support incremental
pulls (e.g. a one-shot import). Say so in the manifest; do not pretend to support it.

### 3.4 Vocab extensions

**Default position: you do not need vocab extensions.** The built-in vocabulary covers
the common cases. Only extend when the external source genuinely expresses a concept
with no equivalent in `ENTITY_TYPES`, `EPISODE_SOURCE_TYPES`, `INGESTION_SOURCE_TYPES`,
or `RELATION_TYPES`.

If an extension is needed:
- Namespace the value: `<plugin-name>/<value>` (e.g. `my-plugin/incident`).
- Bare names risk collision with future built-ins and will warn.
- Declare under `vocab_extensions` in the manifest.
- Collisions with built-ins are **fatal** — the loader refuses to load the plugin.

If the user proposes extending to a concept that already has a built-in (e.g. a
"reviewer" edge when `reviewed_by` exists), push back and use the built-in.

### 3.5 Alias convention

Required for cross-source references to work. Read
`docs/internal/specs/adapter-aliases.md` for the full table, but the short version:

After creating each entity, call `addEntityAlias` for the shorthand form(s). Examples:

| Source | canonical_name | Required aliases |
|---|---|---|
| GitHub PR | `https://github.com/<owner>/<repo>/pull/<N>` | `#<N>`, `<owner>/<repo>#<N>` |
| Git commit | full 40-char SHA | 7-char SHA prefix |
| Gerrit change | change URL | `CL/<N>`, bare number |

`addEntityAlias` does not dedupe. Register aliases only on newly-created entities (not
on resolved existing ones) to keep the tables clean. The Gerrit plugin
(`packages/plugins/gerrit/src/helpers.ts`) is the reference.

---

## Phase 4 — Scaffolding

### 4.1 js-module plugin layout (in-repo)

```
packages/plugins/<name>/
├── manifest.json
├── package.json
├── src/
│   ├── index.ts            # default export + EnrichmentAdapter
│   └── helpers.ts          # ingestion_runs + per-item ingest logic
└── test/
    └── <name>.test.ts      # bun:test with mocked fetch
```

### 4.2 Reference manifest — js-module

Copy from `packages/plugins/gerrit/manifest.json` and adapt. The `capabilities` block
is validated by `packages/engram-core/src/plugins/manifest.ts` — do not omit
`supported_auth`, `supports_cursor`, or `scope_schema`.

```json
{
  "name": "<kebab-case-name>",
  "version": "0.1.0",
  "contract_version": 1,
  "transport": "js-module",
  "entry": "src/index.ts",
  "capabilities": {
    "supported_auth": ["bearer", "none"],
    "supports_cursor": true,
    "scope_schema": {
      "description": "<human-readable format hint, e.g. 'owner/repo'>",
      "pattern": "<regex to match the scope string>"
    }
  }
}
```

Notes from the live schema validator:
- `name` must be lowercase alphanumeric + hyphens.
- `contract_version` must be `1` (or the current `CURRENT_CONTRACT_VERSION` — check
  `packages/engram-core/src/plugins/manifest.ts`).
- `entry` must resolve inside the plugin dir (path traversal is rejected).
- `vocab_extensions` values must be namespaced (`<plugin-name>/<value>`); collisions
  with built-ins are rejected. No per-category count limit is currently enforced by
  the validator (spec proposes 50 but it is not implemented).

### 4.3 Reference `package.json` — js-module

```json
{
  "name": "@engram/plugin-<name>",
  "version": "0.1.0",
  "description": "<One-line description>",
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "build": "echo 'plugin: no build step required'",
    "test": "bun test"
  },
  "dependencies": {
    "engram-core": "workspace:*",
    "ulid": "^2.3.0"
  }
}
```

### 4.4 Executable plugin layout (in-repo)

```
packages/plugins/<name>/
├── manifest.json       # transport: "executable", entry: "<script-name>"
├── <script-name>       # the executable (chmod +x), any language
└── test/               # bats / pytest / whatever your language supports
```

### 4.5 Reference manifest — executable

```json
{
  "name": "<name>",
  "version": "0.1.0",
  "contract_version": 1,
  "transport": "executable",
  "entry": "plugin.py",
  "capabilities": {
    "supported_auth": ["bearer"],
    "supports_cursor": false,
    "scope_schema": {
      "description": "<format hint>",
      "pattern": "<regex>"
    }
  }
}
```

The entry file must be executable (`chmod +x`) and have a shebang on POSIX. On
Windows, `.py` files dispatch via the system interpreter (see
`docs/internal/specs/plugin-loading.md` §3.2).

### 4.6 External / user-authored plugin

Same layout as the in-repo case, but the directory lives at:

- User-wide: `$XDG_DATA_HOME/engram/plugins/<name>/` (fallback
  `~/.local/share/engram/plugins/<name>/`)
- Project-local: `<project>/.engram/plugins/<name>/`

Project-local overrides user-wide on name collision.

---

## Phase 5 — Implementation walk-through

This is the heart of the skill. Walk the user through the enrich loop, pausing for
questions at each step.

### 5.1 js-module — the `enrich()` shape

Every js-module adapter looks structurally the same. Use this scaffold and fill in
the source-specific pieces.

```ts
import type {
  AuthCredential,
  EngramGraph,
  EnrichmentAdapter,
  EnrichOpts,
  IngestResult,
  ScopeSchema,
} from "engram-core";
import {
  applyCompatShim,
  assertAuthKind,
  INGESTION_SOURCE_TYPES,
  readNumericCursor,
} from "engram-core";
import { /* helpers */ } from "./helpers.js";

// 1. Scope schema — see §3.2
export const myScopeSchema: ScopeSchema = {
  description: "<format hint>",
  validate(scope) {
    if (!scope || !/^<regex>$/.test(scope)) {
      throw new Error(
        `MyAdapter: scope must be <format>, got: ${JSON.stringify(scope)}`,
      );
    }
  },
};

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.XXX;  // or namespaced extension

export class MyAdapter implements EnrichmentAdapter {
  name = "<name>";               // must match manifest.name
  kind = "enrichment";
  supportedAuth: AuthCredential["kind"][] = ["bearer", "none"];
  scopeSchema: ScopeSchema = myScopeSchema;
  supportsCursor = true;

  // Inject fetchFn so tests can mock the network.
  private fetchFn: typeof fetch;
  constructor(fetchFn?: typeof fetch) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
    // A. Compat shim: token→auth, repo→scope (+ one-shot deprecation warning)
    opts = applyCompatShim(opts);

    // B. Auth kind check — throws EnrichmentAdapterError('auth_failure') if bad
    assertAuthKind(this, opts);

    // C. Resolve & validate scope
    const scope = opts.scope ?? opts.repo;
    if (!scope) throw new Error("MyAdapter: opts.scope is required");
    this.scopeSchema.validate(scope);

    // D. Materialise the auth string your HTTP client actually needs
    //    (never store it, never log it)
    const token = resolveTokenFromAuth(opts);

    // E. Create the ingestion run row (skip in dry-run)
    const runId = opts.dryRun ? "" : createIngestionRun(graph, /* sourceScope */).id;
    const totals: IngestResult = zeroIngestResult(runId);

    try {
      // F. Read cursor, loop until no more data
      let cursor = opts.dryRun ? 0 : readNumericCursor(graph, SOURCE_TYPE, scope);
      let hasMore = true;
      while (hasMore) {
        const batch = await fetchBatch(/* ... */);
        if (batch.length === 0) break;
        hasMore = /* peek last-page marker */;
        for (const item of batch) {
          if (opts.dryRun) { totals.episodesCreated++; continue; }
          const counts = ingestItem(graph, item);
          accumulate(totals, counts);
        }
        cursor += batch.length;
        opts.onProgress?.({ phase: "fetching", fetched: cursor,
                           created: totals.episodesCreated,
                           skipped: totals.episodesSkipped });
      }
      // G. Persist cursor + mark run completed
      if (!opts.dryRun) {
        completeIngestionRun(graph, runId, cursor > 0 ? String(cursor) : null, totals);
      }
      return totals;
    } catch (err) {
      // H. Fail the run (preserves partial writes, flags the row as failed)
      if (!opts.dryRun && runId) failIngestionRun(graph, runId, errMsg(err));
      throw err;
    }
  }
}

// Required by the js-module loader.
export default new MyAdapter();
```

**The exact order matters.** `applyCompatShim` must run before `assertAuthKind`
(because the shim synthesises `auth` from legacy `token`), and both must run before
`scopeSchema.validate` (the caller expects auth errors before scope errors).

### 5.2 The per-item ingest function

Each `ingestItem(graph, item)` call is where the evidence-first discipline gets
exercised. The pattern:

```ts
export function ingestItem(graph: EngramGraph, item: SourceItem): Partial<IngestResult> {
  const sourceRef = /* stable URL for the item */;
  const occurredAt = /* ISO8601 from the source */;

  // 1. Episode — dedup'd on (source_type, source_ref) inside addEpisode
  const episode = addEpisode(graph, {
    source_type: EPISODE_SOURCE_TYPES.XXX,
    source_ref: sourceRef,
    content: /* raw textual payload */,
    actor: /* upstream actor if available */,
    timestamp: occurredAt,
    metadata: { /* small non-PII fields */ },
  });

  // 2. Entity — resolve first, create with evidence if new.
  //    Always pass entity_type to resolveEntity — canonical_name is not unique
  //    across types and the wrong entity can be returned without the filter.
  const canonicalName = /* stable identifier */;
  let entity = resolveEntity(graph, canonicalName, ENTITY_TYPES.PULL_REQUEST);
  let entityIsNew = false;
  if (!entity) {
    entity = addEntity(graph,
      { canonical_name: canonicalName, entity_type: ENTITY_TYPES.PULL_REQUEST },
      [{ episode_id: episode.id, extractor: `plugin:${PLUGIN_NAME}` }],
    );
    entityIsNew = true;
  }

  // 3. Aliases — only for newly-created entities (see §3.5)
  if (entityIsNew) {
    addEntityAlias(graph, { entity_id: entity.id,
                            alias: `#${item.number}`,
                            episode_id: episode.id });
    addEntityAlias(graph, { entity_id: entity.id,
                            alias: `${scope}#${item.number}`,
                            episode_id: episode.id });
  }

  // 4. Related entities (author, reviewers, etc.) — same resolve-or-create pattern

  // 5. Edges — all observed, all evidence-linked, all temporally bounded
  addEdge(graph,
    { source_id: entity.id, target_id: authorEntity.id,
      relation_type: RELATION_TYPES.AUTHORED_BY,
      edge_kind: "observed",
      fact: `${canonicalName} authored by ${authorEmail}`,
      valid_from: occurredAt,
      valid_until: null },
    [{ episode_id: episode.id, extractor: `plugin:${PLUGIN_NAME}` }],
  );

  return { /* counts */ };
}
```

**Hard rules to state explicitly in the conversation**:

1. Every `addEntity` and `addEdge` call takes `EvidenceInput[]` — never skip it.
2. All `entity_type` / `source_type` / `relation_type` values come from
   `vocab/*`. Never inline literals. Namespaced extensions are the exception.
3. `edge_kind` is `observed` unless the user has a specific reason for `inferred`
   or `asserted`. Mislabelled edges erode trust in the graph.
4. `valid_from` should be the upstream `occurred_at`, not `new Date()`. The
   difference matters for supersession ordering.
5. Skip self-relations (alice authoring, alice reviewing). The Gerrit plugin does
   this; add the same check.

### 5.3 Executable — the wire protocol (as actually implemented)

The prose spec (`docs/internal/specs/plugin-loading.md`) and the current loader
(`packages/engram-core/src/plugins/transport/executable.ts`) disagree. **The loader is
the source of truth** because that's the code the plugin talks to. See §8 for the
reconciliation guidance; use the loader-shaped messages below when writing code.

**Engram → plugin** (actual loader behavior — `transport/executable.ts`):
```json
{"op": "hello", "contract_version": 1}
{"op": "enrich", "scope": "<opts.repo string>", "auth": "<opts.token string>",
 "since": "<ISO8601 or null>", "cursor": null, "dry_run": false}
```

> **Current limitation**: the loader sends `scope` as `opts.repo` (the legacy field)
> and `auth` as a plain token string (`opts.token`), not as a v2 `AuthCredential`
> object. The v2 `opts.scope` / `opts.auth` object fields are not yet forwarded to
> executable plugins.

**Plugin → engram** (each on its own line, flushed):
```json
{"type": "hello_ack", "contract_version": 1, "capabilities": {...}}
{"type": "episode", "source_type": "...", "source_ref": "...",
 "content": "...", "actor": "...", "timestamp": "<ISO8601>",
 "metadata": {...}}
{"type": "entity", "canonical_name": "...", "entity_type": "...",
 "summary": "...", "episode_ref": "<source_ref of the episode above>"}
{"type": "edge", "source_ref": "<entity canonical_name>",
 "target_ref": "<entity canonical_name>",
 "relation_type": "...", "edge_kind": "observed",
 "fact": "...", "episode_ref": "<source_ref>"}
{"type": "progress", "phase": "...", "fetched": N, "created": N, "skipped": N}
{"type": "done", "cursor": "<opaque or null>"}
```

Notes:
- `episode_ref` on entity/edge records is the `source_ref` of an earlier episode
  record in the same run — **not** an internal id. The loader maintains a map.
- Entity records do **not** carry evidence explicitly; the loader synthesises
  evidence from the referenced episode.
- Edge `source_ref` / `target_ref` are entity canonical names, resolved by the
  loader. Both entities must have been emitted earlier in the same run.
- **`valid_from`/`valid_until` are not supported in the edge wire format.** The
  `EdgeRecord` interface has no validity fields, and the loader calls `addEdge`
  without them. Temporal bounds on executable-plugin edges are a current limitation.
- **`done.cursor` is currently ignored by the loader.** The transport does not
  persist it to `ingestion_runs`. Cursor resume does not work for executable plugins
  today — document this in the plugin's README.
- An `{type: "error", message: "..."}` record ends the run with a fatal error.
- 60-second timeout, 10 MB per-line cap. Paginate and flush.

Tell the executable-plugin author to test the handshake first in isolation
(`echo '{"op":"hello","contract_version":1}' | ./plugin.py`) before wiring in
real data.

---

## Phase 6 — Testing and review

This is where quality is won or lost. Ask the user to write tests **before** the
review checklist, not after, so you find bugs with evidence rather than with
speculation.

### 6.1 js-module tests — the Gerrit pattern

Copy the shape from `packages/plugins/gerrit/test/gerrit.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { closeGraph, createGraph, resolveEntity, verifyGraph } from "engram-core";
import { MyAdapter } from "../src/index.js";

let graph: EngramGraph;
beforeEach(() => { graph = createGraph(":memory:"); });
afterEach(() => { closeGraph(graph); });

function makeFetch(responses: Record<string, unknown>): typeof fetch {
  return async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(body), { status: 200 });
      }
    }
    return new Response("[]", { status: 200 });
  };
}
```

Required test cases — **do not ship without all of these**:

1. **Episode creation** — `expect(episode.source_type).toBe(EPISODE_SOURCE_TYPES.XXX)`.
2. **Entity creation with evidence** — query `evidence_*` tables and assert linkage.
3. **Alias resolution** — call `resolveEntity(graph, shorthand)` and expect the entity.
4. **Edge creation** — query `edges` and assert `relation_type`, `edge_kind`,
   `valid_from`, `invalidated_at IS NULL`.
5. **Self-relation skipped** — author reviewing their own item must not produce an
   edge.
6. **Idempotency** — run `enrich()` twice; second run's `episodesCreated === 0` and
   `episodesSkipped > 0`.
7. **Cursor resume** — seed `ingestion_runs` with a cursor, run, assert newer items
   are fetched and older are skipped.
8. **Auth failure** — pass a rejected token, assert `EnrichmentAdapterError` with
   `code: "auth_failure"`.
9. **Scope validation** — pass a bad scope string, assert the scope error is thrown
   before any network call.
10. **`verifyGraph(graph).valid === true`** — run after every ingest. Catches evidence
    violations, orphan entities, and vocab drift if strict mode is on.

Run `bun test` after each test is added.

### 6.2 Executable tests

Test the protocol separately from the business logic:

1. **Handshake** — feed `{"op":"hello",...}`, assert `hello_ack` is emitted with the
   right `contract_version`.
2. **Enrich dry-run** — feed `{"op":"enrich","dry_run":true,...}`, assert no writes
   are made (the test needs to snapshot the filesystem/API, or the plugin must be
   pure).
3. **Happy path** — feed a realistic `enrich` request, capture stdout lines, assert
   the sequence: zero or more `episode`/`entity`/`edge`/`progress`, terminated by
   `done`.
4. **Error path** — feed a request that triggers your rate-limit handling, assert an
   `error` record is emitted.
5. **Exit code** — fatal failure exits non-zero; clean completion exits 0 after `done`.

Language is up to the author. `bats` works well for bash, `pytest` with
`subprocess.Popen` for Python.

### 6.3 Quality checklist — run before opening a PR

Read through this with the user. Fix every failing item.

#### Manifest
- [ ] `name` matches the directory name and the `name` field on the default export
- [ ] `contract_version` matches `CURRENT_CONTRACT_VERSION` in
      `packages/engram-core/src/plugins/manifest.ts`
- [ ] `transport` is `js-module` or `executable`, not a typo
- [ ] `entry` is a relative path that exists on disk
- [ ] `capabilities.supported_auth` is non-empty and includes every kind the code
      checks for
- [ ] `capabilities.supports_cursor` matches reality (the code actually reads/writes
      the cursor)
- [ ] `capabilities.scope_schema.description` reads like a helpful error message
- [ ] No vocab extensions declared unless genuinely needed — and if declared, all
      values are namespaced

#### Adapter object (js-module)
- [ ] `supportedAuth` is typed `AuthCredential["kind"][]` — not a bare `string[]`
- [ ] `enrich()` calls `applyCompatShim(opts)` first, then `assertAuthKind(this, opts)`
- [ ] `scopeSchema.validate` is called and rejects empty / malformed scopes
- [ ] Token material never flows into `addEntity`, `addEdge`, metadata, or the graph
- [ ] Default export is an `EnrichmentAdapter` instance (not a class, not a factory)

#### Data integrity
- [ ] All `source_type` / `entity_type` / `relation_type` values come from `vocab/*`
- [ ] Every `addEntity` and `addEdge` call passes `EvidenceInput[]`
- [ ] `edge_kind` is `observed` (or a justified other value)
- [ ] `valid_from` is the upstream timestamp, not wall-clock now
- [ ] Self-relations are skipped
- [ ] Shorthand aliases are registered per the adapter-aliases spec
- [ ] `ingestion_runs` is opened with `createIngestionRun` and closed with
      `completeIngestionRun` or `failIngestionRun` in every exit path (including
      exceptions)

#### Idempotency
- [ ] Running the same enrich twice in a row produces zero new episodes on the second
      run
- [ ] Aliases are only added on newly-created entities, not on resolved ones
- [ ] Cursor is written only after the run completes without exception

#### Tests
- [ ] All ten cases in §6.1 (or §6.2) are covered
- [ ] Tests use `createGraph(":memory:")` — no disk state leaks between tests
- [ ] `verifyGraph(graph).valid === true` at the end of each positive-path test
- [ ] `bun test` passes; `bun run lint` passes; `bun run build` passes

#### Security
- [ ] No secrets in the manifest, source, or tests
- [ ] Token/secret masked in all log and error messages
- [ ] For executable plugins: stdin isn't logged; auth stays in-memory
- [ ] Path parameters are validated before being interpolated into URLs

#### Documentation
- [ ] Top-of-file comment explains: what source, what auth, any quirks (e.g. Gerrit's
      XSSI prefix)
- [ ] PR description lists which `vocab/*` values are used and flags any extensions
- [ ] `README.md` or equivalent at the plugin root describes install + usage

### 6.4 Reviewing an existing plugin (`--review` flag)

When invoked as `/plugin-create --review <dir>`:

1. Read `manifest.json`, the entry file, any helper files, and the tests.
2. Run through §6.3 top to bottom. For each failing item, quote the file:line and
   suggest a fix.
3. Run `bun test` in the plugin's package (or the language's equivalent) and report
   pass/fail.
4. Produce a summary at the end: `N/M checklist items passing`, grouped by severity
   (critical = data integrity / auth; major = idempotency / vocab; minor =
   documentation / style).

Do not rewrite code in review mode unless the user explicitly says "fix them."

---

## §7 — Common pitfalls (answer these proactively)

| Pitfall | Symptom | Fix |
|---|---|---|
| Inlining `"pull_request"` etc. | Silent drift; `verifyGraph({strict:true})` fails | Import from `vocab/*` |
| Writing tokens into entity properties | Token leaks in `engram export`, `engram context` | Only use `opts.auth`; never persist |
| Skipping `applyCompatShim` | Legacy CLI callers break | Always call it first in `enrich()` |
| Forgetting aliases | `#123` in commit messages never resolves | Register aliases per `adapter-aliases.md` |
| Using `new Date().toISOString()` for `valid_from` | Supersession ordering is wall-clock-sensitive | Use the upstream `occurred_at` |
| Emitting edges with `edge_kind: "asserted"` for API-derived data | Trust signals wrong | Use `"observed"` |
| Emitting one giant episode per run | Can't redact individual items | One episode per atomic upstream item |
| Blowing past 10 MB per line (executable) | Plugin killed mid-run | Paginate; keep lines small |
| Missing `done` message (executable) | Cursor not advanced | Always emit `done`, even on empty runs |
| Cursor written before completion | Stale cursor survives failures | Write only in the success path |

---

## §8 — Known spec/implementation divergence (executable transport)

The prose at `docs/internal/specs/plugin-loading.md` §3.2 describes nested `episode`,
`entity`, `edge` fields (e.g. `{"type":"episode","episode":{...}}`). The current
loader at `packages/engram-core/src/plugins/transport/executable.ts` reads the **flat**
shape described in §5.3 above.

When coaching an author:
- For new executable plugins: write to the flat shape (§5.3). That's what the loader
  reads today.
- For executable plugins that need to work against both the spec and the
  implementation: tolerate both shapes on read, emit the flat shape on write.
- Flag this divergence to the user and suggest filing an issue to reconcile
  (spec update vs. loader update — the project will decide which side is authoritative).

Do not assume either side is "correct" unless the repo has converged them since this
skill was last updated.

---

## §9 — Wrap-up

At the end of the conversation, produce a three-part summary:

1. **What was built**: plugin name, transport, auth kinds, entity/edge types, scope
   format.
2. **What to verify next**: `bun test`, `bun run lint`, `bun run build`, manual
   `engram plugin install <name> --project .`, `engram ingest` against a small
   fixture.
3. **Follow-ups flagged**: any divergences, TODOs, or open questions — especially
   vocab extensions that might warrant promotion to built-in.

Commit only when the user asks. Use conventional commits: `feat(plugin-<name>): ...`
for the initial plugin, `test(plugin-<name>): ...` for test additions.

---

## Guardrails

- **Never commit without confirmation.** Show the diff, then wait.
- **Never auto-apply across multiple files in one go.** Walk phase by phase.
- **Never paraphrase the adapter contract from memory** — re-read the cited files when
  specifics are at stake.
- **Never invent vocab values.** If the user wants a new `entity_type`, either route
  it through the extension mechanism or propose adding it to `vocab/*` in a separate
  PR.
- **Never skip tests.** An un-tested plugin is a draft, not a feature.
- **When the spec and the implementation disagree, say so.** Recommend one path and
  flag the divergence; do not silently pick a side.
