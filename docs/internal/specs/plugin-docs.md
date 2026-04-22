# Plugin Documentation Contract

> Spec for optional `description` and `docs` fields in plugin manifests.
> Companion to `plugin-loading.md`.

---

## 1. Manifest fields

Two optional top-level fields extend `PluginManifest`:

### `description` (string, optional)

A single-line description of the plugin shown in `plugin list` output. Max
recommended length: 80 characters.

```json
{
  "description": "Ingest Gerrit code-review changes as episodes"
}
```

### `docs` (object, optional)

Extended documentation surfaced by `plugin info` and at install time.

```typescript
interface PluginDocs {
  /** 2–4 sentence overview shown by `engram plugin info`. */
  summary?: string;
  /** What the user must do before first use (auth setup, credentials, etc.). */
  auth_setup?: string;
  /** 3–6 representative scope examples. */
  scope_examples?: Array<{ scope: string; description: string }>;
}
```

All sub-fields are optional. The manifest loader passes `docs` through as-is
without further validation — only the outer type check (`object`, not array,
not null) is enforced.

---

## 2. `README.md` well-known filename contract

Each plugin directory **should** contain a `README.md`. The CLI surfaces its
path in `plugin info` output when present.

### Required sections

| Section | Purpose |
|---------|---------|
| Overview / intro paragraph | 1–3 sentence description of what the plugin ingests |
| Prerequisites | What must be set up before first use (auth, credentials, tools) |
| Scope syntax | Table of supported scope forms with descriptions |
| Examples | 2–5 concrete CLI invocations |

### Optional sections

| Section | Purpose |
|---------|---------|
| Limitations | Known constraints (quota, pagination, missing features) |
| Configuration | Additional flags or environment variables |

---

## 3. CLI surfaces

### `plugin list`

Shows `description` as a trailing column in the plugin table. The column is
omitted from the header calculation only if all rows have an empty description
(no manifest updates needed — the column always renders but may be blank).

```
NAME              VERSION  TRANSPORT  SCOPE    SOURCE  STATUS  DESCRIPTION
gerrit            0.1.0    js-module  user     user    OK      Ingest Gerrit code-review changes as episodes
google-workspace  0.1.0    js-module  user     user    OK      Ingest Google Docs as revision-aware episodes
```

### `plugin info <name>`

Renders a formatted info card with:
1. Header line: name, version
2. Capabilities block: auth kinds, cursor support, scope pattern
3. Overview section (from `docs.summary`) — skipped if absent
4. Auth setup section (from `docs.auth_setup`) — skipped if absent
5. Examples section (from `docs.scope_examples`) — skipped if absent
6. README path — shown if `README.md` exists in the plugin directory

### `plugin install <name>`

After the success message, if `docs.auth_setup` is present in the manifest,
prints a "Before first use" hint block (word-wrapped at 80 chars).

---

## 4. Docsite aggregation

The docsite build globs `packages/plugins/*/README.md` to collect plugin docs.
Each file receives frontmatter injection during the build step:

```yaml
---
title: "<plugin name> plugin"
sidebar_position: <auto-assigned>
---
```

This allows the docsite to render plugin-specific pages without manual
registration. The `description` field from `manifest.json` is used as the
page subtitle in the auto-generated index.

No docsite tooling is implemented yet — this section describes the intended
contract for future build tooling.
