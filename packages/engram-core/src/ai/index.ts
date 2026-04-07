/**
 * ai/index.ts — AI provider factory and re-exports.
 *
 * Entry point for all AI provider functionality.
 * createProvider() reads ENGRAM_AI_PROVIDER env var and config to return
 * the appropriate provider instance.
 */

export { GeminiProvider } from "./gemini.js";
export { NullProvider } from "./null.js";
export { OllamaProvider } from "./ollama.js";
export type { AIConfig, AIProvider, EntityHint } from "./provider.js";

import { GeminiProvider } from "./gemini.js";
import { NullProvider } from "./null.js";
import { OllamaProvider } from "./ollama.js";
import type { AIConfig, AIProvider } from "./provider.js";

/**
 * Factory: creates and returns the appropriate AI provider.
 *
 * Provider resolution order:
 * 1. config.provider field (if set)
 * 2. ENGRAM_AI_PROVIDER environment variable
 * 3. Falls back to NullProvider
 */
export function createProvider(config?: Partial<AIConfig>): AIProvider {
  const providerName =
    config?.provider ??
    (process.env.ENGRAM_AI_PROVIDER as AIConfig["provider"] | undefined) ??
    "null";

  switch (providerName) {
    case "ollama":
      return new OllamaProvider({
        baseUrl: config?.ollama?.baseUrl,
        embedModel: config?.ollama?.embedModel,
        extractModel: config?.ollama?.extractModel,
      });

    case "gemini":
      return new GeminiProvider({
        apiKey: config?.gemini?.apiKey,
        embedModel: config?.gemini?.embedModel,
        extractModel: config?.gemini?.extractModel,
      });

    default:
      return new NullProvider();
  }
}
