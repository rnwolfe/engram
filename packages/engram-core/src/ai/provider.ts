/**
 * provider.ts — AIProvider interface and shared types for the AI layer.
 *
 * All AI providers must implement this interface. The system degrades gracefully
 * when no provider is configured or when a provider is offline.
 */

/**
 * A hint from entity extraction — a suggestion for the caller to resolve.
 * The LLM never writes to the graph directly; it only suggests.
 */
export interface EntityHint {
  /** Suggested canonical name */
  name: string;
  /** Suggested entity type */
  entity_type: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Original text span this was extracted from */
  source_text?: string;
}

/**
 * Core AI provider interface.
 * All methods must never throw — errors are logged and null behavior is returned.
 */
export interface AIProvider {
  /**
   * Return the model identifier used for embeddings.
   * Used to record the model name in the embedding storage.
   */
  modelName(): string;

  /**
   * Generate embeddings for a batch of texts.
   * Returns an array of embedding vectors (one per input text).
   * Returns empty arrays on failure — never throws.
   */
  embed(texts: string[]): Promise<number[][]>;

  /**
   * Extract entity hints from raw text (commit messages, PR bodies, etc).
   * Returns [] on failure or when not configured — never throws.
   */
  extractEntities(text: string): Promise<EntityHint[]>;
}

/**
 * Provider configuration for createProvider factory.
 */
export interface AIConfig {
  provider: "null" | "ollama" | "gemini";
  ollama?: {
    baseUrl?: string;
    embedModel?: string;
    extractModel?: string;
  };
  gemini?: {
    apiKey?: string;
    embedModel?: string;
    extractModel?: string;
  };
}
