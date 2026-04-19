# Plugin Loading Architecture

> Spec for issue #204 — hybrid local-plugin loader with XDG discovery and manifest declaration.
> Implementation tracked in issue #206.

## Overview

Engram's enrichment adapter model is extended to support **third-party plugins** — adapters
that live outside the core package and are discovered automatically from standard OS locations.
Two transport mechanisms are supported:

- **js-module** — loaded in-process via dynamic `import()`. Must export an object conforming
  to the `EnrichmentAdapter` interface. TypeScript/JavaScript only.
- **executable** — any language binary or script. Communicates with Engram over JSON-lines on
  stdin/stdout. Engram owns all SQLite writes; the plugin only emits record descriptions.

Cross-references: vocabulary registry (#199 / `docs/internal/specs/vocabulary.md`),
`AuthCredential` and `scopeSchema` (#200), implementation (#206).

---

## 1. Discovery Algorithm

The plugin loader searches three locations in order of increasing precedence (later entries
shadow earlier ones with the same plugin name):

### 1.1 Global user directory (lowest precedence)

| Platform | Path |
|---|---|
| Linux / macOS | `$XDG_DATA_HOME/engram/plugins/` (fallback: `~/.local/share/engram/plugins/`) |
| Windows | `%LOCALAPPDATA%\engram\plugins\` |

### 1.2 Project-local directory (higher precedence)

```
<project-root>/.engram/plugins/<name>/
```

Where `<project-root>` is the directory containing the `.engram` database file being opened.

### 1.3 Plugin directory layout

Each plugin occupies a named subdirectory:

```
plugins/
└── my-gerrit-adapter/
    ├── manifest.json          # Required — plugin declaration
    └── gerrit-adapter.py      # Entry point (path declared in manifest.json)
```

### 1.4 Discovery procedure

At database open time (or on explicit `engram plugin reload`), the loader:

1. Enumerates each search directory that exists.
2. For each subdirectory, reads `manifest.json`. Directories without a manifest are silently
   skipped with a `debug`-level log.
3. Validates the manifest schema (see §2). Invalid manifests emit a `warn`-level log and are
   skipped — they do not abort loading of other plugins.
4. Checks `contract_version` compatibility (see §5).
5. Merges any `vocab_extensions` declared in the manifest (see §4).
6. Loads the transport (see §3).
7. Emits `info`-level log: `loaded plugin <name> v<version> (<transport>)`.

Name collision: when two directories declare the same `name` value in their manifest, the
higher-precedence location wins. The shadowed plugin is logged at `warn` level.

---

## 2. Manifest Schema

Each plugin directory MUST contain a `manifest.json` at its root.

### 2.1 Field reference

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | Unique plugin identifier. Lowercase, alphanumeric, hyphens. Used as the adapter `name` and for dedup. |
| `version` | `string` | Yes | Semver string (e.g. `"1.0.0"`). Informational only — not used for dedup. |
| `contract_version` | `integer` | Yes | Engram plugin contract version this plugin targets. Currently `1`. |
| `transport` | `"js-module" \| "executable"` | Yes | How the plugin is loaded. |
| `entry` | `string` | Yes | Relative path to the entry point from the plugin directory. |
| `capabilities` | `object` | No | Declares plugin capabilities to the loader (see §2.2). |
| `vocab_extensions` | `object` | No | Additional vocab values the plugin introduces (see §4). |

### 2.2 `capabilities` object

| Field | Type | Default | Description |
|---|---|---|---|
| `supported_auth` | `string[]` | `[]` | Auth schemes supported: `"token"`, `"oauth"`, `"none"`. |
| `supports_cursor` | `boolean` | `false` | Whether the plugin supports incremental resume via cursor. |
| `scope_schema` | `object` | `{}` | JSON Schema fragment describing the `scope` object passed to the plugin. Used for CLI validation and `--help` generation. |

### 2.3 Minimal manifest example

```json
{
  "name": "my-gerrit-adapter",
  "version": "0.1.0",
  "contract_version": 1,
  "transport": "executable",
  "entry": "gerrit-adapter.py"
}
```

### 2.4 Full manifest example

```json
{
  "name": "my-gerrit-adapter",
  "version": "1.2.0",
  "contract_version": 1,
  "transport": "executable",
  "entry": "gerrit-adapter.py",
  "capabilities": {
    "supported_auth": ["token"],
    "supports_cursor": true,
    "scope_schema": {
      "type": "object",
      "properties": {
        "endpoint": {
          "type": "string",
          "description": "Gerrit base URL (e.g. https://gerrit.example.com)"
        },
        "project": {
          "type": "string",
          "description": "Gerrit project name"
        }
      },
      "required": ["endpoint", "project"]
    }
  },
  "vocab_extensions": {
    "entity_types": ["gerrit_change"],
    "source_types": {
      "ingestion": ["gerrit"],
      "episode": ["gerrit_change", "gerrit_comment"]
    },
    "relation_types": ["gerrit_reviewed_by"]
  }
}
```

### 2.5 JSON Schema (appendix)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://engram.dev/schemas/plugin-manifest/v1.json",
  "title": "EngramPluginManifest",
  "type": "object",
  "required": ["name", "version", "contract_version", "transport", "entry"],
  "additionalProperties": false,
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9-]*[a-z0-9]$",
      "description": "Unique plugin name. Lowercase alphanumeric with hyphens."
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+",
      "description": "Semver version string."
    },
    "contract_version": {
      "type": "integer",
      "minimum": 1,
      "description": "Engram plugin contract version. Currently 1."
    },
    "transport": {
      "type": "string",
      "enum": ["js-module", "executable"],
      "description": "Transport mechanism for this plugin."
    },
    "entry": {
      "type": "string",
      "description": "Relative path to entry point from plugin directory."
    },
    "capabilities": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "supported_auth": {
          "type": "array",
          "items": { "type": "string", "enum": ["token", "oauth", "none"] },
          "default": []
        },
        "supports_cursor": {
          "type": "boolean",
          "default": false
        },
        "scope_schema": {
          "type": "object",
          "description": "JSON Schema fragment for the scope object."
        }
      }
    },
    "vocab_extensions": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "entity_types": {
          "type": "array",
          "items": { "type": "string" }
        },
        "source_types": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "ingestion": { "type": "array", "items": { "type": "string" } },
            "episode": { "type": "array", "items": { "type": "string" } }
          }
        },
        "relation_types": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }
  }
}
```

---

## 3. Transport Semantics

### 3.1 js-module transport

The loader calls `await import(absoluteEntryPath)` using Node/Bun dynamic import. The module's
default export MUST be an object satisfying the `EnrichmentAdapter` interface defined in
`packages/engram-core/src/ingest/adapter.ts`:

```typescript
interface EnrichmentAdapter {
  name: string;
  kind: string;
  supportsAuth?: string[];
  supportsCursor?: boolean;
  enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult>;
}
```

The `name` field in the exported object MUST match the `name` declared in `manifest.json`.
A mismatch is treated as a load error.

The adapter runs in the same process as the engram-core library. It has full access to the
`EngramGraph` object and is responsible for calling `addEntity`, `addEdge`, `addEpisode`,
and `addEntityAlias` directly, following the same evidence-first invariants as built-in adapters.

**Alias convention**: The js-module adapter MUST register shorthand aliases per
`docs/internal/specs/adapter-aliases.md`. The loader does not enforce this automatically —
adapters that skip alias registration will produce correct graphs but cross-source reference
resolution will be degraded.

**Vocab values**: The adapter MUST import vocab values from `packages/engram-core/src/vocab/`
for built-in types. For extension types declared in `vocab_extensions`, the loader provides a
runtime-resolved vocab map at load time (see §4.3).

### 3.2 Executable transport

The plugin is a standalone process (script, binary, or interpreter-backed script). Engram
spawns it as a subprocess on each `enrich()` call and communicates over stdin/stdout using
newline-delimited JSON (JSON-lines). Stderr from the plugin is forwarded to Engram's logger
at `debug` level.

**Critical invariant**: Engram owns all SQLite writes. The plugin MUST NOT attempt to open or
write to the `.engram` database file. The plugin only emits record descriptions over stdout;
Engram validates and writes them.

The subprocess receives its manifest's `entry` path executed directly. On POSIX systems it
MUST be executable (`chmod +x`). Python scripts should include a `#!/usr/bin/env python3`
shebang. On Windows, `.py` files are dispatched via the system Python interpreter.

#### 3.2.1 Engram → Plugin messages

Messages are written to the plugin's stdin, one per line.

**`hello`** — sent immediately after process start, before any other message.

```json
{"op": "hello", "contract_version": 1}
```

**`enrich`** — initiates an enrichment run.

```json
{
  "op": "enrich",
  "scope": { "endpoint": "https://gerrit.example.com", "project": "myproject" },
  "auth": { "type": "token", "token": "..." },
  "since": "2024-01-01T00:00:00Z",
  "cursor": "page=3&after=2024-03-15T12:00:00Z",
  "dry_run": false
}
```

| Field | Type | Description |
|---|---|---|
| `scope` | `object` | Plugin-defined scope object (validated against `scope_schema` if declared). |
| `auth` | `object \| null` | Auth credential. Shape depends on auth type: `{"type":"token","token":"..."}` or `{"type":"oauth","token":"..."}` or `null`. |
| `since` | `string \| null` | ISO8601 UTC — only fetch items updated after this date. `null` for full backfill. |
| `cursor` | `string \| null` | Opaque resume cursor from the previous run. `null` on first run. |
| `dry_run` | `boolean` | When `true`, plugin SHOULD skip side effects and emit records as if they would be written. |

#### 3.2.2 Plugin → Engram messages

Messages are written to stdout, one per line. Engram reads them until the process exits.
Any line that is not valid JSON is logged at `warn` level and discarded.

**`hello_ack`** — MUST be the first message emitted. Confirms contract compatibility and
echoes capabilities back to Engram.

```json
{
  "type": "hello_ack",
  "capabilities": {
    "supported_auth": ["token"],
    "supports_cursor": true
  }
}
```

**`episode`** — emit a new episode (raw evidence). Engram deduplicates on `(source_type, source_ref)`.

```json
{
  "type": "episode",
  "episode": {
    "source_type": "gerrit_change",
    "source_ref": "https://gerrit.example.com/c/myproject/+/12345",
    "content": "Subject: Fix null pointer in auth handler\n\nChange-Id: I9abc...",
    "occurred_at": "2024-03-15T10:22:00Z",
    "metadata": { "change_number": 12345, "status": "MERGED" }
  }
}
```

**`entity`** — emit an entity with mandatory evidence.

```json
{
  "type": "entity",
  "entity": {
    "entity_type": "person",
    "canonical_name": "alice@example.com",
    "properties": { "display_name": "Alice" }
  },
  "evidence": {
    "source_ref": "https://gerrit.example.com/c/myproject/+/12345"
  }
}
```

**`edge`** — emit a directed temporal edge with mandatory evidence.

```json
{
  "type": "edge",
  "edge": {
    "from_canonical": "https://gerrit.example.com/c/myproject/+/12345",
    "to_canonical": "alice@example.com",
    "relation_type": "reviewed_by",
    "edge_kind": "observed",
    "valid_from": "2024-03-15T11:00:00Z",
    "valid_until": null
  },
  "evidence": {
    "source_ref": "https://gerrit.example.com/c/myproject/+/12345"
  }
}
```

**`progress`** — optional, emitted periodically during long-running runs. Engram forwards
this to any registered `onProgress` callback.

```json
{
  "type": "progress",
  "phase": "fetching changes",
  "fetched": 150,
  "created": 42,
  "skipped": 108
}
```

**`error`** — non-fatal error. The plugin may continue emitting records after an error.
Use exit code `1` (with no `done` message) to signal a fatal, unrecoverable failure.

```json
{
  "type": "error",
  "code": "rate_limited",
  "message": "Gerrit returned 429 — backing off"
}
```

| `code` value | Meaning |
|---|---|
| `auth_failure` | Token missing, invalid, or expired. |
| `rate_limited` | Remote API throttled the request. |
| `server_error` | Remote returned 5xx or equivalent. |
| `data_error` | Malformed response from remote; individual record skipped. |

**`done`** — MUST be the final message on success. Carries the cursor for the next
incremental run (if supported), and summary counters.

```json
{
  "type": "done",
  "cursor": "page=7&after=2024-03-20T00:00:00Z",
  "fetched": 350,
  "created": 88,
  "skipped": 262
}
```

#### 3.2.3 Message ordering and lifecycle

```
Engram spawns subprocess
  → writes: {"op":"hello","contract_version":1}\n
Plugin reads hello
  → writes: {"type":"hello_ack","capabilities":{...}}\n
Engram validates contract_version compatibility (see §5)
Engram writes: {"op":"enrich",...}\n
Plugin processes, emits zero or more: episode / entity / edge / progress / error
Plugin writes: {"type":"done","cursor":"..."}\n
Plugin exits with code 0
Engram reads done, stores cursor, closes subprocess
```

If the plugin exits before emitting `done`, or exits with a non-zero code, Engram treats
the run as failed and does NOT store a new cursor (the old cursor is preserved).

---

## 4. Vocab Extension Merge Algorithm

Plugins may introduce new entity types, source types, and relation types not present in the
built-in registry (see `docs/internal/specs/vocabulary.md`). These are declared in
`manifest.json` under `vocab_extensions` and merged at plugin load time.

### 4.1 Merge rules

- Extensions are **additive only**. Plugins may not remove or rename built-in values.
- Engram maintains a plugin-extended runtime vocab map separate from the compile-time
  constants in `packages/engram-core/src/vocab/`. The built-in constants are never mutated.
- Plugin vocab values are namespaced by convention: `<plugin-name>/<value>` (e.g.
  `my-gerrit-adapter/gerrit_change`). Bare values (no slash) are also accepted but warned
  about — they risk colliding with future built-in additions.

### 4.2 Collision detection

At merge time, the loader checks each declared extension value against:
1. All built-in vocab values.
2. Values already registered by previously loaded plugins in the same session.

If a collision is detected, the loader emits a `warn`-level log:
```
warn: plugin my-gerrit-adapter declares entity_type "person" which already exists in the built-in registry — skipping
```

The colliding value is silently skipped; the plugin is still loaded. This is not a fatal
error because the plugin may legitimately be emitting records using a built-in type.

### 4.3 Runtime vocab map for js-module plugins

When a js-module plugin is loaded, the loader passes a resolved `PluginVocab` object as a
second argument to the module's default export factory (if the export is a function) or
makes it available via a side-channel import. Exact API to be defined in issue #206.

### 4.4 Extension limits

A single plugin may declare at most:
- 50 entity types
- 50 ingestion source types
- 50 episode source types
- 50 relation types

Manifests exceeding these limits fail validation and are not loaded.

---

## 5. Version Compatibility

### 5.1 contract_version semantics

`contract_version` is a single integer. It increments on any breaking change to the plugin
protocol (message schema changes, removal of fields, semantic changes to existing ops).

| Scenario | Loader behavior |
|---|---|
| `manifest.contract_version == LOADER_CONTRACT_VERSION` | Load normally. |
| `manifest.contract_version < LOADER_CONTRACT_VERSION` | Warn: "plugin targets older contract; may work but is unsupported." Load with warning. |
| `manifest.contract_version > LOADER_CONTRACT_VERSION` | **Refuse to load.** Error: "plugin requires contract v{N} but this engram build supports v{LOADER_CONTRACT_VERSION}. Update engram or downgrade the plugin." |

For executable transport, the loader also cross-checks the `hello_ack` capabilities against
the manifest declaration. Discrepancies emit a `warn`-level log but do not abort the load.

### 5.2 plugin `version` field

The `version` semver is informational only. The loader does not use it for compatibility
decisions. It is recorded in `ingestion_runs.metadata` for audit purposes.

---

## 6. Trust Model

Plugin loading follows the same trust model as git hooks, `.envrc` (direnv), and local
`package.json` scripts: **install-time authorization by the user, no signing required**.

### 6.1 Authorization

A plugin is considered authorized if it is present in a recognized plugin directory (see §1).
The act of placing a plugin in `~/.local/share/engram/plugins/` or `.engram/plugins/`
constitutes authorization by the user who controls that path.

Engram does NOT:
- Download plugins automatically from any registry.
- Execute plugins that were not explicitly placed by the user (or a tool the user ran).
- Verify code signatures or checksums.
- Sandbox plugin execution (js-module runs in-process; executable runs as the user's process).

### 6.2 Rationale

Signing and sandboxing add significant implementation complexity for a local-first tool.
The threat model (a user running `engram ingest` on their own machine) is similar to the
threat model for git hooks — if an attacker can write to `~/.local/share/engram/plugins/`,
they already have user-level code execution via many other vectors. Sandboxing does not
materially improve security in this model.

This policy is revisited if engram ever introduces shared multi-user deployments or a
plugin marketplace with remote downloads.

### 6.3 Security guidance for users

- Only install plugins from sources you trust.
- Review plugin source before installing, especially for executable transport plugins that
  receive auth tokens at runtime.
- Plugin auth tokens are passed in the `enrich` message on stdin — executables that log
  stdin (e.g. for debugging) may inadvertently expose tokens. Use `dry_run: true` to test
  a plugin without passing real tokens.
- Project-local plugins (`.engram/plugins/`) are versioned alongside the project. Review
  them as you would any committed script.

---

## 7. Error Handling

### 7.1 Load-time errors

| Condition | Action |
|---|---|
| Plugin directory exists but `manifest.json` is missing | Skip silently at `debug` level. |
| `manifest.json` is not valid JSON | Skip with `warn` log. Other plugins are unaffected. |
| Manifest fails schema validation | Skip with `warn` log (include validation errors). |
| `contract_version` too high (see §5) | Skip with `error` log. |
| `transport: js-module` — `import()` throws | Skip with `error` log. Stack trace at `debug` level. |
| `transport: js-module` — exported `name` != manifest `name` | Skip with `error` log. |
| Vocab extension collision | Skip the colliding value, log `warn`. Plugin still loads. |
| Vocab extension limit exceeded | Skip with `error` log. Plugin not loaded. |

### 7.2 Runtime errors (executable transport)

| Condition | Action |
|---|---|
| Plugin emits `{"type":"error","code":"auth_failure"}` | Surface as `EnrichmentAdapterError("auth_failure", ...)` to caller. |
| Plugin emits `{"type":"error","code":"rate_limited"}` | Surface as `EnrichmentAdapterError("rate_limited", ...)`. Caller may retry. |
| Plugin emits non-JSON line | Log at `warn`, discard line, continue. |
| Plugin exits with non-zero code before `done` | Treat run as failed. Log error. Do NOT update cursor. |
| Plugin takes > 30s without any output | Kill subprocess, treat as `server_error`. |
| Plugin exits 0 without emitting `done` | Treat as failed. Log `warn`. Do NOT update cursor. |

### 7.3 Runtime errors (js-module transport)

Exceptions thrown by `enrich()` are caught by the loader and surfaced as
`EnrichmentAdapterError("server_error", ...)` unless the thrown object is already an
`EnrichmentAdapterError`, in which case it is re-thrown as-is.

---

## 8. Canonical Example: Minimum-Viable Python Plugin

This example demonstrates a complete executable-transport plugin in Python.

### 8.1 Directory layout

```
~/.local/share/engram/plugins/
└── my-gerrit-adapter/
    ├── manifest.json
    └── gerrit-adapter.py
```

### 8.2 `manifest.json`

```json
{
  "name": "my-gerrit-adapter",
  "version": "0.1.0",
  "contract_version": 1,
  "transport": "executable",
  "entry": "gerrit-adapter.py",
  "capabilities": {
    "supported_auth": ["token"],
    "supports_cursor": true,
    "scope_schema": {
      "type": "object",
      "properties": {
        "endpoint": { "type": "string" },
        "project": { "type": "string" }
      },
      "required": ["endpoint", "project"]
    }
  },
  "vocab_extensions": {
    "source_types": {
      "ingestion": ["my-gerrit-adapter/gerrit"],
      "episode": ["my-gerrit-adapter/gerrit_change"]
    }
  }
}
```

### 8.3 `gerrit-adapter.py`

```python
#!/usr/bin/env python3
"""
Minimum-viable Gerrit enrichment plugin for Engram.
Executable transport: reads JSON-lines from stdin, writes JSON-lines to stdout.
"""

import json
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

ENGRAM_CONTRACT_VERSION = 1


def send(msg: dict) -> None:
    print(json.dumps(msg), flush=True)


def recv() -> dict:
    line = sys.stdin.readline()
    if not line:
        sys.exit(1)
    return json.loads(line.strip())


def fetch_changes(endpoint: str, project: str, token: str | None, since: str | None, cursor: str | None) -> tuple[list[dict], str | None]:
    """Fetch merged changes from Gerrit REST API. Returns (changes, next_cursor)."""
    params = f"q=project:{project}+status:merged&o=DETAILED_ACCOUNTS&o=REVIEWERS"
    if since:
        # Gerrit uses 'after:YYYY-MM-DD' filter
        date_part = since[:10]
        params += f"+after:{date_part}"
    if cursor:
        # cursor encodes the start offset
        start = int(cursor)
        params += f"&start={start}"
    else:
        start = 0

    url = f"{endpoint}/changes/?{params}"
    req = urllib.request.Request(url)
    if token:
        # Gerrit HTTP password auth via Basic
        import base64
        creds = base64.b64encode(f":{token}".encode()).decode()
        req.add_header("Authorization", f"Basic {creds}")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            # Gerrit prefixes JSON with ")]}'\n" — strip it
            body = resp.read().decode("utf-8")
            if body.startswith(")]}'"):
                body = body[body.index("\n") + 1:]
            changes = json.loads(body)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            send({"type": "error", "code": "auth_failure", "message": f"Gerrit returned 401 for {url}"})
            return [], None
        elif e.code == 429:
            send({"type": "error", "code": "rate_limited", "message": "Gerrit returned 429"})
            return [], None
        else:
            send({"type": "error", "code": "server_error", "message": f"Gerrit HTTP {e.code}"})
            return [], None

    # Gerrit returns _more_changes: true when there are additional pages
    has_more = changes and changes[-1].get("_more_changes", False)
    next_cursor = str(start + len(changes)) if has_more else None
    return changes, next_cursor


def main() -> None:
    # Step 1: handshake
    hello = recv()
    assert hello.get("op") == "hello", f"Expected hello, got: {hello}"
    if hello.get("contract_version", 0) != ENGRAM_CONTRACT_VERSION:
        sys.stderr.write(f"Unsupported contract version: {hello.get('contract_version')}\n")
        sys.exit(1)

    send({
        "type": "hello_ack",
        "capabilities": {
            "supported_auth": ["token"],
            "supports_cursor": True
        }
    })

    # Step 2: enrich request
    req = recv()
    assert req.get("op") == "enrich", f"Expected enrich, got: {req}"

    scope = req.get("scope", {})
    endpoint = scope.get("endpoint", "").rstrip("/")
    project = scope.get("project", "")
    auth = req.get("auth") or {}
    token = auth.get("token") if auth.get("type") == "token" else None
    since = req.get("since")
    cursor = req.get("cursor")
    dry_run = req.get("dry_run", False)

    if not endpoint or not project:
        send({"type": "error", "code": "data_error", "message": "scope.endpoint and scope.project are required"})
        sys.exit(1)

    # Step 3: fetch and emit
    fetched = 0
    created = 0
    skipped = 0
    next_cursor = cursor

    changes, next_cursor = fetch_changes(endpoint, project, token, since, cursor)

    for change in changes:
        fetched += 1
        change_num = change.get("_number", 0)
        change_url = f"{endpoint}/c/{project}/+/{change_num}"
        subject = change.get("subject", "")
        owner = change.get("owner", {})
        owner_email = owner.get("email", f"unknown-{owner.get('_account_id','?')}@gerrit")
        updated = change.get("updated", datetime.now(timezone.utc).isoformat())

        send({"type": "progress", "phase": "ingesting changes", "fetched": fetched, "created": created, "skipped": skipped})

        if dry_run:
            skipped += 1
            continue

        # Emit episode
        send({
            "type": "episode",
            "episode": {
                "source_type": "my-gerrit-adapter/gerrit_change",
                "source_ref": change_url,
                "content": f"Subject: {subject}\nProject: {project}\nChange-Id: {change.get('change_id','')}\nStatus: {change.get('status','')}",
                "occurred_at": updated,
                "metadata": {"change_number": change_num, "status": change.get("status")}
            }
        })

        # Emit owner entity
        send({
            "type": "entity",
            "entity": {
                "entity_type": "person",
                "canonical_name": owner_email,
                "properties": {"display_name": owner.get("name", owner_email)}
            },
            "evidence": {"source_ref": change_url}
        })

        # Emit change entity (pull_request maps to Gerrit CL)
        send({
            "type": "entity",
            "entity": {
                "entity_type": "pull_request",
                "canonical_name": change_url,
                "properties": {"subject": subject, "change_number": change_num}
            },
            "evidence": {"source_ref": change_url}
        })

        # Emit authored_by edge
        send({
            "type": "edge",
            "edge": {
                "from_canonical": change_url,
                "to_canonical": owner_email,
                "relation_type": "authored_by",
                "edge_kind": "observed",
                "valid_from": updated,
                "valid_until": None
            },
            "evidence": {"source_ref": change_url}
        })

        # Emit reviewer edges
        for reviewer in change.get("reviewers", {}).get("REVIEWER", []):
            reviewer_email = reviewer.get("email", "")
            if reviewer_email and reviewer_email != owner_email:
                send({
                    "type": "entity",
                    "entity": {
                        "entity_type": "person",
                        "canonical_name": reviewer_email,
                        "properties": {"display_name": reviewer.get("name", reviewer_email)}
                    },
                    "evidence": {"source_ref": change_url}
                })
                send({
                    "type": "edge",
                    "edge": {
                        "from_canonical": change_url,
                        "to_canonical": reviewer_email,
                        "relation_type": "reviewed_by",
                        "edge_kind": "observed",
                        "valid_from": updated,
                        "valid_until": None
                    },
                    "evidence": {"source_ref": change_url}
                })

        created += 1

    # Step 4: done
    send({
        "type": "done",
        "cursor": next_cursor,
        "fetched": fetched,
        "created": created,
        "skipped": skipped
    })


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        sys.stderr.write(f"Fatal error: {e}\n")
        sys.exit(1)
```

> Note: The Python example uses only the standard library (`urllib`, `json`, `sys`) to
> remain dependency-free. Real-world plugins may use `requests`, `httpx`, etc.

---

## 9. Related Specifications

- `docs/internal/specs/vocabulary.md` — built-in vocab registries (#199)
- `docs/internal/specs/adapter-aliases.md` — alias registration convention
- `docs/internal/specs/cross-source-references.md` — cross-source reference resolver
- `packages/engram-core/src/ingest/adapter.ts` — `EnrichmentAdapter` interface
- Issue #200 — `AuthCredential` and `scopeSchema` stabilization
- Issue #206 — plugin loader implementation
