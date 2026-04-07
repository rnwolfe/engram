/**
 * null.ts — NullProvider: deterministic no-op AI provider.
 *
 * Always available. Produces no embeddings and extracts no entities.
 * Guarantees zero behavior change from baseline (no AI configured).
 */

import type { AIProvider, EntityHint } from "./provider.js";

export class NullProvider implements AIProvider {
  async embed(_texts: string[]): Promise<number[][]> {
    return [];
  }

  async extractEntities(_text: string): Promise<EntityHint[]> {
    return [];
  }
}
