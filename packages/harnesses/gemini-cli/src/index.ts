/**
 * Gemini CLI harness adapter for engram.
 *
 * Gemini CLI native extension interface: export a `geminiExtension` object
 * with lifecycle hooks. If Gemini CLI does not support native extensions in
 * the current release, use the shell-wrapper approach documented in
 * `engram companion --harness gemini-cli` instead.
 *
 * Shell-wrapper fallback:
 *   engram companion --harness gemini-cli
 * This emits a shell function wrapping the gemini invocation to prepend the
 * engram context pack automatically.
 */
import { onSessionStart, onUserPrompt } from "@engram/harness-core";

const cwd = process.cwd();

// Gemini CLI extension interface (draft — adapt to actual API when stable)
export const geminiExtension = {
  name: "engram",
  version: "0.1.0",

  async onSessionStart() {
    await onSessionStart({ cwd });
  },

  async transformUserMessage(message: string): Promise<string> {
    const pack = await onUserPrompt({ cwd, prompt: message });
    if (!pack) return message;
    return `${pack}\n\n---\n\n${message}`;
  },
};
