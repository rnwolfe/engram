Yes, this has been considered and is part of the roadmap for Engram's agentic delivery layer. 

### 1. Has this been considered?
Yes, the need for a unified "stale/actionable work" surface is tracked and planned in two areas:
*   **[Issue #277](https://github.com/rnwolfe/engram/issues/277)** (`discussion: agent-facing freshness UX — patterns to borrow from beads`): This issue discusses how agents lose context every ~10 minutes, necessitating a lightweight, unified agent-facing freshness UX.
*   **The Harness Pivot Plan in [docs/internal/harness-pivot-plan.md](file:///tmp/engram-pr-archive/docs/internal/harness-pivot-plan.md)**: Defines the **`on_session_start`** lifecycle event for delivery adapters (e.g. Gemini CLI, Claude Code), which is tasked to:
    > *"Run reconcile in background; inject compact staleness brief (what's stale, what's new since last session)."*

---

### 2. What is the current plan?
Currently, an agent/human must run multiple separate commands to determine what is stale or actionable:
1.  `engram status` — to view per-source ingestion freshness (commits/days behind HEAD) and stale projection counts.
2.  `engram doctor` — to run diagnostic, layout, schema drift, and integrity checks.
3.  `engram decay` — to check for stale/dormant/orphaned knowledge.
4.  `engram reconcile` — to find and refresh stale projections.

To consolidate these, the delivery harness packages define:
*   The lifecycle hook [onSessionStart](file:///tmp/engram-pr-archive/packages/harnesses/core/src/index.ts#L5-L13) inside [packages/harnesses/core/src/index.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/index.ts).
*   This hook calls [emitStalenessBrief](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts#L58-L62) in [packages/harnesses/core/src/context-assembly.ts](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts) to write the summary to `stderr`.

**Current implementation gap / TODO:**
The [emitStalenessBrief](file:///tmp/engram-pr-archive/packages/harnesses/core/src/context-assembly.ts#L58-L62) function is currently a placeholder:
```typescript
export async function emitStalenessBrief(_cwd: string): Promise<string | null> {
  // TODO: engram verify --format json outputs { ok, violations }, not a stale_projections
  // count. Wire this to a real command that reports projection staleness when available.
  return null;
}
```

The active plan is to implement or wire this up to a unified CLI reporter command that aggregates the output of `status`, `reconcile`, and `doctor` into a single structured, machine-readable brief at session start.

---
### Summary of Work
*   Reviewed the codebase's CLI command surface (`status`, `doctor`, `reconcile`, `decay`, `brief`, `onboard`).
*   Analyzed architectural decisions (`ADR-009`) and strategic documents ([docs/internal/harness-pivot-plan.md](file:///tmp/engram-pr-archive/docs/internal/harness-pivot-plan.md)).
*   Examined the harness core package ([packages/harnesses/core](file:///tmp/engram-pr-archive/packages/harnesses/core/src/index.ts)) to extract the current implementation status and the planned hook (`onSessionStart`).
