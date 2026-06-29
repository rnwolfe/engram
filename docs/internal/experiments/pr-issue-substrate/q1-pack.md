## Context pack
> Query: What's the plan for a single command that tells an agent what work is actionable or stale right now in this repo, instead of calling several separate commands? Has this been considered?  Budget: 8000 tokens | Used: ~6702 | 33 results (23 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `docs/internal/near-term-plan.md` **[module]** — score 1.000 | evidence: 1 episode(s)
- `docs/internal/harness-pivot-plan.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `scripts/autodev/agent-exec.sh` **[module]** — score 0.960 | evidence: 2 episode(s)
- `17d30496c4156bf7b6332fc86accb0c8c567d8cd` **[commit]** — score 0.907 | evidence: 1 episode(s)
- `docs/internal/specs/cli-as-agent-surface.md` **[module]** — score 0.826 | evidence: 2 episode(s)
- `59769a9a4f3646adf6426ade15b8214942384eda` **[commit]** — score 0.796 | evidence: 1 episode(s)
- `docs/internal/specs/why-command.md` **[module]** — score 0.714 | evidence: 2 episode(s)
- `7c93bb63e5fba27921f0d55ae5a3458d2f600f2d` **[commit]** — score 0.697 | evidence: 1 episode(s)
- `6f362a603fc40180e4fb670351914ab7d7dee99f` **[commit]** — score 0.680 | evidence: 1 episode(s)
- `c4bc39f0b36afb6c6a44ebe8ccef07a103cb1a00` **[commit]** — score 0.670 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/278` **[pull_request]** — score 0.639 | evidence: 1 episode(s)
- `3de3afa0045cd4c02286af8411568540c1703ffb` **[commit]** — score 0.619 | evidence: 1 episode(s)
- `39fb6765f2477b07ba835fd145adf1f1ab4c381c` **[commit]** — score 0.619 | evidence: 1 episode(s)
- `439e986204209da1255e81581e0102e714bad5e0` **[commit]** — score 0.593 | evidence: 1 episode(s)
- `67ada3f38d0e6af3d95c04caf95805148a231e6c` **[commit]** — score 0.593 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/277` **[issue]** — score 0.582 | evidence: 1 episode(s)
- `fa900ad653b1958734e398331a5cb26d9c1d5c97` **[commit]** — score 0.569 | evidence: 1 episode(s)
- `97fafbeaffc9a2cab84ceb29e11c77fd5d7a0085` **[commit]** — score 0.569 | evidence: 1 episode(s)
- `1ecd57a798042e6b1519d2ed40c52e138e0ea0c0` **[commit]** — score 0.569 | evidence: 1 episode(s)
- `9760bf5204f426f1e01993b36cd867ba3b9b0945` **[commit]** — score 0.569 | evidence: 1 episode(s)
- `73046c62a222c7d2ed7b7e5a03048354e5cc75b3` **[commit]** — score 0.569 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/251` **[pull_request]** — score 0.564 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/143` **[issue]** — score 0.530 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/116` **[issue]** — score 0.530 | evidence: 1 episode(s)
- `af53636b0dd5a5b9aebee0b86656518cad4352d3` **[commit]** — score 0.526 | evidence: 1 episode(s)
- `a022c40faec44a7eec22e15fdc7b2ef0b7737d25` **[commit]** — score 0.526 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/issues/141` **[issue]** — score 0.515 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/165` **[pull_request]** — score 0.507 | evidence: 1 episode(s)
- `https://github.com/rnwolfe/engram/pull/164` **[pull_request]** — score 0.507 | evidence: 1 episode(s)
- `7bf201c0cb2ff81b065ecc54eb594fd6588b6219` **[commit]** — score 0.489 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands` **[module]** — score 0.069 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands` **[module]** — score 0.069 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/why.ts` **[module]** — score 0.069 | evidence: 2 episode(s)

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/rnwolfe/engram/pull/279` (2026-04-26 by rnwolfe) — confidence 1.000:
```
…3 compatibility appendix |
| **CLI surface spec** | `docs/internal/specs/cli-as-agent-surface.md` | Exit codes 0/1/2/3, --format=json schemas for 8 commands, --list-tools contract |
| **Exit codes** | `context.ts`, `sync.ts`, `ingest.ts`, `search.ts`, `show.ts`, `stats.ts`, `verify.ts`, `init-runners.ts`, `init-interactive.ts` | system errors → exit(2); rate limits → exit(3); user errors stay exit(1) |
| **--list-tools** | `packages/engram-cli/src/commands/list-tools.ts` | `engram --list-tools` emits 11-command JSON catalogue for agent discovery |
| **Conformance check** | `scripts/check-cli-conformance.ts` | Scans 8 high-traffic commands for --format and exit-code conformance; wired into `bun run verify` |
| **kinds test update** | `packages/engram-core/test/ai/kinds.test.ts` | Updated count assertions for 5 built-in kinds (was 4) |
| **package.json** | root + core | `packages/harnesses/*` workspace, `bun run eval` script, `check:cli-conformance` script |

---

## Manual tests to perform

### 1. Wow-moment gate (the cycle's primary success criterion)

**Prerequisites:**
```sh
# Pin the fixture SHA first (look up the parent of the KEP-753 alpha-impl merge)
# https://github.com/kube…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/128` (2026-04-17 by rnwolfe) — confidence 0.880:
```
…s/engramark/` benchmark package entirely (Fastify retrieval benchmarks, all non-stale-knowledge code)
- Relocates stale-knowledge detection code to `packages/engram-core/test/stale-knowledge/` as standard `bun test` integration tests
- Removes `docs/internal/specs/engramark-ai-benchmarking.md` and `docs/internal/specs/engramark-stale-knowledge.md`
- Updates `CLAUDE.md`, `README.md`, `docs/internal/VISION.md`, and `docs/internal/STATUS.md` to remove engramark references

## What's preserved

The stale-knowledge detection logic is fully retained under `packages/engram-core/test/stale-knowledge/`:
- `datasets/fastify.json` — 10 scenarios (7 stale, 3 fresh)
- `datasets/loader.ts` — `loadDataset()`, `prepareScenarios()`, `SyntheticGenerator`
- `runners/stale-naive-rag.ts` — baseline (always fresh, score 0.0)
- `runners/stale-read-time.ts` — read-time fingerprint check via `getProjection()`
- `runners/stale-full-reconcile.ts` — reconcile() assess phase
- `scoring.ts` — `computeStaleKnowledgeMetrics()` (precision, recall, F1)
- `stale-knowledge.test.ts` — 21 new integration tests covering all strategies

## Test plan

- [x] `bun test` passes (785 tests, 0 failures)
- [x] `bun run build` p…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/17` (2026-04-07 by rnwolfe) — confidence 0.844:
```
… 46 tests

## Acceptance Criteria

- [x] `addEntity(graph, entity, evidence)` — single transaction, evidence required
- [x] `getEntity(graph, id)` — returns entity or null
- [x] `findEntities(graph, query)` — filter by `entity_type`, `canonical_name`, `status`
- [x] `addEdge(graph, edge, evidence)` — single transaction, evidence required
- [x] `getEdge(graph, id)` — returns edge or null
- [x] `findEdges(graph, query)` — filter by `source_id`, `target_id`, `relation_type`, `edge_kind`, active-only
- [x] `addEpisode(graph, episode)` — with SHA-256 content hash and idempotent dedup
- [x] `getEpisode(graph, id)` — returns episode or null
- [x] `getEvidenceForEntity` / `getEvidenceForEdge` — full evidence chain with episode details
- [x] `EvidenceRequiredError` thrown when evidence empty/missing
- [x] ULIDs for all IDs
- [x] `created_at`/`updated_at` auto-set as ISO8601 UTC
- [x] Episode idempotency handled

## Test plan

- [x] `bun test` — 46 tests pass (18 format + 28 graph — wait, the agent said 46 total)
- [x] `bun run build` — succeeds
- [x] `bun run lint` — clean

> **Note:** This PR is based on `feat/engram-format-schema-issue-1` (PR #15). It should be merged after #15.

Closes #…
```

**github_pr** `https://github.com/rnwolfe/engram/pull/226` (2026-04-20 by rnwolfe) — confidence 0.833:
```
…ngram sync` (#203), harness
    plugin (#123), retrieval epic (#111), and the **workflow benchmark
    (#116)** flagged in the last `/product` health check as Gate G1.
- **Phase 3** gating called out: depends on Phase 2 adapter coverage and
  Gate G1 (#116) validation.
- **Stats** updated (17 specs, 8 ADRs through in-flight PR #225, schema v0.2,
  adapter contract v2).

## Not changed

`VISION.md` is unchanged in this PR. Phase 2 language update (reflecting
ADR-008's in-repo-plugin adapter model) is tracked as #224 and will land
separately so its review scope stays narrow.

## Test plan

- [x] STATUS.md renders cleanly
- [ ] Reviewer confirms the \"In flight\" section accurately reflects open issues
- [ ] Reviewer confirms nothing shipped in v0.1 or v0.2 is missing from the Done
      checklists

Docs-only. No code changes.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

**github_pr** `https://github.com/rnwolfe/engram/pull/94` (2026-04-13 by rnwolfe) — confidence 0.813:
```
PR #94: docs: replace Money Command + Visualize with Quick Start section
URL: https://github.com/rnwolfe/engram/pull/94
State: closed
Author: rnwolfe
Created: 2026-04-13T15:19:58Z

## Summary

Replaces the dated "The Money Command" and separate "Visualize your knowledge graph" sections with a single **Quick Start** that walks the full four-step workflow in one annotated code block:

1. `engram init --from-git .` — build graph from git
2. `engram search` — query it
3. `engram visualize` — see it
4. `engram reconcile` + `engram export wiki` — AI projections (optional)

The entity/edge bullet list from the old section is retained beneath the block for readers who want the structural detail.

## Test plan
- [ ] README renders correctly on GitHub

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

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

**git_commit** `6e726d5ea531027de61c193aad7c7645e5d94a2c` (2026-04-18 by rn.wolfe@gmail.com):
```
commit 6e726d5ea531027de61c193aad7c7645e5d94a2c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-18T02:50:23.000Z

docs(internal): add experiments, specs, and planning docs

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

Files:
docs/internal/epic-111-execution.md
docs/internal/experiments/g1-fastify/grades.md
docs/internal/experiments/g1-fastify/results.md
docs/internal/experiment…
```

**source** `docs/internal/harness-pivot-plan.md@8aafc83e65c77e2693c5d728` (2026-06-29):
```
# Harness Pivot Plan

**Status:** partially executed — Phase 1 experiments ran; ADRs 004 and 005 captured the outcomes; Phase 2+ sequencing superseded (see update below).
**Date:** 2026-04-15 (original); 2026-04-17 (status refresh).
**Scope:** repositions engram from "CLI + MCP + benchmark suite" to "CLI + harness plugins," with narrative projections added as a new kind.

**Status update (2026-04-17).**
- Phase 1 Gate G1 (narrative-projection viability experiment) ran as `experiments/g1-narrativ…
```

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

**git_commit** `17d30496c4156bf7b6332fc86accb0c8c567d8cd` (2026-04-26 by noreply@anthropic.com):
```
commit 17d30496c4156bf7b6332fc86accb0c8c567d8cd
Author: Claude <noreply@anthropic.com>
Date: 2026-04-26T13:09:53.000Z

docs: address near-term-plan review feedback

- Rename W3 harness packages from packages/engram-plugin-* to
  packages/harnesses/<name>/ to avoid collision with packages/plugins/
  (ADR-008's home for first-party ingest adapters). Add a callout
  explaining why harness adapters li…
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

**git_commit** `59769a9a4f3646adf6426ade15b8214942384eda` (2026-04-26 by noreply@anthropic.com):
```
commit 59769a9a4f3646adf6426ade15b8214942384eda
Author: Claude <noreply@anthropic.com>
Date: 2026-04-26T04:00:36.000Z

docs: add near-term plan focused on wow-moment validation

Adds docs/internal/near-term-plan.md capturing the next execution cycle:
a single falsifiable goal (one frozen prompt that fails today and one-shots
with engram-injected context) backed by five workstreams — portable YAML
…
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

**github_pr** `https://github.com/rnwolfe/engram/pull/278` (2026-04-26 by rnwolfe):
```
PR #278: docs: add near-term plan focused on wow-moment validation
URL: https://github.com/rnwolfe/engram/pull/278
State: closed
Author: rnwolfe
Created: 2026-04-26T04:01:03Z

## Summary

Adds `docs/internal/near-term-plan.md` — the next execution cycle, sized to deliver one falsifiable demonstration that engram earns its keep. Sits next to `harness-pivot-plan.md` and picks up where ADR-004 deferred D3.

The plan trades breadth for falsifiability: a single frozen "wow-moment" prompt that fails t…
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

