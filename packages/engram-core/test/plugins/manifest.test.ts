/**
 * manifest.test.ts — tests for plugin manifest parsing and validation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  loadManifest,
  ManifestValidationError,
} from "../../src/plugins/manifest.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-manifest-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(obj: unknown): void {
  fs.writeFileSync(
    path.join(tmpDir, "manifest.json"),
    JSON.stringify(obj),
    "utf8",
  );
}

const validManifest = {
  name: "test-plugin",
  version: "1.0.0",
  contract_version: 1,
  transport: "js-module",
  entry: "index.ts",
  capabilities: {
    supported_auth: ["none"],
    supports_cursor: false,
    scope_schema: { description: "test", pattern: ".*" },
  },
};

describe("loadManifest", () => {
  test("parses a valid manifest", () => {
    writeManifest(validManifest);
    const m = loadManifest(tmpDir);
    expect(m.name).toBe("test-plugin");
    expect(m.version).toBe("1.0.0");
    expect(m.contract_version).toBe(1);
    expect(m.transport).toBe("js-module");
    expect(m.entry).toBe("index.ts");
    expect(m.capabilities.supported_auth).toEqual(["none"]);
    expect(m.capabilities.supports_cursor).toBe(false);
  });

  test("throws when manifest.json does not exist", () => {
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("throws on invalid JSON", () => {
    fs.writeFileSync(path.join(tmpDir, "manifest.json"), "not-json", "utf8");
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  for (const field of [
    "name",
    "version",
    "contract_version",
    "transport",
    "entry",
    "capabilities",
  ]) {
    test(`throws when required field '${field}' is missing`, () => {
      const m = { ...validManifest } as Record<string, unknown>;
      delete m[field];
      writeManifest(m);
      expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
    });
  }

  test("throws on major contract_version mismatch (too high)", () => {
    writeManifest({ ...validManifest, contract_version: 2 });
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("throws on major contract_version mismatch (version 0)", () => {
    writeManifest({ ...validManifest, contract_version: 0 });
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("throws on invalid transport value", () => {
    writeManifest({ ...validManifest, transport: "grpc" });
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("accepts executable transport", () => {
    writeManifest({
      ...validManifest,
      transport: "executable",
      entry: "plugin.py",
    });
    const m = loadManifest(tmpDir);
    expect(m.transport).toBe("executable");
  });

  test("throws on path traversal in entry", () => {
    writeManifest({ ...validManifest, entry: "../../../etc/passwd" });
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("throws on absolute path in entry", () => {
    writeManifest({ ...validManifest, entry: "/etc/passwd" });
    expect(() => loadManifest(tmpDir)).toThrow(ManifestValidationError);
  });

  test("parses vocab_extensions when present", () => {
    writeManifest({
      ...validManifest,
      vocab_extensions: {
        entity_types: ["my-plugin/widget"],
        relation_types: ["my-plugin/links-to"],
      },
    });
    const m = loadManifest(tmpDir);
    expect(m.vocab_extensions?.entity_types).toEqual(["my-plugin/widget"]);
    expect(m.vocab_extensions?.relation_types).toEqual(["my-plugin/links-to"]);
  });

  test("vocab_extensions is undefined when absent", () => {
    writeManifest(validManifest);
    const m = loadManifest(tmpDir);
    expect(m.vocab_extensions).toBeUndefined();
  });
});
