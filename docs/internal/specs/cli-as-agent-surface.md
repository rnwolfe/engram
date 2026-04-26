# CLI as Agent Surface

> This spec defines the contract between the `engram` CLI and automated consumers
> (AI agents, CI scripts, harness adapters). Human-facing UX is out of scope.

---

## Standard Exit Codes

All `engram` commands must use this exit code vocabulary. Commands must not use
undocumented exit codes.

| Code | Meaning |
|------|---------|
| `0` | Success — the operation completed and produced valid output. |
| `1` | User error — bad flag, missing required argument, invalid input, or config not found. The agent should not retry without changing its inputs. |
| `2` | System error — DB corrupt, missing dependency, schema violation, or unexpected failure. Human intervention may be required. |
| `3` | Retry recommended — rate limit, transient network error, quota exhausted. The agent may retry after a back-off interval. |

Exit code `3` is reserved for conditions outside the agent's control. Never use `3` for
user errors or local system failures.

---

## `--format=json` Requirement

All agent-facing commands must accept `--format=json` (or `-j` as a shorthand). The flag
must cause the command to emit a single JSON object on stdout, suitable for piping into
`jq` or parsing in a harness.

### General JSON schema conventions

- Top-level `ok: boolean` — `true` when the command succeeded, `false` on any error.
- Top-level `error?: string` — present when `ok` is `false`. Human-readable error message.
- Command-specific payload under a named key (see per-command schemas below).
- All timestamps are ISO8601 UTC strings (`2026-04-26T14:00:00.000Z`).
- No trailing commas. Strict JSON.
- On error, the command still exits with the appropriate non-zero code even when
  `--format=json` is active. The JSON error field is in addition to, not a replacement
  for, the exit code.

### Per-command JSON schemas

#### `engram context <query>`

```json
{
  "ok": true,
  "context": {
    "query": "string",
    "token_budget": 8000,
    "tokens_used": 3241,
    "as_of": "2026-04-26T14:00:00.000Z | null",
    "entities": [
      {
        "id": "string (ULID)",
        "canonical_name": "string",
        "entity_type": "string",
        "confidence": 0.95,
        "scope": "string | null"
      }
    ],
    "edges": [
      {
        "id": "string (ULID)",
        "fact": "string",
        "relation_type": "string",
        "edge_kind": "observed | inferred | asserted",
        "valid_from": "ISO8601 | null",
        "valid_until": "ISO8601 | null",
        "scope": "string | null"
      }
    ],
    "discussions": [
      {
        "episode_id": "string (ULID)",
        "source_type": "string",
        "source_ref": "string",
        "excerpt": "string",
        "confidence": 0.91
      }
    ],
    "projections": [
      {
        "id": "string (ULID)",
        "kind": "string",
        "anchor_type": "string",
        "anchor_id": "string",
        "content": "string",
        "stale": false,
        "scope": "string | null"
      }
    ]
  }
}
```

#### `engram sync`

```json
{
  "ok": true,
  "sync_result": {
    "config_path": "string",
    "started_at": "ISO8601",
    "finished_at": "ISO8601",
    "sources": [
      {
        "name": "string",
        "type": "string",
        "status": "success | failed | skipped",
        "episodes_created": 142,
        "entities_created": 38,
        "edges_created": 17,
        "elapsed_ms": 1240,
        "error": "string | null"
      }
    ],
    "cross_refs_resolved": 5
  }
}
```

#### `engram ingest git`

```json
{
  "ok": true,
  "ingest_result": {
    "source": "git",
    "path": "string",
    "started_at": "ISO8601",
    "finished_at": "ISO8601",
    "episodes_created": 201,
    "entities_created": 44,
    "edges_created": 22
  }
}
```

#### `engram ingest source`

```json
{
  "ok": true,
  "ingest_result": {
    "source": "source",
    "root": "string",
    "started_at": "ISO8601",
    "finished_at": "ISO8601",
    "files_walked": 87,
    "symbols_extracted": 412,
    "episodes_created": 87,
    "entities_created": 412,
    "edges_created": 56
  }
}
```

#### `engram ingest enrich <adapter>`

```json
{
  "ok": true,
  "ingest_result": {
    "source": "string (adapter name)",
    "scope": "string",
    "started_at": "ISO8601",
    "finished_at": "ISO8601",
    "episodes_created": 33,
    "entities_created": 12,
    "edges_created": 8
  }
}
```

#### `engram search <query>`

```json
{
  "ok": true,
  "search": {
    "query": "string",
    "limit": 20,
    "results": [
      {
        "id": "string (ULID)",
        "canonical_name": "string",
        "entity_type": "string",
        "score": 0.87,
        "snippet": "string | null"
      }
    ]
  }
}
```

#### `engram show <entity>`

