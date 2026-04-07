/**
 * ollama.ts — OllamaProvider: local AI via Ollama HTTP API.
 *
 * Uses native fetch — no additional npm packages required.
 * Gracefully degrades when Ollama is offline or returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

interface OllamaEmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
  error?: string;
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

export class OllamaProvider implements AIProvider {
  private baseUrl: string;
  private embedModel: string;
  private extractModel: string | undefined;

  constructor(opts?: {
    baseUrl?: string;
    embedModel?: string;
    extractModel?: string;
  }) {
    this.baseUrl = opts?.baseUrl ?? DEFAULT_BASE_URL;
    this.embedModel = opts?.embedModel ?? DEFAULT_EMBED_MODEL;
    this.extractModel = opts?.extractModel;
  }

  modelName(): string {
    return this.embedModel;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    try {
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.embedModel, input: texts }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        console.warn(
          `[engram] OllamaProvider.embed: HTTP ${response.status} from Ollama`,
        );
        return [];
      }

      const data = (await response.json()) as OllamaEmbedResponse;

      if (data.error) {
        console.warn(`[engram] OllamaProvider.embed: ${data.error}`);
        return [];
      }

      if (data.embeddings && Array.isArray(data.embeddings)) {
        return data.embeddings;
      }

      // Older Ollama API returns single embedding
      if (data.embedding && Array.isArray(data.embedding)) {
        return [data.embedding];
      }

      return [];
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Connection refused or timeout — expected when Ollama is not running
      if (
        msg.includes("ECONNREFUSED") ||
        msg.includes("connect") ||
        msg.includes("timeout") ||
        msg.includes("fetch")
      ) {
        console.warn(
          "[engram] OllamaProvider: connection failed — falling back to null behavior",
        );
      } else {
        console.warn(`[engram] OllamaProvider.embed error: ${msg}`);
      }
      return [];
    }
  }

  async extractEntities(text: string): Promise<EntityHint[]> {
    if (!this.extractModel) return [];
    if (!text || text.trim().length === 0) return [];

    const prompt = buildExtractionPrompt(text);

    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.extractModel,
          prompt,
          stream: false,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        console.warn(
          `[engram] OllamaProvider.extractEntities: HTTP ${response.status}`,
        );
        return [];
      }

      const data = (await response.json()) as OllamaGenerateResponse;

      if (data.error) {
        console.warn(`[engram] OllamaProvider.extractEntities: ${data.error}`);
        return [];
      }

      if (!data.response) return [];

      return parseEntityHints(data.response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engram] OllamaProvider.extractEntities error: ${msg}`);
      return [];
    }
  }
}

function buildExtractionPrompt(text: string): string {
  return `Extract named entities from the following developer text. Return a JSON array of objects with fields: name (string), entity_type (one of: person, module, service, file, concept), confidence (0-1 float). Only return the JSON array, no explanation.

Text: ${text}

JSON:`;
}

function parseEntityHints(raw: string): EntityHint[] {
  try {
    // Extract JSON array from response (model may include extra text)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof item.name === "string" &&
          typeof item.entity_type === "string",
      )
      .map((item) => ({
        name: String(item.name),
        entity_type: String(item.entity_type),
        confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
        source_text:
          typeof item.source_text === "string" ? item.source_text : undefined,
      }));
  } catch {
    return [];
  }
}
