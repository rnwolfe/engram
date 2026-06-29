I will start by exploring the workspace directory to understand the project structure and see if there are any existing documents or implementations related to checking for actionable or stale work.
I will read [CLAUDE.md](file:///tmp/engram-pr-archive/CLAUDE.md) first to get an overview of the project and see if it describes the commands and structure of this repository.
I will perform a search for references to terms like "actionable", "stale", "status", or CLI commands in the `docs` and source directories using `grep_search` to see if this has been planned, discussed, or partially implemented.
I will search for "actionable" in the repository to see if there is any documentation or command that specifically deals with finding or reporting "actionable" items.
I will list the contents of `packages/engram-cli/src/commands/` to check what commands are available in the CLI and see if any of them (e.g., `project`, `reconcile`, or a new command) are related to the user's question.
I will view the command implementation of [brief.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/brief.ts) to see if it is related to compiling or briefing an agent about actionable/stale work.
I will view [status.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/status.ts) to see if it provides or is planned to provide a status of the repo including actionable/stale work.
I will view [project.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/project.ts) to see what it does, as it might relate to summarizing work/status on a repository level.
I will view [reconcile.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/reconcile.ts) next to see if it manages staleness and actionable work projections.
I will list the contents of the `docs` directory to see if there are architectural blueprints, plans, or vision docs discussing a unified status command for actionable and stale work.
I will list the contents of the `docs/internal/` directory to see what architectural details and decision documents are available there.
I will read [STATUS.md](file:///tmp/engram-pr-archive/docs/internal/STATUS.md) to see if there is any mention of a single command for showing actionable/stale work.
I will list the contents of the `docs/internal/specs` directory to search for specifications or design documents related to a unified status command.
I will read [cli-as-agent-surface.md](file:///tmp/engram-pr-archive/docs/internal/specs/cli-as-agent-surface.md) as it specifies how the CLI is designed as an agent surface, which likely covers single command invocation patterns for agents.
I will search for key terms in [DECISIONS.md](file:///tmp/engram-pr-archive/docs/internal/DECISIONS.md) to see if architectural decisions mention plans for compiling actionable or stale status commands for agents.
I will search for "stale" in [DECISIONS.md](file:///tmp/engram-pr-archive/docs/internal/DECISIONS.md).
I will view the beginning of [DECISIONS.md](file:///tmp/engram-pr-archive/docs/internal/DECISIONS.md) to understand the context of the architecture decisions made so far.
I will read the next portion of [DECISIONS.md](file:///tmp/engram-pr-archive/docs/internal/DECISIONS.md) to explore later Architectural Decision Records.
I will read the rest of [DECISIONS.md](file:///tmp/engram-pr-archive/docs/internal/DECISIONS.md) to make sure I don't miss any other ADRs or details.
I will search inside [harness-pivot-plan.md](file:///tmp/engram-pr-archive/docs/internal/harness-pivot-plan.md) to check for plans or options related to a single command for showing actionable/stale work.
I will search the repository for mentions of `companion` to see how engram companion works and whether it checks for actionable or stale work.
I will search [VISION.md](file:///tmp/engram-pr-archive/docs/internal/VISION.md) for terms like "actionable", "stale", "status", "dashboard", or "brief" to check if there is an architectural vision for such a command.
I will view [onboard.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/onboard.ts) to see what the onboarding guided briefing does and if it addresses compiling actionable/stale work.
I will list the `.claude/skills` directory to see what active agent skills are configured for Claude Code / other agents in this repo.
I will view [product/SKILL.md](file:///tmp/engram-pr-archive/.claude/skills/product/SKILL.md) to see if the "product" skill defines how to check the repository's status or actionable items.
I will view [harness-pivot-plan.md](file:///tmp/engram-pr-archive/docs/internal/harness-pivot-plan.md) to understand if a unified command for agents is planned as part of the harness integration.
I will view the contents of [pack-companion-spec.md](file:///tmp/engram-pr-archive/docs/internal/pack-companion-spec.md) to search for details on the companion prompt design, staleness briefing, or how it informs an agent.
I will view the companion base prompt template in [packages/engram-cli/src/templates/companion/base.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/templates/companion/base.ts) to see exactly what instructions are written for agents regarding checking for actionable/stale work.
I will view [overrides.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/templates/companion/overrides.ts) to see harness-specific overrides and instructions.
I will view [sync.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/sync.ts) to see what it does. This command coordinates multi-source sync operations, and might be one of the commands the user wants to avoid calling separately.
I will search the repository for mentions of `on_session_start` or `compact staleness brief` to see if these have been implemented, are in progress, or are still in the planning phase.
I will list the contents of the `packages/` directory to see what packages (including harnesses or plugins) exist in this monorepo.
I will list the contents of `packages/harnesses/` to see the structure of the harness adapters and find where hooks like `on_session_start` are implemented.
I will list the files under [packages/harnesses/core/](file:///tmp/engram-pr-archive/packages/harnesses/core) to locate hook implementations or declarations.
I will list the files under `packages/harnesses/core/src/` to check for core harness hook functions.
I will view [events.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/events.ts) and [index.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/index.ts) to see how session startup events and context assembly are declared.
I will view [context-assembly.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts) to see how the staleness briefing is constructed and what information it provides.
I will list the contents of [packages/harnesses/gemini-cli/](file:///tmp/engram-pr-archive/packages/harnesses/gemini-cli) to see how the Gemini CLI harness invokes the core functions.
I will list the files in the `src` directory of the Gemini CLI harness.
I will view [index.ts](file:///tmp/engram-pr-archive/packages/harnesses/gemini-cli/src/index.ts) from the Gemini CLI harness to understand its structure.
I will view [shell-wrapper.ts](file:///tmp/engram-pr-archive/packages/harnesses/gemini-cli/src/shell-wrapper.ts) to see how the shell-wrapper generates the environment setup.
I will view [verify.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/verify.ts) to see what verification commands check in the codebase.
I will view [decay.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/decay.ts) to see how decay checks identify stale knowledge.
I will search the repository for mentions of `staleness brief` to see if there is any design or open notes about how it should work.
I will read [why-command.md](file:///tmp/engram-pr-archive/docs/internal/specs/why-command.md) to see if the `why` command fits this description or discusses the design of single-command diagnostics.
I will run a command to view the recent Git commits in the workspace to see if there are recent commits or discussions about this feature.
I will search the repository for any occurrences or references to `emitStalenessBrief` to ensure we see all places where this was planned or implemented.
I will view [doctor.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/doctor.ts) to see what repository-lifecycle health checks are performed and if they could form the basis of a unified command.
Yes, this has been considered and is partially planned in the architecture, but it is currently incomplete or fragmented across multiple subcommands. 

Here is the plan, where it stands, and how this has been considered in the repository:

### 1. The Plan: Harness-Neutral Lifecycle Hooks
In the [Harness Pivot Plan](file:///tmp/engram-pr-archive/docs/internal/harness-pivot-plan.md#L70-L80), the project defined a harness-neutral hook surface to automate agent workflows at session boundaries. 
Specifically, the **`on_session_start`** hook is designed to:
* Run `reconcile` in the background.
* Inject a **compact staleness brief** directly to the agent (summarizing what is stale and what is new since the last session) in a single step upon startup.

However, this is currently a stub. If you look at [context-assembly.ts:L58-L62](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts#L58-L62), you will find the following placeholder:
```typescript
export async function emitStalenessBrief(_cwd: string): Promise<string | null> {
  // TODO: engram verify --format json outputs { ok, violations }, not a stale_projections
  // count. Wire this to a real command that reports projection staleness when available.
  return null;
}
```

---

### 2. What an Agent Currently Must Call (Fragmented Commands)
Currently, to understand what is actionable or stale, an agent has to coordinate multiple commands:
1. **Knowledge/Projection Staleness**: Run `engram reconcile --dry-run` or check `engram decay` to see which projections or knowledge elements are stale, dormant, or orphaned.
2. **Sync/Freshness Status**: Call `engram status` (see [status.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/status.ts)) which prints a health/config dashboard and shows if the database is behind remote sources (e.g. git/GitHub). *Note: The command is currently hardcoded to report `0` stale projections because checking every projection fingerprint is too expensive for a synchronous config status check.*
3. **Graph Integrity Checks**: Call `engram verify` (see [verify.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/verify.ts)) or `engram doctor` (see [doctor.ts](file:///tmp/engram-pr-archive/packages/engram-cli/src/commands/doctor.ts)) to check for layout issues, WAL files, or broken evidence links.
4. **VCS/Backlog Actionability**: Shell out to `git status`, `git branch -vv`, `gh issue list`, or `gh pr list` (managed via agent skills like `/cleanup` or `/product`).

---

### 3. The Path Forward
To implement this as a single unified command, the team needs to:
* Address the `TODO` in `emitStalenessBrief` in [context-assembly.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts#L58-L62) by creating a fast database query or caching mechanism for projection staleness.
* Expose a consolidated subcommand (e.g. `engram brief repo` or wiring it directly into `engram status --json`) that gathers VCS branch status, issue/PR backlogs, and graph projection staleness into a single output object for the agent.
