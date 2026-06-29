## Context pack
> Query: Is there a lightweight planned command for an agent to quickly file a fact it just learned mid-task, without the full addEntity ceremony? Has this been considered?  Budget: 8000 tokens | Used: ~5958 | 33 results (17 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `scripts/autodev/agent-exec.sh` **[module]** — score 1.000 | evidence: 2 episode(s)
- `docs/internal/specs/cli-as-agent-surface.md` **[module]** — score 0.861 | evidence: 2 episode(s)
- `docs/internal/specs/why-command.md` **[module]** — score 0.744 | evidence: 2 episode(s)
- `7c93bb63e5fba27921f0d55ae5a3458d2f600f2d` **[commit]** — score 0.726 | evidence: 1 episode(s)
- `6f362a603fc40180e4fb670351914ab7d7dee99f` **[commit]** — score 0.708 | evidence: 1 episode(s)
- `c4bc39f0b36afb6c6a44ebe8ccef07a103cb1a00` **[commit]** — score 0.698 | evidence: 1 episode(s)
- `3de3afa0045cd4c02286af8411568540c1703ffb` **[commit]** — score 0.645 | evidence: 1 episode(s)
- `39fb6765f2477b07ba835fd145adf1f1ab4c381c` **[commit]** — score 0.645 | evidence: 1 episode(s)
- `439e986204209da1255e81581e0102e714bad5e0` **[commit]** — score 0.618 | evidence: 1 episode(s)
- `67ada3f38d0e6af3d95c04caf95805148a231e6c` **[commit]** — score 0.618 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/277` **[issue]** — score 0.607 | evidence: 1 episode(s)
- `fa900ad653b1958734e398331a5cb26d9c1d5c97` **[commit]** — score 0.592 | evidence: 1 episode(s)
- `97fafbeaffc9a2cab84ceb29e11c77fd5d7a0085` **[commit]** — score 0.592 | evidence: 1 episode(s)
- `1ecd57a798042e6b1519d2ed40c52e138e0ea0c0` **[commit]** — score 0.592 | evidence: 1 episode(s)
- `9760bf5204f426f1e01993b36cd867ba3b9b0945` **[commit]** — score 0.592 | evidence: 1 episode(s)
- `73046c62a222c7d2ed7b7e5a03048354e5cc75b3` **[commit]** — score 0.592 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/251` **[pull_request]** — score 0.587 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/143` **[issue]** — score 0.552 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/116` **[issue]** — score 0.552 | evidence: 1 episode(s)
- `af53636b0dd5a5b9aebee0b86656518cad4352d3` **[commit]** — score 0.548 | evidence: 1 episode(s)
- `a022c40faec44a7eec22e15fdc7b2ef0b7737d25` **[commit]** — score 0.548 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/141` **[issue]** — score 0.536 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/165` **[pull_request]** — score 0.528 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/164` **[pull_request]** — score 0.528 | evidence: 1 episode(s)
- `7bf201c0cb2ff81b065ecc54eb594fd6588b6219` **[commit]** — score 0.509 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/188` **[pull_request]** — score 0.509 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/85` **[pull_request]** — score 0.509 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/20` **[pull_request]** — score 0.509 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/205` **[issue]** — score 0.509 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/186` **[issue]** — score 0.509 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands` **[module]** — score 0.072 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands` **[module]** — score 0.072 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/why.ts` **[module]** — score 0.072 | evidence: 2 episode(s)

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/rnwolfe/engram/pull/95` (2026-04-13 by rnwolfe) — confidence 1.000:
```
… Project) as the core story, not just the substrate
- **Quick Start** shows the full workflow in order: `init --from-git`, GitHub enrichment, `reconcile` + `export wiki` (the payoff), then query/visualize — enrichment and projections are steps in the flow, not afterthoughts
- **Enrichment section** gets a support matrix table: GitHub (supported), GitLab/Gerrit/Jira/Linear (planned), Slack/Confluence (desired)
- **AI Providers section** split into two explicit tables: embeddings (null/ollama/gemini) vs. projection authoring (Anthropic only) — both show what is *not* supported so there's no ambiguity
- Design principle 5 updated from "structurally sound without AI" to the ADR-002 reframe: "deterministic substrate, AI-authored projections — both versioned in time"

## Test plan

- [ ] Read through the README top-to-bottom as a new user
- [ ] Verify all commands in Quick Start exist and work
- [ ] Check enrichment table reflects actual adapter code (`packages/engram-core/src/ingest/adapters/`)
- [ ] Check AI provider tables reflect actual provider implementations (`packages/engram-core/src/ai/`)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**github_pr** `https://github.com/rnwolfe/engram/pull/221` (2026-04-20 by rnwolfe) — confidence 0.953:
```
… episode supersession, the reconcile discover phase, and the
`engram companion` command. It also underpitched the command surface and
left `--max-cost` unit ambiguous.

## What changed

- **Added a table of contents** and a compact command matrix covering all
  top-level commands.
- **Replaced the piecewise Quick Start** (`init --from-git`, `ingest source`,
  `ingest enrich github --repo`, etc.) with the `engram init` flow as the
  primary path, plus a non-interactive script variant.
- **New section: "Use it with an AI coding agent"** — promotes the
  `engram companion` + `engram context` workflow that was previously
  invisible in the README despite being one of engram's strongest pitches.
- **Plugin system is now documented** — discovery precedence, both transports
  (`js-module` and `executable`), `engram plugin list` output.
- **Gerrit upgraded from "Planned" to "Built-in"** (it shipped in #211).
- **`--max-cost` is explicitly labelled as a token budget** (not a currency
  amount) — closes a real footgun.
- **Removed hardcoded model version strings** (`gpt-5.4`, `gemini-3.1-pro-preview`)
  that drift between releases. Replaced with "run `engram status` to see
  what your instal…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `scripts/autodev/agent-exec.sh@605cf3c836e447a544e49fd0a05a73` (2026-06-29):
```
#!/usr/bin/env bash
set -euo pipefail

# scripts/autodev/agent-exec.sh — Model-agnostic agent execution abstraction
#
# Usage:
#   scripts/autodev/agent-exec.sh TASK_FILE
#
# Routes to the configured provider. In CI, workflows use claude-code-action@v1
# directly — this script exists for local testing and documenting the abstraction.
#
# Providers:
#   claude  — Claude CLI (requires `claude` in PATH)
#   codex   — OpenAI Codex (placeholder)
#   gemini  — Google Gemini (placeholder)

source "$(di…
```

**git_commit** `6b8490220d35d048754c617b19c9c30a0f5c2acb` (2026-06-29 by rnwolfe@users.noreply.github.com):
```
commit 6b8490220d35d048754c617b19c9c30a0f5c2acb
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-06-29T11:48:37.000Z

feat: wow-moment cycle, plus 2026-h2 direction re-aim and adr-009 (#279)

Implementation (wow-moment cycle):
- eval fixture harness (packages/engram-core/test/fixtures/eval) + k8s
  KEP-753 fixture and runner
- module_overview projection kind, end-to-end with staleness pl…
```

**source** `docs/internal/specs/cli-as-agent-surface.md@e3fecedd5c44dc8d` (2026-06-29):
```
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
| `1` | User error — bad flag, missing required argument, invalid input…
```

**git_commit** `36663175d43a814053d6436adfcb6a6a8badda73` (2026-04-23 by rnwolfe@users.noreply.github.com):
```
commit 36663175d43a814053d6436adfcb6a6a8badda73
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-23T12:42:40.000Z

feat(cli): engram why — narrate the history and rationale of a file, symbol, or line (#269)

* feat: add engram why command — grounded narrative from graph substrate

Implements #260. Adds `engram why <target>` which narrates the history and
rationale of a file, symbol, o…
```

**source** `docs/internal/specs/why-command.md@0761e7c0f6be9941c977f1b8c` (2026-06-29):
```
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
| `path/to/file.ts` | `path` | En…
```

**git_commit** `7c93bb63e5fba27921f0d55ae5a3458d2f600f2d` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 7c93bb63e5fba27921f0d55ae5a3458d2f600f2d
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T10:31:38.000Z

feat: replace copilot wait with sub-agent review in forge-loop

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

Files:
.claude/skills/forge-loop/SKILL.md
```

**git_commit** `6f362a603fc40180e4fb670351914ab7d7dee99f` (2026-04-18 by rn.wolfe@gmail.com):
```
commit 6f362a603fc40180e4fb670351914ab7d7dee99f
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-18T02:50:26.000Z

test(cli): add companion command tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

Files:
packages/engram-cli/test/companion.test.ts
```

**git_commit** `c4bc39f0b36afb6c6a44ebe8ccef07a103cb1a00` (2026-04-21 by rnwolfe@users.noreply.github.com):
```
commit c4bc39f0b36afb6c6a44ebe8ccef07a103cb1a00
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-21T16:49:31.000Z

fix(cli): systematic UX audit fixes for human and agent ergonomics (#251)

* fix(cli): systematic UX audit fixes for human and agent ergonomics

Critical:
- ingest git/md: always emit result counts to stdout in non-TTY mode
  (scripts and agents no longer get silence on s…
```

**git_commit** `3de3afa0045cd4c02286af8411568540c1703ffb` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 3de3afa0045cd4c02286af8411568540c1703ffb
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T03:30:09.000Z

feat: add --format flag to decay command (#165)

Add --format <table|json> (default: table) to engram decay. JSON mode
emits the full DecayReport object to stdout with no clack chrome.
Invalid format values exit 1 with a clear error message.

Closes #146

Co-authored-by: …
```

**git_commit** `39fb6765f2477b07ba835fd145adf1f1ab4c381c` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 39fb6765f2477b07ba835fd145adf1f1ab4c381c
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T03:26:07.000Z

feat: add --format flag to stats command (#164)

* feat: add --format flag to stats command

Add --format <text|json> option to engram stats for machine-readable
output. JSON mode emits a single object with entity, edge, episode,
alias, and db counts. Invalid format value…
```

**git_commit** `439e986204209da1255e81581e0102e714bad5e0` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 439e986204209da1255e81581e0102e714bad5e0
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T13:49:26.000Z

feat(cli): engram doctor — diagnostic and repair command (#188)

* feat: add engram doctor diagnostic and repair command

Implements `engram doctor` — a brew-style diagnostic and repair
command. Runs 7 checks (layout, gitignore, schema, fts_index,
embedding_index, wal, ev…
```

**git_commit** `67ada3f38d0e6af3d95c04caf95805148a231e6c` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 67ada3f38d0e6af3d95c04caf95805148a231e6c
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T14:47:30.000Z

feat: engram project command for explicit projection authoring (#85)

* feat: add engram project command for explicit projection authoring

Implements the `engram project` CLI subcommand that surfaces the core
`project()` operation, allowing users to author projections on…
```

**github_issue** `https://github.com/rnwolfe/engram/issues/277` (2026-04-25 by rnwolfe):
```
Issue #277: discussion: agent-facing freshness UX — patterns to borrow from beads
URL: https://github.com/rnwolfe/engram/issues/277
State: open
Author: rnwolfe
Created: 2026-04-25T03:46:35Z

> *Brainstorm output captured for later discussion. Each numbered idea below is a candidate for its own scoped issue if pursued — this issue is the umbrella context, not a scoped feature request.*

---

## What's worth stealing from beads

Beads' core insight: **agents lose context every ~10 minutes, so exte…
```

**git_commit** `fa900ad653b1958734e398331a5cb26d9c1d5c97` (2026-04-19 by rnwolfe@users.noreply.github.com):
```
commit fa900ad653b1958734e398331a5cb26d9c1d5c97
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-19T21:20:06.000Z

feat(cli): ingest command — consume v2 adapter options (#205) (#215)

* feat(cli): ingest command — consume v2 adapter options

- add AuthCredential union, ScopeSchema, and supportedAuth to adapter.ts
- update GitHub and Gerrit adapters with supportedAuth + scopeSchema
- …
```

**git_commit** `97fafbeaffc9a2cab84ceb29e11c77fd5d7a0085` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 97fafbeaffc9a2cab84ceb29e11c77fd5d7a0085
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T04:21:48.000Z

fix(cli): move intro before validation in embed command (#176)

Clack's log.error produces garbled output when called before intro().
Move intro("engram embed") to the top of the action handler so all
validation errors (modeCount > 1, invalid --target) render cleanly
with…
```

**git_commit** `1ecd57a798042e6b1519d2ed40c52e138e0ea0c0` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 1ecd57a798042e6b1519d2ed40c52e138e0ea0c0
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T03:41:43.000Z

feat(cli): add --format text|json to history command (#167)

* feat(cli): add --format text|json to history command

Adds machine-readable JSON output to `engram history`, emitting full
temporal edge fields (id, fact, edge_kind, relation_type, valid_from,
valid_until, inv…
```

**git_commit** `9760bf5204f426f1e01993b36cd867ba3b9b0945` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 9760bf5204f426f1e01993b36cd867ba3b9b0945
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T03:34:48.000Z

feat(cli): add --format <text|json> to show command (#166)

Adds --format flag to `engram show`. When --format json, emits a
machine-readable JSON object with entity fields, edges array (each with
fact, edge_kind, relation_type, direction, invalidated_at), and
evidenceCou…
```

**git_commit** `73046c62a222c7d2ed7b7e5a03048354e5cc75b3` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 73046c62a222c7d2ed7b7e5a03048354e5cc75b3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T15:21:46.000Z

docs: replace Money Command + Visualize sections with Quick Start (#94)

Consolidates the scattered init/visualize/reconcile introductions into a
single four-step Quick Start block that shows the full workflow at a glance.
Retains the entity/edge bullet list under the blo…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/251` (2026-04-21 by rnwolfe):
```
PR #251: fix(cli): systematic UX audit fixes for human and agent ergonomics
URL: https://github.com/rnwolfe/engram/pull/251
State: closed
Author: rnwolfe
Created: 2026-04-21T15:37:39Z

## Summary

Addresses all findings from a systematic CLI UX audit across all command files. Fixes span three severity tiers: critical scripting breaks, major agent-unfriendly gaps, and minor inconsistencies.

## Critical

- **`ingest git` / `ingest md` silent in non-TTY** — result counts (episodes created, entitie…
```

**github_issue** `https://github.com/rnwolfe/engram/issues/143` (2026-04-18 by rnwolfe):
```
Issue #143: feat(cli): agent ergonomics — context entity/edge limits and companion --check for CI
URL: https://github.com/rnwolfe/engram/issues/143
State: closed
Author: rnwolfe
Created: 2026-04-18T03:07:59Z

## Problem

Two agent-facing commands have ergonomic gaps that reduce usability in automated pipelines.

### 1. `engram context` has no direct control over result counts

`context` uses `--token-budget` for budget, but an agent that wants exactly N entities has no control without guessing t…
```

**github_issue** `https://github.com/rnwolfe/engram/issues/116` (2026-04-17 by rnwolfe):
```
Issue #116: chore: workflow benchmark — Phase 3 (pack vs bare agent on multi-file tasks)
URL: https://github.com/rnwolfe/engram/issues/116
State: open
Author: rnwolfe
Created: 2026-04-17T12:07:03Z

## Goal

Run the Phase 3 workflow benchmark from `docs/internal/pack-companion-spec.md`. This is
the Gate G1 exit criterion for narrative projections per ADR-004 and the `VISION.md`
roadmap.

## Background

The two earlier experiments (experiment G1 on engram repo, experiment G2 on Maestro —
`docs/int…
```

**git_commit** `af53636b0dd5a5b9aebee0b86656518cad4352d3` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit af53636b0dd5a5b9aebee0b86656518cad4352d3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T04:47:05.000Z

feat(cli): add --max-entities and --max-edges to context command (#181)

* feat(cli): add --max-entities and --max-edges to context command

Add optional hard-cap flags that apply as secondary filters after
the token budget, capping the entity and edge candidate sets befo…
```

**git_commit** `a022c40faec44a7eec22e15fdc7b2ef0b7737d25` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit a022c40faec44a7eec22e15fdc7b2ef0b7737d25
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T04:01:37.000Z

fix(cli): treat embedding model 'none' as valid in status command (#171)

Databases initialized with --embedding-model none store 'none' in
metadata. The exit code check used !model which is falsy for null but
also falsy for empty strings, not for 'none'. The correct fix …
```

**github_issue** `https://github.com/rnwolfe/engram/issues/141` (2026-04-18 by rnwolfe):
```
Issue #141: fix(cli): consistent output layer — clean stdout/stderr separation for piped and agent use
URL: https://github.com/rnwolfe/engram/issues/141
State: closed
Author: rnwolfe
Created: 2026-04-18T03:07:24Z

## Problem

The CLI mixes two output layers:
- **`@clack/prompts`** (`log.error`, `log.info`, `log.success`, `intro`, `outro`, spinners) — emits ANSI escape sequences; designed for interactive TTY use
- **`console.error` / `console.log`** — raw, no decoration; goes to stderr/stdout dir…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/165` (2026-04-18 by rnwolfe):
```
PR #165: feat: add --format flag to decay command
URL: https://github.com/rnwolfe/engram/pull/165
State: closed
Author: rnwolfe
Created: 2026-04-18T03:28:29Z

## Summary

- Add `--format <table|json>` option to `engram decay` (default: `table`)
- JSON mode emits the full `DecayReport` object directly to stdout with no clack chrome
- Invalid format values exit 1 with a clear error message matching the pattern used in `ownership` and `stats`

## Acceptance Criteria

- [x] `engram decay --format js…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/164` (2026-04-18 by rnwolfe):
```
PR #164: feat: add --format flag to stats command
URL: https://github.com/rnwolfe/engram/pull/164
State: closed
Author: rnwolfe
Created: 2026-04-18T03:18:48Z

## Summary

- Adds `--format <text|json>` option to `engram stats` (default: `text`)
- JSON mode emits a single-line object: `{ "entities", "edges", "edgesInvalidated", "episodes", "aliases", "db" }` with no clack chrome
- Invalid format value exits 1 with `Error: --format must be 'text' or 'json'`
- Text output (default and `--format text…
```

**git_commit** `7bf201c0cb2ff81b065ecc54eb594fd6588b6219` (2026-04-22 by rnwolfe@users.noreply.github.com):
```
commit 7bf201c0cb2ff81b065ecc54eb594fd6588b6219
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-22T14:40:56.000Z

feat(plugins): plugin docs contract — manifest description/docs fields and plugin info command (#257)

* feat(plugins): plugin docs contract - manifest description/docs fields and plugin info command

Adds optional `description` and `docs` fields to PluginManifest. Surfac…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/188` (2026-04-18 by rnwolfe):
```
PR #188: feat(cli): engram doctor — diagnostic and repair command
URL: https://github.com/rnwolfe/engram/pull/188
State: closed
Author: rnwolfe
Created: 2026-04-18T13:33:47Z

## Summary

- Adds `engram doctor` command: runs 7 diagnostic checks against a `.engram` database (layout, gitignore, schema, fts_index, embedding_index, wal, evidence_integrity) and prints a human-readable health table
- `--fix` / `--fix --yes` applies safe auto-fixes interactively or non-interactively
- `--format json` / …
```

**github_pr** `https://github.com/rnwolfe/engram/pull/85` (2026-04-10 by rnwolfe):
```
PR #85: feat: engram project command for explicit projection authoring
URL: https://github.com/rnwolfe/engram/pull/85
State: closed
Author: rnwolfe
Created: 2026-04-10T11:12:57Z

## Summary

- Adds `engram project` CLI subcommand that surfaces the core `project()` operation
- Supports `--kind`, `--anchor`, `--input` (repeatable), `--dry-run`, and `--db` flags
- When `--input` is omitted for an `entity:<id>` anchor, defaults to the entity + all evidence episodes + all touching edges
- Detects Nul…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/20` (2026-04-07 by rnwolfe):
```
PR #20: feat: git VCS ingestion — the money command engine
URL: https://github.com/rnwolfe/engram/pull/20
State: closed
Author: rnwolfe
Created: 2026-04-07T04:30:02Z

## Summary

- `ingestGitRepo(graph, repo_path, opts?)` — walks git history and builds a structural knowledge graph without any API tokens or AI
- Extracts person entities (authors) and module entities (files)
- Observed edges: `authored_by`, `modified`
- Inferred edges: `co_changes_with` (file pairs changed together ≥ threshold), `…
```

**github_issue** `https://github.com/rnwolfe/engram/issues/205` (2026-04-18 by rnwolfe):
```
Issue #205: feat(cli): ingest command — consume v2 adapter options
URL: https://github.com/rnwolfe/engram/issues/205
State: closed
Author: rnwolfe
Created: 2026-04-18T21:19:49Z

## Goal

Update `packages/engram-cli/src/commands/ingest.ts` to consume the v2 `EnrichmentAdapter`
contract from #200: construct `AuthCredential` from flags/env, validate scope via the
adapter-provided `scopeSchema`, and surface targeted error messages for auth failures.

## Context

#200 lands the v2 contract in `engram…
```

**github_issue** `https://github.com/rnwolfe/engram/issues/186` (2026-04-18 by rnwolfe):
```
Issue #186: feat(cli): engram doctor — diagnostic and repair command
URL: https://github.com/rnwolfe/engram/issues/186
State: closed
Author: rnwolfe
Created: 2026-04-18T12:22:23Z

## Overview

`engram doctor` inspects a graph for known issues and optionally repairs them. Modeled after `brew doctor`, `cargo doctor`, `go env` — a single command that tells you if anything is wrong and how to fix it.

## Checks

| Check | Pass condition | Fix |
|-------|---------------|-----|
| `layout` | `.engram/`…
```

**source** `packages/engram-cli/src/commands/whats-new.ts@ea735c227ec1b8` (2026-06-29):
```
/**
 * whats-new.ts — `engram whats-new` command.
 *
 * Renders user-facing highlights from `docs/whats-new.json` filtered to the
 * versions the user has not yet acknowledged (everything strictly newer than
 * the graph's `last_seen_engine_version`).
 *
 * On successful human-format output, bumps `last_seen_engine_version` to the
 * running `ENGINE_VERSION` so the nudge from `doctor`/`status` goes quiet.
 * `--no-mark` suppresses that side effect — useful for re-reading notes.
 *
 * The file `d…
```

**source** `packages/engram-cli/test/commands/reconcile.test.ts@f84c89b5` (2026-06-29):
```
/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "n…
```

**git_commit** `809357bc02d44335c3525aa9106c1586f825c09b` (2026-04-24 by rn.wolfe@gmail.com):
```
commit 809357bc02d44335c3525aa9106c1586f825c09b
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-24T10:30:44.000Z

fix(cli): resolve 10 noNonNullAssertion lint warnings

Convert ParsedTarget from an optional-field interface to a discriminated
union so TypeScript narrows path/symbol access without assertions. Declare
graph variables as EngramGraph (not | undefined) in brief and onboard
action …
```

**source** `packages/engram-cli/src/commands/why.ts@e8e30b52efea6e3ce0b5` (2026-06-29):
```
/**
 * why.ts — `engram why` command.
 *
 * Narrates the history and rationale of a file, symbol, or line range from the
 * knowledge graph. Assembles a structured digest from the graph substrate
 * (introducing commit, co-change neighbors, ownership, PR history, projections)
 * and optionally passes it through an AI generator for prose narration.
 *
 * Usage:
 *   engram why <path>
 *   engram why <symbol>
 *   engram why <path>:<line>
 *   engram why <path> --since <ref>
 *   engram why <path>…
```

