Yes — this has been considered explicitly and recently, and the answer is nuanced: MCP exposure was **rejected, then partially reversed**. The exact scenario you describe (Cursor pulling engram's context over MCP) is the *motivating case* for the reversal. Here's the decision trail:

## What was rejected, and what was accepted

The project split "expose over MCP" into two distinct things with **opposite rulings** (`docs/internal/DECISIONS.md`, ADR-004 → ADR-005 → ADR-009):

**Rejected (and stays rejected): MCP-as-retrieval.** The original `packages/engram-mcp/` exposed graph-traversal primitives (`neighbors`, `shortest_path`, `get_edge`, …) as many model-callable tools. ADR-004 rejected this and ADR-005 deleted the package outright. The reasoning is the core thesis — **"engine decides, model executes":** the engine deterministically assembles and *bounds* the context pack; letting the model make per-call graph-traversal decisions inverts that control. This is dead and stays dead — re-adding traversal tools requires a brand-new ADR.

**Accepted (as of 2026-06-29, ADR-009): MCP-as-distribution.** A *thin* MCP server exposing essentially a single endpoint — `engram context` (plus at most a small fixed set of stable read primitives: `context`, `why`, `diff`). The engine still assembles and bounds the pack; the model only elects *when* to pull it. The refined invariant: **"engine decides *what*, model decides *when*."** That doesn't invert control, because the model never drives traversal — it requests an engine-bounded pack exactly as a harness hook would.

## So is it the right move for your Cursor case?

Per ADR-009, **yes — that's precisely what the MCP surface is for.** The hook path (invisible force-injection via `on_user_prompt` → `engram context`) is the **primary** delivery mechanism and the canonical realization of the thesis. But Cursor's `beforeSubmitPrompt` is block/inform-only, and Antigravity/Windsurf expose no programmable per-prompt injection. MCP is the **secondary** surface explicitly for *harnesses without a force-injection hook* — Cursor named directly. It's also a deliberate positioning play: a flag in the MCP registry against the official MCP `memory` server (a flat, no-provenance, no-temporal knowledge graph that ADR-009 calls engram's "flat foil").

## Two important caveats

1. **It must never become the path for hook-capable harnesses.** For Claude Code / Gemini CLI / OpenCode, the hook path wins; MCP is the fallback for tools like Cursor that can't force-inject.

2. **It's not built yet — it's gated.** ADR-009 sequences the MCP server *behind* the "wow-moment validation" (`docs/internal/near-term-plan.md`): the hook path proves the thesis on unseen substrate first, then the MCP server ships as a distribution follow-on. The ADR is "Accepted" but explicitly says *"Do not build it before the private-substrate wow moment lands."*

One doc-hygiene note: the `CLAUDE.md` in this fixture already reflects ADR-009 (it describes the distribution-only carve-out correctly), so the older "no MCP of any kind" language ADR-009 flagged for cleanup appears to have already been updated here.

Net: exposing the *full graph* over MCP for Cursor — rejected (control inversion). Exposing a *single bounded `engram context` endpoint* over MCP for Cursor — that's the sanctioned design, just not yet implemented and intentionally sequenced after the hook-path proof.
