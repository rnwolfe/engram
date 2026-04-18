/**
 * ai/index.ts — AI provider and generator factories, and re-exports.
 *
 * createProvider() — embedding/extraction provider factory (reads ENGRAM_AI_PROVIDER)
 * createGenerator() — projection generator factory (reads ENGRAM_AI_PROVIDER or
 *   falls back to auto-detecting from present API keys)
 */

export { GeminiProvider } from "./gemini.js";
export { GeminiGenerator } from "./gemini-generator.js";
export { NullProvider } from "./null.js";
export { OllamaProvider } from "./ollama.js";
export { OpenAIGenerator } from "./openai-generator.js";
export type { ProjectionGenerator } from "./projection-generator.js";
export {
  AnthropicGenerator,
  NullGenerator,
} from "./projection-generator.js";
export type { AIConfig, AIProvider, EntityHint } from "./provider.js";
export type { ReachabilityResult } from "./reachability.js";
export {
  checkGoogle,
  checkOllama,
  checkOpenAI,
} from "./reachability.js";
export type { ReindexProgress } from "./utils.js";
export {
  countEmbeddings,
  generateEntityEmbeddings,
  generateEpisodeEmbeddings,
  reindexEmbeddings,
} from "./utils.js";

import { GeminiProvider } from "./gemini.js";
import { GeminiGenerator } from "./gemini-generator.js";
import { NullProvider } from "./null.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIGenerator } from "./openai-generator.js";
import type { ProjectionGenerator } from "./projection-generator.js";
import { AnthropicGenerator, NullGenerator } from "./projection-generator.js";
import type { AIConfig, AIProvider } from "./provider.js";

// ─── createProvider ───────────────────────────────────────────────────────────

/**
 * Factory: creates and returns the appropriate embedding/extraction provider.
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

// ─── createGenerator ──────────────────────────────────────────────────────────

/**
 * Factory: creates and returns the appropriate projection generator.
 *
 * Resolution order:
 * 1. ENGRAM_AI_PROVIDER env var — explicit selection
 *    Supported values: anthropic, gemini, openai
 * 2. Auto-detection from present API keys (ANTHROPIC_API_KEY takes priority,
 *    then GEMINI_API_KEY, then OPENAI_API_KEY)
 * 3. Falls back to NullGenerator (throws at first LLM call)
 *
 * Throws UsageError for providers that don't support projection authoring
 * (ollama is embeddings-only).
 */
export function createGenerator(opts?: {
  model?: string;
  promptTemplateId?: string;
}): ProjectionGenerator {
  const provider = process.env.ENGRAM_AI_PROVIDER;

  // Explicit provider selection via ENGRAM_AI_PROVIDER
  if (provider === "anthropic") {
    return new AnthropicGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  if (provider === "gemini") {
    return new GeminiGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    });
  }
  if (provider === "openai") {
    return new OpenAIGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  if (provider === "ollama") {
    throw new Error(
      "ENGRAM_AI_PROVIDER=ollama does not support projection authoring. " +
        "Use anthropic, gemini, or openai for engram project/reconcile.",
    );
  }

  // Auto-detection: use whichever API key is present
  if (process.env.ANTHROPIC_API_KEY) {
    return new AnthropicGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  if (process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY) {
    return new GeminiGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
    });
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIGenerator({
      model: opts?.model,
      promptTemplateId: opts?.promptTemplateId,
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  return new NullGenerator();
}
