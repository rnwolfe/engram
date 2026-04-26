/**
 * kinds.test.ts — Unit tests for the KindCatalog loader.
 *
 * Tests cover:
 *   - Happy path: built-in kinds load with all required fields
 *   - XDG override: custom kind file merges in and can override a built-in
 *   - Validation error: YAML missing required fields throws KindValidationError
 *   - Cache behavior: calling loadKindCatalog() twice returns same reference
 *   - Non-existent override dir: returns just built-ins without error
 *   - Folded block scalar: blank lines preserved as paragraph breaks
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KindValidationError, loadKindCatalog } from "../../src/ai/kinds.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

const BUILTIN_NAMES = [
  "entity_summary",
  "decision_page",
  "topic_cluster",
  "contradiction_report",
  "module_overview",
];

const REQUIRED_FIELDS = [
  "name",
  "description",
  "when_to_use",
  "anchor_types",
  "expected_inputs",
  "example_title_pattern",
] as const;

/** Create a temp directory, returning its path. Cleaned up by the test. */
function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `kinds-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Write a minimal valid kind YAML file into a directory. */
function writeKindYaml(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

const MINIMAL_VALID_YAML = `
name: test_kind
description: A test projection kind.
when_to_use: Use this kind in tests.
anchor_types:
  - entity
expected_inputs:
  - Episodes referencing the anchor entity
example_title_pattern: "Test: {name}"
`.trim();

// ─── Built-in kinds ───────────────────────────────────────────────────────────

describe("loadKindCatalog — built-in kinds", () => {
  test("loads exactly five built-in kinds", () => {
    const catalog = loadKindCatalog(undefined, false);
    expect(catalog).toHaveLength(5);
  });

  test("all five built-in kinds are present by name", () => {
    const catalog = loadKindCatalog(undefined, false);
    const names = catalog.map((k) => k.name);
    for (const expected of BUILTIN_NAMES) {
      expect(names).toContain(expected);
    }
  });

  test("every built-in kind has all required fields populated", () => {
    const catalog = loadKindCatalog(undefined, false);
    for (const entry of catalog) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry[field]).toBeTruthy();
      }
    }
  });

  test("every built-in kind has non-empty anchor_types array", () => {
    const catalog = loadKindCatalog(undefined, false);
    for (const entry of catalog) {
      expect(Array.isArray(entry.anchor_types)).toBe(true);
      expect(entry.anchor_types.length).toBeGreaterThan(0);
    }
  });

  test("every built-in kind has non-empty expected_inputs array", () => {
    const catalog = loadKindCatalog(undefined, false);
    for (const entry of catalog) {
      expect(Array.isArray(entry.expected_inputs)).toBe(true);
      expect(entry.expected_inputs.length).toBeGreaterThan(0);
    }
  });
});

// ─── XDG override ─────────────────────────────────────────────────────────────

describe("loadKindCatalog — XDG override", () => {
  let xdgDir: string;

  beforeEach(() => {
    xdgDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(xdgDir, { recursive: true, force: true });
  });

  test("appends a new custom kind from the override directory", () => {
    writeKindYaml(xdgDir, "test_kind.yaml", MINIMAL_VALID_YAML);
    const catalog = loadKindCatalog(xdgDir, false);
    // five built-ins + one custom
    expect(catalog).toHaveLength(6);
    const names = catalog.map((k) => k.name);
    expect(names).toContain("test_kind");
  });

  test("override kind with matching name replaces the built-in", () => {
    const overrideYaml = `
name: entity_summary
description: Custom overridden entity summary kind.
when_to_use: Use this overridden kind.
anchor_types:
  - entity
  - projection
expected_inputs:
  - Custom input type
