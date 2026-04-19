/**
 * vocab.ts — merge plugin vocab_extensions into the in-memory registry.
 *
 * Collision detection: if a value already exists (built-in or a previously
 * loaded plugin), throws with the conflicting value and its source.
 *
 * Merged values are recognized by verifyGraph in strict mode because
 * verifyGraph reads ENTITY_TYPES / EPISODE_SOURCE_TYPES / RELATION_TYPES
 * at module load time — but we mutate those objects at runtime here so
 * strict-mode checks pick up the extensions.
 */

import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  INGESTION_SOURCE_TYPES,
  RELATION_TYPES,
} from "../vocab/index.js";
import type { PluginManifest } from "./manifest.js";

export class VocabCollisionError extends Error {
  constructor(
    public readonly value: string,
    public readonly conflictSource: string,
  ) {
    super(
      `Vocab collision: value '${value}' already registered (source: '${conflictSource}')`,
    );
    this.name = "VocabCollisionError";
  }
}

// Track which plugin registered each extension so we can name it in errors
const registeredBy = new Map<string, string>();

function registerValue(
  registry: Record<string, string>,
  value: string,
  pluginName: string,
): void {
  const existing = Object.values(registry).find((v) => v === value);
  if (existing !== undefined) {
    const source = registeredBy.get(value) ?? "built-in";
    throw new VocabCollisionError(value, source);
  }
  // Mutate the shared registry object so verifyGraph picks up the value
  const key = value.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  (registry as Record<string, string>)[`PLUGIN_${key}`] = value;
  registeredBy.set(value, `plugin:${pluginName}`);
}

/**
 * Merges a single plugin's vocab_extensions into the shared registries.
 * Throws VocabCollisionError on any collision.
 */
export function mergePluginVocab(manifest: PluginManifest): void {
  const ext = manifest.vocab_extensions;
  if (!ext) return;

  const name = manifest.name;

  for (const v of ext.entity_types ?? []) {
    registerValue(ENTITY_TYPES as unknown as Record<string, string>, v, name);
  }

  for (const v of ext.source_types?.ingestion ?? []) {
    registerValue(
      INGESTION_SOURCE_TYPES as unknown as Record<string, string>,
      v,
      name,
    );
  }

  for (const v of ext.source_types?.episode ?? []) {
    registerValue(
      EPISODE_SOURCE_TYPES as unknown as Record<string, string>,
      v,
      name,
    );
  }

  for (const v of ext.relation_types ?? []) {
    registerValue(RELATION_TYPES as unknown as Record<string, string>, v, name);
  }
}
