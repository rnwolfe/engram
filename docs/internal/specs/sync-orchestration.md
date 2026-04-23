# Sync Orchestration — Design Specification

`engram sync` is a config-driven command that runs all configured ingesters in
declaration order, then runs the cross-ref resolver. It replaces hand-crafted
shell sequences like `ingest git && ingest source && ingest enrich github && ...`.

## Config File

The config lives in `.engram.config.json`. The format is JSON, versioned at the
top level.

### Schema

```json
{
  "version": 1,
  "sources": [
    { "name": "repo-git",  "type": "git",    "path": "." },
    { "name": "repo-src",  "type": "source", "root": "packages/" },
    { "name": "engram-gh", "type": "github", "scope": "org/repo",
      "auth": { "kind": "bearer", "tokenEnv": "GITHUB_TOKEN" } }
  ]
}
```

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `1` | yes | Schema version. Only `1` is accepted; mismatch fails with upgrade-path message. |
| `sources` | array | yes | Ordered list of source definitions. |

### Source fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Unique identifier. Used with `--only <name>`. |
| `type` | string | yes | Adapter type (see Built-in types below). |
| `scope` | string | no | Adapter-specific scope (e.g. `owner/repo` for GitHub). |
| `path` | string | no | Filesystem path — repo path for `git`, root for `source`. |
| `root` | string | no | Alias for `path` specifically for `source` adapter. Takes precedence over `path`. |
| `auth` | object | no | Auth config (see Auth below). May be omitted for `git` and `source`. |

Unknown fields at any level cause validation failure (fail-closed design).

### Auth config

Auth config uses env var references (`tokenEnv`) rather than literal secrets.

| Kind | Fields | Description |
|------|--------|-------------|
| `none` | — | No auth required. |
| `bearer` | `tokenEnv` | Env var holding the Bearer/PAT token. |
| `basic` | `usernameEnv`, `secretEnv` | Env vars for HTTP Basic auth. |
| `service_account` | `keyJsonEnv` | Env var holding the full JSON key content. |
| `oauth2` | `tokenEnv`, `scopesEnv?` | OAuth2 access token + optional scopes. |

## Config Discovery

`engram sync` finds its config using this resolution order (first match wins):

1. `--config <path>` — explicit path
2. `$ENGRAM_CONFIG` — environment variable
3. `<cwd>/.engram.config.json` — auto-discovered
4. `<db-dir>/.engram.config.json` — adjacent to the `.engram` database file

If no config is found, the command exits with code `3` and prints the resolution
order with the paths that were checked, plus a pointer to the example config at
`docs/examples/.engram.config.json`.

## Built-in Types

| Type | Adapter | Notes |
|------|---------|-------|
| `git` | `ingestGitRepo()` | Uses `path` (default: `.`). |
| `source` | `ingestSource()` | Uses `root` or `path` (default: `.`). |
| `github` | `GitHubAdapter` | Requires `scope: owner/repo` and `auth`. |
| `google_workspace` | `GoogleWorkspaceAdapter` | Requires `@engram/plugin-google-workspace`. |
| _anything else_ | Plugin | Resolved via `discoverPlugins()`. Unknown type → exit 2. |

## Adapter Resolution

1. Check built-in type map first.
2. If not found, call `discoverPlugins(cwd, bundledPluginsRoot)`.
3. Look for a plugin with a matching `name`.
4. Load via the plugin's declared transport (`js-module` or `executable`).
5. If no plugin found, exit `2` and list all available built-in types plus discovered plugins.

## Failure Semantics

### Fail-fast (default)

Sources run in declaration order. On first failure:
- Remaining sources are marked `skipped`.
- Cross-ref resolver is **not** run.
- Exit code `1`.

### `--continue-on-error`

All sources run regardless of failures. After all sources:
- Cross-ref resolver runs over episodes from **all** sources (including failed ones that
  wrote partial data before failing).
- Exit code `1` if any source failed, `0` if all succeeded.

### Pre-flight auth check

Before any source runs, all `auth.tokenEnv` references are checked for presence
in the environment. Any missing env vars cause immediate exit `2` with a list of
all missing vars — no partial execution.

## Cross-ref Resolver

After all sources complete (or after the successful subset with `--continue-on-error`),
`resolveReferences()` is called once over all non-redacted episodes. This:
- Scans episode content for cross-source references (e.g. GitHub PR mentions in commit msgs).
- Emits `references` edges (edge_kind: `observed`).
- Records unresolved references in `unresolved_refs` for future drain.

Skip with `--no-cross-refs`. The resolver does not run if fail-fast aborted.

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All sources succeeded. |
| `1` | At least one source failed. |
| `2` | Config validation error, unknown `--only` name, or missing auth env var. |
| `3` | No discoverable config file. |

## CLI Flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Override config discovery. |
| `--db <path>` | Target `.engram` file (default: `.engram`). |
| `--only <name>[,<name>...]` | Run named subset in declaration order. |
| `--continue-on-error` | Run all sources, even after a failure. |
| `--no-cross-refs` | Skip the cross-ref resolver step. |
| `--format json` | Emit `SyncResult` JSON. Default: human-readable table. |
| `--dry-run` | Validate config + print plan; no execution. Exits `0`. |

## `SyncResult` shape (JSON output)

```ts
interface SyncResult {
  sources: Array<{
    name: string;
    type: string;
    status: "success" | "failed" | "skipped";
    error?: string;
    episodesCreated?: number;
    entitiesCreated?: number;
    edgesCreated?: number;
    elapsedMs: number;
  }>;
  crossRefs: {
    edgesCreated: number;
    unresolved: number;
    elapsedMs: number;
  } | null;
  status: "success" | "failed";
  elapsedMs: number;
}
```
