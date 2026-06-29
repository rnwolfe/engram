## Context pack
> Query: I want coding agents to pull engram's context over MCP so it shows up in tools like Cursor. Has this been considered here, and is exposing engram over MCP the right move, or was it deliberately rejected?  Budget: 8000 tokens | Used: ~3237 | 69 results

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `.github/pull_request_template.md` **[module]** — score 1.000 | evidence: 1 episode(s)
- `1d41114793be31ce94807f15914fb2f51251876e` **[commit]** — score 0.711 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts` **[module]** — score 0.480 | evidence: 2 episode(s)
- `packages/harnesses/core/src/context-assembly.ts` **[module]** — score 0.480 | evidence: 2 episode(s)
- `packages/engram-mcp/src/tools/context.ts` **[module]** — score 0.480 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::toFtsQuery` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::estimateTokens` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::excerptEpisode` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::bestQueryWindow` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::excerptDiscussion` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::ContextOpts` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EnrichedEntity` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EnrichedEdge` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EvidenceExcerpt` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::DirectEpisodeHit` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::ProjectionInPack` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::ContextPack` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::renderMarkdown` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EntityFtsRow` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EdgeFtsRow` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EvidenceRow` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::isConfigNoise` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::isLowSignalEntity` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::searchEntitiesFts` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::likePatterns` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::searchEntitiesLike` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::searchEntitiesViaEpisodeFts` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::EpisodeSearchRow` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::searchEpisodesDirectly` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/context.ts::searchEdgesFts` **[symbol]** — score 0.456 | evidence: 1 episode(s)
- `packages/harnesses/core/src/events.ts::PromptContext` **[symbol]** — score 0.061 | evidence: 1 episode(s)
- `packages/harnesses/core/src/events.ts::SessionContext` **[symbol]** — score 0.061 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/context-sparse.test.ts` **[module]** — score 0.061 | evidence: 2 episode(s)
- `packages/engram-cli/test/commands/context-max-flags.test.ts` **[module]** — score 0.061 | evidence: 2 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- .github/pull_request_template.md was authored/modified by rn.wolfe@gmail.com in commit 20d879c2 **[observed]** — score 1.000 | valid: 2026-04-07T03:27:10.000Z → present
- .github/pull_request_template.md is likely owned by rn.wolfe@gmail.com (recency-weighted score: 0.526) **[inferred]** — score 0.947
- packages/engram-cli/src/commands/context.ts defines toFtsQuery **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines estimateTokens **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines excerptEpisode **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines bestQueryWindow **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines excerptDiscussion **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines ContextOpts **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EnrichedEntity **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EnrichedEdge **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EvidenceExcerpt **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines DirectEpisodeHit **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines ProjectionInPack **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines ContextPack **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines renderMarkdown **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EntityFtsRow **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EdgeFtsRow **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines EvidenceRow **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines isConfigNoise **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts defines isLowSignalEntity **[observed]** — score 0.600
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/ingest.ts co-change frequently (5 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/search.ts co-change frequently (4 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/show.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/stats.ts co-change frequently (4 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/verify.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/decay.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts and packages/engram-cli/src/commands/ownership.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-mcp/src/tools/context.ts and packages/engram-mcp/src/tools/search.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-mcp/src/tools/context.ts and packages/engram-mcp/test/mcp.test.ts co-change frequently (3 shared commits) **[inferred]** — score 0.800
- packages/engram-cli/src/commands/context.ts is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 5.621) **[inferred]** — score 0.700
- packages/harnesses/core/src/context-assembly.ts is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 1.000) **[inferred]** — score 0.700
- packages/engram-cli/test/commands/context-max-flags.test.ts is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.573) **[inferred]** — score 0.700
- packages/engram-cli/test/commands/context-sparse.test.ts is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.573) **[inferred]** — score 0.700
- packages/engram-mcp/src/tools/context.ts is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 1.626) **[inferred]** — score 0.700
- packages/engram-cli/src/commands/context.ts defines STOP_WORDS **[observed]** — score 0.500

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**document** `/home/rnwolfe/dev/engram/packages/engram-core/test/fixtures/eval/engram-mcp-deci` (2026-06-29) — confidence 0.975:
```
…wise,
   cognee, CodeScene, Sourcegraph, AtlasMemory, the live `codebase-memory-mcp`
   / `code-meridian` wave — ships an MCP server as its primary reach mechanism.
2. **The official MCP `memory` server is engram's flat foil.** It is a
   local single-file knowledge graph (entities / relations / observations in
   one `memory.jsonl`) with **no temporal, provenance, or evidence metadata**.
   It proves the market expects local single-file agent memory *and* leaves
   the temporal + evidence layer — engram's exact differentiator — wide open
   in a registry with built-in discovery.
