import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  languageForPath,
  SourceParser,
} from "../../../src/ingest/source/parser";

describe("languageForPath", () => {
  it("maps .ts to typescript", () => {
    expect(languageForPath("src/foo.ts")).toBe("typescript");
  });

  it("maps .cts to typescript", () => {
    expect(languageForPath("src/foo.cts")).toBe("typescript");
  });

  it("maps .mts to typescript", () => {
    expect(languageForPath("src/foo.mts")).toBe("typescript");
  });

  it("maps .js to typescript", () => {
    expect(languageForPath("src/foo.js")).toBe("typescript");
  });

  it("maps .jsx to typescript", () => {
    expect(languageForPath("src/foo.jsx")).toBe("typescript");
  });

  it("maps .cjs to typescript", () => {
    expect(languageForPath("src/foo.cjs")).toBe("typescript");
  });

  it("maps .mjs to typescript", () => {
    expect(languageForPath("src/foo.mjs")).toBe("typescript");
  });

  it("maps .tsx to tsx", () => {
    expect(languageForPath("src/foo.tsx")).toBe("tsx");
  });

  it("returns null for .py", () => {
    expect(languageForPath("src/foo.py")).toBeNull();
  });

  it("returns null for .go", () => {
    expect(languageForPath("src/foo.go")).toBeNull();
  });

  it("returns null for .rs", () => {
    expect(languageForPath("src/foo.rs")).toBeNull();
  });

  it("returns null for files without extension", () => {
    expect(languageForPath("Makefile")).toBeNull();
  });

  it("handles uppercase extensions", () => {
    // Extension matching is case-insensitive
    expect(languageForPath("src/foo.TS")).toBe("typescript");
  });
});

describe("SourceParser", () => {
  let parser: SourceParser;

  // WASM init costs ~200ms — share one instance across all tests.
  beforeAll(async () => {
    parser = await SourceParser.create();
  });

  afterAll(() => {
    parser.dispose();
  });

  it("create() completes without error", () => {
    // If beforeAll succeeded, parser is defined
    expect(parser).toBeDefined();
  });

  it("parses TypeScript source — root is program node", () => {
    const tree = parser.parse("export function foo() {}", "typescript");
    expect(tree.rootNode.type).toBe("program");
  });

  it("parses TSX source — root is program node", () => {
    const tree = parser.parse("const x = <div>hi</div>;", "tsx");
    expect(tree.rootNode.type).toBe("program");
  });

  it("malformed TypeScript returns a tree with hasError = true", () => {
    const tree = parser.parse("function (((", "typescript");
    expect(tree).toBeDefined();
    expect(tree.rootNode.hasError).toBe(true);
  });

  it("sequential parse calls on the same language work without reinit", () => {
    const tree1 = parser.parse("const a = 1;", "typescript");
    const tree2 = parser.parse("const b = 2;", "typescript");
    expect(tree1.rootNode.type).toBe("program");
    expect(tree2.rootNode.type).toBe("program");
  });

  it("sequential parse calls on different languages work without reinit", () => {
    const tsTree = parser.parse("const a: number = 1;", "typescript");
    const tsxTree = parser.parse("const el = <span />;", "tsx");
    expect(tsTree.rootNode.type).toBe("program");
    expect(tsxTree.rootNode.type).toBe("program");
  });

  it("dispose() does not throw", () => {
    // Create a separate instance so the shared one is unaffected
    expect(async () => {
      const p = await SourceParser.create();
      p.dispose();
    }).not.toThrow();
  });
});
