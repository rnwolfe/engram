/**
 * js-module.test.ts — tests for the in-process js-module transport.
 */

import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { loadManifest } from "../../src/plugins/manifest.js";
import { loadJsModulePlugin } from "../../src/plugins/transport/js-module.js";

const SAMPLE_JS_DIR = path.resolve(
  import.meta.dir,
  "../fixtures/plugins/sample-js",
);

describe("loadJsModulePlugin", () => {
  test("loads sample-js fixture and returns an EnrichmentAdapter", async () => {
    const manifest = loadManifest(SAMPLE_JS_DIR);
    const adapter = await loadJsModulePlugin(SAMPLE_JS_DIR, manifest);

    expect(adapter.name).toBe("sample-js");
    expect(adapter.kind).toBe("enrichment");
    expect(adapter.supportsAuth).toEqual(["none"]);
    expect(typeof adapter.enrich).toBe("function");
  });

  test("enrich() returns a zero-count IngestResult", async () => {
    const manifest = loadManifest(SAMPLE_JS_DIR);
    const adapter = await loadJsModulePlugin(SAMPLE_JS_DIR, manifest);

    const result = await adapter.enrich({} as never, {});
    expect(result.episodesCreated).toBe(0);
    expect(result.entitiesCreated).toBe(0);
    expect(result.edgesCreated).toBe(0);
  });

  test("throws when entry does not exist", async () => {
    const manifest = loadManifest(SAMPLE_JS_DIR);
    const badManifest = { ...manifest, entry: "nonexistent.ts" };

    await expect(
      loadJsModulePlugin(SAMPLE_JS_DIR, badManifest),
    ).rejects.toThrow();
  });
});
