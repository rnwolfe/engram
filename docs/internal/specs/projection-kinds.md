# Projection Kind Catalog — Spec

**Phase**: 2 (projection layer)
**Status**: Accepted
**Proposed**: 2026-04-10
**Companion specs**: [`projections.md`](projections.md), [`format-v0.2.md`](format-v0.2.md)

This spec defines the kind catalog for the projection layer introduced in ADR-002.
A **kind** is a named template type that tells the discover phase what category of
projection to author and what substrate inputs to assemble. The kind catalog ships
with `engram-core` and may be extended via XDG user overrides.

## Catalog Format: YAML

Each kind is defined in its own YAML file. The format is a flat document with a
fixed set of required fields plus optional notes.

**Rationale for YAML over alternatives:**

- *Markdown frontmatter* — frontmatter is good for hybrid docs/data, but kind
  definitions are pure structured data with no freeform prose body. A standalone
  YAML file is simpler to parse and easier to validate with a schema.
- *JSON* — equivalent expressiveness, but less human-readable for the
  `when_to_use` and `example_title_pattern` fields that contain prose. YAML
  multiline strings (`|` block scalar) are significantly more readable.
- *TOML* — reasonable choice but less idiomatic in the TypeScript/Node ecosystem
  than YAML. No existing YAML parsing dependency to introduce.
- *TypeScript objects* — coupling the catalog format to the runtime language
  prevents user overrides from being plain text files. The XDG override path
  requires a format a user can edit without a compiler.

YAML wins because it combines easy-to-read multiline strings, zero new runtime
dependencies (standard YAML parsing is available via Bun's built-in or a tiny
library), and file-based editability for user overrides.

## Location Convention

Built-in kinds ship with `engram-core`:

```
packages/engram-core/src/ai/kinds/<kind-name>.yaml
```

User overrides are loaded from XDG config at runtime:

```
$XDG_CONFIG_HOME/engram/kinds/<kind-name>.yaml
```

The fallback when `$XDG_CONFIG_HOME` is not set:

```
~/.config/engram/kinds/<kind-name>.yaml
```

Override resolution is by **name match**: a user file whose `name` field matches a
built-in kind replaces the built-in entirely. Partial overrides are not supported —
the user file must supply all required fields.

## Required Fields Per Kind

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Canonical kind identifier. Matches the `kind` column in `projections`. Snake_case. |
| `description` | string | One sentence: what this kind of projection IS. |
| `when_to_use` | string | Concrete guidance for the discover prompt: when to propose this kind, what conditions must be present. Multiline YAML string. |
| `anchor_types` | string[] | Valid `anchor_type` values for this kind. Subset of `['entity', 'edge', 'episode', 'projection', 'none']`. |
| `expected_inputs` | string[] | Human-readable list of substrate element types typically included in the input set. Not enforced at write time — guidance for the generator and discover prompt. |
| `example_title_pattern` | string | Pattern for a representative projection title. Used in listings and the discover prompt's coverage catalog. May contain `{placeholder}` tokens. |

All six fields are required. The loader validates at startup and refuses to serve a
catalog with missing fields; a `KindValidationError` is thrown with the kind name
and missing field(s).

## Catalog Loading Semantics

`loadKindCatalog()` is called once at process start (or lazily on first use) and
cached in module scope. It:

1. Reads all `*.yaml` files from the built-in directory
   (`packages/engram-core/src/ai/kinds/`).
2. Reads all `*.yaml` files from `$XDG_CONFIG_HOME/engram/kinds/` (or the
   fallback path). Missing directory is silently ignored.
3. Merges the two sets: for any `name` present in both, the XDG copy replaces
   the built-in.
4. Validates every entry against the required-field contract. Throws
   `KindValidationError` for any invalid entry.
5. Returns the merged, validated array.

The result is a `KindCatalog` (an array of `KindEntry` objects) — see
`packages/engram-core/src/ai/kinds.ts` for the TypeScript interface.

### Loading in tests

Tests may call `loadKindCatalog()` with an explicit override directory path
(second argument) to inject test fixtures without touching the filesystem. The
built-in directory is always the package-relative path; the XDG path is the
overridable parameter.

## Built-In Kinds (v0.2)

### `entity_summary`

A synthesis of what a given entity is: what it does, who works on it, how it
relates to neighboring entities in the graph. The primary "wiki page" kind.

### `decision_page`

Documents a technical or process decision: what was decided, why, who made it,
what alternatives were considered. Anchors to a decision-typed entity or to no
anchor (for decisions that don't map to a single entity).

### `contradiction_report`

Identifies facts in the substrate or across projections that contradict each
other. No anchor — this is a global or scoped analysis. The LLM cites the
conflicting substrate elements as evidence.

### `topic_cluster`

Groups entities, edges, and episodes that share a common theme the LLM identifies
as coherent but which may not have a single named entity as a hub. Useful for
cross-cutting concerns (e.g. "authentication", "performance", "release infra").

## Discover-Phase Prompt Integration

The discover phase of `reconcile()` receives the kind catalog as a structured
input:

```ts
const kindCatalog = loadKindCatalog();
const proposals = await discoverer.propose({ delta, coverage, kindCatalog, budget });
```

The LLM reads the `name`, `description`, `when_to_use`, and `anchor_types` fields
to decide which kinds apply to which parts of the substrate delta. It does **not**
invent new kind names — all proposals reference a kind from the catalog. Unknown
kinds are rejected at `project()` validation time.

The `example_title_pattern` field is used when building the coverage catalog
summary — it gives the LLM a sense of what a title for this kind looks like, which
helps it avoid proposing projections that are functionally identical to existing
ones.

## Schema Validation

The TypeScript loader (`kinds.ts`) validates each loaded entry against the
`KindEntry` interface using a runtime check. The check is exhaustive:

- All six required fields must be present and non-empty strings / non-empty arrays.
- `anchor_types` entries must be a subset of valid anchor type strings.
- `name` must match `^[a-z][a-z0-9_]*$` (snake_case, no hyphens).

Validation happens at load time, not at projection-write time. The projection layer
trusts that any `kind` string that passes the `project()` call is valid (it was
proposed by the discover phase which only picks from the catalog). A secondary
validation that `kind` is in the catalog may be added as a lint invariant in a
future `verifyGraph()` extension.

## Future Extensions

- **Custom kinds from user config.** The XDG override path already supports adding
  entirely new kinds (not just overriding built-ins). No code changes needed.
- **Kind versioning.** A `version` field may be added to detect when a built-in
  changes under an existing projection's `prompt_template_id`.
- **Prompt template binding.** A `prompt_template_id` field may be added to
  explicitly link a kind to a prompt file in `src/ai/prompts/`. Currently the
  binding is by convention (same stem name).
