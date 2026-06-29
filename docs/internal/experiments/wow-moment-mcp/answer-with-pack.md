Short answer: **yes, it's been considered — very recently and deliberately — and your exact use case (Cursor) is the named motivation. It's accepted, but only in a specific, narrow form, and it isn't built yet.**

This is settled in **ADR-009 "MCP as a distribution surface" (DECISIONS.md:404, dated 2026-06-29 — today)**, which refines the earlier blanket rejection. The history matters here, so let me lay out the full arc:

## The decision was never binary — MCP got split in two

ADR-004/005 originally rejected MCP wholesale and deleted the `packages/engram-mcp/` package (decommissioned in commit `67d8468c`, ADR-005). But ADR-009 argues that rejection **conflated two different things**, and rules on them oppositely:

- **MCP-as-retrieval** (many graph-traversal tools the model drives — `neighbors`, `shortest_path`, `get_edge`, etc.) → **still rejected.** This was the architecture of the deleted `engram-mcp`. It inverts engram's core thesis ("engine decides, model executes") by letting the model make per-call retrieval decisions. It stays dead, and per CLAUDE.md you can't add such tools without a new ADR.

- **MCP-as-distribution** (one thin server exposing essentially a *single* `engram context` endpoint, plus maybe a small fixed set like `why`/`diff`) → **now accepted.** The engine still assembles and bounds the pack; the model only elects *when* to pull it. The refined invariant is **"engine decides *what*, model decides *when*."** That doesn't invert control — the model requests an engine-bounded pack the same way a harness hook does.

## Cursor is the explicit reason this path exists

ADR-009 calls Cursor out by name (DECISIONS.md:455): Cursor's `beforeSubmitPrompt` hook is **block/inform-only** — it can't force-inject context the way Claude Code's `UserPromptSubmit` or Gemini CLI's `BeforeAgent` can. So harnesses *without* a force-injection hook (Cursor, Antigravity, Windsurf) are precisely the gap the MCP surface is meant to fill. There's also a competitive angle: planting a flag in the MCP registry directly against the official flat `memory` server (no temporal/provenance/evidence layer — engram's whole differentiator).

## Two important caveats before you count on it

1. **It's the secondary path, not the primary one.** Invisible harness-forced injection stays primary and canonical. The ADR is explicit: *"MCP must never become the path engram tells hook-capable harnesses to use."* So in Claude Code/Gemini you'd still want the hook; MCP is specifically for the harnesses that can't do that.

2. **It's accepted but deliberately not built yet.** ADR-009 gates it behind the wow-moment validation: *"Do not build it before the private-substrate wow moment lands"* (DECISIONS.md:494–497). There's no MCP server in the tree today — `engram context` exists as a CLI command (`packages/engram-cli/src/commands/context.ts`) and as a harness assembler (`packages/harnesses/core/src/context-assembly.ts`), and the planned MCP server would wrap `engram context --format=json` and reuse those same assembly helpers, living under `packages/harnesses/`, not a resurrected `packages/engram-mcp/`.

**So, is it the right move?** The project's answer is: yes for distribution, no for retrieval. Exposing `engram context` as a single MCP endpoint so it shows up in Cursor is exactly the sanctioned design — what you'd want to *avoid* is re-exposing graph-traversal primitives as a toolbox the model drives, which is the thing that was deliberately killed. If you want to actually stand it up, the work is unblocked by ADR-009 but sequenced after the wow-moment proof, and it should be a thin wrapper over the existing `--format=json` pack assembler.
