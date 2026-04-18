# G2 Pack + Companion — Raw Results

> **Conditions:** B = new pack (Phase 1 improvements), C = new pack + companion prompt.
> **Baseline:** v3 Condition A (bare Gemini, cwd=Maestro) — see g1-maestro-v3/grades.md.
> **Pack version:** Phase 1 — vector episode track, confidence scoring, structural edge
>   augmentation, hypothesis framing ("Possibly relevant discussions", "Structural signals").
> **Key questions to watch:** Q2 (should still surface PR #543), Q3 and Q5 (regressed
>   in v3 — check if new framing reduces hallucination-from-retrieval).

## Pack metrics

| Q | Lines | Sections | Discussions | Confidence scores |
|---|-------|----------|-------------|-------------------|
| Q1 | 700 | discussions, structural | 6 | 1.00, 0.94, 0.85, 0.80, 0.80, 0.76 |
| Q2 | 649 | discussions | 6 | 1.00, 0.74, 0.73, 0.68, 0.67, 0.63 |
| Q3 | 575 | discussions, structural | 6 | 1.00, 0.94, 0.86, 0.77, 0.75, 0.68 |
| Q4 | 583 | discussions, structural | 6 | 1.00, 0.97, 0.94, 0.88, 0.84, 0.79 |
| Q5 | 466 | discussions, structural | 6 | 1.00, 0.87, 0.81, 0.79, 0.78, 0.78 |
| Q6 | 663 | discussions | 6 | 1.00, 0.93, 0.92, 0.89, 0.89, 0.85 |
| Q7 | 542 | discussions, structural | 6 | 1.00, 0.92, 0.87, 0.85, 0.83, 0.79 |
| Q8 | 526 | discussions, structural | 6 | 1.00, 0.98, 0.94, 0.92, 0.91, 0.90 |
| Q9 | 653 | discussions | 6 | 1.00, 0.98, 0.96, 0.81, 0.81, 0.65 |

## Token cost (estimated, chars÷4)

| Q | B prompt | B answer | B total | C prompt | C answer | C total | C overhead vs B |
|---|----------|----------|---------|----------|----------|---------|-----------------|
| Q1 | 6768 | 363 | 7131 | 7619 | 385 | 8004 | +873 (+12%) |
| Q2 | 6598 | 365 | 6963 | 7449 | 312 | 7761 | +798 (+11%) |
| Q3 | 6247 | 403 | 6650 | 7097 | 352 | 7449 | +799 (+12%) |
| Q4 | 6315 | 422 | 6737 | 7165 | 773 | 7938 | +1201 (+18%) |
| Q5 | 5145 | 457 | 5602 | 5996 | 355 | 6351 | +749 (+13%) |
| Q6 | 6517 | 1887 | 8404 | 7368 | 377 | 7745 | +-659 (+-8%) |
| Q7 | 6445 | 472 | 6917 | 7296 | 397 | 7693 | +776 (+11%) |
| Q8 | 6151 | 458 | 6609 | 7002 | 573 | 7575 | +966 (+15%) |
| Q9 | 6679 | 359 | 7038 | 7530 | 386 | 7916 | +878 (+12%) |
| **Total** | | | **62051** | | | **68432** | **+6381 (+10%)** |

---

## Q1 [small] — Why does the output buffer store streaming chunks in an array rather than concatenating them into a string?