example_title_pattern: "Override: {entity_name}"
`.trim();

    writeKindYaml(xdgDir, "entity_summary.yaml", overrideYaml);
    const catalog = loadKindCatalog(xdgDir, false);

    // Still five total — the override replaced, not appended
    expect(catalog).toHaveLength(5);

    const entry = catalog.find((k) => k.name === "entity_summary");
    expect(entry).toBeDefined();
    expect(entry?.description).toBe("Custom overridden entity summary kind.");
    expect(entry?.anchor_types).toContain("projection");
  });

  test("custom kind fields are fully populated", () => {
    writeKindYaml(xdgDir, "test_kind.yaml", MINIMAL_VALID_YAML);
    const catalog = loadKindCatalog(xdgDir, false);
    const entry = catalog.find((k) => k.name === "test_kind");
    expect(entry).toBeDefined();
    expect(entry?.description).toBe("A test projection kind.");
    expect(entry?.when_to_use).toBe("Use this kind in tests.");
    expect(entry?.anchor_types).toEqual(["entity"]);
    expect(entry?.expected_inputs).toEqual([
      "Episodes referencing the anchor entity",
    ]);
    expect(entry?.example_title_pattern).toBe("Test: {name}");
  });
});

// ─── Validation errors ────────────────────────────────────────────────────────

describe("loadKindCatalog — validation errors", () => {
  let xdgDir: string;

  beforeEach(() => {
    xdgDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(xdgDir, { recursive: true, force: true });
  });

  test("throws KindValidationError when required scalar fields are missing", () => {
    const badYaml = `
name: bad_kind
anchor_types:
  - entity
expected_inputs:
  - something
`.trim();
    // description, when_to_use, example_title_pattern all missing
    writeKindYaml(xdgDir, "bad_kind.yaml", badYaml);
    expect(() => loadKindCatalog(xdgDir, false)).toThrow(KindValidationError);
  });

  test("KindValidationError message includes kind name and missing field names", () => {
    const badYaml = `
name: incomplete_kind
description: Has a description.
anchor_types:
  - entity
expected_inputs:
  - something
`.trim();
    // when_to_use and example_title_pattern missing
    writeKindYaml(xdgDir, "incomplete_kind.yaml", badYaml);
    try {
      loadKindCatalog(xdgDir, false);
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(KindValidationError);
      const kve = err as KindValidationError;
      expect(kve.kindName).toBe("incomplete_kind");
      expect(kve.missingFields).toContain("when_to_use");
      expect(kve.missingFields).toContain("example_title_pattern");
    }
  });

  test("throws KindValidationError when anchor_types array is empty", () => {
    const badYaml = `
name: no_anchors
description: Missing anchors.
when_to_use: Use it.
anchor_types:
expected_inputs:
  - something
example_title_pattern: "No anchors: {x}"
`.trim();
    writeKindYaml(xdgDir, "no_anchors.yaml", badYaml);
    expect(() => loadKindCatalog(xdgDir, false)).toThrow(KindValidationError);
  });

  test("throws KindValidationError when expected_inputs array is empty", () => {
    const badYaml = `
name: no_inputs
description: Missing inputs.
when_to_use: Use it.
anchor_types:
  - entity
expected_inputs:
example_title_pattern: "No inputs: {x}"
`.trim();
    writeKindYaml(xdgDir, "no_inputs.yaml", badYaml);
    expect(() => loadKindCatalog(xdgDir, false)).toThrow(KindValidationError);
  });

  test("KindValidationError includes the file path", () => {
    const badYaml = `
name: path_check_kind
anchor_types:
  - entity
expected_inputs:
  - something
