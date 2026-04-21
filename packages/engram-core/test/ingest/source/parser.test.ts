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

  it("maps .jsx to tsx (JSX syntax requires the tsx grammar)", () => {
    expect(languageForPath("src/foo.jsx")).toBe("tsx");
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

  it("maps .py to python", () => {
    expect(languageForPath("src/foo.py")).toBe("python");
  });

  it("maps .pyw to python", () => {
    expect(languageForPath("src/foo.pyw")).toBe("python");
  });

  it("maps .go to go", () => {
    expect(languageForPath("src/foo.go")).toBe("go");
  });

  it("maps .rs to rust", () => {
    expect(languageForPath("src/foo.rs")).toBe("rust");
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

  it("parses JSX syntax under tsx grammar without errors", () => {
    // .jsx files use the tsx grammar; valid JSX should parse cleanly
    const tree = parser.parse(
      "const el = <span className='x'>hello</span>;",
      "tsx",
    );
    expect(tree.rootNode.type).toBe("program");
    expect(tree.rootNode.hasError).toBe(false);
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

  it("parses Go source — root is source_file node", () => {
    const tree = parser.parse("package main\nfunc main() {}", "go");
    expect(tree.rootNode.type).toBe("source_file");
    expect(tree.rootNode.hasError).toBe(false);
  });

  it("parses Python source — root is module node", () => {
    const tree = parser.parse("def hello():\n    pass\n", "python");
    expect(tree.rootNode.type).toBe("module");
    expect(tree.rootNode.hasError).toBe(false);
  });

  it("parses Rust source — root is source_file node", () => {
    const tree = parser.parse("pub fn main() {}", "rust");
    expect(tree.rootNode.type).toBe("source_file");
    expect(tree.rootNode.hasError).toBe(false);
  });

  it("dispose() does not throw", async () => {
    // Create a separate instance so the shared one (in afterAll) is unaffected
    const p = await SourceParser.create();
    expect(() => p.dispose()).not.toThrow();
  });
});
