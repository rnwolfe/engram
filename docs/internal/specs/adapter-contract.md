# EnrichmentAdapter Contract v2

This document describes the v2 adapter contract introduced in issue #200.
It covers `AuthCredential` variants, `scopeSchema` convention, cursor helper
contract, v1→v2 migration, and `oauth2` refresh semantics.

## Overview

The adapter contract evolved to support Gerrit, Google Docs, Jira, and other
adapters beyond GitHub. Three key changes were made:

1. **AuthCredential union** — replaces `token?: string` with a typed union.
2. **scopeSchema** — replaces `repo?: string` with adapter-declared scope validation.
3. **Cursor helpers** — shared utilities in `cursor.ts` replace per-adapter boilerplate.

---

## AuthCredential variants

```ts
export type AuthCredential =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'basic'; username: string; secret: string }
  | { kind: 'service_account'; keyJson: string }
  | {
      kind: 'oauth2';
      token: string;
      scopes: string[];
      refresh?: () => Promise<string>;
    };
```

### Variant descriptions

| Kind | Use case |
|------|----------|
| `none` | No auth required (public APIs, local sources) |
| `bearer` | HTTP Bearer / personal access token (GitHub, GitLab) |
| `basic` | HTTP Basic auth — username + password/secret (Gerrit, Jira) |
| `service_account` | JSON key file for service accounts (Google APIs) |
| `oauth2` | OAuth2 access token with optional refresh callback |

### JSON round-trip note

All variants except `oauth2.refresh` are fully JSON-serializable. The
`refresh` callback is a function and will be lost during `JSON.stringify()`.
This is a documented limitation. Only set `refresh` in in-process contexts.

---

## EnrichOpts v2

```ts
export interface EnrichOpts {
  auth?: AuthCredential;  // NEW — replaces deprecated token
  scope?: string;         // NEW — replaces deprecated repo
  token?: string;         // @deprecated — use auth
  repo?: string;          // @deprecated — use scope
  since?: string;
  endpoint?: string;
  dryRun?: boolean;
  onProgress?: (p: EnrichProgress) => void;
}
```

---

## scopeSchema convention

Every adapter declares a `scopeSchema: ScopeSchema` that:
- Documents what the `scope` string represents (`description` field)
- Validates input synchronously, throwing a plain `Error` with a clear message

```ts
export interface ScopeSchema {
  description: string;
  validate(scope: string): void;
}
```

### Examples

**GitHub adapter**:
```ts
export const githubScopeSchema: ScopeSchema = {
  description: "GitHub repository in owner/repo format",
  validate(scope: string): void {
    if (!/^[\w.-]+\/[\w.-]+$/.test(scope)) {
      throw new Error(`GitHubAdapter: scope must be in 'owner/repo' format, got: ...`);
    }
  },
};
```

**Gerrit adapter**:
```ts
export const gerritScopeSchema: ScopeSchema = {
  description: "Gerrit project name (e.g. 'my-project' or 'org/sub-project')",
  validate(scope: string): void {
    if (!scope || scope.startsWith('/') || scope.endsWith('/')) {
      throw new Error(`GerritAdapter: scope must be a non-empty project name...`);
    }
  },
};
```

---

## supportedAuth typing

```ts
// v2: typed against AuthCredential['kind']
supportedAuth: AuthCredential['kind'][];

// v1 (deprecated): untyped string array
supportsAuth?: string[];
```

Adapters declare which auth kinds they accept. The `assertAuthKind()` helper
validates the provided `opts.auth.kind` is in `adapter.supportedAuth` before
calling `enrich()`, throwing `EnrichmentAdapterError { code: 'auth_failure' }`
if not.

**Note**: auth kind checking is automatically bypassed when `opts.token` was
mapped to `opts.auth` by the compat shim (backwards-compatibility path). Only
explicitly-provided v2 `auth` fields are validated.

---

## Cursor helpers

Location: `packages/engram-core/src/ingest/cursor.ts`

```ts
// Returns the cursor string from the most recent completed run, or null.
export function readIsoCursor(
  graph: EngramGraph,
  sourceType: string,
  scope: string,
): string | null

// Parses the cursor as an integer, returning 0 if absent/non-numeric.
export function readNumericCursor(
  graph: EngramGraph,
  sourceType: string,
  scope: string,
): number

// Writes the cursor to the ingestion_runs row identified by runId.
export function writeCursor(
  graph: EngramGraph,
  runId: string,
  value: string | null,
): void
```

### Usage pattern

```ts
// In enrich():
const lastNumber = readNumericCursor(graph, SOURCE_TYPE, scope);

// ... process items where item.number > lastNumber ...

const cursor = latestNumber > 0 ? String(latestNumber) : null;
writeCursor(graph, runId, cursor);
// then update ingestion_runs: set completed_at, counts, status
```

---

## v1 → v2 migration

### Call site changes

```ts
// v1 (deprecated)
await adapter.enrich(graph, {
  token: 'ghp_abc123',
  repo: 'owner/repo',
});

// v2
await adapter.enrich(graph, {
  auth: { kind: 'bearer', token: 'ghp_abc123' },
  scope: 'owner/repo',
});
```

### Compat shim

`applyCompatShim(opts)` automatically maps v1 fields to v2 equivalents and
emits a one-shot deprecation warning to stderr:

```
engram deprecation: EnrichOpts.token and EnrichOpts.repo are deprecated.
Use opts.auth = { kind: 'bearer', token } and opts.scope instead.
```

The warning is emitted exactly once per process (module-level boolean flag).

### Adapter implementation changes

```ts
async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
  // Apply compat shim first (token→auth, repo→scope)
  opts = applyCompatShim(opts);

  // Validate auth kind (skipped for shim-derived auth)
  assertAuthKind(this, opts);

  // Use opts.scope (or opts.repo for extra compat)
  const scope = opts.scope ?? opts.repo;
  this.scopeSchema.validate(scope);

  // Use cursor helpers
  const lastNum = readNumericCursor(graph, SOURCE_TYPE, scope);
  // ...
  writeCursor(graph, runId, cursor);
}
```

---

## oauth2 refresh semantics

When `opts.auth.kind === 'oauth2'` and `opts.auth.refresh` is provided:

1. The adapter attempts the API call.
2. On receiving HTTP 401 or 403, it calls `opts.auth.refresh()` once.
3. The refresh function returns the new access token as a string.
4. The adapter retries the request with the new token.
5. If the retry also fails, throw `EnrichmentAdapterError { code: 'auth_failure' }`.

**In-process only**: Subprocess plugins handle refresh internally and should
not surface the `refresh` callback.

---

## Adding a new adapter

1. Create `packages/engram-core/src/ingest/adapters/<name>.ts`
2. Export a `<name>ScopeSchema: ScopeSchema` constant
3. Implement `EnrichmentAdapter`:
   - Set `supportedAuth: AuthCredential['kind'][]`
   - Set `scopeSchema = <name>ScopeSchema`
   - Call `applyCompatShim(opts)` at start of `enrich()`
   - Call `assertAuthKind(this, opts)` after shim
   - Use `readNumericCursor` / `readIsoCursor` / `writeCursor` from `cursor.ts`
   - Import all vocab values from `../../vocab/index.js` — never inline strings
4. Export from `packages/engram-core/src/index.ts`
5. Write tests in `packages/engram-core/test/ingest/`
