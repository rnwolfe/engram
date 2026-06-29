/**
 * Antigravity (agy) harness adapter for engram.
 *
 * Antigravity is the primary dogfood harness (Google's agentic CLI/IDE; the
 * `agy` CLI). Unlike Claude Code / Gemini CLI, Antigravity does not expose a
 * documented force-injection per-prompt hook, so engram delivers context to it
 * three ways:
 *
 *  1. Shell-wrapper (fallback, works today): wraps `agy -p` to prepend the
 *     `engram context` pack. Install with:
 *       engram companion --harness antigravity >> ~/.zshrc
 *
 *  2. Plugin import: Antigravity can import Gemini/Claude plugins
 *     (`agy plugin import`). The neutral hooks below are exported so an imported
 *     plugin reuses the same context-assembly path as other harnesses.
 *
 *  3. MCP distribution surface (ADR-009): for the no-hook case, the gated
 *     single-endpoint MCP server is the sanctioned delivery path — Antigravity's
 *     lack of a force-injection hook is precisely the gap ADR-009 fills.
 *
 * The harness-neutral lifecycle hooks (`on_session_start`, `on_user_prompt`)
 * live in `@engram/harness-core`; this adapter is a thin translation layer.
 */
import { onSessionStart, onUserPrompt } from "@engram/harness-core";

// Neutral lifecycle adapter — reused by a shell wrapper or an imported plugin.
export const antigravityAdapter = {
  name: "engram",
  version: "0.1.0",

  async onSessionStart() {
    // Compute cwd at call time, not at module load time
    await onSessionStart({ cwd: process.cwd() });
  },

  async transformUserMessage(message: string): Promise<string> {
    const cwd = process.cwd();
    const pack = await onUserPrompt({ cwd, prompt: message });
    if (!pack) return message;
    return `${pack}\n\n---\n\n${message}`;
  },
};

export { generateShellWrapper } from "./shell-wrapper.js";
