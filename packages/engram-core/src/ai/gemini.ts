/**
 * gemini.ts — GeminiProvider: Google Gemini AI via @google/genai SDK.
 *
 * Default embed model: gemini-embedding-001 (overridable via config).
 * API key read from GEMINI_API_KEY env var; never stored in .engram files.
 * Gracefully degrades when key is missing or API returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_EMBED_MODEL = "gemini-embedding-001";

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private embedModel: string;
  private extractModel: string | undefined;
  private client: unknown | null = null;

  constructor(opts?: {
    apiKey?: string;
    embedModel?: string;
    extractModel?: string;
  }) {
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY ?? "";
    this.embedModel = opts?.embedModel ?? DEFAULT_EMBED_MODEL;
    this.extractModel = opts?.extractModel;

    if (!this.apiKey) {
      console.warn(
        "[engram] GeminiProvider: GEMINI_API_KEY not set — falling back to null behavior",
      );
    }
  }

  private async getClient(): Promise<unknown | null> {
    if (!this.apiKey) return null;
    if (this.client) return this.client;

    try {
      const { GoogleGenAI } = await import("@google/genai");
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
      return this.client;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engram] GeminiProvider: failed to init client: ${msg}`);
      return null;
    }
  }

  modelName(): string {
    return this.embedModel;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    if (!this.apiKey) return [];

    const client = await this.getClient();
    if (!client) return [];

    try {
      const genai = client as {
        models: {
          embedContent: (opts: {
            model: string;
            contents: string;
          }) => Promise<{ embeddings?: Array<{ values?: number[] }> }>;
        };
      };

      const results: number[][] = [];

      for (const text of texts) {
        try {
          const response = await genai.models.embedContent({
            model: this.embedModel,
            contents: text,
          });

          const embedding = response?.embeddings?.[0]?.values;
          if (embedding && Array.isArray(embedding)) {
            results.push(embedding);
          } else {
            results.push([]);
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[engram] GeminiProvider.embed (single): ${msg}`);
          results.push([]);
        }
      }

      return results;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engram] GeminiProvider.embed error: ${msg}`);
      return [];
    }
  }

  async extractEntities(text: string): Promise<EntityHint[]> {
    if (!this.extractModel) return [];
    if (!this.apiKey) return [];
    if (!text || text.trim().length === 0) return [];

    const client = await this.getClient();
    if (!client) return [];

    try {
      const genai = client as {
        models: {
          generateContent: (opts: {
            model: string;
            contents: string;
          }) => Promise<{ text?: string }>;
        };
      };

      const prompt = buildExtractionPrompt(text);
      const response = await genai.models.generateContent({
        model: this.extractModel,
        contents: prompt,
      });

      const raw = response?.text ?? "";
      return parseEntityHints(raw);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[engram] GeminiProvider.extractEntities error: ${msg}`);
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