```json
{
  "ok": true,
  "entity": {
    "id": "string (ULID)",
    "canonical_name": "string",
    "entity_type": "string",
    "status": "active | redacted",
    "created_at": "ISO8601",
    "aliases": ["string"],
    "edges": [
      {
        "id": "string (ULID)",
        "fact": "string",
        "relation_type": "string",
        "edge_kind": "observed | inferred | asserted",
        "valid_from": "ISO8601 | null",
        "valid_until": "ISO8601 | null",
        "from_entity_id": "string",
        "to_entity_id": "string"
      }
    ],
    "evidence": [
      {
        "episode_id": "string (ULID)",
        "source_type": "string",
        "source_ref": "string",
        "excerpt": "string | null"
      }
    ]
  }
}
```

#### `engram stats`

```json
{
  "ok": true,
  "stats": {
    "db": "string (path)",
    "entities": 1204,
    "edges": 3412,
    "edges_invalidated": 88,
    "episodes": 5601,
    "aliases": 234
  }
}
```

#### `engram verify`

```json
{
  "ok": true,
  "verify": {
    "violations": [
      { "message": "string" }
    ]
  }
}
```

When `ok` is `true`, `violations` is an empty array. When `ok` is `false`, `violations`
contains one entry per integrity failure.

#### `engram init`

```json
{
  "ok": true,
  "init": {
    "db": "string (path)",
    "created_at": "ISO8601",
    "embedding_model": "string | null",
    "from_git": "string | null",
    "episodes_created": 201,
    "entities_created": 44,
    "edges_created": 22
  }
}
```

---

## `--list-tools` Discovery Contract

Running `engram --list-tools` must exit 0 and emit a JSON array of tool descriptors to
stdout. No other output is permitted on stdout.

This catalogue is the canonical machine-readable description of the engram CLI surface.
An agent can bootstrap a full `ingest → context → show` workflow using only this output.

### Tool descriptor schema

```json
[
  {
    "name": "string",
    "description": "string",
    "args": [
      {
        "name": "string",
        "required": true,
        "description": "string"
      }
    ],
    "flags": [
      {
        "name": "string",
        "description": "string",
        "values": ["option1", "option2"],
        "default": "option1"
      }
    ],
    "output_schema_ref": "string"
  }
]
```

- `args` — positional arguments in declaration order. `required: true` means the command
  will exit 1 if the argument is absent.
- `flags` — optional flags. `values` is present when the flag accepts an enumerated set
  of strings. `default` is the value used when the flag is omitted.
- `output_schema_ref` — a short label identifying the JSON output schema for this
  command. These labels correspond to the schema sections in this document
  (e.g. `"context.json"`, `"sync.json"`).

### Bootstrapping a workflow from the catalogue

An agent that has never seen `engram` before can:

1. Run `engram --list-tools` to discover available commands, their required arguments,
   and their `output_schema_ref` values.
2. Run `engram init --yes --db /tmp/test.engram --format json` to create a graph and
   verify the `init.json` output schema.
3. Run `engram ingest git . --db /tmp/test.engram --format json` to populate the graph.
4. Run `engram context "auth middleware" --db /tmp/test.engram --format json` to retrieve
   a context pack and verify the `context.json` output schema.
5. Run `engram show <entity-id> --db /tmp/test.engram --format json` to inspect a
   specific entity.

---

## Stable Schema Discipline

Once a `--format=json` output schema is documented in this spec, it is **stable**. Any
change that removes a key, renames a key, or changes a key's type is a breaking change.

### Breaking changes

Breaking changes require one of:
- A new `--format=json-v2` flag (the `v1` flag continues to work unchanged).
- A top-level `"format_version": 2` field, with the `v1` schema still emittable via
  an explicit `--format-version 1` flag.

Breaking changes must be announced in the changelog and kept behind a feature flag for at
least one minor release.

### Safe (additive) changes

- Adding a new optional key to an existing object.
- Adding a new object to an existing array.
- Adding a new command to `--list-tools` output.
- Adding a new accepted `values` entry for an existing flag.

Additive changes may land in any release without a version bump.

### Commands not yet supporting `--format=json`

The following commands do not yet have a `--format=json` implementation. Each should be
added in a future cycle before the command is considered agent-ready:

| Command | Notes |
|---------|-------|
| `engram ingest git` | Currently only human-readable progress output. |
| `engram ingest source` | Currently only human-readable progress output. |
| `engram ingest enrich` | Currently only human-readable progress output. |
| `engram companion` | Outputs raw text by design; a JSON wrapper is low priority. |
| `engram project` | Outputs human-readable via `@clack/prompts`; add `--format json`. |
| `engram reconcile` | Outputs human-readable via `@clack/prompts`; add `--format json`. |