3. **ADR-004 conflated two uses of MCP.** "MCP" was rejected wholesale as
   "model-callable retrieval that inverts engine-decides-model-executes." But
   exposing engram as a *single* context endpoint is a different thing from
   exposing graph-traversal primitives as many tools. The first preserves the
   thesis; only the second violates it.

**Decision**: Reverse the *blanket* MCP prohibition in ADR-004's "explicit nos"
and the harness-pivot-plan out-of-scope list. Split MCP into two uses with
opposite rulings:

- **MCP-as-retrieval (many graph-traversal tools the model drives)** — still
  rejected, unchanged from ADR-004. The model must not make per-call retrieval
  decisions over engram's graph primitives. This was the architecture of the
  deleted `engram-mcp` (`mcp-graph-traversal-tools.md`); it…
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

**git_commit** `1d41114793be31ce94807f15914fb2f51251876e` (2026-04-07 by rnwolfe@users.noreply.github.com):
```
commit 1d41114793be31ce94807f15914fb2f51251876e
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-07T10:23:42.000Z

fix: add pull-requests:read permission to commitlint CI job (#33)


Files:
.github/workflows/ci.yml
docs/internal/STATUS.md
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

**source** `packages/engram-cli/src/commands/context.ts@2569768c7d7902c4` (2026-06-29):
```
/**
 * context.ts — `engram context` command.
 *
 * Assembles a token-budgeted context pack from the knowledge graph for a
 * given query and writes it to stdout. Intended for injection into agent
 * prompts via harness plugins or manual use.
 *
 * Output includes: ranked entities (with type), edges (with kind), and
 * evidence excerpts from backing episodes. A budget accounting line at the
 * top lets the consumer know how much was truncated.
 */

import * as path from "node:path";
import type …
```

**source** `packages/harnesses/core/src/context-assembly.ts@8c44ef029123` (2026-06-29):
```
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDeadlineMs } from "./deadline.js";

function findEngramDb(cwd: string): string | null {
  const candidate = path.join(cwd, ".engram");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function findEngramCli(): string {
  return "engram";
}

export async function assembleContextPack(
  cwd: string,
  prompt: string,
): Promise<string | null> {
  const db …
```

**git_commit** `67d8468c6a617209fba792ab23601a46ed20720e` (2026-04-17 by rnwolfe@users.noreply.github.com):
```
commit 67d8468c6a617209fba792ab23601a46ed20720e
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-17T17:36:28.000Z

chore: decommission engram-mcp (ADR-005) (#136)

* chore: decommission engram-mcp and remove serve command

Deletes packages/engram-mcp/ per ADR-005, removes the engram serve
placeholder command, and cleans up all MCP references from CLAUDE.md,
README.md, and the CLI comm…
```

**source** `packages/harnesses/core/src/events.ts@8ebe0cf03f3ad0741efa99` (2026-06-29):
```
export interface SessionContext {
  cwd: string;
  sessionId?: string;
}

export interface PromptContext extends SessionContext {
  prompt: string;
}

export type HookResult = { ok: true } | { ok: false; error: string };
```

**git_commit** `792ea8fe468bd0a3da279ccc42d006f7909d456c` (2026-04-18 by rnwolfe@users.noreply.github.com):
```
commit 792ea8fe468bd0a3da279ccc42d006f7909d456c
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-18T04:14:49.000Z

fix(cli): gate sparse-results note on --verbose or stderr TTY (#174)

The diagnostic note emitted when fewer than 3 entities are found was
unconditionally written to stderr, causing constant noise in CI pipelines
that redirect stderr. Gate it behind opts.verbose || proces…
```

**source** `packages/engram-cli/test/commands/context-sparse.test.ts@2e6` (2026-06-29):
```
/**
 * context-sparse.test.ts — Tests that the sparse-results diagnostic note on
 * stderr is gated on --verbose or process.stderr.isTTY.
 *
 * Issue #155: the note was unconditionally written, causing noise in CI.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { createGraph } from "engram-core";
import { registerContext } from "../../src/commands/co…
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

**source** `packages/engram-cli/test/commands/context-max-flags.test.ts@` (2026-06-29):
```
/**
 * context-max-flags.test.ts — Tests for --max-entities and --max-edges
 * hard-cap flags on `engram context`.
 *
 * Issue #162: flags apply as secondary filters after the token budget,
 * limiting candidate sets before the budget loop.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { addEdge, addEntity, addEpisode, createGraph } from "engram-cor…
```

