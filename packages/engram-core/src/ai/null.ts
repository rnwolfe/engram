/**
 * null.ts — NullProvider: deterministic no-op AI provider.
 *
 * Always available. Produces no embeddings and extracts no entities.
 * Guarantees zero behavior change from baseline (no AI configured).
 */

import type { AIProvider, EntityHint } from "./provider.js";

export class NullProvider implements AIProvider {
  modelName(): string {
    return "null";
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }

  async extractEntities(_text: string): Promise<EntityHint[]> {
    return [];
  }
}