`.trim();
    const fp = writeKindYaml(xdgDir, "path_check_kind.yaml", badYaml);
    try {
      loadKindCatalog(xdgDir, false);
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(KindValidationError);
      const kve = err as KindValidationError;
      expect(kve.filePath).toBe(fp);
    }
  });
});

// ─── Cache behavior ───────────────────────────────────────────────────────────

describe("loadKindCatalog — cache behavior", () => {
  test("calling loadKindCatalog() twice without args returns same array reference", () => {
    // Force a fresh load first to ensure cache is populated
    const first = loadKindCatalog(undefined, false);
    // Now call with default (useCache=true); the module cache should be set
    const second = loadKindCatalog();
    // Both should contain the same built-in kinds
    expect(second.map((k) => k.name)).toEqual(first.map((k) => k.name));
  });

  test("useCache=false always returns a fresh load with the same content", () => {
    const a = loadKindCatalog(undefined, false);
    const b = loadKindCatalog(undefined, false);
    expect(b.map((k) => k.name).sort()).toEqual(a.map((k) => k.name).sort());
  });

  test("overrideXdgDir bypasses cache but does not pollute module cache", () => {
    const xdgDir = makeTempDir();
    try {
      writeKindYaml(xdgDir, "custom_kind.yaml", MINIMAL_VALID_YAML);
      const withOverride = loadKindCatalog(xdgDir, false);
      expect(withOverride).toHaveLength(6);

      // Module cache (no overrideXdgDir) should not have the custom kind
      const fromCache = loadKindCatalog();
      expect(fromCache).toHaveLength(5);
    } finally {
      rmSync(xdgDir, { recursive: true, force: true });
    }
  });
});

// ─── Non-existent override dir ────────────────────────────────────────────────

describe("loadKindCatalog — non-existent override dir", () => {
  test("returns only built-ins when override dir does not exist", () => {
    const nonExistent = join(tmpdir(), "engram-kinds-does-not-exist-xyz123");
    const catalog = loadKindCatalog(nonExistent, false);
    expect(catalog).toHaveLength(5);
    const names = catalog.map((k) => k.name);
    for (const expected of BUILTIN_NAMES) {
      expect(names).toContain(expected);
    }
  });

  test("does not throw when override dir does not exist", () => {
    const nonExistent = join(tmpdir(), "engram-kinds-does-not-exist-abc999");
    expect(() => loadKindCatalog(nonExistent, false)).not.toThrow();
  });
});

// ─── Folded block scalar (`>`) ────────────────────────────────────────────────

describe("loadKindCatalog — folded block scalar paragraph breaks", () => {
  let xdgDir: string;

  beforeEach(() => {
    xdgDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(xdgDir, { recursive: true, force: true });
  });

  test("folded scalar with blank line separator produces two paragraphs", () => {
    // Uses `>` block scalar with a blank line between two paragraphs
    const yaml = `
name: folded_test
description: >
  First paragraph line one
  first paragraph line two.

  Second paragraph line one
  second paragraph line two.
when_to_use: Use it.
anchor_types:
  - entity
expected_inputs:
  - something
example_title_pattern: "Folded: {x}"
`.trim();

    writeKindYaml(xdgDir, "folded_test.yaml", yaml);
    const catalog = loadKindCatalog(xdgDir, false);
    const entry = catalog.find((k) => k.name === "folded_test");
    expect(entry).toBeDefined();

    // Blank line in folded scalar must produce a paragraph break, not be eaten
    expect(entry?.description).toContain("\n\n");
    expect(entry?.description).toContain("First paragraph");
    expect(entry?.description).toContain("Second paragraph");
  });

  test("folded scalar without blank lines joins lines with single space", () => {
    const yaml = `
name: folded_single
description: >
  Line one
  line two
  line three.
when_to_use: Use it.
anchor_types:
  - entity
expected_inputs:
  - something
example_title_pattern: "Single: {x}"
`.trim();

    writeKindYaml(xdgDir, "folded_single.yaml", yaml);
    const catalog = loadKindCatalog(xdgDir, false);
    const entry = catalog.find((k) => k.name === "folded_single");
    expect(entry).toBeDefined();
    expect(entry?.description).toBe("Line one line two line three.");
    expect(entry?.description).not.toContain("\n");
  });

  test("literal scalar (`|`) preserves newlines as-is", () => {
    const yaml = `
name: literal_test
description: A literal kind.
when_to_use: |
  Step one.
  Step two.
  Step three.
anchor_types:
  - entity
expected_inputs:
  - something
example_title_pattern: "Literal: {x}"
`.trim();

    writeKindYaml(xdgDir, "literal_test.yaml", yaml);
    const catalog = loadKindCatalog(xdgDir, false);
    const entry = catalog.find((k) => k.name === "literal_test");
    expect(entry).toBeDefined();
    expect(entry?.when_to_use).toBe("Step one.\nStep two.\nStep three.");
  });
});
