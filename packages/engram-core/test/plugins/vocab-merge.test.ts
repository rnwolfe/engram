/**
 * vocab-merge.test.ts — tests for plugin vocab extension merging and collision detection.
 */

import { afterEach, describe, expect, test } from "bun:test";
import type { PluginManifest } from "../../src/plugins/manifest.js";
import {
  mergePluginVocab,
  VocabCollisionError,
} from "../../src/plugins/vocab.js";
import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  RELATION_TYPES,
} from "../../src/vocab/index.js";

function makeManifest(
  name: string,
  vocab_extensions: PluginManifest["vocab_extensions"],
): PluginManifest {
  return {
    name,
    version: "1.0.0",
    contract_version: 1,
    transport: "js-module",
    entry: "index.ts",
    capabilities: {
      supported_auth: ["none"],
      supports_cursor: false,
      scope_schema: { description: "", pattern: ".*" },
    },
    vocab_extensions,
  };
}

// Track keys added so we can clean up after each test
const addedKeys: Array<{ registry: Record<string, string>; key: string }> = [];

// Patch mergePluginVocab to track what gets added for cleanup
afterEach(() => {
  for (const { registry, key } of addedKeys) {
    delete registry[key];
  }
  addedKeys.length = 0;
});

// We use unique value names per test to avoid cross-test collisions
// since the vocab registries are module-level singletons

describe("mergePluginVocab", () => {
  test("adds entity_type extension to registry", () => {
    const uniqueVal = `test-plugin-et-${Date.now()}`;
    mergePluginVocab(makeManifest("test-a", { entity_types: [uniqueVal] }));

    expect(Object.values(ENTITY_TYPES)).toContain(uniqueVal);

    // Cleanup: find the key that was added
    for (const [k, v] of Object.entries(ENTITY_TYPES)) {
      if (v === uniqueVal) {
        addedKeys.push({
          registry: ENTITY_TYPES as unknown as Record<string, string>,
          key: k,
        });
      }
    }
  });

  test("adds relation_type extension to registry", () => {
    const uniqueVal = `test-plugin-rt-${Date.now()}`;
    mergePluginVocab(makeManifest("test-b", { relation_types: [uniqueVal] }));

    expect(Object.values(RELATION_TYPES)).toContain(uniqueVal);

    for (const [k, v] of Object.entries(RELATION_TYPES)) {
      if (v === uniqueVal) {
        addedKeys.push({
          registry: RELATION_TYPES as unknown as Record<string, string>,
          key: k,
        });
      }
    }
  });

  test("adds episode source_type extension to registry", () => {
    const uniqueVal = `test-plugin-st-${Date.now()}`;
    mergePluginVocab(
      makeManifest("test-c", {
        source_types: { episode: [uniqueVal] },
      }),
    );

    expect(Object.values(EPISODE_SOURCE_TYPES)).toContain(uniqueVal);

    for (const [k, v] of Object.entries(EPISODE_SOURCE_TYPES)) {
      if (v === uniqueVal) {
        addedKeys.push({
          registry: EPISODE_SOURCE_TYPES as unknown as Record<string, string>,
          key: k,
        });
      }
    }
  });

  test("throws VocabCollisionError for built-in entity_type collision", () => {
    // "person" is a built-in value
    expect(() =>
      mergePluginVocab(
        makeManifest("bad-plugin", { entity_types: ["person"] }),
      ),
    ).toThrow(VocabCollisionError);
  });

  test("throws VocabCollisionError for built-in relation_type collision", () => {
    expect(() =>
      mergePluginVocab(
        makeManifest("bad-plugin-2", { relation_types: ["authored_by"] }),
      ),
    ).toThrow(VocabCollisionError);
  });

  test("throws VocabCollisionError when two plugins declare same entity_type", () => {
    const sharedVal = `shared-et-${Date.now()}`;
    mergePluginVocab(makeManifest("plugin-x", { entity_types: [sharedVal] }));

    // Clean up after test
    for (const [k, v] of Object.entries(ENTITY_TYPES)) {
      if (v === sharedVal) {
        addedKeys.push({
          registry: ENTITY_TYPES as unknown as Record<string, string>,
          key: k,
        });
      }
    }

    expect(() =>
      mergePluginVocab(makeManifest("plugin-y", { entity_types: [sharedVal] })),
    ).toThrow(VocabCollisionError);
  });

  test("no-ops when vocab_extensions is undefined", () => {
    const beforeCount = Object.keys(ENTITY_TYPES).length;
    mergePluginVocab(makeManifest("no-vocab", undefined));
    expect(Object.keys(ENTITY_TYPES).length).toBe(beforeCount);
  });
});
