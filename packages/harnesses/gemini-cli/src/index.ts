/**
 * Gemini CLI harness adapter for engram.
 *
 * Gemini CLI native extension interface: export a `geminiExtension` object
 * with lifecycle hooks. If Gemini CLI does not support native extensions in
 * the current release, use the shell-wrapper fallback:
 *
 *   engram companion --harness gemini-cli >> ~/.bashrc
 *
 * This appends a shell function that wraps gemini invocations to prepend
 * the engram context pack automatically. See shell-wrapper.ts for the
 * generated snippet.
 */
import { onSessionStart, onUserPrompt } from "@engram/harness-core";

// Gemini CLI extension interface (draft — adapt to actual API when stable)
export const geminiExtension = {
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