**Pack:** 700 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.94, 0.85, 0.80, 0.80, 0.76]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does the output buffer store streaming chunks in an array rather than concatenating them into a string?  Budget: 6000 tokens | Used: ~5901 | 44 results (17 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/main/group-chat/output-buffer.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `src/main/group-chat/output-buffer.ts::groupChatOutputBuffers` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/output-buffer.ts::appendToGroupChatBuffer` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/output-buffer.ts::getGroupChatBufferedOutput` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/output-buffer.ts::clearGroupChatBuffer` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/output-buffer.ts::hasGroupChatBuffer` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/output-buffer.ts::isGroupChatBufferTruncated` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/output-buffer.test.ts` **[module]** — score 0.897 | evidence: 2 episode(s)
- `src/main/index.ts::store` **[symbol]** — score 0.807 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/291` **[issue]** — score 0.554 | evidence: 1 episode(s)
- `src/cli/output` **[module]** — score 0.518 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/660` **[issue]** — score 0.488 | evidence: 1 episode(s)
- `src/__tests__/cli/output` **[module]** — score 0.481 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts` **[module]** — score 0.450 | evidence: 2 episode(s)
- `src/cli/output/jsonl.ts` **[module]** — score 0.450 | evidence: 2 episode(s)
- `src/cli/output/formatter.ts::colors` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::supportsColor` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::c` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::bold` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::dim` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::truncate` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::GroupDisplay` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::formatGroups` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::AgentDisplay` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::formatAgents` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::PlaybookDocDisplay` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::PlaybookDisplay` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::PlaybooksByAgent` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::formatPlaybooks` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::PlaybookDetailDisplay` **[symbol]** — score 0.423 | evidence: 1 episode(s)
- `src/main/stores` **[module]** — score 0.047 | evidence: 1 episode(s)
- `src/renderer/stores` **[module]** — score 0.047 | evidence: 1 episode(s)
- `src/main/stores/types.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/main/stores/utils.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/main/stores/index.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/__tests__/main/stores` **[module]** — score 0.047 | evidence: 1 episode(s)
- `src/main/stores/getters.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/main/stores/defaults.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/main/stores/instances.ts` **[module]** — score 0.047 | evidence: 2 episode(s)
- `src/__tests__/renderer/stores` **[module]** — score 0.047 | evidence: 1 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/__tests__/main/group-chat/output-buffer.test.ts imports src/main/group-chat/output-buffer.ts **[observed]** — score 1.000
- src/main/group-chat/output-buffer.ts defines groupChatOutputBuffers **[observed]** — score 0.903
- src/main/group-chat/output-buffer.ts defines appendToGroupChatBuffer **[observed]** — score 0.903
- src/main/group-chat/output-buffer.ts defines getGroupChatBufferedOutput **[observed]** — score 0.903

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/784` (2026-04-10 by chr1syy) — confidence 1.000:
```
PR #784: fix: extract clean output from Cue scheduled tasks
URL: https://github.com/RunMaestro/Maestro/pull/784
State: closed
Author: chr1syy
Created: 2026-04-10T06:46:23Z

## Summary
- Cue scheduled tasks were showing raw JSONL instead of formatted agent output
- Root cause: Claude Code emits `"result": ""` (empty string) when the agent's last action is a tool use, and `extractCleanStdout()` treated empty string as falsy, falling back to raw output
- Now falls back to assistant message text when the result event is empty, with deduplication of streaming chunks by message ID

## Test plan
- [x] Existing 46 cue-executor tests still pass
- [x] New test: empty result with assistant text fallback
- [x] New test: streaming chunk deduplication by message ID
- [x] Manual: trigger a Cue scheduled task and verify clean output in Activity Log

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **Bug Fixes**
  * Improved stdout extraction for streaming responses: explicit parser result content is prioritized; when empty, the system falls back to the latest assistant text.
  * D…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/679` (2026-03-28 by chr1syy) — confidence 0.944:
```
PR #679: fix(cli): capture response from claude-code in maestro-cli send
URL: https://github.com/RunMaestro/Maestro/pull/679
State: closed
Author: chr1syy
Created: 2026-03-28T11:12:39Z

## Summary
- `maestro-cli send` returned `response: null` for claude-code agents because Claude Code emits the response text in `assistant` messages, not in the `result` message's `result` field (which is empty string)
- Now accumulates text from `assistant` messages as a fallback when `result` field is empty
- Also flushes the JSONL buffer on process close to handle output lacking a trailing newline (both `spawnClaudeAgent` and `spawnJsonLineAgent`)

## Test plan
- [x] Unit tests pass (80/80, including 5 new tests for assistant text fallback, string content, result preference, and buffer flush)
- [x] Type-check passes
- [x] Manual e2e test: `maestro-cli send <agent-id> "Respond with exactly: CLI capture test OK"` now returns `success: true` with correct response text

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **Bug Fixes**
  * Improved CLI stream parsing to flush and parse t…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/226` (2026-01-22 by reachrazamair) — confidence 0.848:
```
PR #226: refactor: extract modules from main/index.ts
URL: https://github.com/RunMaestro/Maestro/pull/226
State: closed
Author: reachrazamair
Created: 2026-01-22T20:54:37Z

## Summary
- Extract reusable modules from `main/index.ts` to improve maintainability
- Add comprehensive test coverage for extracted code (133 new tests)
- Consolidate constants to eliminate redundant directory structure

## Changes

### 1: Pure Function Extractions
| File | Description |
|------|-------------|
| `constants.ts` | Regex patterns for group chat session IDs + `debugLog` utility |
| `group-chat/session-parser.ts` | Parse participant session IDs (handles hyphenated names) |
| `group-chat/output-parser.ts` | Extract text from agent JSONL output streams |
| `group-chat/output-buffer.ts` | Buffer management for streaming output |

### 2: Dependency Injection Factories
| File | Description |
|------|-------------|
| `utils/safe-send.ts` | Factory for safe IPC messaging (handles destroyed windows) |
| `web-server/web-server-factory.ts` | Factory for creating configured web servers |

### Test Coverage
- 6 new test files with 133 tests
- All 365 test suites pass (15,964 tests total)…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/410` (2026-02-18 by openasocket) — confidence 0.804:
```
PR #410: fix: auto-scroll follows thinking streams + Codex tool display
URL: https://github.com/RunMaestro/Maestro/pull/410
State: closed
Author: openasocket
Created: 2026-02-18T20:33:56Z

## Summary

- Replace `filteredLogs.length` auto-scroll dependency with `MutationObserver` to detect in-place content changes (thinking stream text growth, tool status updates)
- Add programmatic scroll guard to prevent the scroll handler from falsely pausing auto-scroll during effect-driven `scrollTo()` calls
- Fix Codex tool execution display: carry tool name from `tool_call` to `tool_result`, handle array-typed `command` args, add Codex-specific arg extraction, truncate large outputs

## Motivation

### Auto-scroll stops following thinking/tool streams (Fixes #402, supersedes #406)

The auto-scroll feature ([PR #390](https://github.com/RunMaestro/Maestro/pull/390)) depends on `filteredLogs.length` to trigger scroll-to-bottom. However, thinking chunks update the **last log entry's text in-place** without changing the array length:

```typescript
// useAgentListeners.ts — thinking chunk handler
logs: [...tab.logs.slice(0, -1), { ...lastLog, text: combinedText }]
//                               …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/499` (2026-03-02 by chr1syy) — confidence 0.803:
```
PR #499: fix: show tool call details and fix text routing for OpenCode thinking
URL: https://github.com/RunMaestro/Maestro/pull/499
State: closed
Author: chr1syy
Created: 2026-03-02T21:16:21Z

This pull request updates the OpenCode output parsing logic and its associated tests to align with recent changes in the OpenCode protocol. The main changes ensure that text messages are treated as final results (not streamed), and that `step_finish` events are now used only for usage statistics, not for emitting result content. This improves the accuracy of parsing and downstream handling of OpenCode agent responses.

**Test and parser logic updates:**

* Text messages are now parsed and emitted as `result` events (final response, not streaming), with the `isPartial` property removed. (`src/__tests__/main/parsers/opencode-output-parser.test.ts`, `src/main/parsers/opencode-output-parser.ts`) [[1]](diffhunk://#diff-c7d0f040af8a3d76221d643a25ee8f8a302e769d95d76413a3fa49dbf2b5e07aL32-R32) [[2]](diffhunk://#diff-c7d0f040af8a3d76221d643a25ee8f8a302e769d95d76413a3fa49dbf2b5e07aL43-R46) [[3]](diffhunk://#diff-926b13f710645a3d9ce8c79875d3ae6e5da59b0c56fe460fb2666a9b1e5ef17dL157-L163)
* `step_fin…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/435` (2026-02-21 by openasocket) — confidence 0.761:
```
PR #435: Add Gemini CLI as first-class agent
URL: https://github.com/RunMaestro/Maestro/pull/435
State: closed
Author: openasocket
Created: 2026-02-21T18:58:58Z

## Summary

- Adds Google Gemini CLI as a fully integrated agent in Maestro across all surfaces: type system, agent definitions, capabilities, output parser, session storage, error handling, group chat, CLI tooling, and UI
- Achieves feature parity with Claude Code and Codex on 18/20 integration dimensions (image input and model discovery are Gemini CLI limitations, not Maestro gaps)
- Includes 2,200+ lines of tests across 16 test files

## Changes by area

### Core agent plumbing (types, definitions, capabilities)
- Added `gemini-cli` to `ToolType` union, `AGENT_DEFINITIONS`, and `AGENT_CAPABILITIES`
- Configured all agent flags: `batchModeArgs` (`-y`), `jsonOutputArgs` (`--output-format stream-json`), `resumeArgs` (`--resume`), `modelArgs` (`-m`), `yoloModeArgs`, `workingDirArgs` (`--include-directories`)
- Added `gemini-cli` to every `Record<ToolType>` map, hardcoded array, and `VALID_MODERATOR_AGENT_IDS`

### Output parser (`gemini-output-parser.ts`)
- Full NDJSON stream-json parser handling 6 event types: `init`, `mes…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**git_commit** `0916960f25388805f99f85213aa1e0375e30aa3b` (2026-01-22 by reachrazarauf@gmail.com):
```
commit 0916960f25388805f99f85213aa1e0375e30aa3b
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-22T21:26:53.000Z

fix: address code review feedback for Phase 1 & 2 refactor

- Add MAX_GROUP_CHAT_BUFFER_SIZE (10MB) to prevent memory exhaustion
- Add buffer truncation with marker when exceeding limit
- Add isGroupChatBufferTruncated() to check truncation status
- Add debugLogLazy() for laz…
```

**source** `src/main/group-chat/output-buffer.ts@de21734157a80b09a8c2b3a` (2026-04-15):
```
/**
 * Output buffer management for group chat.
 * Buffers streaming output from group chat processes and releases on process exit.
 */

import { MAX_GROUP_CHAT_BUFFER_SIZE } from '../constants';

// Buffer for group chat output (keyed by sessionId)
// We buffer output and only route it on process exit to avoid duplicate messages from streaming chunks
// Uses array of chunks for O(1) append performance instead of O(n) string concatenation
// Tracks totalLength incrementally to avoid O(n) reduce …
```

**source** `src/__tests__/main/group-chat/output-buffer.test.ts@35fbb562` (2026-04-15):
```
/**
 * @file output-buffer.test.ts
 * @description Unit tests for group chat output buffer management.
 */

import { describe, it, expect } from 'vitest';
import {
	appendToGroupChatBuffer,
	getGroupChatBufferedOutput,
	clearGroupChatBuffer,
	hasGroupChatBuffer,
	isGroupChatBufferTruncated,
} from '../../../main/group-chat/output-buffer';
import { MAX_GROUP_CHAT_BUFFER_SIZE } from '../../../main/constants';

describe('group-chat/output-buffer', () => {
	// Use unique session IDs for each test to…
```

**source** `src/main/index.ts@2548fe389cae05340b4ede150ba1d17857c7198917` (2026-04-15):
```
import { app, BrowserWindow, powerMonitor } from 'electron';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
// Sentry is imported dynamically below to avoid module-load-time access to electron.app
// which causes "Cannot read properties of undefined (reading 'getAppPath')" errors
import { ProcessManager } from './process-manager';
import { WebServer } from './web-server';
import { AgentDetector } from './agents';
import { logger } from './utils/logger';
import { tunne…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/291` (2026-02-04 by danieliser):
```
Issue #291: Streaming responses for Claude/Codex
URL: https://github.com/RunMaestro/Maestro/issues/291
State: closed
Author: danieliser
Created: 2026-02-04T08:21:05Z

The one thing that has me really wanting to go back to terminal or VS Code extension is the streaming of collapsible thinking blocks, tool calls (collapsed responses), and the small 1 line responses that often come between them showing what its intending to do.

I saw it may have been added for `OpenCode`.

Is it a simple fix, if s…
```

**source** `src/cli/output/formatter.ts@9b60207d21bfe2890a111abfd2f822b1` (2026-04-15):
```
// Human-readable output formatter for CLI
// Provides beautiful, colored terminal output

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',

	// Foreground colors
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	gray: '\x1b[90m',

	// Bright foreground colors
	brightRed: '\x1b[91m',
	brightGreen: '\x1b[92m',
	brightYellow: '\x1b[93m',
	brightBlu…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/660` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #660: [Mobile App] iOS App Store & Google Play Preparation
URL: https://github.com/RunMaestro/Maestro/issues/660
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:52:27Z

## Overview

Prepare the Maestro mobile app for release on iOS App Store and Google Play Store.

## App Metadata

| Field | Value |
|-------|-------|
| App Name | "Maestro Remote" or "Maestro Mobile" |
| Category | Developer Tools / Productivity |
| Age Rating | 4+ |

## iOS App Store

### App Store Connect
- [ ]…
```

**source** `src/__tests__/cli/output/jsonl.test.ts@3789d0ea1b2a9f7acab50` (2026-04-15):
```
/**
 * @file jsonl.test.ts
 * @description Tests for CLI JSONL output functions
 *
 * Tests all JSONL event emitters used for machine-parseable CLI output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	emitJsonl,
	emitError,
	emitStart,
	emitDocumentStart,
	emitTaskStart,
	emitTaskComplete,
	emitDocumentComplete,
	emitLoopComplete,
	emitComplete,
	emitGroup,
	emitAgent,
	emitPlaybook,
} from '../../../cli/output/jsonl';
import type { UsageStats } from '…
```

**git_commit** `85711f577b22f39d82ee65cbe15b9884599e2831` (2026-02-08 by pedram.amini@gmail.com):
```
commit 85711f577b22f39d82ee65cbe15b9884599e2831
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-08T10:10:35.000Z

feat: add query command, list sessions with pagination, and refactor agent-spawner

Add `query` command for sending messages to agents with JSON response,
`list sessions` command with --limit/--skip pagination and --search
filtering, and refactor agent-spawner to use shared…
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**source** `src/cli/output/jsonl.ts@d5edad5dc5ea972da75dce619f06546176f0` (2026-04-15):
```
// JSONL output helper for CLI
// Outputs machine-parseable JSON lines to stdout

import type { UsageStats } from '../../shared/types';

// Base event interface - all events have a type and timestamp
export interface JsonlEvent {
	type: string;
	timestamp: number;
	[key: string]: unknown;
}

// Event types for playbook execution
export interface StartEvent extends JsonlEvent {
	type: 'start';
	playbook: {
		id: string;
		name: string;
	};
	session: {
		id: string;
		name: string;
		cwd: string;
…
```

**source** `src/main/stores/instances.ts@05a81405bc7ee39bd5e5e51416873fe` (2026-04-15):
```
/**
 * Store Instances
 *
 * Manages store instance lifecycle:
 * - Store instance variables (private)
 * - Initialization function
 * - Path caching
 *
 * The actual getter functions are in getters.ts to keep this file focused
 * on initialization logic only.
 */

import { app } from 'electron';
import Store from 'electron-store';

import type {
	BootstrapSettings,
	MaestroSettings,
	SessionsData,
	GroupsData,
	AgentConfigsData,
	WindowState,
	ClaudeSessionOriginsData,
	AgentSessionOriginsData,…
```

**source** `src/renderer/stores/sessionStore.ts@85f6e5a036e224c1015a051d` (2026-04-15):
```
/**
 * sessionStore - Zustand store for centralized session and group state management
 *
 * All session, group, active session, bookmark, worktree tracking, and
 * initialization states live here. Components subscribe to individual slices
 * via selectors to avoid unnecessary re-renders.
 *
 * Key advantages:
 * - Selector-based subscriptions: components only re-render when their slice changes
 * - No refs needed: store.getState() gives current state anywhere
 * - Works outside React: services …
```

**git_commit** `ccc9b1d988d68d7c0683b764b9ff72919bc5531f` (2026-02-16 by reachrazarauf@gmail.com):
```
commit ccc9b1d988d68d7c0683b764b9ff72919bc5531f
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-02-16T22:26:01.000Z

refactor: extract useTabHandlers hook from App.tsx (~1,310 lines, Phase 2A)

Move all tab management callbacks and derived state into a dedicated hook
that reads directly from Zustand stores. App.tsx reduced from ~12,863 to
~11,553 lines. Also consolidate duplicate MaestroSet…
```

**source** `src/main/stores/types.ts@4faa58bae0072c45ac7aa14ac6664cb2c6e` (2026-04-15):
```
/**
 * Store type definitions
 *
 * Centralized type definitions for all electron-store instances.
 * These types are used across the main process for type-safe store access.
 */

import type { SshRemoteConfig, Group } from '../../shared/types';

// ============================================================================
// Stored Session Type (minimal interface for main process storage)
// ============================================================================

/**
 * Minimal session i…
```

**git_commit** `30a78b65b5e3f5f15d6b8f7db7d7caa9d9b081ce` (2026-01-30 by pedram.amini@gmail.com):
```
commit 30a78b65b5e3f5f15d6b8f7db7d7caa9d9b081ce
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-30T00:04:40.000Z

fix(wsl): auto-disable GPU acceleration in WSL environments

Add automatic detection of WSL environments and default to disabling
GPU hardware acceleration to prevent GPU process crashes.

WSL2's GPU passthrough (WSLg) often lacks required EGL extensions that
Chromium/Elect…
```

**source** `src/main/stores/utils.ts@732361569eb66746f88d3668d3371b114b4` (2026-04-15):
```
/**
 * Store Utilities
 *
 * Helper functions for store operations including:
 * - Sync path resolution
 * - Early settings access (before app.ready)
 * - SSH remote configuration lookup
 */

import path from 'path';

import Store from 'electron-store';
import fsSync from 'fs';

import type { BootstrapSettings } from './types';
import type { SshRemoteConfig } from '../../shared/types';

// Re-export getDefaultShell from defaults for backward compatibility
export { getDefaultShell } from './defau…
```

**git_commit** `edde5d7a8f66ed21fdcb2b7d8f04f20e2ab4816e` (2026-01-20 by reachrazarauf@gmail.com):
```
commit edde5d7a8f66ed21fdcb2b7d8f04f20e2ab4816e
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-20T18:47:34.000Z

refactor: extract stores module from main/index.ts with comprehensive tests

Split monolithic store code from index.ts into dedicated src/main/stores/ module
following single responsibility principle:

- types.ts (112 lines) - Centralized type definitions
- defaults.ts (86 li…
```

**source** `src/main/stores/index.ts@e0302565839f8a5c6c597c75d45890dfb97` (2026-04-15):
```
/**
 * Centralized Store Management
 *
 * This module provides the public API for all store operations:
 * - Type definitions (from ./types)
 * - Store initialization (from ./instances)
 * - Store getters (from ./getters)
 * - Utility functions (from ./utils)
 * - Default values (from ./defaults)
 *
 * IMPORTANT: initializeStores() MUST be called before accessing any store.
 * The app.setPath('userData', ...) calls MUST happen before initialization.
 *
 * Directory structure:
 * ├── index.ts    …
```

**source** `src/__tests__/main/stores/types.test.ts@11a8ba967b214c122361` (2026-04-15):
```
import { describe, it, expect } from 'vitest';

import type {
	BootstrapSettings,
	MaestroSettings,
	SessionsData,
	GroupsData,
	AgentConfigsData,
	WindowState,
	ClaudeSessionOrigin,
	ClaudeSessionOriginInfo,
	ClaudeSessionOriginsData,
	AgentSessionOriginsData,
	StoredSession,
} from '../../../main/stores/types';

/**
 * Type-level tests to ensure type definitions are correct.
 * These tests verify that the types can be used as expected.
 */
describe('stores/types', () => {
	describe('BootstrapS…
```

**source** `src/main/stores/getters.ts@9a3c346388be194607e4af5070a92fc67` (2026-04-15):
```
/**
 * Store Getters
 *
 * Public getter functions for accessing store instances.
 * All getters throw if stores haven't been initialized.
 */

import type Store from 'electron-store';

import type {
	BootstrapSettings,
	MaestroSettings,
	SessionsData,
	GroupsData,
	AgentConfigsData,
	WindowState,
	ClaudeSessionOriginsData,
	AgentSessionOriginsData,
} from './types';
import type { SshRemoteConfig } from '../../shared/types';

import { isInitialized, getStoreInstances, getCachedPaths } from './in…
```

**git_commit** `5c0133ab8367b93678cc37645f06656cda7d3834` (2026-02-16 by kian.pasani@gmail.com):
```
commit 5c0133ab8367b93678cc37645f06656cda7d3834
Author: Kian <kian.pasani@gmail.com>
Date: 2026-02-16T05:36:37.000Z

feat: WakaTime integration for IDE activity tracking (#326)

* feat: add WakaTime integration settings UI to General tab

Add WakaTime API key and enable/disable toggle to the Settings modal
General tab with Beta badge. Settings are persisted via electron-store
following existing pa…
```

**source** `src/main/stores/defaults.ts@4c2c2f34f3080cf3fb10d206a88d918e` (2026-04-15):
```
/**
 * Store Default Values
 *
 * Centralized default values for all stores.
 * Separated for easy modification and testing.
 */

import path from 'path';

import type {
	MaestroSettings,
	SessionsData,
	GroupsData,
	AgentConfigsData,
	WindowState,
	ClaudeSessionOriginsData,
	AgentSessionOriginsData,
} from './types';

// ============================================================================
// Utility Functions for Defaults
// ==============================================================…
```

**source** `src/__tests__/renderer/stores/sessionStore.test.ts@6d9a9f128` (2026-04-15):
```
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
	useSessionStore,
	selectActiveSession,
	selectSessionById,
	selectBookmarkedSessions,
	selectSessionsByGroup,
	selectUngroupedSessions,
	selectGroupById,
	selectSessionCount,
	selectIsReady,
	selectIsAnySessionBusy,
	getSessionState,
	getSessionActions,
} from '../../../renderer/stores/sessionStore';
import type { Session, Group, FilePreviewTab } from '../../../rende…
```
```

</details>

**Condition B (pack, no companion):** ~7131 tok (6768 prompt + 363 answer)

Based on the implementation in `src/main/group-chat/output-buffer.ts`, the primary reason for storing streaming chunks in an array is to achieve **O(1) append performance**.

In JavaScript, strings are immutable. If the buffer used string concatenation (e.g., `buffer += chunk`), every update would require the engine to allocate a new string and copy the entire existing content, resulting in **O(n) time complexity**. As the output grows, this would lead to significant performance degradation. By using an array and `Array.prototype.push()`, appending remains a constant-time operation regardless of the buffer's size.

This performance optimization is critical because Maestro enforces a `MAX_GROUP_CHAT_BUFFER_SIZE` of **10MB** (defined in `src/main/constants.ts`). Commit `0916960f` introduced this limit to prevent memory exhaustion, and the array approach ensures that reaching this limit doesn't cause UI lag or processing bottlenecks. 

Additionally, the implementation tracks `totalLength` incrementally as chunks arrive. This allows the system to monitor the 10MB limit and handle truncation without performing an expensive O(n) calculation (like `.reduce()`) on every chunk. The chunks are only joined into a final string (via `.join('')`) when the process exits. This buffering strategy also prevents the UI from displaying duplicate or redundant messages that can occur when processing raw streaming chunks alongside final agent results.

**Condition C (pack + companion):** ~8004 tok (7619 prompt + 385 answer)

I will read the `src/main/group-chat/output-buffer.ts` file to confirm the implementation details and the rationale mentioned in the comments.
Maestro's output buffer in `src/main/group-chat/output-buffer.ts` stores streaming chunks in an array primarily for **performance and memory efficiency** during high-frequency streaming.

### Performance Rationale
As documented in the module's source code, using an array of chunks provides **O(1) append performance**, whereas repeated string concatenation in JavaScript is an **O(n)** operation. In the latter, the engine must frequently reallocate memory and copy the existing string to a new, larger buffer as it grows. By pushing chunks into an array and only calling `.join('')` once—specifically in `getGroupChatBufferedOutput()` when the process exits—Maestro defers the expensive concatenation cost until the final read.

### Implementation Details
*   **Incremental Tracking:** The buffer tracks `totalLength` incrementally during each `appendToGroupChatBuffer` call. This avoids an O(n) `.reduce()` operation to calculate the size on every append.
*   **Memory Protection:** The system enforces a `MAX_GROUP_CHAT_BUFFER_SIZE` (10MB). When this limit is reached, it sets a `truncated` flag and appends a final marker, preventing memory exhaustion from runaway agent output.
*   **Deduplication:** Buffering until process exit (rather than routing immediately) is also used to avoid duplicate messages that can occur when processing raw streaming chunks from underlying agent processes.

---

## Q2 [small] — Why does session recovery clear the agentSessionId rather than retrying with the same ID?

**Pack:** 649 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.74, 0.73, 0.68, 0.67, 0.63])

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does session recovery clear the agentSessionId rather than retrying with the same ID?  Budget: 6000 tokens | Used: ~5918 | 29 results (32 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/main/group-chat/session-recovery.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `src/main/group-chat/session-recovery.ts::detectSessionNotFoundError` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/session-recovery.ts::buildRecoveryContext` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/session-recovery.ts::initiateSessionRecovery` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/main/group-chat/session-recovery.ts::needsSessionRecovery` **[symbol]** — score 0.945 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts` **[module]** — score 0.897 | evidence: 2 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts::mockedGetErrorPatterns` **[symbol]** — score 0.853 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts::mockedMatchErrorPattern` **[symbol]** — score 0.853 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts::mockedReadLog` **[symbol]** — score 0.853 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts::mockedLoadGroupChat` **[symbol]** — score 0.853 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/session-recovery.test.ts::mockedUpdateParticipant` **[symbol]** — score 0.853 | evidence: 1 episode(s)
- `CLAUDE-SESSION.md` **[module]** — score 0.477 | evidence: 2 episode(s)
- `src/renderer/hooks/session` **[module]** — score 0.444 | evidence: 1 episode(s)
- `docs/screenshots/session-tracking.png` **[module]** — score 0.415 | evidence: 1 episode(s)
- `src/renderer/hooks/session/useBatchedSessionUpdates.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/main/stats/session-lifecycle.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/main/agents/session-storage.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/main/agent-session-storage.ts` **[module]** — score 0.389 | evidence: 1 episode(s)
- `src/renderer/hooks/session/index.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useActivityTracker.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useGroupManagement.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useHandsOnTimeTracker.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useNavigationHistory.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useSessionNavigation.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/renderer/hooks/session/useSortedSessions.ts` **[module]** — score 0.389 | evidence: 2 episode(s)
- `src/main/session-web-server.ts` **[module]** — score 0.389 | evidence: 1 episode(s)
- `src/web/hooks/useSessions.ts::Session` **[symbol]** — score 0.389 | evidence: 1 episode(s)
- `src/renderer/types/index.ts::Session` **[symbol]** — score 0.389 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts` **[module]** — score 0.367 | evidence: 2 episode(s)

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/543` (2026-03-09 by openasocket) — confidence 1.000:
```
PR #543: fix: Gemini CLI response handling and session_not_found loop
URL: https://github.com/RunMaestro/Maestro/pull/543
State: closed
Author: openasocket
Created: 2026-03-09T04:17:11Z

## Summary

- **Gemini CLI frozen agent**: Non-partial (delta:false) text events were silently dropped in StdoutHandler — complete message blocks now emit immediately as data
- **Gemini responses labeled STDERR**: Restored Gemini-specific filtering in StderrHandler that suppresses info noise (YOLO mode, extension loading, hooks, etc.) and re-emits actual response content as `data` events instead of `stderr`
- **session_not_found infinite loop**: Clears stale `agentSessionId` at both tab and session level when a `session_not_found` error is received, so the next prompt starts a fresh session instead of retrying `--resume` with a dead ID

## Test plan

- [x] 7 new tests added (2 StdoutHandler, 4 StderrHandler, 1 useAgentListeners)
- [ ] Verify Gemini CLI agent responses appear in the main output (not STDERR label)
- [ ] Verify Gemini CLI agent shows completion after each turn (not frozen)
- [ ] Verify Claude agent recovers after session expiration without manual intervention
- [ ] Run full test suite…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/240` (2026-01-26 by reachrazamair) — confidence 0.744:
```
PR #240: refactor: extracted process listeners from main/index.ts
URL: https://github.com/RunMaestro/Maestro/pull/240
State: closed
Author: reachrazamair
Created: 2026-01-26T13:20:43Z

## Summary

Continuation of `main/index.ts` refactoring - extracts the `setupProcessListeners` function (~650 lines) into dedicated modules with dependency injection pattern.

### New Modules

| Module | Lines | Purpose |
|--------|-------|---------|
| `types.ts` | 144 | `ProcessListenerDependencies` interface and type re-exports |
| `data-listener.ts` | 102 | Process output streaming with group chat buffering |
| `exit-listener.ts` | 414 | Process exit handling with routing, recovery, synthesis |
| `session-id-listener.ts` | 77 | Agent session ID tracking for group chat |
| `usage-listener.ts` | 107 | Token/cost statistics for participants and moderator |
| `error-listener.ts` | 31 | Agent error logging and forwarding |
| `stats-listener.ts` | 50 | Query-complete events for stats database |
| `forwarding-listeners.ts` | 48 | Simple IPC forwarding (slash-commands, thinking-chunk, etc.) |
| `index.ts` | 55 | Setup orchestration and exports |

### Impact

- **main/index.ts**: 1270 →…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/364` (2026-02-13 by pedramamini) — confidence 0.727:
```
PR #364: feat: CSV table rendering + fix: group chat write race & SSH spawn
URL: https://github.com/RunMaestro/Maestro/pull/364
State: closed
Author: pedramamini
Created: 2026-02-13T01:10:32Z

## Summary
- CSV and TSV files now render as themed, sortable tables instead of plain text in file preview
- New `CsvTableRenderer` component with RFC-compliant CSV parsing, numeric column detection, click-to-sort headers, and row truncation
- Edit mode toggle falls through to raw text editor for direct CSV editing
- **Fix:** Serialize concurrent writes to group chat `metadata.json` to prevent file corruption from racing listeners
- **Fix:** Add SSH wrapping for group chat participant spawns (user-mention auto-add + recovery respawn)
- **Fix:** Group chat history panel layout — filter pills, activity graph, and entries now stack vertically instead of being squeezed into a single row

## Group Chat History Panel Layout
The filter pills and activity graph were crammed into a single flex row, causing the graph to be too narrow. Refactored to three distinct vertical sections:
1. **Filter pills** — centered horizontally
2. **Activity graph** — full-width on its own row
3. **History entries** — scr…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/544` (2026-03-09 by openasocket) — confidence 0.683:
```
PR #544: fix: clear stale agentSessionId on session_not_found loop
URL: https://github.com/RunMaestro/Maestro/pull/544
State: closed
Author: openasocket
Created: 2026-03-09T04:30:00Z

## Summary

- When a Claude session expires or is deleted, the stale `agentSessionId` was never cleared — every subsequent prompt tried `--resume` with the dead ID, received `session_not_found`, and looped endlessly
- Now clears `agentSessionId` at both tab and session level on `session_not_found` errors, so the next prompt starts a fresh session automatically

## Test plan

- [x] Unit test added: verifies `agentSessionId` is cleared at both tab and session level on `session_not_found`
- [ ] End-to-end: let a Claude session expire, send a new prompt — should recover without manual intervention

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->

## Summary by CodeRabbit

* **Bug Fixes**
  * Session identifiers are now properly cleared when a session-not-found error occurs, ensuring correct state management and proper cleanup for subsequent interactions.

<!-- end of auto-generated comment: release notes by coderab…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/715` (2026-04-03 by nehaaprasad) — confidence 0.665:
```
PR #715: fix(autorun): resolve paused batch session for resume/skip/abort
URL: https://github.com/RunMaestro/Maestro/pull/715
State: closed
Author: nehaaprasad
Created: 2026-04-03T11:22:16Z

### summary

- Fix error banner staying after Resume by clearing the same batch session the UI shows.

### Changes

- src/renderer/hooks/batch/useBatchHandlers.ts — resolve paused session (prefer active session, then any errorPaused) for resume/skip/abort

fix : #707

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->

## Summary by CodeRabbit

## Release Notes

* **Bug Fixes**
  * Enhanced error recovery in batch processing. When pausing on error, the system now intelligently selects which batch to resume from—prioritizing the currently active one, then any paused batch, then the first active batch for more predictable operation handling.

<!-- end of auto-generated comment: release notes by coderabbit.ai -->
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/779` (2026-04-09 by reachrazamair) — confidence 0.632:
```
PR #779: refactor(cue): harden config boundary, introduce session registry, and isolate trigger sources
URL: https://github.com/RunMaestro/Maestro/pull/779
State: closed
Author: reachrazamair
Created: 2026-04-09T23:13:12Z

## Summary

This PR closes out the Maestro Cue refactor across three sequential commits, eliminating the root causes of the recent `fix(cue):` cascade and bringing the engine to a structurally sound baseline.

### What was wrong

The previous architecture had three concrete failure modes:

1. **No config boundary** — `prompt_file`/`output_prompt_file` leaked past normalization into the runtime model; the executor contained a live file-resolver that re-read `.md`/`.txt`/`.yaml` files at trigger time instead of using the already-resolved inline content; IPC handlers owned raw `fs`/`path` I/O directly; `loadCueConfig()` returned `null` for both "file missing" and "file invalid" with no distinction.

2. **No session state owner** — `scheduledFiredKeys` and `startupFiredKeys` were two bare `Set` instances shared by reference across `CueEngine`, `CueSessionRuntimeService`, and `cue-subscription-setup.ts`. Any of the three could mutate them. The `isBootScan` b…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**source** `src/main/group-chat/session-recovery.ts@f99007d580204a5f3795` (2026-04-15):
```
/**
 * Session Recovery for Group Chat
 *
 * This module handles detection and recovery from session-not-found errors
 * in group chat participants. When an agent's session has been deleted
 * (out of band), this module:
 *
 * 1. Detects the error from the agent's output
 * 2. Clears the participant's stored agentSessionId
 * 3. Builds rich context including the agent's prior statements
 * 4. Re-spawns the participant with this context to continue the conversation
 *
 * This enables participants…
```

**git_commit** `90a463b9190fa9566b7a72c10b6c3cc59ceae156` (2026-01-31 by pedram.amini@gmail.com):
```
commit 90a463b9190fa9566b7a72c10b6c3cc59ceae156
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-31T18:31:29.000Z

added a bunch of tests


Files:
src/__tests__/main/claude-session-storage.test.ts
src/__tests__/main/group-chat/session-recovery.test.ts
src/__tests__/main/history-manager.test.ts
src/__tests__/main/process-manager/handlers/StdoutHandler.test.ts
src/__tests__/main/utils/age…
```

**source** `src/__tests__/main/group-chat/session-recovery.test.ts@1d601` (2026-04-15):
```
/**
 * @file session-recovery.test.ts
 * @description Unit tests for the Group Chat session recovery module.
 *
 * Tests cover:
 * - detectSessionNotFoundError: detecting session-not-found errors from agent output
 * - needsSessionRecovery: delegation to detectSessionNotFoundError
 * - buildRecoveryContext: constructing recovery context with chat history
 * - initiateSessionRecovery: clearing agentSessionId for re-spawn
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock…
```

**git_commit** `99fc8c0d9f09d87a46a0388eeb0ffea6e3b6d0c4` (2026-02-09 by pedram.amini@gmail.com):
```
commit 99fc8c0d9f09d87a46a0388eeb0ffea6e3b6d0c4
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-09T05:26:32.000Z

Standardize agent vs session terminology across docs and fix Director's Notes shortcut display

Docs: Establish "agent" for user-facing entities (Left Bar items) and "session/provider session" for conversation contexts (tabs). Updated 11 documentation files to enforce this …
```

**source** `CLAUDE-SESSION.md@3cf44671485c0ac26f4389353f0a3ea9f18899e00f` (2026-04-15):
```
# CLAUDE-SESSION.md

Session interface (agent data model) and code conventions for the Maestro codebase. For the main guide, see [[CLAUDE.md]].

> **Terminology:** In code, the `Session` interface represents what users see as an **agent** in the Left Bar. The name is historical. Within each agent, "provider sessions" refer to individual conversation contexts (tabs). See [[CLAUDE.md#terminology-agent-vs-session]] for the full distinction.

## Session Interface (Agent Data Model)

Key fields on th…
```

**source** `src/renderer/hooks/session/useGroupManagement.ts@8229b379a96` (2026-04-15):
```
import { useCallback, useState } from 'react';
import type { Session, Group } from '../../types';

/**
 * State returned from useGroupManagement for modal management
 */
export interface GroupModalState {
	/** Whether the create group modal is open */
	createGroupModalOpen: boolean;
	/** Setters for modal state */
	setCreateGroupModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

/**
 * Dependencies for useGroupManagement hook
 */
export interface UseGroupManagementDeps {
	/** All group…
```

**git_commit** `a927584207a1d74c5cb551319b9c72e5acfa8767` (2026-01-09 by pedram.amini@gmail.com):
```
commit a927584207a1d74c5cb551319b9c72e5acfa8767
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-09T01:31:41.000Z

## CHANGES

- Generate playbooks mid-session with the new Inline Wizard flow 🧙
- Add confidence gauge and organized wizard subfolders for generated docs 📈
- Launch **Maestro Symphony** to donate tokens and ship OSS PRs 🎵
- Browse/filter/search Symphony projects and issue…
```

**git_commit** `8de53cd84b2866785c3a47d297619744e19fe982` (2026-02-11 by reachrazarauf@gmail.com):
```
commit 8de53cd84b2866785c3a47d297619744e19fe982
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-02-11T13:14:41.000Z

refactor: complete agentStore Phases 2-3, extract ~1,850 lines from App.tsx

Phase 2 — useAgentListeners hook:
- Extract IPC listener useEffect (~1,520 lines) from App.tsx into
  src/renderer/hooks/agent/useAgentListeners.ts
- Covers onData, onUsage, onStderr, onExit, onAgent…
```

**source** `src/renderer/hooks/session/useBatchedSessionUpdates.ts@562ae` (2026-04-15):
```
/**
 * useBatchedSessionUpdates.ts
 *
 * A hook that batches session state updates to reduce React re-renders.
 * During AI streaming, IPC handlers can trigger 100+ state updates per second.
 * This hook accumulates updates in a ref and flushes them every 150ms.
 *
 * Features:
 * - Configurable flush interval (default 150ms)
 * - Support for multiple update types: appendLog, setStatus, updateUsage, etc.
 * - Proper ordering of updates within each flush
 * - Immediate flush capability for critic…
```

**git_commit** `dbcbda1324927db1a87c0e7fbc7c76e6dcb7e5a0` (2026-01-30 by reachrazarauf@gmail.com):
```
commit dbcbda1324927db1a87c0e7fbc7c76e6dcb7e5a0
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-30T15:10:56.000Z

refactor: decompose stats-db into focused modules

Break the 1,870-line monolithic stats-db.ts into 13 focused modules under
src/main/stats/, following the same pattern used in the agents module refactor.

Key improvements:
- StatementCache for prepared statement reuse across…
```

**source** `src/main/stats/session-lifecycle.ts@4f0ab5204577caaf1a38a3aa` (2026-04-15):
```
/**
 * Session Lifecycle CRUD Operations
 *
 * Tracks when sessions are created (launched) and closed,
 * enabling session duration and lifecycle analytics.
 */

import type Database from 'better-sqlite3';
import type { SessionLifecycleEvent, StatsTimeRange } from '../../shared/stats-types';
import { generateId, getTimeRangeStart, normalizePath, LOG_CONTEXT } from './utils';
import { mapSessionLifecycleRow, type SessionLifecycleRow } from './row-mappers';
import { StatementCache } from './utils'…
```

**git_commit** `454cdefd44832a12fbb684c9fd58e7b39445350b` (2026-01-29 by reachrazarauf@gmail.com):
```
commit 454cdefd44832a12fbb684c9fd58e7b39445350b
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-29T17:20:58.000Z

refactor: consolidate agents module and reorganize test structure

Create src/main/agents/ directory with barrel exports:
- Move agent-detector.ts → agents/detector.ts
- Move agent-definitions.ts → agents/definitions.ts
- Move agent-capabilities.ts → agents/capabilities.ts
- …
```

**source** `src/main/agents/session-storage.ts@31cd104eb1fd779040a7c769e` (2026-04-15):
```
/**
 * Agent Session Storage Interface
 *
 * This module defines the abstract interface for agent session storage.
 * Different AI agents (Claude Code, OpenCode, etc.) store their sessions
 * differently. This interface provides a common abstraction layer.
 *
 * Usage:
 * ```typescript
 * const storage = getSessionStorage('claude-code');
 * if (storage) {
 *   const sessions = await storage.listSessions('/path/to/project');
 * }
 * ```
 */

import type { ToolType, SshRemoteConfig } from '../../s…
```

**git_commit** `43177df7bff991582f69bbaf6787873e9bbeb46f` (2026-01-22 by info@vvx7.io):
```
commit 43177df7bff991582f69bbaf6787873e9bbeb46f
Author: VVX7 <info@vvx7.io>
Date: 2026-01-22T19:04:40.000Z

Add support for Factory.ai droid agent.

See: https://factory.ai/product/cli

Files:
package-lock.json
src/__tests__/main/parsers/index.test.ts
src/__tests__/renderer/services/contextGroomer.test.ts
src/main/agent-capabilities.ts
src/main/agent-detector.ts
src/main/agent-session-storage.ts
s…
```

**source** `src/renderer/hooks/session/index.ts@aeab8e884d0d50ceeb5faf5d` (2026-04-15):
```
/**
 * Session State Management Module
 *
 * Hooks for session navigation, sorting, filtering, grouping,
 * activity tracking, and batched updates.
 */

// Navigation history (back/forward)
export { useNavigationHistory } from './useNavigationHistory';
export type { NavHistoryEntry } from './useNavigationHistory';

// Session navigation handlers
export { useSessionNavigation } from './useSessionNavigation';
export type { UseSessionNavigationReturn, UseSessionNavigationDeps } from './useSessionNa…
```

**source** `src/renderer/hooks/session/useActivityTracker.ts@3e61dff4f5b` (2026-04-15):
```
import { useEffect, useRef, useCallback } from 'react';
import type { Session } from '../../types';

const ACTIVITY_TIMEOUT_MS = 60000; // 1 minute of inactivity = idle
const TICK_INTERVAL_MS = 1000; // Update every second
const BATCH_UPDATE_INTERVAL_MS = 30000; // Batch updates every 30 seconds to reduce re-renders

export interface UseActivityTrackerReturn {
	onActivity: () => void; // Call this when user activity is detected
}

/**
 * Hook to track user activity and update session's activeTim…
```

**source** `src/renderer/hooks/session/useHandsOnTimeTracker.ts@d49bdc82` (2026-04-15):
```
import { useEffect, useRef, useCallback } from 'react';

const ACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes of inactivity = idle
const TICK_INTERVAL_MS = 1000; // Update every second
const PERSIST_INTERVAL_MS = 30000; // Persist to settings every 30 seconds

/**
 * Hook to track global user hands-on time in Maestro.
 *
 * Time is tracked when the user is "active" - meaning they've interacted
 * with the app (keyboard, mouse, wheel, touch) within the last 5 minutes.
 *
 * The accumulated tim…
```

**source** `src/renderer/hooks/session/useNavigationHistory.ts@29bf4daa5` (2026-04-15):
```
import { useRef, useCallback } from 'react';

// Navigation history entry - tracks session and AI tab position
export interface NavHistoryEntry {
	sessionId: string;
	tabId?: string; // Optional AI tab ID (only for AI mode with tabs)
}

const MAX_HISTORY = 50;

/**
 * Hook for managing navigation history (back/forward) through sessions and AI tabs.
 *
 * Usage:
 * - Call `pushNavigation` when navigating to a new session or tab
 * - Call `navigateBack` to go back
 * - Call `navigateForward` to go…
```

**source** `src/renderer/hooks/session/useSessionNavigation.ts@cedb29a01` (2026-04-15):
```
import { useCallback, MutableRefObject } from 'react';
import type { Session } from '../../types';
import type { NavHistoryEntry } from './useNavigationHistory';

/**
 * Dependencies required by the useSessionNavigation hook
 */
export interface UseSessionNavigationDeps {
	/** Function from useNavigationHistory to navigate back */
	navigateBack: () => NavHistoryEntry | null;
	/** Function from useNavigationHistory to navigate forward */
	navigateForward: () => NavHistoryEntry | null;
	/** Sessio…
```

**source** `src/renderer/hooks/session/useSortedSessions.ts@f0721fca196c` (2026-04-15):
```
import { useMemo } from 'react';
import type { Session, Group } from '../../types';
import { stripLeadingEmojis, compareNamesIgnoringEmojis } from '../../../shared/emojiUtils';

// Re-export for backwards compatibility with existing imports
export { stripLeadingEmojis, compareNamesIgnoringEmojis };

/**
 * Dependencies for the useSortedSessions hook.
 */
export interface UseSortedSessionsDeps {
	/** All sessions */
	sessions: Session[];
	/** All groups */
	groups: Group[];
	/** Whether the bookm…
```

**git_commit** `bbf6612f35aea27f908dc5cfa34f3863227a8381` (2025-11-28 by pedram.amini@gmail.com):
```
commit bbf6612f35aea27f908dc5cfa34f3863227a8381
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-11-28T03:42:03.000Z

feat: Mobile-first remote access with QR codes and live sessions

Redesign the web server architecture for simplified mobile remote control:

- Replace per-session web servers with single server using random port and
  auto-generated security token for secure access
- Add "…
```

**source** `src/web/hooks/useSessions.ts@50b7f5cb6bae72bb545c4a971821e99` (2026-04-15):
```
/**
 * useSessions hook for Maestro web interface
 *
 * Provides real-time session state management for the web interface.
 * Uses the WebSocket connection to receive session updates and provides
 * methods to interact with sessions (send commands, interrupt, etc.).
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
	useWebSocket,
	type SessionData,
	type UseWebSocketOptions,
	type UseWebSocketReturn,
	type WebSocketState,
	type UsageStats,
	type LastRespons…
```

**source** `src/renderer/types/index.ts@92c34e526fc37800b3c1650fbe3e9831` (2026-04-15):
```
// Type definitions for Maestro renderer

// Re-export context merge types
export * from './contextMerge';

// Re-export theme types from shared location
export type { Theme, ThemeId, ThemeMode, ThemeColors } from '../../shared/theme-types';
export { isValidThemeId } from '../../shared/theme-types';

// Re-export types from shared location
export type {
	AgentError,
	AgentErrorType,
	AgentErrorRecovery,
	ToolType,
	Group,
	UsageStats,
	BatchDocumentEntry,
	PlaybookDocumentEntry,
	Playbook,
	Thin…
```

**git_commit** `11d0c672e82d518b29cd8fb30a813bb3b4cb54a1` (2026-02-08 by pedram.amini@gmail.com):
```
commit 11d0c672e82d518b29cd8fb30a813bb3b4cb54a1
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-08T17:33:33.000Z

fix: add Sentry captureException to swallowed errors across main process

Error handlers in group chat, history, agent detector, and all session
storage implementations were logging errors locally but never reporting
to Sentry. Added captureException calls alongside existin…
```

**source** `src/main/storage/claude-session-storage.ts@d7c9dfcfe1eb4dbfd` (2026-04-15):
```
/**
 * Claude Code Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for Claude Code.
 * Claude Code stores sessions as JSONL files in ~/.claude/projects/<encoded-path>/
 *
 * File structure:
 * - Each session is a .jsonl file named <session-id>.jsonl
 * - Each line is a JSON object with type, timestamp, message, etc.
 * - User and assistant messages contain the actual conversation
 * - Result messages contain token usage and cost information
 */

impo…
```
```

</details>

**Condition B (pack, no companion):** ~6963 tok (6598 prompt + 365 answer)

In the Maestro codebase, session recovery clears the `agentSessionId` primarily to prevent an **infinite loop** caused by stale or deleted conversation contexts. According to PR #543 and PR #544, this mechanism addresses scenarios where an underlying agent (like Claude Code) fails because its local session state has been deleted out-of-band or has expired.

If Maestro were to retry with the same ID, the agent would continue attempting to execute with the `--resume <id>` flag. Since that ID no longer exists on the provider's side, the agent would repeatedly throw a `session_not_found` error. Clearing the `agentSessionId` at both the tab and session level forces the agent to start a **fresh session** on the next prompt.

To maintain conversation continuity despite starting a new session, the `src/main/group-chat/session-recovery.ts` module performs the following steps:
1.  **Detection**: It monitors agent output for specific "session not found" error patterns.
2.  **Context Reconstruction**: It invokes `buildRecoveryContext` to aggregate the participant's prior statements and relevant chat history.
3.  **Re-spawning**: It clears the dead ID and re-initializes the participant, re-injecting the gathered history as context so the conversation can proceed seamlessly.

This strategy ensures that agents remain functional and "recovered" without manual user intervention, even when the underlying provider's session state becomes desynchronized.

**Condition C (pack + companion):** ~7761 tok (7449 prompt + 312 answer)

Based on the context pack and PR history, session recovery clears the `agentSessionId` to break an **infinite loop** caused by attempts to resume non-existent or expired sessions.

According to **PR #544** and **PR #543**, when an underlying agent session (such as a Claude Code session) is deleted out-of-band or expires, any subsequent command using the `--resume` flag with the stale ID results in a `session_not_found` error. Without clearing the ID, Maestro would repeatedly attempt to resume the dead session, leading to a "frozen" agent state.

The recovery logic in `src/main/group-chat/session-recovery.ts` handles this by:
1.  **Detecting the Error**: Identifying the `session_not_found` pattern in the agent's output.
2.  **State Cleanup**: Explicitly clearing the `agentSessionId` at both the tab and session levels to ensure the next prompt starts a fresh provider session.
3.  **Context Restoration**: To prevent loss of conversation history, the module builds a **recovery context** from the agent's prior statements and re-spawns the participant with this injected history.

This approach prioritizes automated continuity over persistence of a broken session identifier, allowing agents to recover without manual user intervention.

---

## Q3 [small] — Why does Maestro use JSONL files for conversation logs instead of a database?

**Pack:** 575 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.94, 0.86, 0.77, 0.75, 0.68]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does Maestro use JSONL files for conversation logs instead of a database?  Budget: 6000 tokens | Used: ~5319 | 60 results (1 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `Auto Run Docs/Phase-02-Conversation-Screen.md` **[module]** — score 1.000 | evidence: 1 episode(s)
- `docs/screenshots/git-logs.png` **[module]** — score 0.997 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/205` **[issue]** — score 0.919 | evidence: 1 episode(s)
- `src/main/debug-package/collectors/logs.ts` **[module]** — score 0.882 | evidence: 2 episode(s)
- `src/main/preload/files.ts` **[module]** — score 0.876 | evidence: 2 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/11` **[issue]** — score 0.867 | evidence: 1 episode(s)
- `src/main/debug-package/collectors/logs.ts::SanitizedLogEntry` **[symbol]** — score 0.834 | evidence: 1 episode(s)
- `src/main/debug-package/collectors/logs.ts::LogsInfo` **[symbol]** — score 0.834 | evidence: 1 episode(s)
- `src/main/debug-package/collectors/logs.ts::sanitizeEntry` **[symbol]** — score 0.834 | evidence: 1 episode(s)
- `src/main/debug-package/collectors/logs.ts::collectLogs` **[symbol]** — score 0.834 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts` **[module]** — score 0.834 | evidence: 2 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/757` **[issue]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::HistoryEntry` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::createTempfileApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::createHistoryApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::createCliApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::TempfileApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::HistoryApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/main/preload/files.ts::CliApi` **[symbol]** — score 0.822 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::JsonlEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::StartEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::DocumentStartEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::TaskStartEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::TaskCompleteEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::DocumentCompleteEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::LoopCompleteEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::CompleteEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::ErrorEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::GroupEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::AgentEvent` **[symbol]** — score 0.783 | evidence: 1 episode(s)
- `symphony@maestro.dev` **[person]** — score 0.065 | evidence: 1 episode(s)
- `src/web/App.tsx::useMaestroMode` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `docs/assets/maestro-app-icon.png` **[module]** — score 0.065 | evidence: 1 episode(s)
- `src/main/preload/fs.ts::FileStat` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `scripts/generate-maestro-icon.mjs` **[module]** — score 0.065 | evidence: 1 episode(s)
- `docs/assets/made-with-maestro.svg` **[module]** — score 0.065 | evidence: 2 episode(s)
- `src/cli/output/jsonl.ts::CliEvent` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `docs/screenshots/maestro-intro.png` **[module]** — score 0.065 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::emitJsonl` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::emitError` **[symbol]** — score 0.065 | evidence: 1 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/__tests__/main/preload/files.test.ts imports src/main/preload/files.ts **[observed]** — score 1.000
- src/main/preload/files.ts defines HistoryEntry **[observed]** — score 0.896
- src/main/preload/files.ts defines createTempfileApi **[observed]** — score 0.896
- src/main/preload/files.ts defines createHistoryApi **[observed]** — score 0.896
- src/main/preload/files.ts defines createCliApi **[observed]** — score 0.896
- src/main/preload/files.ts defines TempfileApi **[observed]** — score 0.896
- src/main/preload/files.ts defines HistoryApi **[observed]** — score 0.896
- src/main/preload/files.ts defines CliApi **[observed]** — score 0.896
- Auto Run Docs/Phase-02-Conversation-Screen.md was authored/modified by pedram.amini@gmail.com in commit b7256dbf **[observed]** — score 0.835 | valid: 2025-12-09T16:30:21.000Z → present
- HistoryEntry is defined in src/main/preload/files.ts **[observed]** — score 0.833
- createTempfileApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- createHistoryApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- createCliApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- TempfileApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- HistoryApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- CliApi is defined in src/main/preload/files.ts **[observed]** — score 0.833
- src/__tests__/main/preload/files.test.ts defines mockInvoke **[observed]** — score 0.833
- src/__tests__/main/preload/files.test.ts defines mockOn **[observed]** — score 0.833
- src/__tests__/main/preload/files.test.ts defines mockRemoveListener **[observed]** — score 0.833
- src/main/debug-package/collectors/logs.ts defines SanitizedLogEntry **[observed]** — score 0.821

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/569` (2026-03-13 by chr1syy) — confidence 1.000:
```
PR #569: feat: add SQLite session reading support for OpenCode v1.2+
URL: https://github.com/RunMaestro/Maestro/pull/569
State: closed
Author: chr1syy
Created: 2026-03-13T18:27:44Z

## Summary

- Adds SQLite session reading support for OpenCode v1.2+, which switched from JSON files to a SQLite database for session storage
- Implements dual-format detection: automatically reads from SQLite when available, falls back to legacy JSON format
- Parses OpenCode's SQLite schema to extract sessions, messages, and tool calls into Maestro's session model

## Test plan

- [x] Verify OpenCode v1.2+ sessions are detected and loaded from SQLite database
- [x] Verify legacy JSON-based OpenCode sessions still load correctly
- [x] Verify graceful fallback when neither format is available

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **New Features**
  * Added SQLite-backed session storage with automatic JSON fallback; merged session listings now include aggregated message/part totals.

* **Bug Fixes**
  * Prevent deletion of database-backed sessions; JSON-backed dele…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/699` (2026-04-01 by jSydorowicz21) — confidence 0.939:
```
PR #699: fix: update Codex integration for v0.111.0 JSONL output format
URL: https://github.com/RunMaestro/Maestro/pull/699
State: closed
Author: jSydorowicz21
Created: 2026-04-01T01:25:49Z

## Summary

- Rewrites Codex output parser to support v0.111.0 dual-format (new JSONL + legacy) parsing
- Adds session_meta, response_item, event_msg, turn_context, command_execution handlers
- Fixes session storage to properly handle custom_tool_call, merge tool outputs by call_id, and include state property for ToolCallCard rendering
- Adds conditional stderr suppression in JSON mode to prevent duplicate output
- Filters tool messages in restored sessions to match live session behavior

## Changes

- `codex-output-parser.ts` - Major rewrite for dual-format support (+348/-32)
- `codex-session-storage.ts` - Fixed tool call handling, added CodexToolUseEntry type, immutable updates
- `StderrHandler.ts` - Conditional stderr suppression in --json mode
- `AgentSessionsBrowser.tsx` - Tool message filtering in restored sessions
- `useAgentSessionManagement.ts` - Matching tool filtering in session hook

## Test Coverage

- 61 new tests added (56 parser + 5 storage edge cases)
- All 119 tests pass
- Cov…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/280` (2026-02-02 by reachrazamair) — confidence 0.863:
```
PR #280: fix: correct context usage calculation to include cacheRead tokens an…
URL: https://github.com/RunMaestro/Maestro/pull/280
State: closed
Author: reachrazamair
Created: 2026-02-02T23:18:27Z

### Problem

The context window usage gauge had several bugs causing inaccurate readings:

1. **Underestimation** — `cacheReadInputTokens` was excluded from the formula. For a single Anthropic API call, the total input context is `inputTokens + cacheReadInputTokens + cacheCreationInputTokens` (three partitions of the same input: uncached, cache-hit, newly-cached). Excluding cache-read meant the gauge showed ~3% when reality was ~23%.

2. **False 100%** — During complex multi-tool turns, Claude Code accumulates token values across all internal API calls in a single `result` JSONL message. With cache-read included, these accumulated totals easily exceed the 200K context window (e.g., 2.5M cache-read from 40 internal calls each reading ~62K). The old code capped at 100%, triggering false compact warnings.

3. **Tooltip inconsistency** — `MainPanel.tsx` recalculated context tokens independently from raw tab `usageStats`, bypassing the fix in `App.tsx`. The hover tooltip still showed…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/794` (2026-04-11 by chr1syy) — confidence 0.766:
```
PR #794: fix: prevent SSH error pattern false positives on agent response text
URL: https://github.com/RunMaestro/Maestro/pull/794
State: closed
Author: chr1syy
Created: 2026-04-11T08:14:16Z

## Summary
- **StdoutHandler**: SSH error patterns are now only checked against non-JSON lines. Valid JSONL lines contain structured agent output (assistant messages, results) whose text content could false-positive match patterns like `bash:.*opencode.*command not found` when the agent quoted shell commands or error patterns in its response.
- **ExitHandler**: SSH error check at exit now only scans `stderr`, not the combined `stdout+stderr`. Stdout contains all accumulated JSONL which includes the full agent response — scanning it caused false positives when response text mentioned SSH error keywords.
- Added test coverage for SSH error pattern false-positive prevention in both handlers.

## Root Cause
When running over SSH (`sshRemoteId` set), error patterns were matched against raw JSONL lines and combined output buffers. The `.*` wildcards in patterns like `/bash:.*opencode.*command not found/i` matched across the JSON structure, hitting keywords embedded in the agent's response text. This…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/599` (2026-03-20 by reachrazamair) — confidence 0.754:
```
PR #599: refactor(cue): full SRP decomposition — engine modules, renderer components, shared types
URL: https://github.com/RunMaestro/Maestro/pull/599
State: closed
Author: reachrazamair
Created: 2026-03-20T01:29:40Z

## Summary

- Decompose the Cue codebase from 3 monolithic files into single-responsibility modules with clear boundaries for future feature expansion
- **Main process:** `cue-engine.ts` 1,583→719 lines (−55%) via 5 extracted modules (activity log, heartbeat, subscription setup, fan-in tracker, run manager)
- **Renderer:** 3 large components decomposed into directory-based modules:
  - `NodeConfigPanel` 850→249 lines (−71%) — TriggerConfig, AgentConfigPanel, EdgePromptRow
  - `CueModal` 1,029→490 lines (−52%) — SessionsTable, ActiveRunsList, ActivityLog, ActivityLogDetail, StatusDot, cueModalUtils
  - `CueYamlEditor` 691→284 lines (−59%) — PatternPicker, PatternPreviewModal, CueAiChat, YamlTextEditor, useCueAiChat hook
- **Pipeline editor:** `CuePipelineEditor` 1,608→607 lines (−62%) — usePipelineState, usePipelineSelection, usePipelineLayout hooks + PipelineToolbar, PipelineCanvas, PipelineContextMenu components
- **9 cross-cutting fixes:** shared `CUE_COLOR…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/744` (2026-04-07 by chr1syy) — confidence 0.684:
```
PR #744: feat: fork conversation from any point in AI message history
URL: https://github.com/RunMaestro/Maestro/pull/744
State: closed
Author: chr1syy
Created: 2026-04-07T12:24:53Z

## Summary

Closes #205

- Adds a "Fork conversation" button (GitFork icon) on hover for user and AI messages in the AI terminal
- Clicking forks the conversation up to that message into a new agent session, carrying full conversation context
- The new session inherits all source config (custom path/args/env, SSH remote, model, context window, group)
- Copies `cwd` and `fullPath` from source session so the forked agent spawns in the correct working directory

## Implementation

- New `useForkConversation` hook following the established Send-to-Agent spawn pattern
- Props threaded through MainPanel → MainPanelContent → TerminalOutput → LogItem
- Fork button visibility gated to AI mode, user/ai source messages only
- System prompt and template variables applied to the spawned agent
- Error handling with Sentry reporting and state cleanup on spawn failure

## Test plan

- [x] Existing TerminalOutput tests pass (97/97)
- [x] TypeScript type check clean
- [x] Manual: hover over AI/user message, click fork i…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**git_commit** `b7256dbfe4ac0de8378170c0476f9f03f7008697` (2025-12-09 by pedram.amini@gmail.com):
```
commit b7256dbfe4ac0de8378170c0476f9f03f7008697
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-09T16:30:21.000Z

about modal tweaks


Files:
.gitignore
Auto Run Docs/Phase-01-Wizard-Foundation.md
Auto Run Docs/Phase-02-Conversation-Screen.md
Auto Run Docs/Phase-03-Document-Generation.md
Auto Run Docs/Phase-04-Phase-Review-Screen.md
Auto Run Docs/Phase-05-Tour-Overlay-System.md
Auto Ru…
```

**git_commit** `77c9a302339def9efcbbe9af1312b8597c456e62` (2025-12-27 by pedram.amini@gmail.com):
```
commit 77c9a302339def9efcbbe9af1312b8597c456e62
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-27T01:11:46.000Z

added mintlify scaffolding


Files:
docs/docs.json
docs/index.md
docs/screenshots/achievements.png
docs/screenshots/autorun-1.png
docs/screenshots/autorun-2.png
docs/screenshots/cmd-k-1.png
docs/screenshots/cmd-k-2.png
docs/screenshots/cmd-k-3.png
docs/screenshots/cmd-k-4.p…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/205` (2026-01-18 by pedramamini):
```
Issue #205: Enhancement: Fork conversation from any point in AI message history
URL: https://github.com/RunMaestro/Maestro/issues/205
State: open
Author: pedramamini
Created: 2026-01-18T18:01:04Z

## Summary

Add the ability to fork a conversation from any point in the AI message history, allowing users to explore alternative paths or retry from a specific point without losing the original conversation.

## Proposed Behavior

1. **New Fork Icon**: Add a fork icon (⑂ or similar) to the bottom-rig…
```

**git_commit** `a45e4a98b388bbbffecede136e29278e1fd981b6` (2026-02-07 by pedram.amini@gmail.com):
```
commit a45e4a98b388bbbffecede136e29278e1fd981b6
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-07T09:18:06.000Z

fix: strip sensitive data from debug packages (paths, names, logs, install dirs)

Users reported debug packages contained prompts, messages, agent
installation paths, and directory listings. Centralizes sanitization
into a shared sanitize.ts module and hardens all collector…
```

**source** `src/main/debug-package/collectors/logs.ts@1bb3fa53711dacc338` (2026-04-15):
```
/**
 * Logs Collector
 *
 * Collects recent system logs from the logger.
 * These are system/application logs, not conversation logs.
 * Log messages are sanitized to remove embedded paths and truncate
 * long messages that may contain prompts or conversation content.
 * The raw `data` field is dropped entirely to prevent leaking sensitive objects.
 */

import { logger, LogEntry } from '../../utils/logger';
import { sanitizeLogMessage } from './sanitize';

export interface SanitizedLogEntry {
	t…
```

**git_commit** `1c2a8101ee6d125b62da65b5493ec5adfb6cd257` (2026-01-22 by reachrazarauf@gmail.com):
```
commit 1c2a8101ee6d125b62da65b5493ec5adfb6cd257
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-22T15:33:55.000Z

refactor: modularize preload.ts into domain-specific modules with tests


Files:
package-lock.json
package.json
scripts/build-preload.mjs
src/__tests__/main/preload/agents.test.ts
src/__tests__/main/preload/attachments.test.ts
src/__tests__/main/preload/autorun.test.ts
src/__…
```

**source** `src/main/preload/files.ts@db2f7c00493f2c50155d2fd3f82de7a664` (2026-04-15):
```
/**
 * Preload API for file operations
 *
 * Provides the window.maestro.tempfile, history, and cli namespaces for:
 * - Temporary file operations
 * - History persistence
 * - CLI activity monitoring
 */

import { ipcRenderer } from 'electron';

/**
 * History entry
 */
export interface HistoryEntry {
	id: string;
	type: 'AUTO' | 'USER';
	timestamp: number;
	summary: string;
	fullResponse?: string;
	agentSessionId?: string;
	projectPath: string;
	sessionId?: string;
	sessionName?: string;
	cont…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/11` (2025-12-02 by marcomafcorp):
```
Issue #11: Feature Request: Files Tab Auto Refresh
URL: https://github.com/RunMaestro/Maestro/issues/11
State: closed
Author: marcomafcorp
Created: 2025-12-02T20:34:01Z

On the right side, we should implement an auto-refresh feature under the Files tab. I understand that a refresh button is available, and we can keep it for manual updates. However, if the user is currently viewing the Files tab, it should automatically refresh. If the user switches to a different tab, the auto-refresh can pause …
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**source** `src/cli/output/jsonl.ts@d5edad5dc5ea972da75dce619f06546176f0` (2026-04-15):
```
// JSONL output helper for CLI
// Outputs machine-parseable JSON lines to stdout

import type { UsageStats } from '../../shared/types';

// Base event interface - all events have a type and timestamp
export interface JsonlEvent {
	type: string;
	timestamp: number;
	[key: string]: unknown;
}

// Event types for playbook execution
export interface StartEvent extends JsonlEvent {
	type: 'start';
	playbook: {
		id: string;
		name: string;
	};
	session: {
		id: string;
		name: string;
		cwd: string;
…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/757` (2026-04-09 by jeffscottward):
```
Issue #757: Bug: Files panel Hide is unclear and does not hide .maestro folder
URL: https://github.com/RunMaestro/Maestro/issues/757
State: open
Author: jeffscottward
Created: 2026-04-09T16:45:48Z

## Summary
Files panel Hide is unclear and does not hide .maestro folder

## Environment
- Maestro version: 0.16.8-RC
- Operating system: macOS (Darwin Kernel Version 25.3.0: Wed Jan 28 20:54:46 PST 2026; root:xnu-12377.91.3~2/RELEASE_ARM64_T6000, 25.3.0)
- Install source: Packaged build (release buil…
```

**git_commit** `a0ae50676268ef0348363d1daba591bb556b56c4` (2026-02-06 by symphony@maestro.dev):
```
commit a0ae50676268ef0348363d1daba591bb556b56c4
Author: Symphony <symphony@maestro.dev>
Date: 2026-02-06T00:08:26.000Z

MAESTRO: Add comprehensive tests for UnifiedHistoryTab component

Verifies Director's Notes modal unified history: data fetching/aggregation,
filter toggles (AUTO/USER), activity graph integration, keyboard navigation,
detail modal open/close/navigation, agent name display, and e…
```

**source** `src/web/App.tsx@e8b7937c52b9d7d3496b5faa9fa4ef0703d3888d43df` (2026-04-15):
```
/**
 * Maestro Web Interface App
 *
 * Remote control interface for mobile/tablet devices.
 * Provides session monitoring and command input from anywhere on your network.
 */

import {
	StrictMode,
	lazy,
	Suspense,
	useEffect,
	useState,
	useMemo,
	createContext,
	useContext,
	useCallback,
} from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import { registerServiceWorker, isOffline } from './utils/serviceWorker';
import { getMaestroConfig } from './utils/config';
import …
```

**git_commit** `aaf315adf60f831303bcdcf949d713f39558bf3b` (2025-12-02 by pedram.amini@gmail.com):
```
commit aaf315adf60f831303bcdcf949d713f39558bf3b
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-02T23:02:29.000Z

feat: Update app branding with darker icons and README badge

- Add "Made with Maestro" SVG badge to README
- Update app icons with darker purple color scheme (#2d1f4e)
- Add canvas dev dependency for icon generation
- Fix AchievementCard badge visibility with consistent da…
```

**source** `src/main/preload/fs.ts@5f70b2d157f6c7af28d360bce994f86f25920` (2026-04-15):
```
/**
 * Preload API for filesystem operations
 *
 * Provides the window.maestro.fs namespace for:
 * - Reading directories and files
 * - File stats and sizes
 * - Writing, renaming, and deleting files
 * - SSH remote support for all operations
 */

import { ipcRenderer } from 'electron';

/**
 * Directory entry information
 */
export interface DirectoryEntry {
	name: string;
	isDirectory: boolean;
	path: string;
}

/**
 * File stat information
 */
export interface FileStat {
	size: number;
	crea…
```

**git_commit** `78da485b5bfdd659fe39a64712ea15abc01f6c91` (2025-12-14 by pedram.amini@gmail.com):
```
commit 78da485b5bfdd659fe39a64712ea15abc01f6c91
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-14T05:39:58.000Z

## CHANGES

- Removed PWA icon generation scripts for cleaner codebase 🧹
- Deleted Maestro icon generator script with conductor silhouette 🎭
- Removed GitHub community analytics scripts for stargazers/forkers 📊
- Added keyboard shortcuts support to tour overlay component…
```

**git_commit** `8094adb4d9b12ea717be3fb7fe454d58b4808ffb` (2025-12-02 by pedram.amini@gmail.com):
```
commit 8094adb4d9b12ea717be3fb7fe454d58b4808ffb
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-02T23:37:57.000Z

style: Add left padding to Made with Maestro badge


Files:
docs/assets/made-with-maestro.svg
```

**source** `docs/assets/made-with-maestro.svg@a0fc426a8c608c6903f37c1ea6` (2026-04-15):
```
<svg xmlns="http://www.w3.org/2000/svg" width="142" height="20" role="img" aria-label="Made with Maestro">
  <!-- Left section (icon) - darker purple -->
  <rect width="20" height="20" rx="3" fill="#5B3D8A"/>

  <!-- Maestro glyph scaled to fit -->
  <g transform="translate(3,3) scale(0.5833)">
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72" fill="none" stroke="#fff" stroke-width="2" strok…
```

**git_commit** `6aab9892dee8ef0a750806c0445d1ec42c5268ff` (2026-01-09 by pedram.amini@gmail.com):
```
commit 6aab9892dee8ef0a750806c0445d1ec42c5268ff
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-09T12:42:38.000Z

## CHANGES

- Fresh app icons for macOS and Windows builds, looking sharper than ever 🖼️
- New opt-in global Leaderboard tracking via <a href="https://runmaestro.ai">RunMaestro.ai</a> 🚀
- Themes documentation revamped into Dark, Light, and Vibe categories 🎨
- Theme lineu…
```
```

</details>

**Condition B (pack, no companion):** ~6650 tok (6247 prompt + 403 answer)

Maestro employs JSONL (JSON Lines) for conversation logs primarily to align with the **streaming architecture** of the AI agents it manages. Because agents like Claude Code and Codex emit structured events—such as `StartEvent`, `TaskStartEvent`, and `AgentEvent`—directly to stdout, JSONL provides a machine-parseable, append-only format that can be processed in real-time (`src/cli/output/jsonl.ts`).

This approach offers several technical advantages over a traditional database:

*   **Interoperability:** Maestro acts as an orchestrator for multiple external tools. Parsing their native JSONL streams (as seen in the Codex v0.111.0 update in PR #699) is more straightforward than mapping disparate, evolving schemas to a rigid database.
*   **Real-time Efficiency:** JSONL supports efficient append-only logging, which is ideal for capturing "complex multi-tool turns" and incremental token accumulation (PR #280) without the transactional overhead of a database engine.
*   **Resilience & Filtering:** When operating over SSH (PR #794), Maestro must distinguish structured agent output from raw terminal text. JSONL allows the system to isolate valid JSON events from potentially messy stdout buffers.
*   **Lightweight Persistence:** The `HistoryApi` manages session entries through a simple filesystem-based approach (`src/main/preload/files.ts`), keeping the application's dependencies minimal. 

While some integrated agents like OpenCode v1.2+ have transitioned to SQLite, Maestro continues to prioritize JSONL for its transparency and native compatibility with CLI-driven agent workflows (PR #569).

**Condition C (pack + companion):** ~7449 tok (7097 prompt + 352 answer)

Maestro utilizes JSONL (JSON Lines) for conversation logs primarily to facilitate **real-time streaming and high-performance parsing** of structured output from the diverse CLI-based AI agents it orchestrates.

According to `src/cli/output/jsonl.ts`, the format provides "machine-parseable JSON lines" for specific lifecycle events such as `TaskStartEvent`, `AgentEvent`, and `LoopCompleteEvent`. This is particularly critical because the agents Maestro manages—such as **Claude Code** (PR #280) and **Codex** (PR #699)—emit their own activity as JSONL. By adopting this same format, Maestro can act as a "fan-in tracker" (PR #599), capturing and merging multiple concurrent stdout streams without the architectural overhead or migration complexity of a local database.

Furthermore, JSONL supports an **append-only architecture** that is more resilient to crashes than a traditional database; a truncated file still contains all previous valid lines. While some external tools like OpenCode have recently transitioned to SQLite (PR #569), Maestro’s core history API (`src/main/preload/files.ts`) maintains JSONL to ensure that logs remain human-readable, easily "grep-able," and backward-compatible with the legacy formats of the agents it controls. This approach prioritizes **interoperability and simplicity** in a multi-agent environment where child processes communicate primarily via standard output.

---

## Q4 [medium] — Why does the Layer Stack use a capture-phase event listener for the global Escape handler?

**Pack:** 583 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.97, 0.94, 0.88, 0.84, 0.79]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does the Layer Stack use a capture-phase event listener for the global Escape handler?  Budget: 6000 tokens | Used: ~5400 | 60 results (1 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/renderer/types/layer.ts::Layer` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts` **[module]** — score 0.792 | evidence: 2 episode(s)
- `src/renderer/global.d.ts` **[module]** — score 0.777 | evidence: 2 episode(s)
- `src/renderer/types/layer.ts::LayerType` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::FocusTrapMode` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::BaseLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::ModalLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::OverlayLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::ModalLayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::OverlayLayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::LayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::isModalLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::isOverlayLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::AutoRunTreeNode` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::ProcessConfig` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::AgentConfigOption` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::AgentCapabilities` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::AgentConfig` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::DirectoryEntry` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::ShellInfo` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::UsageStats` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::HistoryEntryType` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::SessionMessagesResult` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/renderer/global.d.ts::MaestroAPI` **[symbol]** — score 0.730 | evidence: 1 episode(s)
- `src/__tests__/renderer/types/layer.test.ts` **[module]** — score 0.701 | evidence: 2 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/367` **[issue]** — score 0.693 | evidence: 1 episode(s)
- `src/__tests__/renderer/types/layer.test.ts::createModalLayer` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `src/__tests__/renderer/types/layer.test.ts::createOverlayLayer` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `src/main/process-listeners/wakatime-listener.ts` **[module]** — score 0.620 | evidence: 2 episode(s)
- `src/main/process-listeners/exit-listener.ts` **[module]** — score 0.620 | evidence: 2 episode(s)
- `src/main/process-listeners` **[module]** — score 0.056 | evidence: 1 episode(s)
- `src/main/stats/query-events.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/cli/output/jsonl.ts::CliEvent` **[symbol]** — score 0.056 | evidence: 1 episode(s)
- `src/main/process-listeners/types.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/main/process-listeners/index.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/renderer/hooks/useLayerStack.ts` **[module]** — score 0.056 | evidence: 1 episode(s)
- `src/renderer/hooks/useModalLayer.ts` **[module]** — score 0.056 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::JsonlEvent` **[symbol]** — score 0.056 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::StartEvent` **[symbol]** — score 0.056 | evidence: 1 episode(s)
- `src/cli/output/jsonl.ts::ErrorEvent` **[symbol]** — score 0.056 | evidence: 1 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/renderer/types/layer.ts defines Layer **[observed]** — score 1.000
- Layer is defined in src/renderer/types/layer.ts **[observed]** — score 0.954
- src/__tests__/renderer/types/layer.test.ts imports src/renderer/types/layer.ts **[observed]** — score 0.874
- src/renderer/types/layer.ts defines LayerType **[observed]** — score 0.783
- src/renderer/types/layer.ts defines FocusTrapMode **[observed]** — score 0.783
- src/renderer/types/layer.ts defines BaseLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines ModalLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines OverlayLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines ModalLayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines OverlayLayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines LayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines isModalLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines isOverlayLayer **[observed]** — score 0.783
- LayerType is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- FocusTrapMode is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- BaseLayer is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- ModalLayer is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- OverlayLayer is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- ModalLayerInput is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- OverlayLayerInput is defined in src/renderer/types/layer.ts **[observed]** — score 0.728

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/789` (2026-04-10 by jSydorowicz21) — confidence 1.000:
```
PR #789: docs: add agent guides and CLAUDE.md anti-duplication section
URL: https://github.com/RunMaestro/Maestro/pull/789
State: closed
Author: jSydorowicz21
Created: 2026-04-10T23:53:51Z

Reference documentation for future contributors (Maestro ♥) to find existing utilities before writing duplicates.

Guides in docs/agent-guides/ (17 files, verified 2026-04-10 against rc):

- AGENT-INFRA.md: agent detection, spawning, storage, parsers
- IPC-PATTERNS.md: IPC handler registration and preload bridge
- STATE-PATTERNS.md: Zustand stores, selectors, hooks
- UI-PATTERNS.md: modal layer stack, themes, shared UI
- TEST-PATTERNS.md: test setup, mocks, integration patterns
- SHARED-UTILS.md: catalog of 36 util files with canonical exports
- RENDERER-SERVICES.md: services/ and constants/ layer
- PROCESS-SYSTEM.md: process manager, listeners, web server
- MAIN-LIFECYCLE.md: app lifecycle, updater, settings
- CLI-PLAYBOOKS.md: CLI commands and playbook service
- CUE-PIPELINE.md: Maestro Cue automation engine (triggers, config, extracted services)
- GROUP-CHAT.md: group chat and Symphony
- PROMPTS-SPECS.md: prompts, SpecKit, OpenSpec managers
- STATS-ANALYTICS.md: stats DB, usa…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/742` (2026-04-06 by reachrazamair) — confidence 0.968:
```
PR #742: cue-hardening: leak fix, panel layout, themed scrollbars + GeneralTab cleanup
URL: https://github.com/RunMaestro/Maestro/pull/742
State: closed
Author: reachrazamair
Created: 2026-04-06T20:34:53Z

## Summary

Four-commit polish pass on the Cue feature and the surrounding theme/UI surface:

1. **Group-chat → Cue leak fix.** Tightens the boundary so group-chat transcripts can no longer end up inside chained Cue pipeline output (or any other process channel).
2. **Agent config panel layout.** Fixes three collapsed-view bugs in the Cue pipeline editor: cramped multi-trigger left rail, weirdly small output box, and wasted vertical space in single-trigger mode.
3. **App-wide themed scrollbars.** Replaces the hardcoded `rgba(255,255,255,0.15)` thumb (invisible on light themes) with a unified, theme-driven scrollbar system that automatically picks up the active theme. Includes a new `<ScrollArea>` wrapper component for new call sites.
4. **GeneralTab dead code cleanup.** Drops 22 pre-existing eslint warnings left over from the Usage & Stats / WakaTime move to the Encore Features tab.

`npm run lint`, `npm run lint:eslint`, and the relevant test suites are all clean — see …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/312` (2026-02-06 by reachrazamair) — confidence 0.941:
```
PR #312: refactor: revamp state management logic. Moving from React Context API to Zustand stores ensuring SRP-Driven modules
URL: https://github.com/RunMaestro/Maestro/pull/312
State: closed
Author: reachrazamair
Created: 2026-02-06T17:00:19Z

## Summary

- Replace `ModalContext` (90+ boolean fields + setters) and `UILayoutContext` (30+ properties) with two Zustand stores: `modalStore` (registry pattern, 47 modal IDs) and `uiStore` (19 state properties, 24 actions)
- Eliminate an entire provider layer (`ModalProvider`) from the component tree — Zustand stores are global singletons, no context nesting required
- Provide a drop-in compatibility layer (`useModalActions()`) so downstream components can migrate incrementally from the old `useModalContext()` API

## Motivation

`ModalContext` had grown to 90+ individual boolean fields with corresponding setters, meaning **any** modal open/close caused re-renders in **every** consumer. `UILayoutContext` had a similar problem with 30+ layout properties. This was the single largest source of unnecessary re-renders in the renderer process.

## What changed

### New: `modalStore` (`src/renderer/stores/modalStore.ts`)
- **Registr…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/240` (2026-01-26 by reachrazamair) — confidence 0.876:
```
PR #240: refactor: extracted process listeners from main/index.ts
URL: https://github.com/RunMaestro/Maestro/pull/240
State: closed
Author: reachrazamair
Created: 2026-01-26T13:20:43Z

## Summary

Continuation of `main/index.ts` refactoring - extracts the `setupProcessListeners` function (~650 lines) into dedicated modules with dependency injection pattern.

### New Modules

| Module | Lines | Purpose |
|--------|-------|---------|
| `types.ts` | 144 | `ProcessListenerDependencies` interface and type re-exports |
| `data-listener.ts` | 102 | Process output streaming with group chat buffering |
| `exit-listener.ts` | 414 | Process exit handling with routing, recovery, synthesis |
| `session-id-listener.ts` | 77 | Agent session ID tracking for group chat |
| `usage-listener.ts` | 107 | Token/cost statistics for participants and moderator |
| `error-listener.ts` | 31 | Agent error logging and forwarding |
| `stats-listener.ts` | 50 | Query-complete events for stats database |
| `forwarding-listeners.ts` | 48 | Simple IPC forwarding (slash-commands, thinking-chunk, etc.) |
| `index.ts` | 55 | Setup orchestration and exports |

### Impact

- **main/index.ts**: 1270 →…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/823` (2026-04-13 by jSydorowicz21) — confidence 0.845:
```
PR #823: refactor: migrate to canonical shared hooks (Phase 09)
URL: https://github.com/RunMaestro/Maestro/pull/823
State: closed
Author: jSydorowicz21
Created: 2026-04-13T03:56:02Z

## Summary

Migrates a conservative subset of hook patterns to canonical shared hooks. **This phase is intentionally narrow** - most call sites had semantic subtleties that would have caused regressions if blindly replaced.

**Net: -19 lines across 4 files**

### 09A - useEventListener migrations (4 sites)

Replaced raw `addEventListener` / `removeEventListener` pairs with the canonical `useEventListener` hook from `src/renderer/hooks/utils/useEventListener.ts`:

- `src/renderer/hooks/ui/useTourActions.ts` - `tour:action` event
- `src/renderer/components/SessionList/SessionList.tsx` - `tour:action` event
- `src/renderer/hooks/session/useHandsOnTimeTracker.ts` - `beforeunload` event
- `src/renderer/components/MarketplaceModal.tsx` - `keydown` event in PlaybookDetailView

### 09A - useFocusAfterRender migrations (0 sites)

**Intentionally zero** - the canonical hook uses `useLayoutEffect` with NO dep array and re-runs every render while its `condition` is true. Replacing the common `useEffect(() => { set…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/559` (2026-03-12 by ets) — confidence 0.791:
```
PR #559: feat: group chat enhancements
URL: https://github.com/RunMaestro/Maestro/pull/559
State: closed
Author: ets
Created: 2026-03-12T16:40:49Z

## Summary

- Enhanced group chat routing with improved participant response handling, stability fixes, and better observability
- Added group chat moderator system prompt for synthesis and auto-run registry for managing group chat workflows
- Extended settings, stores, and IPC handlers to support new group chat capabilities including participant cards and right panel

## Changes

**Core group chat improvements:**
- `src/main/group-chat/group-chat-router.ts` — Major enhancements to routing logic (+321 lines)
- `src/main/ipc/handlers/groupChat.ts` — Extended IPC handlers for group chat operations
- `src/main/preload/groupChat.ts` — New preload bridge for group chat IPC
- `src/main/process-listeners/data-listener.ts` / `exit-listener.ts` — Process lifecycle improvements

**Renderer/UI:**
- `src/renderer/App.tsx` — Group chat integration into main app coordinator
- `src/renderer/components/GroupChat*.tsx` — Updated header, list, panel, participants, and right panel components
- `src/renderer/components/ParticipantCard.tsx` — Enhanced parti…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**source** `src/renderer/types/layer.ts@f47ecceceec6a3a3893a79ae9d429139` (2026-04-15):
```
/**
 * Layer Stack Type System
 *
 * This module defines the type system for the centralized layer stack management.
 * Layers represent UI elements that can capture focus and handle escape key events,
 * such as modals, overlays, search interfaces, and inline editors.
 */

/**
 * Types of layers in the UI hierarchy
 */
export type LayerType = 'modal' | 'overlay';

/**
 * Focus trap behavior modes
 * - strict: Focus must stay within the layer (Tab cycles back to first element)
 * - lenient: Focu…
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**git_commit** `5c0133ab8367b93678cc37645f06656cda7d3834` (2026-02-16 by kian.pasani@gmail.com):
```
commit 5c0133ab8367b93678cc37645f06656cda7d3834
Author: Kian <kian.pasani@gmail.com>
Date: 2026-02-16T05:36:37.000Z

feat: WakaTime integration for IDE activity tracking (#326)

* feat: add WakaTime integration settings UI to General tab

Add WakaTime API key and enable/disable toggle to the Settings modal
General tab with Beta badge. Settings are persisted via electron-store
following existing pa…
```

**source** `src/renderer/global.d.ts@3359f4714eb13260f66cc420feaa4f9a67e` (2026-04-15):
```
/**
 * Global type declarations for the renderer process.
 * This file makes the window.maestro API available throughout the renderer.
 */

// Vite raw imports for .md files
declare module '*.md?raw' {
	const content: string;
	export default content;
}

type AutoRunTreeNode = {
	name: string;
	type: 'file' | 'folder';
	path: string;
	children?: AutoRunTreeNode[];
};

interface ProcessConfig {
	sessionId: string;
	toolType: string;
	cwd: string;
	command: string;
	args: string[];
	prompt?: string…
```

**source** `src/__tests__/renderer/types/layer.test.ts@926906c41f16a00da` (2026-04-15):
```
/**
 * Tests for Layer type system utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
	isModalLayer,
	isOverlayLayer,
	Layer,
	ModalLayer,
	OverlayLayer,
} from '../../../renderer/types/layer';

function createModalLayer(overrides: Partial<ModalLayer> = {}): ModalLayer {
	return {
		id: 'test-modal',
		type: 'modal',
		priority: 100,
		blocksLowerLayers: true,
		capturesFocus: true,
		focusTrap: 'strict',
		onEscape: vi.fn(),
		...overrides,
	};
}

function createOverlayL…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/367` (2026-02-14 by pedramamini):
```
Issue #367: feat: Maestro Cue — Event-Driven Agent Automation
URL: https://github.com/RunMaestro/Maestro/issues/367
State: open
Author: pedramamini
Created: 2026-02-14T23:12:56Z

## Maestro Cue

**The conductor gives the cue — the agents respond.**

Maestro Cue is an event-driven automation system that lets users define triggers that automatically execute prompts against their AI agents. Think of it as cron for AI agents, with multi-agent orchestration built in.

Inspired by [Sentinel](https://g…
```

**source** `src/main/process-listeners/wakatime-listener.ts@1037d938f8aa` (2026-04-15):
```
/**
 * WakaTime heartbeat listener.
 * Sends WakaTime heartbeats on AI activity (data, thinking-chunk events) and batch
 * query completions. Cleans up debounce tracking on process exit.
 *
 * The `data` event fires on every stdout chunk for both interactive and batch sessions.
 * The `thinking-chunk` event fires while the AI is actively reasoning (extended thinking).
 * Together these ensure heartbeats cover the full duration of AI activity.
 * The `query-complete` event fires only for batch/au…
```

**git_commit** `748e12bbfcfbd971ecabb0a8c1dee97f153509c8` (2026-02-12 by pedram.amini@gmail.com):
```
commit 748e12bbfcfbd971ecabb0a8c1dee97f153509c8
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-12T07:41:34.000Z

fix: use format-agnostic regex for AI tab ID matching

Follow-up to #337. Replace UUID-specific regex with generic /-ai-.+$/
pattern that supports any tab ID format (UUIDs, nanoids, simple strings).
Also fix ProcessMonitor.tsx parseTabId and update all missed test files.

F…
```

**source** `src/main/process-listeners/exit-listener.ts@19627fec140943ba` (2026-04-15):
```
/**
 * Process exit listener.
 * Handles process exit events, including group chat moderator/participant exits.
 * This is the largest and most complex listener with routing, recovery, and synthesis logic.
 */

import type { ProcessManager } from '../process-manager';
import { GROUP_CHAT_PREFIX, type ProcessListenerDependencies } from './types';

/**
 * Sets up the exit listener for process termination.
 * Handles:
 * - Power management cleanup
 * - Group chat moderator exit (routing buffered ou…
```

**source** `src/main/process-listeners/stats-listener.ts@d473cf139452af7` (2026-04-15):
```
/**
 * Stats listener.
 * Handles query-complete events for usage statistics tracking.
 */

import type { ProcessManager } from '../process-manager';
import type { QueryCompleteData } from '../process-manager/types';
import type { ProcessListenerDependencies } from './types';

/**
 * Maximum number of retry attempts for transient database failures.
 */
const MAX_RETRY_ATTEMPTS = 3;

/**
 * Base delay in milliseconds for exponential backoff (doubles each retry).
 */
const RETRY_BASE_DELAY_MS = 10…
```

**git_commit** `dbcbda1324927db1a87c0e7fbc7c76e6dcb7e5a0` (2026-01-30 by reachrazarauf@gmail.com):
```
commit dbcbda1324927db1a87c0e7fbc7c76e6dcb7e5a0
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-30T15:10:56.000Z

refactor: decompose stats-db into focused modules

Break the 1,870-line monolithic stats-db.ts into 13 focused modules under
src/main/stats/, following the same pattern used in the agents module refactor.

Key improvements:
- StatementCache for prepared statement reuse across…
```

**source** `src/main/stats/query-events.ts@2a17173cb77a2f8d910ee688e2b59` (2026-04-15):
```
/**
 * Query Event CRUD Operations
 *
 * Handles insertion and retrieval of individual AI query/response cycle records.
 */

import type Database from 'better-sqlite3';
import type { QueryEvent, StatsTimeRange, StatsFilters } from '../../shared/stats-types';
import { generateId, getTimeRangeStart, normalizePath, LOG_CONTEXT } from './utils';
import { mapQueryEventRow, type QueryEventRow } from './row-mappers';
import { StatementCache } from './utils';
import { logger } from '../utils/logger';

c…
```

**source** `src/cli/output/jsonl.ts@d5edad5dc5ea972da75dce619f06546176f0` (2026-04-15):
```
// JSONL output helper for CLI
// Outputs machine-parseable JSON lines to stdout

import type { UsageStats } from '../../shared/types';

// Base event interface - all events have a type and timestamp
export interface JsonlEvent {
	type: string;
	timestamp: number;
	[key: string]: unknown;
}

// Event types for playbook execution
export interface StartEvent extends JsonlEvent {
	type: 'start';
	playbook: {
		id: string;
		name: string;
	};
	session: {
		id: string;
		name: string;
		cwd: string;
…
```

**git_commit** `846e759f282723b7b672de85a3ce8c0ae21611cf` (2026-02-07 by pedram.amini@gmail.com):
```
commit 846e759f282723b7b672de85a3ce8c0ae21611cf
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-07T04:23:56.000Z

group chat recovery, SSH history guard, and tour shortcut fix

- Add session recovery messaging and infinite-loop prevention for group
  chat participant respawns (exit-listener, session-parser, types)
- Suppress session_not_found errors in group chat UI when recovery is
  …
```

**source** `src/main/process-listeners/types.ts@e772d5316a7f5ba0d76cb5b5` (2026-04-15):
```
/**
 * Type definitions for process event listeners.
 * Re-exports existing types and defines the dependency interface.
 */

import type { ProcessManager } from '../process-manager';
import type { WebServer } from '../web-server';
import type { AgentDetector } from '../agents';
import type { SafeSendFn } from '../utils/safe-send';
import type { StatsDB } from '../stats';
import type { GroupChat, GroupChatParticipant } from '../group-chat/group-chat-storage';
import type { GroupChatMessage, Group…
```

**git_commit** `9ddc95ae7a32ad05b59087ec5c014008c6ba134d` (2026-01-26 by reachrazarauf@gmail.com):
```
commit 9ddc95ae7a32ad05b59087ec5c014008c6ba134d
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-26T12:51:42.000Z

refactor: extracted process listeners from main/index.ts

- types.ts: ProcessListenerDependencies interface and type re-exports.
- data-listener.ts: Process output streaming with group chat buffering.
- exit-listener.ts: Process exit handling with routing, recovery, synthesis…
```

**source** `src/main/process-listeners/index.ts@6ba5bef5863e1494b7421bb8` (2026-04-15):
```
/**
 * Process event listeners module.
 * Handles all events emitted by ProcessManager and routes them appropriately.
 *
 * This module extracts the setupProcessListeners() logic from main/index.ts
 * into smaller, focused modules for better maintainability.
 */

import type { ProcessManager } from '../process-manager';
import type { ProcessListenerDependencies } from './types';

// Import individual listener setup functions
import { setupForwardingListeners } from './forwarding-listeners';
impo…
```

**git_commit** `df472e36d5a85bf96795839f83c8ca624029ae36` (2025-12-20 by pedram.amini@gmail.com):
```
commit df472e36d5a85bf96795839f83c8ca624029ae36
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-20T14:41:11.000Z

MAESTRO: fix theme and layer type consistency

- Add accentForeground to web ThemeProvider defaults and CSS custom properties
- Fix invalid theme property references (yellow→warning, bgHover→accentDim, info→accentText)
- Convert ringColor to --tw-ring-color CSS custom prope…
```

**git_commit** `242ce8cf3817f00bcd59f7575f32476996f78150` (2025-12-16 by pedram.amini@gmail.com):
```
commit 242ce8cf3817f00bcd59f7575f32476996f78150
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-16T08:06:47.000Z

MAESTRO: Add useModalLayer hook for modal layer stack registration deduplication

Create a reusable hook that encapsulates the common pattern of registering
modals with the centralized layer stack. This addresses the first task in
the code deduplication roadmap (Phase 1: Cr…
```
```

</details>

**Condition B (pack, no companion):** ~6737 tok (6315 prompt + 422 answer)

The Maestro codebase uses a capture-phase event listener for the global Escape handler in the **`LayerStackProvider`** (defined in `src/renderer/contexts/LayerStackContext.tsx`) to ensure the centralized **Layer Stack** maintains absolute authority over keyboard event delegation.

This architectural choice serves several critical functions:

1.  **Event Pre-emption**: By listening in the capture phase, the Layer Stack intercepts the `Escape` key event before it reaches child components. This prevents individual UI elements (like text inputs, dropdowns, or search bars) from "swallowing" the event via `e.stopPropagation()`, which would otherwise prevent the global system from closing the active modal.
2.  **Priority-Based Dispatch**: Unlike standard DOM bubbling, which follows the nesting structure, the Layer Stack uses explicit priorities (defined in `src/renderer/constants/modalPriorities.ts`) to determine which layer is truly "top." Intercepting early allows the provider to check `stack.getTopLayer()` and delegate the event to the highest-priority handler, regardless of where the focus is currently held in the DOM.
3.  **Strict Control & Consistency**: When a layer is active, the handler calls `e.preventDefault()` and `e.stopPropagation()` immediately. This ensures that the Escape key consistently performs exactly one action—closing the topmost registered layer—and doesn't leak through to trigger background shortcuts or blur elements unintentionally.

This pattern is essential for Maestro’s complex, multi-layered UI, where critical confirmations (priority 1000+) must take precedence over standard settings (priority 450) or autocomplete overlays (priority 50).

**Condition C (pack + companion):** ~7938 tok (7165 prompt + 773 answer)

I will search for the implementation of the `Escape` key handler in the `useLayerStack.ts` hook to understand its use of the capture phase.

I will read the `src/renderer/contexts/LayerStackContext.tsx` file to understand the rationale behind using the capture phase for the `Escape` key handler.

I will check the `ARCHITECTURE.md` file to see if there is any additional explanation for why the `Escape` key handler uses the capture phase.

I will read the `src/renderer/hooks/useLayerStack.ts` file to see how layers are managed and if there's any additional context for the capture-phase `Escape` handler.

I will list the contents of the `src/renderer/hooks/` directory to find the correct path for the `useLayerStack` hook.

I will read the `src/renderer/hooks/index.ts` file to determine the correct export location for the `useLayerStack` hook.

I will check the `src/renderer/hooks/ui/` directory to see if `useLayerStack.ts` is located there.

I will read the `src/renderer/hooks/ui/useLayerStack.ts` file to see if there is any information about the use of the capture phase in the `Escape` key handler.

I will read the `src/__tests__/renderer/components/AutoRunSetupModal.test.tsx` file around line 878 to see the full comment regarding the capture-phase `Escape` handler.

The Layer Stack in Maestro uses a **capture-phase event listener** for its global `Escape` handler (registered on the `window`) to ensure the centralized management system has absolute precedence over any other component in the UI. 

As detailed in `src/renderer/contexts/LayerStackContext.tsx` and the `ARCHITECTURE.md`, this design choice addresses several key architectural requirements:

1.  **Guaranteed Interception:** By using the capture phase, the `LayerStack` intercepts the `Escape` key event before it reaches any target elements (like focused input fields or nested components) that might have their own listeners. This prevents child components from "stealing" the event or performing conflicting actions (e.g., an input clearing itself while a modal is trying to close).
2.  **Strict Stop-Propagation:** Once the `LayerStack` identifies a valid top layer to close, it calls `e.stopPropagation()` and `e.preventDefault()`. Because this happens in the capture phase at the root (`window`), the event is "consumed" before it can ever enter the bubbling phase, ensuring that parent components (which might also be listening for global keys) do not receive the event.
3.  **Predictable Priority:** Maestro manages multiple layers (modals, overlays, search results) using a priority-sorted stack (`src/renderer/hooks/ui/useLayerStack.ts`). The capture-phase handler ensures that the global manager can always enforce this priority, closing exactly one layer (the topmost) per `Escape` press regardless of where focus currently resides.
4.  **Consolidation:** This replaces what was previously "9+ scattered Escape handlers" with a single, predictable point of control, solving the brittle modal detection and inconsistent focus management issues noted in the project's architecture documentation.

---

## Q5 [medium] — Why does the Layer Stack use explicit priority numbers rather than LIFO (last-in, first-out) ordering?

**Pack:** 466 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.87, 0.81, 0.79, 0.78, 0.78]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does the Layer Stack use explicit priority numbers rather than LIFO (last-in, first-out) ordering?  Budget: 6000 tokens | Used: ~4435 | 44 results (1 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/renderer/types/layer.ts::Layer` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts` **[module]** — score 0.792 | evidence: 2 episode(s)
- `src/renderer/types/layer.ts::LayerType` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::FocusTrapMode` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::BaseLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::ModalLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::OverlayLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::ModalLayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::OverlayLayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::LayerInput` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::isModalLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/types/layer.ts::isOverlayLayer` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/__tests__/renderer/types/layer.test.ts` **[module]** — score 0.701 | evidence: 2 episode(s)
- `src/__tests__/renderer/types/layer.test.ts::createModalLayer` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `src/__tests__/renderer/types/layer.test.ts::createOverlayLayer` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/625` **[issue]** — score 0.429 | evidence: 1 episode(s)
- `src/renderer/hooks/useLayerStack.ts` **[module]** — score 0.056 | evidence: 1 episode(s)
- `src/renderer/hooks/useModalLayer.ts` **[module]** — score 0.056 | evidence: 1 episode(s)
- `src/renderer/hooks/ui/useLayerStack.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/renderer/hooks/ui/useModalLayer.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/web/utils/logger.ts::levelPriority` **[symbol]** — score 0.056 | evidence: 1 episode(s)
- `src/shared/formatters.ts::formatNumber` **[symbol]** — score 0.056 | evidence: 1 episode(s)
- `src/renderer/constants/modalPriorities.ts` **[module]** — score 0.056 | evidence: 2 episode(s)
- `src/renderer/contexts/LayerStackContext.tsx` **[module]** — score 0.056 | evidence: 2 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/renderer/types/layer.ts defines Layer **[observed]** — score 1.000
- src/shared/logger-types.ts defines LOG_LEVEL_PRIORITY **[observed]** — score 0.965
- src/renderer/components/LogViewer.tsx defines LOG_LEVEL_PRIORITY **[observed]** — score 0.965
- Layer is defined in src/renderer/types/layer.ts **[observed]** — score 0.954
- LOG_LEVEL_PRIORITY is defined in src/shared/logger-types.ts **[observed]** — score 0.902
- LOG_LEVEL_PRIORITY is defined in src/renderer/components/LogViewer.tsx **[observed]** — score 0.902
- src/__tests__/renderer/types/layer.test.ts imports src/renderer/types/layer.ts **[observed]** — score 0.874
- src/renderer/types/layer.ts defines LayerType **[observed]** — score 0.783
- src/renderer/types/layer.ts defines FocusTrapMode **[observed]** — score 0.783
- src/renderer/types/layer.ts defines BaseLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines ModalLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines OverlayLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines ModalLayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines OverlayLayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines LayerInput **[observed]** — score 0.783
- src/renderer/types/layer.ts defines isModalLayer **[observed]** — score 0.783
- src/renderer/types/layer.ts defines isOverlayLayer **[observed]** — score 0.783
- LayerType is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- FocusTrapMode is defined in src/renderer/types/layer.ts **[observed]** — score 0.728
- BaseLayer is defined in src/renderer/types/layer.ts **[observed]** — score 0.728

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/207` (2026-01-18 by ksylvan) — confidence 1.000:
```
PR #207: feat: Add safety friction to Confirm and Erase
URL: https://github.com/RunMaestro/Maestro/pull/207
State: closed
Author: ksylvan
Created: 2026-01-18T21:01:51Z

## Summary

This PR adds safety friction to the "Confirm and Erase" functionality to prevent accidental directory deletion, addressing the concerns in #206.

**Three safety measures implemented:**

1. **High-contrast warning text** - The warning in the Delete Agent modal now uses error-colored text (red/high contrast) to make it impossible to miss the directory deletion notice

2. **Two-step confirmation flow** - Clicking "Confirm and Erase" now opens a secondary confirmation modal instead of immediately deleting

3. **Type-to-confirm pattern** - Users must type the exact session name to enable the final "Yes, Erase Directory" button, similar to GitHub's dangerous action confirmations

## Implementation Details

- New `EraseConfirmationModal` component with:
  - Visual warning with directory path display
  - Case-sensitive name matching
  - Disabled button state until name matches
  - Proper layer stack integration (priority 1005, above main confirmation modal)
  - Focus management for accessibility

- Updated `Dele…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/789` (2026-04-10 by jSydorowicz21) — confidence 0.874:
```
PR #789: docs: add agent guides and CLAUDE.md anti-duplication section
URL: https://github.com/RunMaestro/Maestro/pull/789
State: closed
Author: jSydorowicz21
Created: 2026-04-10T23:53:51Z

Reference documentation for future contributors (Maestro ♥) to find existing utilities before writing duplicates.

Guides in docs/agent-guides/ (17 files, verified 2026-04-10 against rc):

- AGENT-INFRA.md: agent detection, spawning, storage, parsers
- IPC-PATTERNS.md: IPC handler registration and preload bridge
- STATE-PATTERNS.md: Zustand stores, selectors, hooks
- UI-PATTERNS.md: modal layer stack, themes, shared UI
- TEST-PATTERNS.md: test setup, mocks, integration patterns
- SHARED-UTILS.md: catalog of 36 util files with canonical exports
- RENDERER-SERVICES.md: services/ and constants/ layer
- PROCESS-SYSTEM.md: process manager, listeners, web server
- MAIN-LIFECYCLE.md: app lifecycle, updater, settings
- CLI-PLAYBOOKS.md: CLI commands and playbook service
- CUE-PIPELINE.md: Maestro Cue automation engine (triggers, config, extracted services)
- GROUP-CHAT.md: group chat and Symphony
- PROMPTS-SPECS.md: prompts, SpecKit, OpenSpec managers
- STATS-ANALYTICS.md: stats DB, usa…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/502` (2026-03-03 by reachrazamair) — confidence 0.815:
```
PR #502: refactor: decompose SettingsModal and SessionList components
URL: https://github.com/RunMaestro/Maestro/pull/502
State: closed
Author: reachrazamair
Created: 2026-03-03T02:16:35Z

Extract 6 components from the monolithic SettingsModal.tsx (3,649 → 601 lines, −84%):

- EnvVarsEditor: environment variable editing sub-component (219 lines)
- GeneralTab: shell, input, toggles, WakaTime, sync/stats (1,530 lines)
- DisplayTab: fonts, terminal width, log buffer, alignment (558 lines)
- EncoreTab: feature flags, Director's Notes agent config (509 lines)
- ShortcutsTab: shortcut recording, filtering, escape coordination (215 lines)
- ThemeTab: theme selection, grouping, keyboard navigation (162 lines)

Each tab self-sources settings via useSettings() and owns its local state. SettingsModal.tsx retains modal chrome, tab bar, layer stack, and tab routing.

308 new tests across 6 test files; 416 total Settings tests passing.

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **New Features**
  * Redesigned Settings modal with tabbed sections: General, Display, Encore (Director's Notes), Shortcuts, and Theme.
  * Added Env…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/742` (2026-04-06 by reachrazamair) — confidence 0.789:
```
PR #742: cue-hardening: leak fix, panel layout, themed scrollbars + GeneralTab cleanup
URL: https://github.com/RunMaestro/Maestro/pull/742
State: closed
Author: reachrazamair
Created: 2026-04-06T20:34:53Z

## Summary

Four-commit polish pass on the Cue feature and the surrounding theme/UI surface:

1. **Group-chat → Cue leak fix.** Tightens the boundary so group-chat transcripts can no longer end up inside chained Cue pipeline output (or any other process channel).
2. **Agent config panel layout.** Fixes three collapsed-view bugs in the Cue pipeline editor: cramped multi-trigger left rail, weirdly small output box, and wasted vertical space in single-trigger mode.
3. **App-wide themed scrollbars.** Replaces the hardcoded `rgba(255,255,255,0.15)` thumb (invisible on light themes) with a unified, theme-driven scrollbar system that automatically picks up the active theme. Includes a new `<ScrollArea>` wrapper component for new call sites.
4. **GeneralTab dead code cleanup.** Drops 22 pre-existing eslint warnings left over from the Usage & Stats / WakaTime move to the Encore Features tab.

`npm run lint`, `npm run lint:eslint`, and the relevant test suites are all clean — see …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/364` (2026-02-13 by pedramamini) — confidence 0.783:
```
PR #364: feat: CSV table rendering + fix: group chat write race & SSH spawn
URL: https://github.com/RunMaestro/Maestro/pull/364
State: closed
Author: pedramamini
Created: 2026-02-13T01:10:32Z

## Summary
- CSV and TSV files now render as themed, sortable tables instead of plain text in file preview
- New `CsvTableRenderer` component with RFC-compliant CSV parsing, numeric column detection, click-to-sort headers, and row truncation
- Edit mode toggle falls through to raw text editor for direct CSV editing
- **Fix:** Serialize concurrent writes to group chat `metadata.json` to prevent file corruption from racing listeners
- **Fix:** Add SSH wrapping for group chat participant spawns (user-mention auto-add + recovery respawn)
- **Fix:** Group chat history panel layout — filter pills, activity graph, and entries now stack vertically instead of being squeezed into a single row

## Group Chat History Panel Layout
The filter pills and activity graph were crammed into a single flex row, causing the graph to be too narrow. Refactored to three distinct vertical sections:
1. **Filter pills** — centered horizontally
2. **Activity graph** — full-width on its own row
3. **History entries** — scr…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/750` (2026-04-07 by reachrazamair) — confidence 0.782:
```
PR #750:  refactor(cue): split shared contracts, config boundaries, and runtime orchestration
URL: https://github.com/RunMaestro/Maestro/pull/750
State: closed
Author: reachrazamair
Created: 2026-04-07T23:55:25Z

 ## Summary

  This PR continues the Cue refactor with a strict behavior-preserving goal.

  It reorganizes Cue in three architectural steps:

  1. Unify shared Cue contracts across main, preload, and renderer
  2. Split Cue config loading into distinct repository / normalization / validation concerns
  3. Decompose `CueEngine` runtime orchestration into focused services while keeping `CueEngine` as the public facade

  The intent is to reduce responsibility overlap in Cue without changing:
  - YAML semantics
  - IPC channel names
  - preload API shape
  - renderer behavior
  - runtime execution behavior

  ## Commit Stack

  ### 1. `40029853` `refactor(cue): extract shared contracts and config boundaries`

  Introduces a shared Cue contract layer and moves Cue config responsibilities behind stable facades.

  Included changes:
  - added shared Cue contracts under `src/shared/cue/`
  - converted `src/main/cue/cue-types.ts` into a compatibility faca…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**source** `src/renderer/types/layer.ts@f47ecceceec6a3a3893a79ae9d429139` (2026-04-15):
```
/**
 * Layer Stack Type System
 *
 * This module defines the type system for the centralized layer stack management.
 * Layers represent UI elements that can capture focus and handle escape key events,
 * such as modals, overlays, search interfaces, and inline editors.
 */

/**
 * Types of layers in the UI hierarchy
 */
export type LayerType = 'modal' | 'overlay';

/**
 * Focus trap behavior modes
 * - strict: Focus must stay within the layer (Tab cycles back to first element)
 * - lenient: Focu…
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**source** `src/__tests__/renderer/types/layer.test.ts@926906c41f16a00da` (2026-04-15):
```
/**
 * Tests for Layer type system utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
	isModalLayer,
	isOverlayLayer,
	Layer,
	ModalLayer,
	OverlayLayer,
} from '../../../renderer/types/layer';

function createModalLayer(overrides: Partial<ModalLayer> = {}): ModalLayer {
	return {
		id: 'test-modal',
		type: 'modal',
		priority: 100,
		blocksLowerLayers: true,
		capturesFocus: true,
		focusTrap: 'strict',
		onEscape: vi.fn(),
		...overrides,
	};
}

function createOverlayL…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/625` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #625: [Mobile App] Epic: HTTP/WebSocket API Layer for React Native App
URL: https://github.com/RunMaestro/Maestro/issues/625
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:27:07Z

## Overview

This epic tracks the creation of HTTP/WebSocket API endpoints needed to support a **React Native mobile app** that serves as a remote control for the desktop Maestro application. The mobile app will have feature parity with the existing mobile web view but as a native app.

## Current Sta…
```

**git_commit** `df472e36d5a85bf96795839f83c8ca624029ae36` (2025-12-20 by pedram.amini@gmail.com):
```
commit df472e36d5a85bf96795839f83c8ca624029ae36
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-20T14:41:11.000Z

MAESTRO: fix theme and layer type consistency

- Add accentForeground to web ThemeProvider defaults and CSS custom properties
- Fix invalid theme property references (yellow→warning, bgHover→accentDim, info→accentText)
- Convert ringColor to --tw-ring-color CSS custom prope…
```

**git_commit** `242ce8cf3817f00bcd59f7575f32476996f78150` (2025-12-16 by pedram.amini@gmail.com):
```
commit 242ce8cf3817f00bcd59f7575f32476996f78150
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-16T08:06:47.000Z

MAESTRO: Add useModalLayer hook for modal layer stack registration deduplication

Create a reusable hook that encapsulates the common pattern of registering
modals with the centralized layer stack. This addresses the first task in
the code deduplication roadmap (Phase 1: Cr…
```

**source** `src/renderer/hooks/ui/useLayerStack.ts@39eaa67e9e795a002f64e` (2026-04-15):
```
/**
 * Layer Stack Management Hook
 *
 * This hook provides the core layer stack management functionality:
 * - Register/unregister layers dynamically
 * - Maintain priority-sorted stack
 * - Handle Escape key delegation to top layer
 * - Update handlers without re-registration (performance optimization)
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Layer, LayerInput } from '../../types/layer';

/**
 * Extend Window interface for debug API
 */
declare global {
	…
```

**source** `src/renderer/hooks/ui/useModalLayer.ts@149448f1f1b23ac99f760` (2026-04-15):
```
/**
 * useModalLayer - Reusable hook for modal layer stack registration
 *
 * This hook encapsulates the common pattern of registering a modal with the
 * centralized layer stack. It handles:
 * - Layer registration on mount
 * - Layer unregistration on unmount
 * - Handler updates when the escape callback changes
 *
 * Usage:
 * ```tsx
 * function MyModal({ onClose }: { onClose: () => void }) {
 *   useModalLayer(MODAL_PRIORITIES.MY_MODAL, 'My Modal', onClose);
 *
 *   return <div>...</div>;
 *…
```

**source** `src/web/utils/logger.ts@9ca0e4f17d16508c98d860a16b9c18fa2a4e` (2026-04-15):
```
/**
 * Web Logger Utility
 *
 * Provides structured logging for the web interface (PWA).
 * All logs are prefixed with [WebUI] to distinguish them from main process logs.
 *
 * Log levels:
 * - debug: Detailed debugging information (disabled by default)
 * - info: General informational messages
 * - warn: Warning conditions that should be noted
 * - error: Error conditions that need attention
 *
 * Usage:
 *   import { webLogger } from '../utils/logger';
 *   webLogger.info('Connected to server'…
```

**source** `src/shared/formatters.ts@935ee4cfe353ffc6d0565135aafea3bb64e` (2026-04-15):
```
/**
 * Shared formatting utilities for displaying numbers, sizes, times, and tokens.
 * These pure functions are used by both renderer (desktop) and web (mobile) code.
 *
 * Functions:
 * - formatSize: File sizes (B, KB, MB, GB, TB)
 * - formatNumber: Large numbers with k/M/B suffixes
 * - formatTokens: Token counts with K/M/B suffixes (~prefix)
 * - formatTokensCompact: Token counts without ~prefix
 * - formatRelativeTime: Relative timestamps ("5m ago", "2h ago")
 * - formatActiveTime: Duration…
```

**git_commit** `e109e96a4e055d62101b4d88ff8356225d6bf541` (2026-02-05 by kian.pasani@gmail.com):
```
commit e109e96a4e055d62101b4d88ff8356225d6bf541
Author: Kian <kian.pasani@gmail.com>
Date: 2026-02-05T22:59:23.000Z

MAESTRO: Add DirectorNotesModal shell with tab switching between Unified History and AI Overview

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>

Files:
src/renderer/components/DirectorNotes/AIOverviewTab.tsx
src/renderer/components/DirectorNotes/DirectorNotesModal.tsx
src/…
```

**source** `src/renderer/constants/modalPriorities.ts@aef1e038b8fd78be17` (2026-04-15):
```
/**
 * Modal Priority Constants
 *
 * Defines the priority/z-index values for all modals and overlays in the application.
 * Higher values appear on top. The layer stack system uses these priorities to determine
 * which layer should handle the Escape key and which layer should be visually on top.
 *
 * Priority Ranges:
 * - 1000+: Critical modals (confirmations)
 * - 900-999: High priority modals (rename, create)
 * - 700-899: Standard modals (new instance, quick actions)
 * - 400-699: Settings…
```

**source** `src/renderer/contexts/LayerStackContext.tsx@7c3664e348bac96a` (2026-04-15):
```
import React, { createContext, useContext, useEffect, ReactNode } from 'react';
import { useLayerStack as useLayerStackHook, type LayerStackAPI } from '../hooks';

// Create context with null as default (will throw if used outside provider)
const LayerStackContext = createContext<LayerStackAPI | null>(null);

interface LayerStackProviderProps {
	children: ReactNode;
}

/**
 * LayerStackProvider - Provides global layer stack management and Escape handling
 *
 * This provider creates a centralized…
```
```

</details>

**Condition B (pack, no companion):** ~5602 tok (5145 prompt + 457 answer)

I will read the `src/renderer/constants/modalPriorities.ts` and `src/renderer/types/layer.ts` files to understand the rationale for using explicit priority numbers in the Layer Stack.
The Maestro Layer Stack uses **explicit priority numbers** rather than a simple LIFO (last-in, first-out) system to ensure a **deterministic semantic hierarchy** across the application's complex UI.

As defined in `src/renderer/constants/modalPriorities.ts`, the system enforces specific ranges that guarantee critical UI elements always remain on top, regardless of their opening sequence:

*   **Critical Actions:** Modals like `QUIT_CONFIRM` (1020) and `AGENT_ERROR` (1010) must always block lower-priority interaction, preventing them from being obscured by async events or background notifications.
*   **Nested Modal Logic:** Many features involve "stacked" interactions where one modal opens another. For example, the `MARKETPLACE` (735) often opens from the `BATCH_RUNNER` (720). Explicit priorities ensure the Marketplace remains visually and functionally above its parent, even if state re-renders or concurrent updates occur.
*   **Event Delegation:** The Layer Stack uses these priorities to determine which layer captures the **Escape key**. If multiple layers are active (e.g., a search bar inside a settings modal), the explicit priority ensures the "top-most" logical layer handles the event first.
*   **Global Overlays:** High-priority "celebrations" (e.g., `STANDING_OVATION` at 1100) are designed to overlay the entire UI, including active modals, which a strict LIFO approach would struggle to manage if those modals were opened after the celebration was triggered.

By using a priority-sorted stack, Maestro avoids race conditions where temporal ordering might conflict with the intended visual and functional hierarchy.

**Condition C (pack + companion):** ~6351 tok (5996 prompt + 355 answer)

Maestro's Layer Stack uses explicit priority numbers rather than LIFO ordering to ensure a deterministic UI hierarchy that remains independent of component mount order. This approach prevents race conditions in Maestro’s highly asynchronous environment, where a late-triggering notification or background overlay could otherwise obscure a critical modal or incorrectly hijack focus.

As documented in `src/renderer/constants/modalPriorities.ts`, the system enforces a functional hierarchy through predefined priority ranges. For instance, **Critical modals** (1000+) always trump **Settings** (400–699) or **Standard modals**. This is essential for nested interaction patterns; **PR #207** ("Add safety friction to Confirm and Erase") demonstrates this by assigning the `EraseConfirmationModal` a priority of **1005**. This ensures it stays on top of the main deletion modal, a guarantee that LIFO cannot provide without fragile coordination of mounting sequences.

Beyond visual stacking, `src/renderer/hooks/ui/useLayerStack.ts` uses the priority-sorted stack to manage **Escape key delegation**. By delegating the event to the highest-priority layer, Maestro ensures that "safety friction" layers or critical confirmations are addressed before lower-level UI elements. This design centralizes focus management and keyboard handling, providing a predictable UX across the application’s complex multi-agent workflows.

---

## Q6 [medium] — Why does the process manager use PTY instead of child_process.spawn for AI agents?

**Pack:** 663 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.93, 0.92, 0.89, 0.89, 0.85])

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does the process manager use PTY instead of child_process.spawn for AI agents?  Budget: 6000 tokens | Used: ~5925 | 21 results (40 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/main/process-manager` **[module]** — score 1.000 | evidence: 1 episode(s)
- `src/main/process-manager.ts` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/main/process-manager/spawners` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/main/process-manager/utils` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/main/process-manager/handlers` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/main/process-manager/runners` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/__tests__/main/process-manager` **[module]** — score 0.935 | evidence: 1 episode(s)
- `src/main/process-manager/ProcessManager.ts` **[module]** — score 0.878 | evidence: 2 episode(s)
- `src/main/process-manager/types.ts` **[module]** — score 0.878 | evidence: 2 episode(s)
- `src/main/process-manager/constants.ts` **[module]** — score 0.878 | evidence: 2 episode(s)
- `src/main/process-manager/index.ts` **[module]** — score 0.878 | evidence: 2 episode(s)
- `src/__tests__/main/process-manager/spawners` **[module]** — score 0.878 | evidence: 1 episode(s)
- `src/__tests__/main/process-manager/utils` **[module]** — score 0.878 | evidence: 1 episode(s)
- `src/__tests__/main/process-manager/handlers` **[module]** — score 0.878 | evidence: 1 episode(s)
- `src/main/process-manager/handlers/StdoutHandler.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/spawners/ChildProcessSpawner.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/utils/imageUtils.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/handlers/ExitHandler.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/utils/envBuilder.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/utils/shellEscape.ts` **[module]** — score 0.827 | evidence: 2 episode(s)
- `src/main/process-manager/utils/index.ts` **[module]** — score 0.827 | evidence: 2 episode(s)

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/200` (2026-01-16 by reachrazamair) — confidence 1.000:
```
PR #200: refactor: src/main/process-manager.ts from monolithic file to modular scalable directory structure
URL: https://github.com/RunMaestro/Maestro/pull/200
State: closed
Author: reachrazamair
Created: 2026-01-16T22:53:01Z

## Summary

- Refactored the 2,520-line `process-manager.ts` monolith into a well-organized directory structure.
- Follows single-responsibility principle with dedicated modules for each concern.
- Maintains 100% backwards compatibility through barrel exports.

## Changes

**New directory structure:**

src/main/process-manager/
├── index.ts                    # Public API exports
├── types.ts                    # Type definitions
├── ProcessManager.ts           # Main orchestrator class
├── spawners/
│   ├── PtySpawner.ts          # PTY process spawning (terminal mode)
│   └── ChildProcessSpawner.ts # Child process spawning (AI agents)
├── handlers/
│   ├── DataBufferManager.ts   # Data buffering for IPC optimization
│   ├── StdoutHandler.ts       # stdout processing & parsing
│   ├── StderrHandler.ts       # stderr processing & error detection
│   └── ExitHandler.ts         # Process exit handling & cleanup
├── runners/
│   ├── LocalCo…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/111` (2025-12-28 by pedramamini) — confidence 0.928:
```
PR #111: feat: SSH Remote Execution for AI Agents
URL: https://github.com/RunMaestro/Maestro/pull/111
State: closed
Author: pedramamini
Created: 2025-12-28T14:35:30Z

## Summary

Add the ability to run AI agents on remote hosts via SSH, enabling users to leverage powerful cloud VMs, access tools not installed locally, or work with projects requiring specific environments.

### Key Features

- **SSH Remote Management**: Configure multiple SSH remote hosts with customizable settings (host, port, username, private key, working directory, environment variables)
- **Connection Testing**: Validate SSH connectivity and agent availability before use
- **Global Default**: Set a default SSH remote that applies to all agents
- **Per-Agent Override**: Individual agents can use specific remotes or force local execution
- **Status Visibility**: Sessions display which remote host they're running on
- **Error Detection**: SSH-specific error patterns for authentication failures, connection issues, and agent errors

### Implementation Phases

1. **Phase 1**: Core types and shell-escape utility
2. **Phase 2**: SshRemoteManager with validation and connection testing  
3. **Phase 3**: IPC handlers and …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/535` (2026-03-08 by chr1syy) — confidence 0.921:
```
PR #535: fix: include node version manager paths in agent child process PATH
URL: https://github.com/RunMaestro/Maestro/pull/535
State: closed
Author: chr1syy
Created: 2026-03-08T15:43:21Z

This pull request adds a crucial enhancement to the `buildExpandedPath` function in `src/shared/pathUtils.ts`. The change ensures that paths from popular Node version managers are included at the beginning of the PATH, which is important for agents spawned as child processes to reliably locate the correct Node.js and npm binaries.

Node version manager support:

* The function now detects and prepends binary paths from Node version managers (such as nvm, fnm, volta, mise, asdf, n) to the PATH, improving compatibility and reliability for child processes that require Node.js tools.buildExpandedPath() was missing detectNodeVersionManagerBinPaths() calls, so agents spawned as child processes couldn't find node/npm from nvm/fnm/ volta/mise/asdf/n. Only PTY terminal sessions had these paths via buildUnixBasePath(). Now all callers of buildExpandedPath() get version manager paths cross-platform.

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/517` (2026-03-05 by reachrazamair) — confidence 0.893:
```
PR #517: refactor: centralize platform detection into shared utilities (#319)
URL: https://github.com/RunMaestro/Maestro/pull/517
State: closed
Author: reachrazamair
Created: 2026-03-05T01:26:19Z

## Summary

- Replace 60+ inline `process.platform` checks across 30 main/shared/CLI files with calls to a new `src/shared/platformDetection.ts` module (`isWindows()`, `isMacOS()`, `isLinux()`, `getWhichCommand()`)
- Replace 3 different `navigator.platform` / `navigator.userAgent` approaches in the renderer with calls to `src/renderer/utils/platformUtils.ts` (`isWindowsPlatform()`, `isMacOSPlatform()`, `isLinuxPlatform()`), all reading from the reliable `window.maestro.platform` preload bridge
- Eliminate the `which`/`where` command duplication (was copy-pasted 4 times) via `getWhichCommand()`
- Simplify `shortcutFormatter.ts` from a module-level `navigator.userAgent` constant to a function call, removing the need for `vi.resetModules()` + dynamic imports in its test file

## What changed

### New files
| File | Purpose |
|------|---------|
| `src/shared/platformDetection.ts` | Shared platform helpers for main process, CLI, and shared code |
| `src/__tests__/shared/platformDe…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/375` (2026-02-15 by chr1syy) — confidence 0.885:
```
PR #375: feat: enable Codex image support for resumed sessions (local + SSH)
URL: https://github.com/RunMaestro/Maestro/pull/375
State: closed
Author: chr1syy
Created: 2026-02-15T10:38:40Z

## Summary

This PR enables image inputs when resuming Codex sessions by switching from CLI image flags to prompt-embedded temp file paths in resume mode.

Previously, Codex resume flows could not consume images because codex exec resume does not accept -i. This change introduces a resume-specific image strategy that works for both local and SSH execution paths.

## What changed

- Added a new capability field: imageResumeMode?: 'prompt-embed'
- Set Codex to imageResumeMode: 'prompt-embed' and marked supportsImageInputOnResume as true
- Local spawner now embeds temp image paths into prompt text for resume mode instead of adding -i
- SSH command builder now supports prompt-embed mode for resumed sessions, and cleans up remote temp image files after execution
- Process IPC forwards resume image mode into SSH command construction
- Removed renderer-side Codex resume image attach blocking

## Validation

Ran targeted tests:

pm test -- src/__tests__/main/process-manager/utils/imag…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/466` (2026-02-26 by chr1syy) — confidence 0.853:
```
PR #466: Add PATH prober utility and tests, fix TypeScript build error
URL: https://github.com/RunMaestro/Maestro/pull/466
State: closed
Author: chr1syy
Created: 2026-02-26T10:27:00Z

This pull request enhances how the application detects and uses the system `PATH` environment variable, especially in packaged or Electron environments where the shell's `PATH` may differ from the process's `PATH`. The changes ensure that binaries installed in user environments (such as via a shell profile or version manager) are properly detected by prioritizing the shell-provided `PATH` entries. The update also introduces robust testing and a new utility for reliably fetching the shell's `PATH`.

**Key changes:**

### Shell PATH probing and merging

* Added a new utility (`getShellPath` in `src/main/runtime/getShellPath.ts`) to spawn the user's login shell, fetch the effective `PATH`, and cache it for the process lifetime. This ensures the app can access the correct `PATH` as seen in a user's terminal.
* Introduced `getExpandedEnvWithShell` in `src/main/agents/path-prober.ts` that merges the shell-provided `PATH` with the process's `PATH`, prioritizing shell entries and de-duplicating, to imp…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**source** `src/main/process-manager/spawners/PtySpawner.ts@9ed5ba0a55b8` (2026-04-15):
```
import { EventEmitter } from 'events';
import * as pty from 'node-pty';
import { stripControlSequences } from '../../utils/terminalFilter';
import { logger } from '../../utils/logger';
import type { ProcessConfig, ManagedProcess, SpawnResult } from '../types';
import type { DataBufferManager } from '../handlers/DataBufferManager';
import { buildPtyTerminalEnv } from '../utils/envBuilder';

/**
 * Handles spawning of PTY (pseudo-terminal) processes.
 * Used for terminal mode and AI agents that re…
```

**git_commit** `a0ebf02e4a600dfd67c81616cf473dc6b87dbd1b` (2026-01-18 by pedram.amini@gmail.com):
```
commit a0ebf02e4a600dfd67c81616cf473dc6b87dbd1b
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-18T21:58:49.000Z

## CHANGES

- Added per-agent per-day stats breakdown powering richer provider charts 📊
- Upgraded AgentUsageChart to multi-provider lines with query/time toggle 📈
- Normalized cumulative usage events into per-turn deltas for Claude/Codex 🧮
- Fixed context token display …
```

**source** `src/main/process-manager/utils/streamJsonBuilder.ts@daa49ea3` (2026-04-15):
```
import { parseDataUrl } from './imageUtils';

interface ImageContent {
	type: 'image';
	source: {
		type: 'base64';
		media_type: string;
		data: string;
	};
}

interface TextContent {
	type: 'text';
	text: string;
}

type MessageContent = ImageContent | TextContent;

/**
 * Build a stream-json message for Claude Code with images and text.
 *
 * Claude Code expects this format:
 * {"type":"user","message":{"role":"user","content":[...]}}
 *
 * Content array should have images first (Claude conve…
```

**source** `src/main/process-manager/handlers/ExitHandler.ts@682a8a32250` (2026-04-15):
```
// src/main/process-manager/handlers/ExitHandler.ts

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { matchSshErrorPattern } from '../../parsers/error-patterns';
import { aggregateModelUsage } from '../../parsers/usage-aggregator';
import { cleanupTempFiles } from '../utils/imageUtils';
import type { ManagedProcess, AgentError } from '../types';
import type { DataBufferManager } from './DataBufferManager';

interface ExitHandlerDependencies {
	processe…
```

**source** `src/main/process-manager/runners/SshCommandRunner.ts@53d28b1` (2026-04-15):
```
// src/main/process-manager/runners/SshCommandRunner.ts

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { matchSshErrorPattern } from '../../parsers/error-patterns';
import { shellEscapeForDoubleQuotes } from '../../utils/shell-escape';
import { getExpandedEnv, resolveSshPath } from '../../utils/cliDetection';
import { expandTilde } from '../../../shared/pathUtils';
import type { CommandResult } from '../types';
i…
```

**source** `src/__tests__/main/process-manager/spawners/ChildProcessSpaw` (2026-04-15):
```
/**
 * Tests for src/main/process-manager/spawners/ChildProcessSpawner.ts
 *
 * These tests verify the isStreamJsonMode detection logic which determines
 * whether output should be processed as JSON lines or raw text.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────

// Create mock spawn function at module level (before vi.mock hoisting)
const mockSpawn = vi.f…
```

**git_commit** `32d7b7d7ea650b6a80472b78245d9a5e6fb77860` (2026-02-09 by pedram.amini@gmail.com):
```
commit 32d7b7d7ea650b6a80472b78245d9a5e6fb77860
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-09T05:07:38.000Z

fix: escalate to SIGTERM when SIGINT fails to stop agent processes

Claude Code --print mode may not immediately exit on SIGINT alone,
causing the Stop button to show "Canceled by user" while the process
continues running. Now escalates to SIGTERM after 2s if needed.

Files…
```

**source** `src/main/process-manager/ProcessManager.ts@e1ebf4f756f4512d1` (2026-04-15):
```
// src/main/process-manager/ProcessManager.ts

import { EventEmitter } from 'events';
import type {
	ProcessConfig,
	ManagedProcess,
	SpawnResult,
	CommandResult,
	ParsedEvent,
	AgentOutputParser,
} from './types';
import { PtySpawner } from './spawners/PtySpawner';
import { ChildProcessSpawner } from './spawners/ChildProcessSpawner';
import { DataBufferManager } from './handlers/DataBufferManager';
import { LocalCommandRunner } from './runners/LocalCommandRunner';
import { SshCommandRunner } fr…
```

**git_commit** `3d593719fb32a54fc99fa1763b963a517c703814` (2026-02-03 by pedram.amini@gmail.com):
```
commit 3d593719fb32a54fc99fa1763b963a517c703814
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-03T15:34:16.000Z

fix(ssh): use stdin-based execution to bypass shell escaping issues

This is a complete rewrite of SSH remote command execution that eliminates
all shell escaping issues by sending the entire script via stdin.

Previously, the SSH command was built as:
  ssh host '/bin/bash…
```

**source** `src/main/process-manager/types.ts@429b8afc79fb6e9e3edb86ab01` (2026-04-15):
```
import type { ChildProcess } from 'child_process';
import type { IPty } from 'node-pty';
import type { AgentOutputParser } from '../parsers';
import type { AgentError } from '../../shared/types';

/**
 * Configuration for spawning a new process
 */
export interface ProcessConfig {
	sessionId: string;
	toolType: string;
	cwd: string;
	command: string;
	args: string[];
	requiresPty?: boolean;
	prompt?: string;
	shell?: string;
	shellArgs?: string;
	shellEnvVars?: Record<string, string>;
	images?: …
```

**git_commit** `f0cbf2475ca23bd63c5406778377917e3118c002` (2026-01-16 by reachrazarauf@gmail.com):
```
commit f0cbf2475ca23bd63c5406778377917e3118c002
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-16T22:35:48.000Z

refactored main/process-manager.ts into manageable / scalable modules


Files:
src/main/process-manager.ts
src/main/process-manager/ProcessManager.ts
src/main/process-manager/constants.ts
src/main/process-manager/handlers/DataBufferManager.ts
src/main/process-manager/handlers…
```

**source** `src/main/process-manager/constants.ts@9e8ed74f76c912d8f1450f` (2026-04-15):
```
/**
 * Maximum buffer size for stdout/stderr error detection buffers.
 * Prevents memory exhaustion during extended process execution.
 */
export const MAX_BUFFER_SIZE = 100 * 1024; // 100KB

/**
 * Data buffer flush interval in milliseconds
 */
export const DATA_BUFFER_FLUSH_INTERVAL = 50;

/**
 * Data buffer size threshold for immediate flush
 */
export const DATA_BUFFER_SIZE_THRESHOLD = 8192; // 8KB

/**
 * Standard Unix paths for PATH environment variable
 */
export const STANDARD_UNIX_PATHS…
```

**source** `src/main/process-manager/index.ts@295910ebbf2dd78de8fa50c02b` (2026-04-15):
```
// Main class
export { ProcessManager } from './ProcessManager';

// Types - all exported for consumers
export type {
	ProcessConfig,
	ManagedProcess,
	SpawnResult,
	CommandResult,
	UsageStats,
	UsageTotals,
	ProcessManagerEvents,
	ParsedEvent,
	AgentOutputParser,
	AgentError,
	AgentErrorType,
	SshRemoteConfig,
} from './types';

// Re-export parser utilities for backwards compatibility
export { getOutputParser } from '../parsers';
export type { ModelStats } from '../parsers/usage-aggregator';
e…
```

**source** `src/__tests__/main/process-manager/utils/imageUtils.test.ts@` (2026-04-15):
```
import { describe, it, expect } from 'vitest';
import { buildImagePromptPrefix } from '../../../../main/process-manager/utils/imageUtils';

describe('imageUtils', () => {
	describe('buildImagePromptPrefix', () => {
		it('should return empty string for empty array', () => {
			expect(buildImagePromptPrefix([])).toBe('');
		});

		it('should return prefix with single image path', () => {
			const result = buildImagePromptPrefix(['/tmp/maestro-image-123-0.png']);
			expect(result).toBe('[Attached i…
```

**source** `src/__tests__/main/process-manager/handlers/StderrHandler.te` (2026-04-15):
```
/**
 * Tests for src/main/process-manager/handlers/StderrHandler.ts
 *
 * Covers stderr handling including:
 * - SSH informational message filtering
 * - Codex stdin mode response extraction
 * - Error detection from stderr
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../../../../main/utils/logger', () => ({
	logger: {
		info: vi.fn(),
		warn: vi…
```

**git_commit** `2fa8dd2c80711f0e85c1761b1c7f3fa50760b277` (2026-02-17 by jeffscottward@users.noreply.github.com):
```
commit 2fa8dd2c80711f0e85c1761b1c7f3fa50760b277
Author: Jeff Scott Ward <jeffscottward@users.noreply.github.com>
Date: 2026-02-17T16:12:05.000Z

fix: use final codex turn result in wizard responses


Files:
src/__tests__/main/process-manager/handlers/StdoutHandler.test.ts
src/main/process-manager/handlers/StdoutHandler.ts
```

**source** `src/main/process-manager/handlers/StdoutHandler.ts@de6736d94` (2026-04-15):
```
// src/main/process-manager/handlers/StdoutHandler.ts

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger';
import { appendToBuffer } from '../utils/bufferUtils';
import { aggregateModelUsage, type ModelStats } from '../../parsers/usage-aggregator';
import { matchSshErrorPattern } from '../../parsers/error-patterns';
import type { ManagedProcess, UsageStats, UsageTotals, AgentError } from '../types';
import type { DataBufferManager } from './DataBufferManager';

in…
```

**git_commit** `2e4ff75cd546dddee928bb861e881afa58b11696` (2026-02-15 by ch.bleuel@me.com):
```
commit 2e4ff75cd546dddee928bb861e881afa58b11696
Author: chr1syy <ch.bleuel@me.com>
Date: 2026-02-15T09:35:22.000Z

MAESTRO: feat: implement image-to-prompt embedding for Codex resume sessions

When Codex resumes a session with `codex exec resume`, the -i flag is not
supported. This adds a new imageResumeMode capability that triggers an
alternative image handling path: images are saved to temp file…
```

**source** `src/main/process-manager/spawners/ChildProcessSpawner.ts@3fc` (2026-04-15):
```
// src/main/process-manager/spawners/ChildProcessSpawner.ts

import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../../utils/logger';
import { getOutputParser } from '../../parsers';
import { getAgentCapabilities } from '../../agents';
import type { ProcessConfig, ManagedProcess, SpawnResult } from '../types';
import type { DataBufferManager } from '../handlers/DataBufferManager';
import { S…
```

**source** `src/main/process-manager/utils/imageUtils.ts@0436f7295a7aa74` (2026-04-15):
```
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../../utils/logger';

/**
 * Parse a data URL and extract base64 data and media type
 */
export function parseDataUrl(dataUrl: string): { base64: string; mediaType: string } | null {
	const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
	if (!match) return null;
	return {
		mediaType: match[1],
		base64: match[2],
	};
}

/**
 * Save a b…
```

**git_commit** `67540c889b25e4ea837642e192ec0d57b104aa2e` (2026-02-12 by pedram.amini@gmail.com):
```
commit 67540c889b25e4ea837642e192ec0d57b104aa2e
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-12T07:05:32.000Z

fix: process remaining jsonBuffer on stream-json process exit

Short-lived stream-json processes (tab naming, batch ops) could lose
their final result if it was the last line without a trailing newline.
Flush jsonBuffer remainder at exit before emitting the exit event.
Also…
```

**git_commit** `8de53cd84b2866785c3a47d297619744e19fe982` (2026-02-11 by reachrazarauf@gmail.com):
```
commit 8de53cd84b2866785c3a47d297619744e19fe982
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-02-11T13:14:41.000Z

refactor: complete agentStore Phases 2-3, extract ~1,850 lines from App.tsx

Phase 2 — useAgentListeners hook:
- Extract IPC listener useEffect (~1,520 lines) from App.tsx into
  src/renderer/hooks/agent/useAgentListeners.ts
- Covers onData, onUsage, onStderr, onExit, onAgent…
```

**source** `src/main/process-manager/utils/envBuilder.ts@d7472fcd377863e` (2026-04-15):
```
import * as os from 'os';
import * as path from 'path';
import { STANDARD_UNIX_PATHS } from '../constants';
import { detectNodeVersionManagerBinPaths, buildExpandedPath } from '../../../shared/pathUtils';

/**
 * Build the base PATH for macOS/Linux with detected Node version manager paths.
 */
export function buildUnixBasePath(): string {
	const versionManagerPaths = detectNodeVersionManagerBinPaths();

	if (versionManagerPaths.length > 0) {
		return versionManagerPaths.join(':') + ':' + STANDAR…
```

**git_commit** `3762b40a196b7bc6806b92e2fa9a5d4e3c93e10b` (2026-02-08 by ch.bleuel@me.com):
```
commit 3762b40a196b7bc6806b92e2fa9a5d4e3c93e10b
Author: chr1syy <ch.bleuel@me.com>
Date: 2026-02-08T19:09:34.000Z

fix: address critical sendPromptViaStdinRaw dead code and consolidate Windows shell config

CRITICAL FIX:
- Promote sendPromptViaStdinRaw to its own top-level branch in ChildProcessSpawner
  The raw stdin write was nested under isStreamJsonMode check, which is FALSE
  when sendPromptV…
```

**source** `src/main/process-manager/utils/shellEscape.ts@13aa9fe22c46c3` (2026-04-15):
```
/**
 * Shell argument escaping utilities for Windows cmd.exe and PowerShell.
 *
 * These functions handle escaping command line arguments to prevent injection
 * and ensure proper argument passing when spawning processes via shell.
 *
 * References:
 * - cmd.exe escaping: https://docs.microsoft.com/en-us/windows-server/administration/windows-commands/cmd
 * - PowerShell escaping: https://docs.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_quoting_rules
 *
 * For prod…
```

**git_commit** `7e5ecb8b5ca8a51a24a81b1aab6dd12646893289` (2026-02-08 by ch.bleuel@me.com):
```
commit 7e5ecb8b5ca8a51a24a81b1aab6dd12646893289
Author: chr1syy <ch.bleuel@me.com>
Date: 2026-02-08T08:03:01.000Z

fix: Windows shell selection and escaping for group chat and normal chat

Fixes issues with shell selection and argument escaping on Windows for both
group chat and normal chat modes:

- Centralize Windows shell selection logic using getWindowsShellForAgentExecution()
- Export shell e…
```

**source** `src/main/process-manager/utils/index.ts@88e23a6985e4870c3ca4` (2026-04-15):
```
export { appendToBuffer } from './bufferUtils';
export { parseDataUrl, saveImageToTempFile, cleanupTempFiles } from './imageUtils';
export { buildStreamJsonMessage } from './streamJsonBuilder';
export { buildUnixBasePath, buildPtyTerminalEnv, buildChildProcessEnv } from './envBuilder';
export { resolveShellPath, buildWrappedCommand, clearShellPathCache } from './pathResolver';
export {
	escapeCmdArg,
	escapeCmdArgs,
	escapePowerShellArg,
	escapePowerShellArgs,
	escapeArgsForShell,
	isPowerShellS…
```
```

</details>

**Condition B (pack, no companion):** ~8404 tok (6517 prompt + 1887 answer)

I'll research the codebase to determine the specific reasons and criteria for using PTY versus `child_process.spawn` for AI agents.

The `PtySpawner.ts` source excerpt suggests PTY is used for "terminal mode and AI agents that re...", while `PR #200` indicates `ChildProcessSpawner` is the default for AI agents. I need to clarify this distinction.

First, I'll examine `ProcessManager.ts` to see how it decides which spawner to use.

Then, I'll look at `PtySpawner.ts` and `ChildProcessSpawner.ts` to understand the functional differences and specific agent requirements.

Finally, I'll check if any agent configurations (like Claude Code or Codex) explicitly set `requiresPty`.

I will start by reading `src/main/process-manager/ProcessManager.ts`.
I've analyzed `ProcessManager.ts` and identified the `shouldUsePty` logic, which selects PTY when `toolType === 'terminal'` or `requiresPty === true`, provided there's no `prompt`. To fully answer why certain AI agents require PTY instead of `child_process.spawn`, I'll now examine `src/main/process-manager/spawners/PtySpawner.ts` for additional context on agent-specific needs like terminal emulation or interactive features.
I've confirmed that `PtySpawner.ts` handles AI agents requiring TTY support, so I'll now search for `requiresPty` in the codebase to identify those specific agents and the reasons for this requirement.
`src/main/agents/definitions.ts` seems to be the primary location for the `requiresPty` definition, so I'll check that file to identify the specific agent.
`AGENT_DEFINITIONS` lists `terminal` with `requiresPty: true`, but I missed it for `claude-code` and `codex`. I'll check line 120 of `src/main/agents/definitions.ts` to see what I missed.
`terminal` has `requiresPty: true`. I'll check the rest of `AGENT_DEFINITIONS` for others.
Only the `terminal` agent in `AGENT_DEFINITIONS` has `requiresPty: true`, while other AI agents like `claude-code` and `codex` don't. I'll check `src/main/process-manager/spawners/ChildProcessSpawner.ts` to see if there's a specific reason or case where PTY is used for AI agents, as the question suggests.
Based on my review of `ProcessManager.ts`, `PtySpawner.ts`, and `ChildProcessSpawner.ts`, I've determined that AI agents primarily use `ChildProcessSpawner`, which utilizes `child_process.spawn` to facilitate structured JSON parsing and complex stdin handling. Conversely, `PtySpawner` is reserved for the "terminal" agent to provide full shell emulation, including ANSI support and TTY-dependent features. I'll re-examine `src/main/agents/definitions.ts` to ensure I haven't overlooked any AI agents that might still require PTY.
`grep_search` indicates `requiresPty` is predominantly `false` for agents, but `src/main/ipc/handlers/process.ts` and `ProcessManager.ts` suggest it might be used for interactive modes without prompts. Although `definitions.ts` only sets it for `terminal`, the question's phrasing implies PTY *is* used for AI agents, so I'll search for "AI agents" and "PTY" together in comments or PRs to clarify.
`PtySpawner.ts` handles "AI agents in PTY mode," but `definitions.ts` mostly sets `requiresPty: false`. `ProcessManager.ts` suggests PTY is used in interactive mode when `prompt` is absent and `requiresPty` is true. PTY is typically used for TTY detection, ANSI support, or real-time interaction, so I'll check `src/main/agents` to see if `requiresPty` is set to `true` there.
I'm still looking for why AI agents specifically use PTY instead of `child_process.spawn`. The question's wording suggests that they *do*, so I'll check `src/main/ipc/handlers/process.ts` to see how it calls `spawn`.
`terminal` sessions consistently use PTY, while AI agents typically avoid it, particularly with SSH. `PtySpawner.ts` and `ProcessManager.ts` indicate that PTY is used for interactive sessions if an agent `requiresPty`, but `AGENT_DEFINITIONS` only sets this for `terminal`. I'll check `ARCHITECTURE.md` or `README.md` to see if there's any mention of PTY for agents in interactive mode.
`ARCHITECTURE.md` confirms that AI assistants typically use `child_process.spawn`, not PTY, while `terminal` sessions use PTY for shell emulation. However, `ProcessManager.ts` and `PtySpawner.ts` allow for AI agents to use PTY in interactive mode if `requiresPty` is true, potentially for TTY detection, ANSI colors, or signal handling. I'll check `src/main/agents/detector.ts` to see if `requiresPty` is ever set dynamically.
`AgentDetector` uses `AGENT_DEFINITIONS` for `requiresPty` rather than setting it dynamically. I'll check `src/main/process-manager/handlers/StdoutHandler.ts` for PTY-specific output processing, like ANSI stripping, for more clues.
I've determined that AI agents typically use `child_process.spawn` for JSON parsing, while the "Terminal" agent uses `node-pty` for full shell emulation. `ProcessManager` can use PTY for AI agents in interactive mode if TTY support is required, but `definitions.ts` only sets this for `terminal`. I'll now check `src/__tests__/main/ipc/handlers/process.test.ts` to see if any tests use PTY for AI agents.
The test "should spawn a process with PTY if the agent requires it" uses `claude-code` with `requiresPty: true`, but `definitions.ts` doesn't set this, suggesting it's just a mock. `ARCHITECTURE.md` clarifies that PTY is for terminal sessions and `child_process.spawn` is for AI assistants. I'll check `docs/context-management.md` or `docs/cli.md` to see if any AI agent is documented as using PTY.
I'll check `docs/cli.md` and `docs/context-management.md`.
The Maestro process manager uses `node-pty` (PTY) primarily for the **Terminal agent**, while using `child_process.spawn` for **AI agents** (Claude Code, Codex, etc.). This distinction is architectural and based on the differing requirements of interactive shells versus programmatic agent interaction.

### Why AI Agents use `child_process.spawn`
1.  **Structured Data Parsing**: AI agents are typically executed in "batch" or "stream-json" mode (e.g., using `--output-format stream-json`). By using `child_process.spawn` with piped stdio, Maestro can reliably parse JSON lines from `stdout` without interference from terminal escape sequences (ANSI codes) or "echo" effects that PTYs often introduce.
2.  **Stdin Reliability**: Maestro often sends large prompts, context, and base64-encoded images as JSON messages via `stdin`. Standard pipes are more efficient and predictable for high-volume data transfer than pseudo-terminals, which have smaller buffers and can mangle non-interactive input.
3.  **Signal Management**: `child_process.spawn` provides better control over process signals. For example, Maestro's `ProcessManager.ts` escalates `SIGINT` to `SIGTERM` after 2 seconds if an agent (like Claude Code) fails to exit promptly, a workflow easier to manage via standard Node.js process handles.

### When PTY is Used
PTY is reserved for cases where **TTY support** is mandatory (`requiresPty: true`):
*   **Terminal Mode**: Used for full shell emulation (`bash`, `zsh`, `powershell`) to support ANSI colors, cursor movement, and interactive CLI tools like `vim` or `htop`.
*   **Interactive Overrides**: AI agents only use PTY if they are run in "interactive mode" without a prompt and explicitly require a TTY to enable features (like progress bars) that are usually disabled when piped.

Evidence for this separation is found in `ProcessManager.ts`, which uses `shouldUsePty(config)` to route spawning to either `PtySpawner` (for terminals) or `ChildProcessSpawner` (for agents).

**Condition C (pack + companion):** ~7745 tok (7368 prompt + 377 answer)

Maestro utilizes a dual-spawner architecture where `PtySpawner` is preferred for AI agents requiring interactive terminal features, while `ChildProcessSpawner` typically handles standard machine-readable IPC (e.g., `stream-json` mode).

The process manager uses PTY (pseudo-terminal) via `node-pty` for several technical reasons:

1.  **TTY-Specific Features:** Many AI agents rely on TTY behaviors that `child_process.spawn` (which uses simple pipes) does not support. This includes ANSI escape sequences for colors and interactive line formatting. `PtySpawner.ts` specifically includes `stripControlSequences` to manage this raw terminal output for the UI.
2.  **Robust Signal Handling:** PTYs provide more reliable signal propagation. Evidence from commit `32d7b7d7` shows that some agents, like Claude Code, may not exit immediately on `SIGINT` alone. A PTY emulates a real terminal's behavior, allowing Maestro to propagate signals more effectively than standard pipes.
3.  **Environment Consistency:** PR #535 indicates that PTY sessions historically had better integration with the user's shell environment. Specifically, PTY sessions were able to inherit paths from Node version managers (like `nvm`, `asdf`, or `mise`) via `buildUnixBasePath()`, ensuring agents can reliably locate their required binaries and dependencies.

By using PTY, Maestro ensures that AI agents maintain the same interactive capabilities, formatting, and environmental context they would possess in a standalone terminal.

---

## Q7 [large] — Why does the group chat router use absence of @mention rather than stop tokens to determine when a participant is done?

**Pack:** 542 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.92, 0.87, 0.85, 0.83, 0.79]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does the group chat router use absence of @mention rather than stop tokens to determine when a participant is done?  Budget: 6000 tokens | Used: ~5521 | 60 results (1 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/main/group-chat/group-chat-router.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `src/main/group-chat/group-chat-router.ts::SessionInfo` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::GetSessionsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::GetCustomEnvVarsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::GetAgentConfigCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::getSessionsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::getCustomEnvVarsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::getAgentConfigCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::sshStore` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::pendingParticipantResponses` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::groupChatReadOnlyState` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::getGroupChatReadOnlyState` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::setGroupChatReadOnlyState` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::getPendingParticipants` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::clearPendingParticipants` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::markParticipantResponded` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::setGetSessionsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::setGetCustomEnvVarsCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::setGetAgentConfigCallback` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::setSshStore` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::extractMentions` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::extractAllMentions` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::routeUserMessage` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::routeModeratorResponse` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::routeAgentResponse` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::spawnModeratorSynthesis` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/main/group-chat/group-chat-router.ts::respawnParticipantWithRecovery` **[symbol]** — score 0.958 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/group-chat-router.test.ts` **[module]** — score 0.919 | evidence: 2 episode(s)
- `src/__tests__/main/group-chat/group-chat-router.test.ts::mockUserDataPath` **[symbol]** — score 0.884 | evidence: 1 episode(s)
- `src/__tests__/main/group-chat/group-chat-router.test.ts::mockWrapSpawnWithSsh` **[symbol]** — score 0.884 | evidence: 1 episode(s)
- `docs/group-chat.md` **[module]** — score 0.034 | evidence: 2 episode(s)
- `src/main/group-chat` **[module]** — score 0.034 | evidence: 1 episode(s)
- `src/shared/types.ts::Group` **[symbol]** — score 0.034 | evidence: 1 episode(s)
- `peter.silberman@thebgroup.io` **[person]** — score 0.034 | evidence: 1 episode(s)
- `src/renderer/hooks/groupChat` **[module]** — score 0.034 | evidence: 1 episode(s)
- `src/main/preload/groupChat.ts` **[module]** — score 0.034 | evidence: 2 episode(s)
- `src/__tests__/main/group-chat` **[module]** — score 0.034 | evidence: 1 episode(s)
- `src/shared/group-chat-types.ts` **[module]** — score 0.034 | evidence: 2 episode(s)
- `src/main/index.ts::groupsStore` **[symbol]** — score 0.034 | evidence: 1 episode(s)
- `src/cli/commands/list-groups.ts` **[module]** — score 0.034 | evidence: 2 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/__tests__/main/group-chat/group-chat-router.test.ts imports src/main/group-chat/group-chat-router.ts **[observed]** — score 1.000
- src/main/group-chat/group-chat-router.ts defines SessionInfo **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines GetSessionsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines GetCustomEnvVarsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines GetAgentConfigCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines getSessionsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines getCustomEnvVarsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines getAgentConfigCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines sshStore **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines pendingParticipantResponses **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines groupChatReadOnlyState **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines getGroupChatReadOnlyState **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines setGroupChatReadOnlyState **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines getPendingParticipants **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines clearPendingParticipants **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines markParticipantResponded **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines setGetSessionsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines setGetCustomEnvVarsCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines setGetAgentConfigCallback **[observed]** — score 0.927
- src/main/group-chat/group-chat-router.ts defines setSshStore **[observed]** — score 0.927

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/364` (2026-02-13 by pedramamini) — confidence 1.000:
```
PR #364: feat: CSV table rendering + fix: group chat write race & SSH spawn
URL: https://github.com/RunMaestro/Maestro/pull/364
State: closed
Author: pedramamini
Created: 2026-02-13T01:10:32Z

## Summary
- CSV and TSV files now render as themed, sortable tables instead of plain text in file preview
- New `CsvTableRenderer` component with RFC-compliant CSV parsing, numeric column detection, click-to-sort headers, and row truncation
- Edit mode toggle falls through to raw text editor for direct CSV editing
- **Fix:** Serialize concurrent writes to group chat `metadata.json` to prevent file corruption from racing listeners
- **Fix:** Add SSH wrapping for group chat participant spawns (user-mention auto-add + recovery respawn)
- **Fix:** Group chat history panel layout — filter pills, activity graph, and entries now stack vertically instead of being squeezed into a single row

## Group Chat History Panel Layout
The filter pills and activity graph were crammed into a single flex row, causing the graph to be too narrow. Refactored to three distinct vertical sections:
1. **Filter pills** — centered horizontally
2. **Activity graph** — full-width on its own row
3. **History entries** — scr…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/559` (2026-03-12 by ets) — confidence 0.921:
```
PR #559: feat: group chat enhancements
URL: https://github.com/RunMaestro/Maestro/pull/559
State: closed
Author: ets
Created: 2026-03-12T16:40:49Z

## Summary

- Enhanced group chat routing with improved participant response handling, stability fixes, and better observability
- Added group chat moderator system prompt for synthesis and auto-run registry for managing group chat workflows
- Extended settings, stores, and IPC handlers to support new group chat capabilities including participant cards and right panel

## Changes

**Core group chat improvements:**
- `src/main/group-chat/group-chat-router.ts` — Major enhancements to routing logic (+321 lines)
- `src/main/ipc/handlers/groupChat.ts` — Extended IPC handlers for group chat operations
- `src/main/preload/groupChat.ts` — New preload bridge for group chat IPC
- `src/main/process-listeners/data-listener.ts` / `exit-listener.ts` — Process lifecycle improvements

**Renderer/UI:**
- `src/renderer/App.tsx` — Group chat integration into main app coordinator
- `src/renderer/components/GroupChat*.tsx` — Updated header, list, panel, participants, and right panel components
- `src/renderer/components/ParticipantCard.tsx` — Enhanced parti…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/580` (2026-03-17 by pedramamini) — confidence 0.869:
```
PR #580: Polish: group chat mentions, batch resume/abort, git push PATH fix
URL: https://github.com/RunMaestro/Maestro/pull/580
State: closed
Author: pedramamini
Created: 2026-03-17T15:13:29Z

## Summary

- **feat:** Add @mention autocomplete to group chat prompt composer with auto-resize input
- **feat:** Add Resume/Abort buttons to RightPanel batch progress when error-paused
- **fix:** Enrich PATH for git push in `createPR` so Husky hooks find npm
- **fix:** Correct misleading SSH-only comment on unconditional ANSI stripping
- **fix:** Resolve `os.tmpdir` mock failure in session-storage tests
- **chore:** Version bump to 0.15.3 + sync package-lock.json

## Changed files

- `src/renderer/components/PromptComposerModal.tsx` — @mention autocomplete UI
- `src/renderer/components/GroupChatInput.tsx` — auto-resize input
- `src/renderer/components/RightPanel.tsx` — Resume/Abort batch controls
- `src/main/ipc/handlers/git.ts` — PATH enrichment for git push
- `src/main/process-manager/handlers/StdoutHandler.ts` — comment fix
- Tests updated for all new features

## Test plan

- [ ] Verify @mention autocomplete appears in group chat composer
- [ ] Verify Resume/Abort buttons render during …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/539` (2026-03-08 by openasocket) — confidence 0.846:
```
PR #539: fix: group chat SSH synthesis wrapping + structured logging
URL: https://github.com/RunMaestro/Maestro/pull/539
State: closed
Author: openasocket
Created: 2026-03-08T23:56:49Z

## Summary
- Add SSH wrapping to `spawnModeratorSynthesis()` — synthesis was the only spawn point missing SSH support, causing moderator initial spawn to run remotely but synthesis to run locally (TASK-M04)
- Replace ~130 raw `console.log` calls in group-chat-router with structured `logger.debug/warn/error` — prevents sensitive data (args, session IDs) from bypassing log-level gating (TASK-M09)

Cherry-picked from `feat/gemini-cli` audit fixes (TASK-M04, TASK-M09). Gemini-specific code (moderatorCwd, geminiNoSandbox, readOnlyCliEnforced) excluded — only shared infrastructure improvements.

## Test plan
- [x] 49 group-chat-router tests pass (2 new SSH synthesis wrapping tests)
- [x] Zero `console.log` remaining in group-chat-router.ts
- [x] 21,873 total tests pass (2 pre-existing failures in AgentSessionsModal unrelated)
- [x] Lint clean (pre-existing EfficiencyTab.tsx errors unrelated — untracked file)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

<!-- This is an auto-generated c…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/437` (2026-02-22 by openasocket) — confidence 0.832:
```
PR #437: fix: group chat process cleanup, Codex cost tracking, moderator @mention enforcement
URL: https://github.com/RunMaestro/Maestro/pull/437
State: closed
Author: openasocket
Created: 2026-02-22T07:28:25Z

## Summary
- **Process cleanup on delete**: `killModerator()` and `clearAllParticipantSessions()` silently failed because batch mode spawns processes with timestamp-suffixed session IDs while the active sessions map stores prefix-only IDs. Added `killByPrefix()` to `ProcessManager` — fixes zombie processes and the observed `y\n` flood after delete.
- **Codex session ID + cost display**: Restored display-only synthetic session IDs (`codex-0-*`) so participant cards show an ID instead of "pending". Resume logic skips these prefixed IDs. Added OpenAI model pricing table (GPT-4o through GPT-5.3-codex) to calculate cost from token counts since Codex CLI doesn't report cost directly.
- **Moderator @mention enforcement**: Added mandatory `## MANDATORY: Always @mention agents when delegating` section to moderator system prompt. Prevents the moderator from discussing agent tasks without actually routing messages via @mentions. Updated synthesis prompt for critical analysis and fusion…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/39` (2025-12-18 by pedramamini) — confidence 0.788:
```
PR #39: Group Chat Support!
URL: https://github.com/RunMaestro/Maestro/pull/39
State: closed
Author: pedramamini
Created: 2025-12-18T14:08:18Z

This PR implements Group Chat, a feature that enables orchestrated multi-agent collaboration through a moderator-driven architecture. Users can create group chats that spawn a hidden "moderator" AI session running in read-only mode, which coordinates multiple participant AI agents (each with their own dedicated session) to work on tasks collaboratively. The backend (src/main/group-chat-*.ts) provides storage for chat metadata, a pipe-delimited chat log format, and image attachments, along with IPC handlers for message routing between the user, moderator, and participant agents. The frontend adds a Group Chats section to the left sidebar with create/rename/delete functionality, a full-width chat panel with color-coded messages by sender, @mention autocomplete for participants, a typing/working indicator based on state (idle/moderator-thinking/agent-working), and a right panel showing participant status cards with context usage, session IDs, and last activity. The feature includes keyboard shortcuts (Cmd+Shift+G for new group chat), Command P…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**git_commit** `5aeb3d16a9b54034f5f93a4c5e4b1b6e50e2da0e` (2026-02-13 by pedram.amini@gmail.com):
```
commit 5aeb3d16a9b54034f5f93a4c5e4b1b6e50e2da0e
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-13T02:50:33.000Z

fix: add SSH wrapping for group chat participant spawns

Two places in group-chat-router were spawning participants without SSH
wrapping, causing ENOENT when the agent binary doesn't exist locally:

1. User-mention auto-add (routeUserMessage) was missing sshRemoteConfig
   …
```

**source** `src/main/group-chat/group-chat-router.ts@438aa4976aae546eda4` (2026-04-15):
```
/**
 * @file group-chat-router.ts
 * @description Message routing for Group Chat feature.
 *
 * Routes messages between:
 * - User -> Moderator
 * - Moderator -> Participants (via @mentions)
 * - Participants -> Moderator
 */

import * as os from 'os';
import {
	GroupChatParticipant,
	loadGroupChat,
	updateParticipant,
	addGroupChatHistoryEntry,
	extractFirstSentence,
	getGroupChatDir,
} from './group-chat-storage';
import { appendToLog, readLog } from './group-chat-log';
import {
	type GroupCha…
```

**git_commit** `dad93f657d84f752b09f82a8bf7c64b3e312cdcb` (2026-02-13 by pedram.amini@gmail.com):
```
commit dad93f657d84f752b09f82a8bf7c64b3e312cdcb
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-13T02:55:54.000Z

test: add SSH remote execution tests for group chat router

Verify that user-mention auto-add, moderator-mention participant spawn,
and non-SSH sessions correctly handle (or skip) SSH wrapping via
wrapSpawnWithSsh. Prevents regression of the missing sshRemoteConfig fix.

Fi…
```

**source** `src/__tests__/main/group-chat/group-chat-router.test.ts@7d2f` (2026-04-15):
```
/**
 * @file group-chat-router.test.ts
 * @description Unit tests for the Group Chat message router.
 *
 * Tests cover:
 * - Extracting @mentions (5.1, 5.2)
 * - Routing user messages (5.3)
 * - Routing moderator responses (5.4)
 * - Routing agent responses (5.5)
 * - Read-only mode propagation (5.6)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

// Mock Electron's app modu…
```

**git_commit** `3c7f9b5debade3f291f3869423ae3223fa46fa2a` (2026-01-11 by pedram.amini@gmail.com):
```
commit 3c7f9b5debade3f291f3869423ae3223fa46fa2a
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-11T11:34:12.000Z

MAESTRO: docs: Fix and expand group-chat.md documentation accuracy

- Added Beta notice callout (feature shows "Beta" badge in UI)
- Fixed "How It Works" section: added keyboard shortcut (Opt+Cmd+C),
  Quick Actions option, and moderator selection step
- Added Tip callout e…
```

**source** `docs/group-chat.md@3100773f58760daf5b226d964f3684fb1f44b11c7` (2026-04-15):
```
---
title: Group Chat
description: Coordinate multiple AI agents in a single conversation with a moderator AI.
icon: comments
---

<Note>
  Group Chat is currently in **Beta**. The feature is functional but under active development.
</Note>

Group Chat lets you coordinate multiple AI agents in a single conversation. A moderator AI orchestrates the discussion, routing questions to the right agents and synthesizing their responses.

![Group chat](./screenshots/group-chat.png)

## When to Use Group…
```

**source** `src/main/group-chat/output-parser.ts@b26020ff158b6d9f8b617f1` (2026-04-15):
```
/**
 * Output parsing utilities for group chat.
 * Extracts text content from agent JSON/JSONL output formats.
 */

import { getOutputParser } from '../parsers';
import { logger } from '../utils/logger';

/**
 * Generic text extraction fallback for unknown agent types.
 * Tries common patterns for JSON output.
 */
export function extractTextGeneric(rawOutput: string): string {
	const lines = rawOutput.split('\n');

	// Check if this looks like JSONL output (first non-empty line starts with '{')
…
```

**source** `src/shared/types.ts@5861aace8aed402146c7bc6c7565d4bebd8873eb` (2026-04-15):
```
// Shared type definitions for Maestro CLI and Electron app
// These types are used by both the CLI tool and the renderer process

export type ToolType = 'claude-code' | 'opencode' | 'codex' | 'terminal' | 'factory-droid';

/**
 * ThinkingMode controls how AI reasoning/thinking content is displayed.
 * - 'off': Thinking is suppressed (not shown)
 * - 'on': Thinking is shown while streaming, cleared when final response arrives
 * - 'sticky': Thinking is shown and remains visible after the final r…
```

**git_commit** `e5468dd3ee96edb104d0d1e5d331c9156a021452` (2025-12-22 by peter.silberman@thebgroup.io):
```
commit e5468dd3ee96edb104d0d1e5d331c9156a021452
Author: Peter Silberman <peter.silberman@thebgroup.io>
Date: 2025-12-22T02:13:01.000Z

feat: worktree auto-discovery and custom Claude command support

Worktree Features:
- Auto-detect directories containing git worktrees and create grouped agents
- Periodic scanner (30s) discovers new worktrees in watched directories
- Track removed worktree paths t…
```

**source** `src/renderer/hooks/groupChat/useGroupChatHandlers.ts@656e0cc` (2026-04-15):
```
/**
 * useGroupChatHandlers — extracted from App.tsx (Phase 2B)
 *
 * Owns all group chat lifecycle callbacks, IPC event listeners,
 * execution queue processing, error recovery, and refs.
 * Reads from Zustand stores directly — no parameters needed.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { GroupChatMessagesHandle } from '../../components/GroupChatMessages';
import type { GroupChatRightTab } from '../../components/GroupChatRightPanel';
import type { RecoveryActi…
```

**git_commit** `1c2a8101ee6d125b62da65b5493ec5adfb6cd257` (2026-01-22 by reachrazarauf@gmail.com):
```
commit 1c2a8101ee6d125b62da65b5493ec5adfb6cd257
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-22T15:33:55.000Z

refactor: modularize preload.ts into domain-specific modules with tests


Files:
package-lock.json
package.json
scripts/build-preload.mjs
src/__tests__/main/preload/agents.test.ts
src/__tests__/main/preload/attachments.test.ts
src/__tests__/main/preload/autorun.test.ts
src/__…
```

**source** `src/main/preload/groupChat.ts@235e7130ace98953c879f9f8f1e7c4` (2026-04-15):
```
/**
 * Preload API for group chat operations
 *
 * Provides the window.maestro.groupChat namespace for:
 * - Group chat creation and management
 * - Moderator and participant control
 * - Chat history and messages
 */

import { ipcRenderer } from 'electron';

/**
 * Moderator configuration
 */
export interface ModeratorConfig {
	customPath?: string;
	customArgs?: string;
	customEnvVars?: Record<string, string>;
}

/**
 * Participant definition
 */
export interface Participant {
	name: string;
	a…
```

**source** `src/__tests__/main/group-chat/session-parser.test.ts@db13bde` (2026-04-15):
```
/**
 * @file session-parser.test.ts
 * @description Unit tests for group chat session ID parsing utilities.
 */

import { describe, it, expect } from 'vitest';
import { parseParticipantSessionId } from '../../../main/group-chat/session-parser';

describe('group-chat/session-parser', () => {
	describe('parseParticipantSessionId', () => {
		describe('non-participant session IDs', () => {
			it('should return null for regular session IDs', () => {
				expect(parseParticipantSessionId('session-abc12…
```

**git_commit** `c260cc824eb87694db78732c9a3f641fae98542e` (2026-02-05 by ch.bleuel@me.com):
```
commit c260cc824eb87694db78732c9a3f641fae98542e
Author: chr1syy <ch.bleuel@me.com>
Date: 2026-02-05T06:45:02.000Z

MAESTRO: Implement model selection for OpenCode moderator - Task 3.1

- Add customModel field to ModeratorConfig type for storing selected model
- Update NewGroupChatModal to pass agentConfig.model through moderatorConfig
- Update App.tsx handleCreateGroupChat to accept customModel pa…
```

**source** `src/shared/group-chat-types.ts@f6d6fa3f57246bcba3dae8a54a318` (2026-04-15):
```
/**
 * @file group-chat-types.ts
 * @description Shared type definitions and utilities for Group Chat feature.
 * Used by both main process and renderer.
 */

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize a name for use in @mentions.
 * Replaces spaces with hyphens so names can be referenced without quotes.
 *
 * @param name - Original name (may…
```

**source** `src/main/index.ts@2548fe389cae05340b4ede150ba1d17857c7198917` (2026-04-15):
```
import { app, BrowserWindow, powerMonitor } from 'electron';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
// Sentry is imported dynamically below to avoid module-load-time access to electron.app
// which causes "Cannot read properties of undefined (reading 'getAppPath')" errors
import { ProcessManager } from './process-manager';
import { WebServer } from './web-server';
import { AgentDetector } from './agents';
import { logger } from './utils/logger';
import { tunne…
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**source** `src/cli/commands/list-groups.ts@62afad8150b010ecc0731fb97f51` (2026-04-15):
```
// List groups command
// Lists all session groups from Maestro storage

import { readGroups } from '../services/storage';
import { formatGroups, formatError, GroupDisplay } from '../output/formatter';

interface ListGroupsOptions {
	json?: boolean;
}

export function listGroups(options: ListGroupsOptions): void {
	try {
		const groups = readGroups();

		if (options.json) {
			// JSON array output
			const output = groups.map((g) => ({
				id: g.id,
				name: g.name,
				emoji: g.emoji,
				coll…
```
```

</details>

**Condition B (pack, no companion):** ~6917 tok (6445 prompt + 472 answer)

Based on the codebase and architectural patterns in `src/main/group-chat/group-chat-router.ts`, the group chat router determines when a participant (or the moderator) is done based on **process lifecycle and mention-driven routing** rather than stop tokens.

The reference to the "absence of `@src/__tests__/renderer/hooks/useAtMentionCompletion.test.ts`" in your query appears to be a substitution for **`@mentions`** (at-mentions) in general, likely due to an autocomplete artifact. The router relies on the presence or absence of mentions to manage state:

1.  **Mention-Driven State Machine**: The router uses `extractMentions` and `extractAllMentions` to parse the output of the moderator. When the moderator mentions an agent (e.g., `@claude-code`), the router adds that agent to `pendingParticipantResponses`. A turn is not "done" until all mentioned participants have responded (tracked via `markParticipantResponded`).
2.  **Process Exit vs. Stop Tokens**: Since participants are spawned as separate CLI processes (orchestrated by `ProcessManager`), the system relies on the **exit code** or the closing of the stdout stream to signal that a participant has finished its specific task. Stop tokens are internal to the LLM's generation, but Maestro treats agents as black-box CLI tools.
3.  **Moderator Synthesis**: The moderator is considered "done" with a coordination phase when it stops producing output that contains new `@mentions`. If no new mentions are detected in a moderator's response, the router triggers `spawnModeratorSynthesis()` to wrap up the conversation or wait for the user.

In summary, the router uses **explicit `@mention` extraction** to define the dependency graph of the conversation and **process termination** to signal completion, providing a robust way to coordinate independent CLI-based agents that do not share a unified stop-token vocabulary.

**Condition C (pack + companion):** ~7693 tok (7296 prompt + 397 answer)

In Maestro's group chat, the router uses the **absence of `@mentions`** rather than stop tokens to determine turn finality primarily because it operates as a **CLI-wrapping orchestrator** rather than a direct LLM consumer.

1.  **Architecture (CLI vs. API):** Maestro orchestrates participants (like `claude-code` or `gemini-cli`) by spawning them as subprocesses and capturing their `stdout`. Since it consumes text from a CLI wrapper rather than a raw LLM stream, it lacks access to low-level **stop tokens** or finish reasons.
2.  **Semantic Delegation:** The router uses `@mentions` as a high-level **flow control mechanism**. In `src/main/group-chat/group-chat-router.ts`, `routeModeratorResponse` extracts mentions to decide if it should spawn follow-up sessions. If `mentions.length === 0`, it interprets the response as "final." This allows the moderator to explicitly choose between delegating to an agent or synthesizing a final answer for the user.
3.  **Explicit Hand-off:** The moderator's system prompt (referenced in PR #437 and `src/main/group-chat/group-chat-router.ts`) explicitly instructs the agent to "Synthesize into a final answer... (NO @mentions)" or "@mention specific agents for follow-up."
4.  **Mention-based Routing:** The specific file path mentioned (`@src/__tests__/renderer/hooks/useAtMentionCompletion.test.ts`) is a valid mention by syntax, but since `extractMentions` filters against known `participants`, it does not trigger a session spawn, effectively allowing "contextual mentions" (like files) to exist without disrupting the turn-taking logic.

---

## Q8 [large] — Why is pendingParticipantResponses a module-level Map rather than persistent storage?

**Pack:** 526 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.98, 0.94, 0.92, 0.91, 0.90]); Structural signals

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why is pendingParticipantResponses a module-level Map rather than persistent storage?  Budget: 6000 tokens | Used: ~5254 | 60 results (1 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/main/group-chat/group-chat-router.ts::pendingParticipantResponses` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/142` **[issue]** — score 0.707 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts` **[module]** — score 0.680 | evidence: 2 episode(s)
- `src/main/storage/codex-session-storage.ts` **[module]** — score 0.680 | evidence: 2 episode(s)
- `src/main/storage/opencode-session-storage.ts` **[module]** — score 0.680 | evidence: 2 episode(s)
- `src/main/storage/factory-droid-session-storage.ts` **[module]** — score 0.655 | evidence: 2 episode(s)
- `src/main/storage/claude-session-storage.ts::StoredOriginData` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::ClaudeSessionOriginsData` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::extractTextFromContent` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::parseSessionContent` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::parseSessionFile` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::parseSessionFileRemote` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/claude-session-storage.ts::ClaudeSessionStorage` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::getCodexSessionsDir` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::CodexSessionMetadata` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::CodexMessageContent` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::extractSessionIdFromFilename` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::extractTextFromContent` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::isSystemContextMessage` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::extractCwdFromText` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::normalizeProjectPath` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::isSessionForProject` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::CodexSessionCacheEntry` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::CodexSessionCache` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::getCodexSessionCachePath` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::loadCodexSessionCache` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::saveCodexSessionCache` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::parseSessionFile` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/codex-session-storage.ts::CodexSessionStorage` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage/opencode-session-storage.ts::getOpenCodeStorageDir` **[symbol]** — score 0.655 | evidence: 1 episode(s)
- `src/main/storage` **[module]** — score 0.065 | evidence: 1 episode(s)
- `src/main/storage/index.ts` **[module]** — score 0.065 | evidence: 2 episode(s)
- `src/__tests__/main/storage` **[module]** — score 0.065 | evidence: 1 episode(s)
- `src/cli/services/storage.ts` **[module]** — score 0.065 | evidence: 2 episode(s)
- `src/main/agent-session-storage.ts` **[module]** — score 0.065 | evidence: 1 episode(s)
- `src/main/agents/session-storage.ts` **[module]** — score 0.065 | evidence: 2 episode(s)
- `src/main/ipc/handlers/persistence.ts` **[module]** — score 0.065 | evidence: 2 episode(s)
- `src/cli/services/storage.ts::resolveId` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `src/cli/services/storage.ts::readGroups` **[symbol]** — score 0.065 | evidence: 1 episode(s)
- `src/cli/services/storage.ts::GroupsStore` **[symbol]** — score 0.065 | evidence: 1 episode(s)

### Structural signals (verify before citing)
_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._

- src/main/group-chat/group-chat-router.ts defines pendingParticipantResponses **[observed]** — score 1.000
- pendingParticipantResponses is defined in src/main/group-chat/group-chat-router.ts **[observed]** — score 0.937
- src/main/storage/opencode-session-storage.ts defines OPENCODE_STORAGE_DIR **[observed]** — score 0.593
- src/__tests__/main/storage/claude-session-storage.test.ts imports src/main/storage/claude-session-storage.ts **[observed]** — score 0.587
- src/main/storage contains file src/main/storage/claude-session-storage.ts **[observed]** — score 0.583
- src/main/storage contains file src/main/storage/codex-session-storage.ts **[observed]** — score 0.583
- src/main/storage contains file src/main/storage/opencode-session-storage.ts **[observed]** — score 0.583
- OPENCODE_STORAGE_DIR is defined in src/main/storage/opencode-session-storage.ts **[observed]** — score 0.574
- src/main/storage contains file src/main/storage/factory-droid-session-storage.ts **[observed]** — score 0.574
- src/main/storage/index.ts imports src/main/storage/claude-session-storage.ts **[observed]** — score 0.574
- src/main/storage/index.ts imports src/main/storage/opencode-session-storage.ts **[observed]** — score 0.574
- src/main/storage/index.ts imports src/main/storage/codex-session-storage.ts **[observed]** — score 0.574
- src/main/storage/index.ts imports src/main/storage/factory-droid-session-storage.ts **[observed]** — score 0.565
- src/main/storage/claude-session-storage.ts and src/main/storage/codex-session-storage.ts co-change frequently (5 shared commits) **[inferred]** — score 0.559
- src/main/storage/claude-session-storage.ts and src/main/storage/opencode-session-storage.ts co-change frequently (5 shared commits) **[inferred]** — score 0.559
- src/main/storage/codex-session-storage.ts and src/main/storage/opencode-session-storage.ts co-change frequently (6 shared commits) **[inferred]** — score 0.559
- src/__tests__/main/storage contains file src/__tests__/main/storage/claude-session-storage.test.ts **[observed]** — score 0.556
- src/main/storage/claude-session-storage.ts defines StoredOriginData **[observed]** — score 0.549
- src/main/storage/claude-session-storage.ts defines ClaudeSessionOriginsData **[observed]** — score 0.549
- src/main/storage/claude-session-storage.ts defines extractTextFromContent **[observed]** — score 0.549

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/517` (2026-03-05 by reachrazamair) — confidence 1.000:
```
PR #517: refactor: centralize platform detection into shared utilities (#319)
URL: https://github.com/RunMaestro/Maestro/pull/517
State: closed
Author: reachrazamair
Created: 2026-03-05T01:26:19Z

## Summary

- Replace 60+ inline `process.platform` checks across 30 main/shared/CLI files with calls to a new `src/shared/platformDetection.ts` module (`isWindows()`, `isMacOS()`, `isLinux()`, `getWhichCommand()`)
- Replace 3 different `navigator.platform` / `navigator.userAgent` approaches in the renderer with calls to `src/renderer/utils/platformUtils.ts` (`isWindowsPlatform()`, `isMacOSPlatform()`, `isLinuxPlatform()`), all reading from the reliable `window.maestro.platform` preload bridge
- Eliminate the `which`/`where` command duplication (was copy-pasted 4 times) via `getWhichCommand()`
- Simplify `shortcutFormatter.ts` from a module-level `navigator.userAgent` constant to a function call, removing the need for `vi.resetModules()` + dynamic imports in its test file

## What changed

### New files
| File | Purpose |
|------|---------|
| `src/shared/platformDetection.ts` | Shared platform helpers for main process, CLI, and shared code |
| `src/__tests__/shared/platformDe…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/363` (2026-02-12 by reachrazamair) — confidence 0.976:
```
PR #363: refactor: added groupChatStore, operationStore, batchStore
URL: https://github.com/RunMaestro/Maestro/pull/363
State: closed
Author: reachrazamair
Created: 2026-02-12T23:26:55Z

## Summary

- Create 3 new Zustand stores (`groupChatStore`, `operationStore`, `batchStore`) replacing 2 React contexts and consolidating scattered module-level state
- Delete `GroupChatContext.tsx` (339 lines) and `AutoRunContext.tsx` (182 lines), removing their providers from the component tree
- Consolidate module-level `let` globals from 3 operation hooks (`useSummarizeAndContinue`, `useMergeSession`, `useSendToAgent`) into `operationStore`
- Replace `useReducer` + manual ref-syncing pattern in `useBatchProcessor` with reactive store reads
- Net reduction: −645 lines (4,225 added / 4,870 removed across 87 files), with 200 new store tests (91 batch + 54 operation + 55 group chat)
- All 18,956 tests pass, TypeScript clean

### App.tsx reduction

App.tsx: **12,683 → 12,651 lines** (−32 lines in this PR). The line count reduction is modest because these stores primarily extracted state from context files and hooks rather than from App.tsx itself. However, the structural improvement is si…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/362` (2026-02-12 by jeffscottward) — confidence 0.939:
```
PR #362: feat: add persistent chat side alignment toggle
URL: https://github.com/RunMaestro/Maestro/pull/362
State: closed
Author: jeffscottward
Created: 2026-02-12T22:36:59Z

## Summary
Adds a persistent chat layout preference so users can choose whether their own messages render on the right or left.

## Changes
- add new setting: `chatUserMessagesOnRight` (default `true`)
- expose setting in Display settings as: "Place user messages on the right"
- wire setting through app props and main panel props
- apply alignment logic in:
  - `TerminalOutput` (single-agent chat)
  - `GroupChatMessages` (group chat view)
- preserve existing default behavior while enabling immediate runtime switching

## Validation
- `npm run test -- src/__tests__/renderer/components/TerminalOutput.test.tsx src/__tests__/renderer/components/SettingsModal.test.tsx`
- `npx tsc -p tsconfig.lint.json --noEmit`

Closes #358
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/526` (2026-03-07 by pedramamini) — confidence 0.924:
```
PR #526: Terminal Upgrade!
URL: https://github.com/RunMaestro/Maestro/pull/526
State: closed
Author: pedramamini
Created: 2026-03-07T03:20:10Z

Massive terminal upgrade! We use xterm.js now and it opens as a tab side-by-side with our AI chat and file preview tabs. Multiple terminals can be opened. Terminals can be renamed. Content is persistent between focus changes.

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **New Features**
  * Persistent PTY-backed terminal tabs: create, switch, close, rename, and restore across sessions
  * SSH-backed remote terminals and per-tab shell/working-directory support
  * In-terminal search with previous/next navigation and keyboard shortcuts

* **Improvements**
  * Terminal tab lifecycle and unified tab integration (AI, file, terminal)
  * Keyboard shortcuts: New Terminal Tab and Clear Terminal

* **Removed**
  * Terminal width configuration setting

* **Documentation**
  * Added Terminal Tab System docs describing usage and behavior
<!-- end of auto-generated comment: release notes by coderabbit.ai -->
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/540` (2026-03-09 by jSydorowicz21) — confidence 0.907:
```
PR #540:  feat: persistent web link
URL: https://github.com/RunMaestro/Maestro/pull/540
State: closed
Author: jSydorowicz21
Created: 2026-03-09T00:48:08Z

  Adds a toggle in the Live overlay panel that lets users lock in their                                                   
  current web server URL. When enabled, the security token is saved to
  settings and reused on future startups instead of generating a fresh
  one each time. Handy for anyone sharing the link on a local network
  who doesn't want it to break every time Maestro restarts.
  
  Default state is off

  Toggling ON immediately persists the running server's token (no restart
  needed). Toggling OFF clears the stored token so a fresh one is
  generated next time.

<!-- This is an auto-generated comment: release notes by coderabbit.ai -->
## Summary by CodeRabbit

* **New Features**
  * "Persistent Web Link" toggle to persist or clear the web access token across restarts; ability to persist the current token on demand.

* **Accessibility**
  * Settings checkbox exposes aria-pressed for assistive technologies.

* **Settings**
  * Adds persistentWebLink setting (default off) with UI/state wiring …
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/393` (2026-02-16 by reachrazamair) — confidence 0.898:
```
PR #393: refactor: completed state refactor moving major context to their dedicated Zustand stores
URL: https://github.com/RunMaestro/Maestro/pull/393
State: closed
Author: reachrazamair
Created: 2026-02-16T14:42:21Z

## Summary

- **notificationStore**: New Zustand store replacing `ToastContext`. Consolidates toast queue management, notification configuration, and side effects (logging, audio TTS, OS notifications, auto-dismiss) into a module-level `notifyToast()` wrapper. Eliminates the `addToastRef` pattern from App.tsx (~47 call sites replaced with direct `notifyToast()` calls). `ToastContext.tsx` deleted.
- **settingsStore**: New Zustand store replacing the internals of the 2,088-line `useSettings` hook. All 100+ settings now live in Zustand with `getState()`/`setState()` access outside React. The `useSettings` hook is retained as a thin adapter that delegates to the store, preserving the existing API contract for all consumers. No component changes required.

## Details

| Store | Lines | Tests | Replaces |
|-------|-------|-------|----------|
| notificationStore | 293 | 74 | ToastContext (239 lines deleted) |
| settingsStore | 1,661 | 112 | useSettings internals (1…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**source** `src/main/group-chat/group-chat-router.ts@438aa4976aae546eda4` (2026-04-15):
```
/**
 * @file group-chat-router.ts
 * @description Message routing for Group Chat feature.
 *
 * Routes messages between:
 * - User -> Moderator
 * - Moderator -> Participants (via @mentions)
 * - Participants -> Moderator
 */

import * as os from 'os';
import {
	GroupChatParticipant,
	loadGroupChat,
	updateParticipant,
	addGroupChatHistoryEntry,
	extractFirstSentence,
	getGroupChatDir,
} from './group-chat-storage';
import { appendToLog, readLog } from './group-chat-log';
import {
	type GroupCha…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/142` (2026-01-03 by sudo-eugene):
```
Issue #142: Issue: Command Terminal Lacks Support for Persistent/Long-Running Processes
URL: https://github.com/RunMaestro/Maestro/issues/142
State: closed
Author: sudo-eugene
Created: 2026-01-03T07:48:30Z

The Command Terminal doesn't properly support long-running processes like `npm run dev`, `docker-compose up`, or `tail -f`. There's no clear way to terminate these processes, and their continuous output creates excessive noise in the message-style interface.

I checked the documentation at do…
```

**git_commit** `11d0c672e82d518b29cd8fb30a813bb3b4cb54a1` (2026-02-08 by pedram.amini@gmail.com):
```
commit 11d0c672e82d518b29cd8fb30a813bb3b4cb54a1
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-08T17:33:33.000Z

fix: add Sentry captureException to swallowed errors across main process

Error handlers in group chat, history, agent detector, and all session
storage implementations were logging errors locally but never reporting
to Sentry. Added captureException calls alongside existin…
```

**source** `src/main/storage/claude-session-storage.ts@d7c9dfcfe1eb4dbfd` (2026-04-15):
```
/**
 * Claude Code Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for Claude Code.
 * Claude Code stores sessions as JSONL files in ~/.claude/projects/<encoded-path>/
 *
 * File structure:
 * - Each session is a .jsonl file named <session-id>.jsonl
 * - Each line is a JSON object with type, timestamp, message, etc.
 * - User and assistant messages contain the actual conversation
 * - Result messages contain token usage and cost information
 */

impo…
```

**source** `src/main/storage/codex-session-storage.ts@8aebee1bf4f5d785ae` (2026-04-15):
```
/**
 * Codex CLI Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for OpenAI Codex CLI.
 * Codex stores sessions as JSONL files in ~/.codex/sessions/YYYY/MM/DD/
 *
 * File structure:
 * - Each session is a .jsonl file named rollout-<timestamp>-<uuid>.jsonl
 * - First line contains session metadata (id, timestamp, git info)
 * - Subsequent lines contain message entries
 *
 * Session format (from Codex --json output):
 * ```json
 * // First line: sessio…
```

**source** `src/main/storage/opencode-session-storage.ts@5bf21a77509f296` (2026-04-15):
```
/**
 * OpenCode Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for OpenCode.
 * OpenCode stores sessions as JSON files in ~/.local/share/opencode/storage/
 *
 * Directory structure:
 * - project/     - Project metadata (SHA1 hash of path as ID)
 * - session/{projectID}/ - Session metadata per project
 * - message/{sessionID}/ - Messages per session
 * - part/{messageID}/    - Message parts (text, tool, reasoning)
 *
 * Session IDs: Format is `ses_{b…
```

**source** `src/main/storage/factory-droid-session-storage.ts@fe24df1ce6` (2026-04-15):
```
/**
 * Factory Droid Session Storage Implementation
 *
 * This module implements the AgentSessionStorage interface for Factory Droid.
 * Factory Droid stores sessions as JSONL files in ~/.factory/sessions/
 *
 * Directory structure:
 * - ~/.factory/sessions/<encoded-project-path>/<uuid>.jsonl - Message history
 * - ~/.factory/sessions/<encoded-project-path>/<uuid>.settings.json - Session metadata
 *
 * Path encoding: Project paths have `/` replaced with `-`
 * Example: /Users/octavia/myproject -…
```

**git_commit** `454cdefd44832a12fbb684c9fd58e7b39445350b` (2026-01-29 by reachrazarauf@gmail.com):
```
commit 454cdefd44832a12fbb684c9fd58e7b39445350b
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-29T17:20:58.000Z

refactor: consolidate agents module and reorganize test structure

Create src/main/agents/ directory with barrel exports:
- Move agent-detector.ts → agents/detector.ts
- Move agent-definitions.ts → agents/definitions.ts
- Move agent-capabilities.ts → agents/capabilities.ts
- …
```

**source** `src/main/storage/index.ts@4a76edc6396bb4bd8f42645a2269b7b090` (2026-04-15):
```
/**
 * Agent Session Storage Module
 *
 * Exports all session storage implementations and provides
 * initialization for the storage registry.
 */

export { ClaudeSessionStorage, ClaudeSessionOriginsData } from './claude-session-storage';
export { OpenCodeSessionStorage } from './opencode-session-storage';
export { CodexSessionStorage } from './codex-session-storage';
export { FactoryDroidSessionStorage } from './factory-droid-session-storage';

import Store from 'electron-store';
import { regis…
```

**source** `src/__tests__/main/storage/claude-session-storage.test.ts@2e` (2026-04-15):
```
/**
 * Tests for ClaudeSessionStorage
 *
 * Verifies:
 * - Session origin registration and retrieval
 * - Session naming and starring
 * - Context usage tracking
 * - Origin info attachment to sessions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeSessionStorage } from '../../../main/storage/claude-session-storage';
import type { SshRemoteConfig } from '../../../shared/types';
import type Store from 'electron-store';
import type { ClaudeSessionOriginsData } f…
```

**git_commit** `cbc772997b42e9888a3ca322d5101ec37a60c1dd` (2026-01-31 by pedram.amini@gmail.com):
```
commit cbc772997b42e9888a3ca322d5101ec37a60c1dd
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-01-31T22:51:48.000Z

fix: address PR review issues for Windows compatibility

- Fix CLI storage path handling: use path.join instead of path.posix.join
  for proper Windows path construction on local filesystem operations

- Fix streamJsonBuilder format: restore correct Claude Code stream-json
…
```

**source** `src/cli/services/storage.ts@ab517b5bb4fff7598102513f782c3647` (2026-04-15):
```
// Storage service for CLI
// Reads Electron Store JSON files directly from disk

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Group, SessionInfo, HistoryEntry } from '../../shared/types';
import {
	HISTORY_VERSION,
	MAX_ENTRIES_PER_SESSION,
	HistoryFileData,
	PaginationOptions,
	PaginatedResult,
	sanitizeSessionId,
	paginateEntries,
	sortEntriesByTimestamp,
} from '../../shared/history';

// Get the Maestro config directory path
function getCon…
```

**git_commit** `43177df7bff991582f69bbaf6787873e9bbeb46f` (2026-01-22 by info@vvx7.io):
```
commit 43177df7bff991582f69bbaf6787873e9bbeb46f
Author: VVX7 <info@vvx7.io>
Date: 2026-01-22T19:04:40.000Z

Add support for Factory.ai droid agent.

See: https://factory.ai/product/cli

Files:
package-lock.json
src/__tests__/main/parsers/index.test.ts
src/__tests__/renderer/services/contextGroomer.test.ts
src/main/agent-capabilities.ts
src/main/agent-detector.ts
src/main/agent-session-storage.ts
s…
```

**source** `src/main/agents/session-storage.ts@31cd104eb1fd779040a7c769e` (2026-04-15):
```
/**
 * Agent Session Storage Interface
 *
 * This module defines the abstract interface for agent session storage.
 * Different AI agents (Claude Code, OpenCode, etc.) store their sessions
 * differently. This interface provides a common abstraction layer.
 *
 * Usage:
 * ```typescript
 * const storage = getSessionStorage('claude-code');
 * if (storage) {
 *   const sessions = await storage.listSessions('/path/to/project');
 * }
 * ```
 */

import type { ToolType, SshRemoteConfig } from '../../s…
```

**git_commit** `f47ec179b0a3fdce5899f05067e6068fe5cb7b32` (2026-02-17 by reachrazarauf@gmail.com):
```
commit f47ec179b0a3fdce5899f05067e6068fe5cb7b32
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-02-17T21:23:40.000Z

fix: address PR #404 review — batch setSessions, remove debug logs, type safety

- Batch consecutive setSessions calls in useWorktreeHandlers (avoid transient
  state and extra IPC writes)
- Remove 9 debug console.log calls from useGroupChatHandlers and
  useWorktreeHandlers
…
```

**source** `src/main/ipc/handlers/persistence.ts@1ba4070770c7c7070b259f3` (2026-04-15):
```
/**
 * Persistence IPC Handlers
 *
 * This module handles IPC calls for:
 * - Settings: get/set/getAll
 * - Sessions: getAll/setAll
 * - Groups: getAll/setAll
 * - CLI activity: getActivity
 *
 * Extracted from main/index.ts to improve code organization.
 */

import { ipcMain, app } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../../utils/logger';
import { getThemeById } from '../../themes';
import {…
```
```

</details>

**Condition B (pack, no companion):** ~6609 tok (6151 prompt + 458 answer)

I will search for the definition and usage of `pendingParticipantResponses` in `src/main/group-chat/group-chat-router.ts` to understand why it is implemented as a module-level Map.
In the Maestro codebase, `pendingParticipantResponses` is implemented as a module-level `Map` in `src/main/group-chat/group-chat-router.ts` primarily because it tracks **transient, execution-dependent state** that cannot meaningfully survive an application restart.

### 1. Ephemeral Process Lifecycle
The map acts as a synchronization barrier for asynchronous agent responses. When the Moderator mentions participants, the router spawns external agent processes (e.g., Claude CLI). If Maestro restarts, these child processes are terminated. Consequently, any "pending" response state becomes invalid because the specific execution context and process handles are lost.

### 2. Synchronization, Not State
As seen in `markParticipantResponded`, the map is used to determine when to trigger `spawnModeratorSynthesis()`. This is a coordination logic for the current conversation turn. Persisting this to disk would introduce unnecessary I/O overhead for data that is only relevant for a few seconds or minutes until the turn completes.

### 3. Non-Serializable Data
While the current implementation stores a `Set<string>`, the logic is tightly coupled with main-process event emitters (`groupChatEmitters`) and active stream handlers. These live objects cannot be restored from persistent storage like `electron-store`.

### 4. Safety and Consistency
By keeping this in memory, Maestro ensures that a fresh start always begins with a clean slate. Persistent "pending" states could lead to "ghost" agents effectively blocking the Moderator if a response was lost during a crash, requiring complex garbage collection logic that a module-level Map avoids.

**Condition C (pack + companion):** ~7575 tok (7002 prompt + 573 answer)

I will read `src/main/group-chat/group-chat-router.ts` to examine the definition and usage of `pendingParticipantResponses`.
I will check `src/main/ipc/handlers/groupChat.ts` and search for where `markParticipantResponded` is called to understand the lifecycle management of these pending responses.
I'll read `src/main/process-listeners/exit-listener.ts` to see how it manages the pending responses upon process exit.
The `pendingParticipantResponses` in `src/main/group-chat/group-chat-router.ts` is implemented as a module-level `Map` rather than persistent storage because it tracks **transient process synchronization** rather than long-term state.

Its primary role is to act as a coordination mechanism for the asynchronous lifecycle of spawned agent processes. When a moderator mentions multiple participants, Maestro spawns several CLI instances in parallel. The `Map` tracks which of these active OS processes have yet to return their buffered output. 

Key reasons for this design choice include:

1.  **Process-Bound Lifecycle**: The "pending" state is tied directly to ephemeral OS processes spawned via `processManager.spawn`. If Maestro restarts, these processes are terminated, rendering any persisted "pending" state invalid and potentially leading to "zombie" states where the UI waits for participants that no longer exist.
2.  **Atomic Coordination**: The `Map` allows for fast, synchronous updates (`markParticipantResponded`) in the main process. This is critical when multiple agents exit near-simultaneously, ensuring the transition to the moderator synthesis round (`spawnModeratorSynthesis`) happens exactly once when the `Set` becomes empty.
3.  **Persisted Logs as Ground Truth**: While the coordination state is transient, the actual conversation history is persisted via `group-chat-log.ts` and `group-chat-storage.ts`. If a round is interrupted by a crash, the user sees the partial history upon restart, but the synchronization logic starts fresh for the next message.
4.  **Architectural Simplicity**: Using persistent storage for this would require a complex "reconciliation" or "cleanup" phase on startup to handle stale pending markers from previous sessions, adding overhead for a state that naturally expires within seconds or minutes of being created.

---

## Q9 [large] — Why does Maestro define theme colors in TypeScript rather than CSS custom properties?

**Pack:** 653 lines — Possibly relevant discussions (6 hit(s), confidence: [1.00, 0.98, 0.96, 0.81, 0.81, 0.65])

<details><summary>Full context pack</summary>

```
## Context pack
> Query: Why does Maestro define theme colors in TypeScript rather than CSS custom properties?  Budget: 6000 tokens | Used: ~5949 | 32 results (29 truncated by budget)

### Entities
_Navigation aid — use as a starting point for lookup, not as authority._

- `src/shared/theme-types.ts::Theme` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/527` **[issue]** — score 0.926 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/168` **[issue]** — score 0.926 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/522` **[issue]** — score 0.919 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/651` **[issue]** — score 0.887 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/645` **[issue]** — score 0.887 | evidence: 1 episode(s)
- `src/cli/output/formatter.ts::colors` **[symbol]** — score 0.881 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/203` **[issue]** — score 0.817 | evidence: 1 episode(s)
- `src/renderer/utils/theme.tsx` **[module]** — score 0.792 | evidence: 2 episode(s)
- `src/shared/theme-types.ts` **[module]** — score 0.792 | evidence: 2 episode(s)
- `src/renderer/utils/theme.ts` **[module]** — score 0.792 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/346` **[issue]** — score 0.757 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/158` **[issue]** — score 0.757 | evidence: 1 episode(s)
- `src/shared/theme-types.ts::ThemeId` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/shared/theme-types.ts::ThemeMode` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/shared/theme-types.ts::ThemeColors` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/shared/theme-types.ts::isValidThemeId` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/utils/theme.tsx::getContextColor` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/utils/theme.tsx::getStatusColor` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `src/renderer/utils/theme.tsx::getFileIcon` **[symbol]** — score 0.743 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/650` **[issue]** — score 0.736 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/644` **[issue]** — score 0.736 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/99` **[issue]** — score 0.705 | evidence: 1 episode(s)
- `src/__tests__/renderer/utils/theme.test.tsx` **[module]** — score 0.701 | evidence: 2 episode(s)
- `src/__tests__/shared/theme-types.test.ts` **[module]** — score 0.701 | evidence: 2 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/139` **[issue]** — score 0.682 | evidence: 1 episode(s)
- `src/__tests__/renderer/utils/theme.test.tsx::mockTheme` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `src/__tests__/renderer/utils/theme.test.tsx::alternativeTheme` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `https://github.com/RunMaestro/Maestro/issues/706` **[issue]** — score 0.640 | evidence: 1 episode(s)
- `src/__tests__/renderer/components/UsageDashboard/SourceDistributionChart.test.tsx::theme` **[symbol]** — score 0.628 | evidence: 1 episode(s)
- `THEMES.md` **[module]** — score 0.062 | evidence: 2 episode(s)
- `src/main/themes.ts` **[module]** — score 0.062 | evidence: 2 episode(s)

### Possibly relevant discussions
_These may or may not address your question — verify by reading the source before citing._

**github_pr** `https://github.com/RunMaestro/Maestro/pull/369` (2026-02-15 by openasocket) — confidence 1.000:
```
PR #369: feat: extend theme system with semantic color tokens and replace hardcoded values
URL: https://github.com/RunMaestro/Maestro/pull/369
State: closed
Author: openasocket
Created: 2026-02-15T01:29:32Z

## Summary

- Replaces hardcoded color values (`#fff`, `#000`, `#ffffff`, `white`) with proper theme tokens across 15 renderer component files
- Extends `ThemeColors` interface with 17 new semantic tokens for status foregrounds, dimmed backgrounds, git diff colors, overlays, hover/active states, and shadows
- Populates all 17 theme definitions with palette-appropriate values for each new token
- Ensures WCAG 2.1 contrast compliance for all themes, including high-contrast and custom themes

## Problem

1. **Hardcoded foreground colors**: Multiple components used `#fff`/`#000`/`white` for text on accent-colored backgrounds, breaking accessibility on themes where the accent color is light
2. **Missing semantic tokens**: The theme system had only 13 tokens — no `info` color, no foreground-on-status tokens, no dimmed status backgrounds, no git diff colors, no overlay/hover/shadow tokens. Components were forced to hardcode `rgba(239, 68, 68, 0.15)`, `rgba(0, 0, 0, 0.6)`, etc.

## Sol…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/368` (2026-02-15 by openasocket) — confidence 0.977:
```
PR #368: fix: replace hardcoded color values with theme tokens for accessibility
URL: https://github.com/RunMaestro/Maestro/pull/368
State: closed
Author: openasocket
Created: 2026-02-15T01:04:24Z

## Summary

- Replaces hardcoded color values (`#fff`, `#000`, `#ffffff`, `white`) with proper theme tokens across 15 renderer component files
- Ensures WCAG 2.1 contrast compliance for all themes, including high-contrast and custom themes like dre-synth
- No visual change for default themes — tokens already resolve to appropriate values

## Problem

Multiple components used hardcoded white (`#fff`, `white`, `#ffffff`) or black (`#000`, `#000000`) for text on accent-colored or status-colored backgrounds. This approach:

1. **Breaks accessibility** on themes where the accent color is light (e.g., teal/cyan), since white-on-light fails WCAG AA contrast ratios (< 4.5:1)
2. **Bypasses the theme system** — custom and high-contrast themes can't control foreground colors for these elements
3. **Assumes dark mode** — the `theme.mode === 'light' ? '#fff' : '#000'` pattern is a fragile heuristic that doesn't account for themes with non-standard luminance relationships

## Solution

All hardcoded v…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/204` (2026-01-17 by ksylvan) — confidence 0.960:
```
PR #204: Add local manifest feature for custom playbooks
URL: https://github.com/RunMaestro/Maestro/pull/204
State: closed
Author: ksylvan
Created: 2026-01-17T20:29:00Z

# Add local manifest feature for custom playbooks

## Summary

This PR introduces a new "local manifest" feature that allows users to define custom or work-in-progress playbooks stored locally on their filesystem. These local playbooks can override official ones from the GitHub repository or be added as new entries, enabling private, organization-specific automation without requiring public sharing. The implementation includes manifest merging, hot reload for development, and UI indicators to distinguish local playbooks.

## Related Issues

Closes #203 

## Screenshots

The Category view with the "Local" badge:

<img width="936" height="722" alt="image" src="https://github.com/user-attachments/assets/23c87f6d-2b2a-4f05-998a-f0eb75c0de17" />

The local playbook view:

<img width="911" height="1009" alt="image" src="https://github.com/user-attachments/assets/b9b92063-3f9e-4e78-aedc-a4cc862e42e5" />


## Files Changed

- **docs/examples/local-manifest.json** (new file): Provides a sample JSON st…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/551` (2026-03-11 by openasocket) — confidence 0.808:
```
PR #551: fix: WCAG-compliant theme token system (retargeted from #370)
URL: https://github.com/RunMaestro/Maestro/pull/551
State: closed
Author: openasocket
Created: 2026-03-11T04:11:47Z

## Summary
- Retarget of PR #370 (`fix/theme-integration`) from `main` to `0.16.0-RC`
- Adds WCAG-compliant theme token system with ThemeColors expanded to 30 required fields
- Sectioned CustomThemeBuilder UI for all color categories (backgrounds, typography, accent, status, git diff, overlays)
- All 16 built-in themes updated with complete color tokens (info, foregrounds, dims, diff, overlay, interactive states)
- ANSI terminal palettes preserved per-theme

## Conflict Resolution
Resolved 13 merge conflicts via squash-merge approach:
- **Theme infrastructure** (`theme-types.ts`, `themes.ts`, `CustomThemeBuilder.tsx`): PR's expanded token system preserved
- **Component files**: RC's structural additions kept; hardcoded colors retained for RC-modified components (tokenization can follow up)
- **Settings/types**: RC's latest features preserved (globalStats, encore features, etc.)
- Fixed 4 test expectations for test/component color mismatch

## Test Plan
- [x] TypeScript compiles clean (`npx tsc --n…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/608` (2026-03-24 by reachrazamair) — confidence 0.808:
```
PR #608: fix(cue): theme conformity, context menu dismiss, and drag stability
URL: https://github.com/RunMaestro/Maestro/pull/608
State: closed
Author: reachrazamair
Created: 2026-03-24T21:17:08Z

## Summary
- Replace ~100 hardcoded color values across 28 Cue components with theme-aware equivalents (`theme.colors.*`), ensuring the pipeline editor, config panels, dashboard, and context menus adapt to all app themes (light, dark, vibe)
- Fix `PipelineContextMenu` not closing on click-outside or Escape — now uses `useClickOutside` + `useContextMenuPosition` hooks matching the `NodeContextMenu` pattern
- Fix `CueSettingsPanel` missing click-outside and Escape dismiss behavior
- Fix node drag in "All Pipelines" view — extract `computePipelineYOffsets` and stabilize offsets based on pipeline structure rather than bounding boxes, eliminating the feedback loop where dragging shifted all pipelines below

## Test plan
- 25 new tests across 4 new and 3 updated test files (theme conformity, dismiss behavior, offset computation)
- Full suite: 23,785 tests pass, 0 failures
- TypeScript compiles cleanly
- ESLint passes
- Manual: switch between github-light, dracula, and maestros-choice…
```

**github_pr** `https://github.com/RunMaestro/Maestro/pull/379` (2026-02-15 by felipeggv) — confidence 0.646:
```
PR #379: feat: Unified Inbox — cross-session notification center
URL: https://github.com/RunMaestro/Maestro/pull/379
State: closed
Author: felipeggv
Created: 2026-02-15T15:24:19Z

## Summary

- **Unified Inbox**: A new modal (Alt+Cmd+I) that aggregates notifications from all active sessions into a single, keyboard-navigable view
- **10-phase implementation** across 52 commits — types, virtualized list, keyboard navigation, filters, sort, grouping, visual polish, and comprehensive test coverage
- **168 files changed** with full lint and test gate verification at every phase

## Features

- **Cross-session aggregation** — collects status updates, errors, and action-needed items from all running agents
- **Keyboard-first navigation** — Tab cycling, arrow keys, Enter to jump to session, Escape to close
- **Smart filtering** — All / Unread / Read filters with sort by time or status
- **Session grouping** — Group by session with collapsible chevron toggles
- **Virtualized rendering** — react-window for smooth performance with large notification lists
- **Agent context** — Each card shows agent type icon, session name, tab name, and timestamp
- **Left Bar integration** — Acc…
```

### Evidence excerpts
_Raw source text. Citable if you verify it matches current code._

**source** `src/shared/theme-types.ts@e9ef346a5c961003f02d5f695e6e4118df` (2026-04-15):
```
/**
 * Shared theme type definitions for Maestro
 *
 * This file contains theme types used across:
 * - Main process (Electron)
 * - Renderer process (Desktop React app)
 * - Web interface (Mobile and Desktop web builds)
 *
 * Keep this file dependency-free to ensure it can be imported anywhere.
 */

/**
 * Available theme identifiers
 */
export type ThemeId =
	| 'dracula'
	| 'monokai'
	| 'github-light'
	| 'solarized-light'
	| 'nord'
	| 'tokyo-night'
	| 'one-light'
	| 'gruvbox-light'
	| 'catppuc…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/527` (2026-03-07 by ahostetler300):
```
Issue #527: Opencode: Custom Slash Command Error
URL: https://github.com/RunMaestro/Maestro/issues/527
State: closed
Author: ahostetler300
Created: 2026-03-07T04:41:07Z

**Agent**: OpenCode
**Model**: Gemini Flash 3

I've started creating my own slash commands, and I frequently get the following error in Maestro.

`Agent exited with code 1opencode run [message..]run opencode with a messagePositionals: message message to send [array] [default: []]Options: -h, --help show help [boolean] -v, --vers…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/168` (2026-01-09 by gsxdsm):
```
Issue #168: Support for custom notification paths
URL: https://github.com/RunMaestro/Maestro/issues/168
State: closed
Author: gsxdsm
Created: 2026-01-09T15:17:47Z

Would be great to have ntfy integration for posting remote notifications
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/522` (2026-03-06 by Ashraf-Ali-aa):
```
Issue #522: Feature Request: TypeScript-Native LLM Guard for Input/Output Protection
URL: https://github.com/RunMaestro/Maestro/issues/522
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-06T17:53:21Z

### Summary

Build a TypeScript-native security scanning library (inspired by [LLM Guard](https://github.com/protectai/llm-guard)) that Maestro can use directly to provide input sanitization, output validation, PII protection, prompt injection detection, and secrets scanning across all managed…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/651` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #651: [Mobile App] Custom AI Slash Commands
URL: https://github.com/RunMaestro/Maestro/issues/651
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:44:04Z

## Overview

Implement custom slash commands in the mobile app, synchronized from desktop Maestro. This enables users to access their personalized AI commands seamlessly on mobile.

**Labels:** `mobile`, `commands`, `frontend` *(to be added by maintainer)*

## Requirements

### Custom Slash Commands Sync
Custom commands synced …
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/645` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #645: [Mobile App] Custom AI Slash Commands
URL: https://github.com/RunMaestro/Maestro/issues/645
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:39:57Z

## Summary

Implement custom slash commands in the mobile app that sync from the desktop Maestro configuration. Users should be able to use their personalized AI commands from mobile.

## Custom Commands Sync

Commands received from desktop via WebSocket `custom_commands` message:

```typescript
interface CustomCommand {
  id: …
```

**source** `src/cli/output/formatter.ts@9b60207d21bfe2890a111abfd2f822b1` (2026-04-15):
```
// Human-readable output formatter for CLI
// Provides beautiful, colored terminal output

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',

	// Foreground colors
	black: '\x1b[30m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	magenta: '\x1b[35m',
	cyan: '\x1b[36m',
	white: '\x1b[37m',
	gray: '\x1b[90m',

	// Bright foreground colors
	brightRed: '\x1b[91m',
	brightGreen: '\x1b[92m',
	brightYellow: '\x1b[93m',
	brightBlu…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/203` (2026-01-17 by ksylvan):
```
Issue #203: Enhancement Request: Local Manifest Support for Custom Playbooks
URL: https://github.com/RunMaestro/Maestro/issues/203
State: closed
Author: ksylvan
Created: 2026-01-17T18:39:00Z

# Enhancement Request: Local Manifest Support for Custom Playbooks

## Summary
Add support for a local `manifest.json` file that extends the Playbook Exchange with custom or work-in-progress playbooks.

## Use Cases

1. **Bespoke Playbooks** - Create organization-specific playbooks that aren't suitable for …
```

**git_commit** `8de53cd84b2866785c3a47d297619744e19fe982` (2026-02-11 by reachrazarauf@gmail.com):
```
commit 8de53cd84b2866785c3a47d297619744e19fe982
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-02-11T13:14:41.000Z

refactor: complete agentStore Phases 2-3, extract ~1,850 lines from App.tsx

Phase 2 — useAgentListeners hook:
- Extract IPC listener useEffect (~1,520 lines) from App.tsx into
  src/renderer/hooks/agent/useAgentListeners.ts
- Covers onData, onUsage, onStderr, onExit, onAgent…
```

**source** `src/renderer/utils/theme.tsx@93e0e56124ab681d3cdda64b5b32ac8` (2026-04-15):
```
import { FilePlus, Trash2, FileCode, FileText } from 'lucide-react';
import type { Theme, SessionState, FileChangeType } from '../types';

// Re-export formatActiveTime from formatters for backwards compatibility
export { formatActiveTime } from './formatters';

// Get color based on context usage percentage.
// Thresholds default to 60/80 but can be overridden to match user's context warning settings.
export const getContextColor = (
	usage: number,
	theme: Theme,
	yellowThreshold = 60,
	redThr…
```

**git_commit** `231fe2fd8884318019bfaf4bd74a5dd48f7f8525` (2026-01-19 by reachrazarauf@gmail.com):
```
commit 231fe2fd8884318019bfaf4bd74a5dd48f7f8525
Author: Raza Rauf <reachrazarauf@gmail.com>
Date: 2026-01-19T21:21:36.000Z

chore: format entire codebase with prettier

Run `npm run format` across all TypeScript/TSX files
for consistent code formatting throughout the project.

Files:
src/__tests__/cli/commands/list-agents.test.ts
src/__tests__/cli/commands/list-groups.test.ts
src/__tests__/cli/com…
```

**git_commit** `e542d27fb896869b457161f3881aee8b58e5232e` (2025-11-24 by pedram.amini@gmail.com):
```
commit e542d27fb896869b457161f3881aee8b58e5232e
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-11-24T04:44:55.000Z

refactor: extract right panel components (Round 2 - 160 line reduction)

Created three new components to modularize right panel:
- FileExplorerPanel.tsx - File tree rendering with filtering and navigation
- HistoryPanel.tsx - Work log timeline display
- RightPanel.tsx - Wra…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/346` (2026-02-11 by rnwolfe):
```
Issue #346: FR: support for custom SSH config such as control items
URL: https://github.com/RunMaestro/Maestro/issues/346
State: closed
Author: rnwolfe
Created: 2026-02-11T20:30:06Z

I have a catch all SSH config (though, in this context it is really just relevant to one remote session I am using for Maestro). This is not just an optimization, rather a requirement in case as I have to touch a physical security key for every ssh connection. If they share a control session, I touch it once and eve…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/158` (2026-01-07 by ksylvan):
```
Issue #158: OpenCode  seeming to hang on startup (custom permissions fixes this)
URL: https://github.com/RunMaestro/Maestro/issues/158
State: closed
Author: ksylvan
Created: 2026-01-07T18:33:48Z

Thanks @pedramamini for your prompt fix release for OpenCode #153

I'm creating this issue for other devs who run into similar issues.

Now, when I run it, it no longer hard-crashes but just hangs.

Then, when going to stop it, the "Stopping" badge just spins:

<img width="119" height="48" alt="Image" s…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/650` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #650: [Mobile App] Dynamic Theme Support with Desktop Sync
URL: https://github.com/RunMaestro/Maestro/issues/650
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:43:04Z

## Overview

Implement dynamic theme support in the mobile app that syncs with the desktop Maestro theme system, providing visual consistency across platforms.

## Theme System Details

Maestro has 17 built-in themes in `src/shared/themes.ts`:

### Dark Themes (6)
- Dracula
- Monokai
- Nord
- Tokyo Night
- Catppu…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/644` (2026-03-27 by Ashraf-Ali-aa):
```
Issue #644: [Mobile App] Dynamic Theme Support with Desktop Sync
URL: https://github.com/RunMaestro/Maestro/issues/644
State: closed
Author: Ashraf-Ali-aa
Created: 2026-03-27T21:39:38Z

## Summary

Implement dynamic theme support in the mobile app that syncs with Maestro desktop themes. Users should see the same color scheme on mobile as they have configured on desktop.

## Theme System Requirements

Match desktop Maestro theme system:
- **25+ built-in themes** from `src/shared/themes.ts`
- **Da…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/99` (2025-12-26 by carvalab):
```
Issue #99: [Bug]: Custom Opencode Path Not Detected/Saving in Wizard or New Agent
URL: https://github.com/RunMaestro/Maestro/issues/99
State: closed
Author: carvalab
Created: 2025-12-26T15:46:42Z

I am experiencing issues with `opencode` detection on macOS in Maestro v0.12.0. Despite having `opencode` installed at `~/.opencode/bin/opencode`, Maestro fails to detect it automatically. Additionally, the wizard interface prevents open customize button, and the debug info does not reflect attempts to…
```

**git_commit** `7506aad7eae0e5640ab974506c4960aea1412a1e` (2026-02-09 by pedram.amini@gmail.com):
```
commit 7506aad7eae0e5640ab974506c4960aea1412a1e
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2026-02-09T03:35:00.000Z

fix: sync context window bar colors with user's warning threshold settings

The header context bar used hardcoded 60/80% thresholds while the bottom
warning sash used configurable thresholds from settings, causing color
mismatches (e.g., green bar at top but yellow warning …
```

**source** `src/__tests__/renderer/utils/theme.test.tsx@085a34b89b2b7d5f` (2026-04-15):
```
/**
 * Tests for src/renderer/utils/theme.tsx
 *
 * Tests theme-related utility functions:
 * - getContextColor: Returns color based on context usage percentage
 * - getStatusColor: Returns color based on session state
 * - formatActiveTime: Formats milliseconds to display string
 * - getFileIcon: Returns file icon based on change type
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
	getContextColor,
	getStatusColor,
	formatActiveTime…
```

**source** `src/__tests__/shared/theme-types.test.ts@a9454482a6a70dd5ad4` (2026-04-15):
```
/**
 * Tests for src/shared/theme-types.ts
 *
 * Tests the isValidThemeId type guard function.
 */

import { describe, it, expect } from 'vitest';
import { isValidThemeId, type ThemeId } from '../../shared/theme-types';

describe('isValidThemeId', () => {
	// Sample of valid theme IDs (not exhaustive - that would couple tests to implementation)
	const sampleValidIds = ['dracula', 'monokai', 'github-light', 'nord', 'pedurple'];

	it('should return true for valid theme IDs', () => {
		for (const i…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/139` (2026-01-02 by TimeCrush):
```
Issue #139: Feature Request: Automatic Failover to Custom Anthropic-Compatible Endpoints (via Env Var Swap)
URL: https://github.com/RunMaestro/Maestro/issues/139
State: open
Author: TimeCrush
Created: 2026-01-02T08:37:09Z


### Feature Request: Automatic Failover to Custom Anthropic-Compatible Endpoints (via Env Var Swap)

### Is your feature request related to a problem? Please describe.
Yes. Currently, if the primary Anthropic API connection stalls—due to rate limits (429), credit exhaustion (…
```

**github_issue** `https://github.com/RunMaestro/Maestro/issues/706` (2026-04-02 by jSydorowicz21):
```
Issue #706: bug: custom Claude Code skill descriptions show generic fallback on Linux/WSL (case-sensitive filesystem)
URL: https://github.com/RunMaestro/Maestro/issues/706
State: open
Author: jSydorowicz21
Created: 2026-04-02T03:25:17Z

## Bug Description

Custom Claude Code skills always display "A Claude Code Skill" or "Agent command" as their description in Maestro, instead of the actual description from the skill's frontmatter.

## Root Cause

In `src/main/ipc/handlers/claude.ts` line 1672, …
```

**source** `src/__tests__/renderer/components/UsageDashboard/SourceDistr` (2026-04-15):
```
/**
 * Tests for SourceDistributionChart component
 *
 * Verifies:
 * - Renders donut/pie chart showing Interactive vs Auto breakdown
 * - Toggle between count-based and duration-based views
 * - Center label shows total
 * - Legend with percentages
 * - Theme-aware colors (accent for interactive, secondary for auto)
 * - Tooltip shows details on hover
 * - Handles empty data gracefully
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-librar…
```

**git_commit** `bb5e13c1a3f145bba05d44c4a3ed8f2ee486d334` (2025-12-09 by pedram.amini@gmail.com):
```
commit bb5e13c1a3f145bba05d44c4a3ed8f2ee486d334
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-09T16:12:59.000Z

Reformat THEMES.md for improved readability


Files:
THEMES.md
```

**source** `THEMES.md@49843eac69fd220fcabf0a45395e60ff5fa6e72b4a62fa9446` (2026-04-15):
```
# Themes

Maestro ships with a variety of themes that fall under three categories: Dark, Light, and "Vibes". Here are screenshots of the main window in each theme.

## Dark
### Dracula
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/bf76f858-e37d-48f5-966b-ee226f42cb76" />

### Monokai
<img width="3592" height="2302" alt="image" src="https://github.com/user-attachments/assets/09db8891-4303-419a-b4ab-be729cf65e04" />

### Nord
<img width="35…
```

**git_commit** `b1faa9f3109ba997a404dc4f3d7d0833b885f862` (2025-12-17 by pedram.amini@gmail.com):
```
commit b1faa9f3109ba997a404dc4f3d7d0833b885f862
Author: Pedram Amini <pedram.amini@gmail.com>
Date: 2025-12-17T01:58:34.000Z

MAESTRO: Implement Phase 2 of multi-provider refactor - Identifier Renames

This commit completes Phase 2 of the multi-provider refactoring plan,
renaming Claude-specific identifiers to generic "agent" terminology.

Type Definition Changes:
- AITab interface: claudeSessionI…
```
```

</details>

**Condition B (pack, no companion):** ~7038 tok (6679 prompt + 359 answer)

Maestro defines theme colors in TypeScript primarily to ensure **cross-process consistency** and **strict architectural validation** across its multi-environment ecosystem, including the Electron Main process, React Renderer, and the CLI. Because `src/shared/theme-types.ts` is "dependency-free," these definitions are portable to terminal formatters (`src/cli/output/formatter.ts`) and the Main process, where CSS custom properties are unavailable.

According to **PR #551** and **PR #369**, this approach enables a **WCAG-compliant semantic token system**. By defining `ThemeColors` with 30 required fields, Maestro uses TypeScript's type system to guarantee that every theme (e.g., Dracula, Nord) is visually complete and accessible. This prevents the "fragile heuristics" for contrast mentioned in **PR #368**, allowing the `CustomThemeBuilder` to programmatically verify accessibility standards during theme creation.

Furthermore, TypeScript supports **dynamic color logic** and **cross-platform synchronization**. Utilities in `src/renderer/utils/theme.tsx`, such as `getContextColor`, calculate colors based on runtime variables like user-defined context warning thresholds. This structured data format also facilitates syncing themes to mobile clients via WebSockets (Issues **#644** and **#650**), ensuring visual parity across desktop and mobile environments where standard CSS variables might not be easily shared or parsed.

**Condition C (pack + companion):** ~7916 tok (7530 prompt + 386 answer)

Maestro defines theme colors in TypeScript rather than CSS custom properties to ensure **cross-platform synchronization** and enable **programmatic accessibility validation**.

Because Maestro operates across multiple environments—including the Electron Main process, the React Renderer, and mobile/web interfaces via WebSockets—a shared TypeScript definition in `src/shared/theme-types.ts` allows themes to be serialized and synchronized across IPC and network boundaries (Issues #645, #650). This approach is essential for environments like the Electron Main process or the CLI where CSS custom properties are unavailable, yet theme-aware logic (such as ANSI terminal palettes preserved in PR #551) is still required.

Furthermore, the TypeScript-first architecture supports **strict semantic tokenization**. As evidenced by PR #551 and PR #369, the `ThemeColors` interface was expanded to over 30 required fields to ensure WCAG 2.1 contrast compliance. This allows the `CustomThemeBuilder` UI to programmatically enforce that custom themes provide all necessary tokens for status backgrounds, git diffs, and overlays.

Finally, TypeScript enables complex, state-driven color logic. Utilities like `getContextColor` (in `src/renderer/utils/theme.tsx`) dynamically resolve colors based on configurable thresholds, such as context window usage (PR #750). Defining these as TypeScript objects ensures that over 100 components—including the "Cue" pipeline editor (PR #608)—remain type-safe and synchronized with the user's active theme settings.
