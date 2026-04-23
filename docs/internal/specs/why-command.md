# `engram why` — Narrative Assembly Contract

## Overview

`engram why <target>` narrates the history and rationale of a file, symbol, or
line range from the knowledge graph. It assembles a **digest** from the graph
substrate and optionally passes it through an AI generator for prose narration.

The command is **read-only** — it does not create or modify any graph data.

## Target Resolution

### Forms

| Input | Kind | Resolution |
|-------|------|------------|
| `path/to/file.ts` | `path` | Entity with `canonical_name` matching (exact or suffix LIKE) |
| `symbolName` | `symbol` | Entity with `canonical_name` ending in `::symbolName` |
| `path/to/file.ts:N` | `path_line` | File entity + git blame for line N intro commit |

### Resolution algorithm

1. **Exact match** — query `entities WHERE canonical_name = ?`
2. **Suffix LIKE** — query `entities WHERE canonical_name LIKE '%<input>'`
3. **FTS fallback** — search `entities_fts` for close matches; suggest in error

If exactly one match: resolved. If multiple matches: **disambiguation list + exit 2**.
If no match: **exit 1** with closest suggestions from FTS.

### path:line

1. Parse file path and line number.
2. Run `git blame -L N,N --porcelain <path>` to find the introducing commit hash.
3. Look up the commit episode in the graph via `source_ref`.
4. Use the file entity as primary; the blame episode overrides the default
   introducing episode when available.

## Narrative Assembly (Substrate-Only, Deterministic)

The digest is assembled in this order, respecting the `--token-budget`:

1. **Introducing episode** — oldest `git_commit` episode linked to the entity
   via `entity_evidence`. Actor + timestamp + first line of commit message.
2. **Co-change neighbors** — top 5 by weight from `co_changes_with` edges,
   sorted descending. Includes the neighbor's canonical name and edge weight.
3. **Active ownership edges** — `likely_owner_of` edges not yet invalidated.
   Includes the `fact` string and `valid_from`.
4. **Anchored projections** — `listActiveProjections({ anchor_id: entity.id })`.
   Kind, title, valid_from.
5. **Recent PRs/issues** — episodes of `source_type IN ('github_pr', 'github_issue')`
   linked via `entity_evidence`, sorted by timestamp descending, capped at 10.
6. **Rename-following** — `git log --follow <path>` to collect commits from
   prior paths; matches them against episodes in the graph.

### Token budget

- Default: 4000 tokens
- `--token-budget 0` disables capping entirely
- Items are added in order; when adding an item would exceed the budget, it is
  skipped and `truncated: true` is set in the output

### Determinism

The structured output (`--no-ai`) is fully deterministic for a given graph state.
The same graph + same target always produces the same digest.

## AI Narration

When an AI generator is configured (Anthropic, Gemini, or OpenAI API key present):

1. The digest is assembled as above.
2. A fixed prompt is constructed with the evidence, requesting 3–5 sentence
   prose with inline `[E:<ulid>]` citations.
3. The generated text is appended to text/markdown output, or added as
   `narrative` in JSON output.

`--no-ai` bypasses AI narration entirely. The structured digest is always present
regardless of AI availability.

## Output Formats

See `docs/internal/specs/citation-convention.md` for citation format details.

### text (default)

```
edges.ts — packages/engram-core/src/graph/edges.ts

Introduced
  abc1234  feat: initial edges implementation
           Ryan Wolfe · 2026-01-14  [E:01J9V...]

Top co-change neighbors (last 90d)
  episodes.ts          18×
  evidence.ts          12×

Active ownership
  Ryan Wolfe owns edges.ts  since 2026-01-14  [E:01J9VZX...]

Anchored decisions
  decision_page  "edge supersession is atomic"  2026-03-22  [E:01JABC...]

Recent PRs touching this target
  #216  episode supersession invariants   2026-04-04  [E:...]
```

### markdown

Headings for each section, inline citations as markdown links for GitHub episodes.

### json

```json
{
  "target": "packages/engram-core/src/graph/edges.ts",
  "evidence": {
    "episodes": [...],
    "edges": [...],
    "projections": [...]
  },
  "citations": [...],
  "truncated": false,
  "token_budget_used": 1240,
  "narrative": "..."
}
```

## Error Semantics

| Condition | Exit code |
|-----------|-----------|
| Target not found | 1 |
| Ambiguous target (multiple matches) | 2 |
| Graph file not found | 1 |
| Invalid flags | 1 |

## CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--db <path>` | `.engram` | Path to .engram file |
| `--format text\|markdown\|json` | `text` | Output format |
| `-j` | — | Shorthand for `--format json` |
| `--no-ai` | off | Force structured output, skip AI narration |
| `--token-budget <n>` | 4000 | Cap assembled context (0 = no cap) |
| `--since <ref>` | — | Restrict to changes since ISO date or git ref |
