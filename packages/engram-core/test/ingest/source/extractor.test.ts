import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import {
  extractTypeScript,
  resolveImport,
} from "../../../src/ingest/source/extractors/typescript";
import { SourceParser } from "../../../src/ingest/source/parser";

// ---------------------------------------------------------------------------
// Shared parser — WASM init is expensive, create once for the whole suite.
// ---------------------------------------------------------------------------

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureFor(src: string, lang: "typescript" | "tsx" = "typescript") {
  const tree = parser.parse(src, lang);
  return parser.runQuery(tree, lang);
}

// ---------------------------------------------------------------------------
// extractTypeScript — symbol extraction
// ---------------------------------------------------------------------------

describe("extractTypeScript — all 6 symbol kinds", () => {
  const src = `
function myFunc() {}
class MyClass {}
interface MyInterface {}
type MyType = string;
enum MyEnum { A }
const myConst = 42;
`;

  it("extracts all 6 symbol kinds", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("myFunc");
    expect(names).toContain("MyClass");
    expect(names).toContain("MyInterface");
    expect(names).toContain("MyType");
    expect(names).toContain("MyEnum");
    expect(names).toContain("myConst");
  });

  it("assigns correct kinds", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));
    expect(byName.myFunc.kind).toBe("function");
    expect(byName.MyClass.kind).toBe("class");
    expect(byName.MyInterface.kind).toBe("interface");
    expect(byName.MyType.kind).toBe("type");
    expect(byName.MyEnum.kind).toBe("enum");
    expect(byName.myConst.kind).toBe("const");
  });

  it("unexported symbols have exported=false", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    for (const sym of symbols) {
      expect(sym.exported).toBe(false);
    }
  });
});

describe("extractTypeScript — exported variants", () => {
  const src = `
export function expFunc() {}
export class ExpClass {}
export interface ExpIface {}
export type ExpType = boolean;
export enum ExpEnum { X }
export const expConst = 1;
`;

  it("exported symbols have exported=true", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    for (const sym of symbols) {
      expect(sym.exported).toBe(true);
    }
  });

  it("exported symbols have correct names and kinds", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    const byName = Object.fromEntries(symbols.map((s) => [s.name, s]));
    expect(byName.expFunc.kind).toBe("function");
    expect(byName.ExpClass.kind).toBe("class");
    expect(byName.ExpIface.kind).toBe("interface");
    expect(byName.ExpType.kind).toBe("type");
    expect(byName.ExpEnum.kind).toBe("enum");
    expect(byName.expConst.kind).toBe("const");
  });
});

describe("extractTypeScript — default exports", () => {
  it("extracts export default identifier as kind=default, exported=true", () => {
    const src = `export default someExternalVar;`;
    const { symbols } = extractTypeScript(captureFor(src));
    const def = symbols.find((s) => s.kind === "default");
    expect(def).toBeDefined();
    expect(def?.name).toBe("someExternalVar");
    expect(def?.exported).toBe(true);
  });

  it("export default function is captured as kind=function, exported=true (via declaration: field)", () => {
    // tree-sitter-typescript uses the `declaration:` field for export default function too,
    // so it matches the exported pattern and gets kind=function, not kind=default.
    const src = `export default function myFn() {}`;
    const { symbols } = extractTypeScript(captureFor(src));
    const sym = symbols.find((s) => s.name === "myFn");
    expect(sym).toBeDefined();
    expect(sym?.kind).toBe("function");
    expect(sym?.exported).toBe(true);
  });

  it("export default class is captured as kind=class, exported=true (via declaration: field)", () => {
    const src = `export default class MyDefaultClass {}`;
    const { symbols } = extractTypeScript(captureFor(src));
    const sym = symbols.find((s) => s.name === "MyDefaultClass");
    expect(sym).toBeDefined();
    expect(sym?.kind).toBe("class");
    expect(sym?.exported).toBe(true);
  });
});

describe("extractTypeScript — import extraction", () => {
  const src = `
import React from 'react';
import { foo } from './utils';
import type { Bar } from "../types";
`;

  it("extracts raw import specifiers without quotes", () => {
    const { rawImports } = extractTypeScript(captureFor(src));
    expect(rawImports).toContain("react");
    expect(rawImports).toContain("./utils");
    expect(rawImports).toContain("../types");
  });

  it("does not include import specifiers as symbols", () => {
    const { symbols } = extractTypeScript(captureFor(src));
    expect(symbols).toHaveLength(0);
  });
});

describe("extractTypeScript — nested symbols not extracted", () => {
  it("method inside class is not extracted as top-level symbol", () => {
    const src = `
class MyClass {
  method() {}
  anotherMethod() {}
}
`;
    const { symbols } = extractTypeScript(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyClass");
    expect(names).not.toContain("method");
    expect(names).not.toContain("anotherMethod");
  });

  it("function inside function is not extracted", () => {
    const src = `
function outer() {
  function inner() {}
}
`;
    const { symbols } = extractTypeScript(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("outer");
    expect(names).not.toContain("inner");
  });
});

describe("extractTypeScript — TSX/JSX does not break extraction", () => {
  it("JSX expressions in TSX file don't prevent symbol extraction", () => {
    const src = `
import React from 'react';

export function MyComponent() {
  return <div className="foo">hello</div>;
}

export const value = 42;
`;
    const { symbols } = extractTypeScript(captureFor(src, "tsx"));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyComponent");
    expect(names).toContain("value");
  });
});

describe("extractTypeScript — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "export function foo() {}";
    const { symbols } = extractTypeScript(captureFor(src));
    const sym = symbols.find((s) => s.name === "foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});

describe("extractTypeScript — duplicate name collision", () => {
  it("warns and keeps the first occurrence for duplicate names", () => {
    // Two exported functions with the same name (overloads without impl, then impl)
    const src = `
function foo() {}
function foo(x: number) {}
`;
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const { symbols } = extractTypeScript(captureFor(src));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("duplicate symbol name 'foo'"),
    );
    // Only one 'foo' symbol retained
    const fooSymbols = symbols.filter((s) => s.name === "foo");
    expect(fooSymbols).toHaveLength(1);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// resolveImport
// ---------------------------------------------------------------------------

describe("resolveImport — external packages", () => {
  const root = "/repo";
  const knownFiles = new Set(["src/a.ts"]);

  it("returns null for bare npm package name", () => {
    expect(resolveImport("react", "src/a.ts", knownFiles, root)).toBeNull();
  });

  it("returns null for scoped package", () => {
    expect(
      resolveImport("@scope/pkg", "src/a.ts", knownFiles, root),
    ).toBeNull();
  });

  it("returns null for node built-in style", () => {
    expect(resolveImport("fs", "src/a.ts", knownFiles, root)).toBeNull();
    expect(resolveImport("node:path", "src/a.ts", knownFiles, root)).toBeNull();
  });
});

describe("resolveImport — relative specifier resolves to .ts file", () => {
  const root = "/repo";

  it("resolves ./foo when src/foo.ts exists", () => {
    const knownFiles = new Set(["src/foo.ts", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo.ts",
    );
  });

  it("resolves ./foo when src/foo.tsx exists", () => {
    const knownFiles = new Set(["src/foo.tsx", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo.tsx",
    );
  });

  it("resolves ../bar to src/bar.js when only .js exists (no .ts)", () => {
    const knownFiles = new Set(["src/bar.js", "src/nested/a.ts"]);
    expect(resolveImport("../bar", "src/nested/a.ts", knownFiles, root)).toBe(
      "src/bar.js",
    );
  });

  it("resolves ./foo to src/foo.js when only .js exists", () => {
    const knownFiles = new Set(["src/foo.js", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo.js",
    );
  });
});

describe("resolveImport — directory index resolution", () => {
  const root = "/repo";

  it("resolves ./foo to src/foo/index.ts when it exists", () => {
    const knownFiles = new Set(["src/foo/index.ts", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo/index.ts",
    );
  });

  it("resolves ./foo to src/foo/index.tsx when only index.tsx exists", () => {
    const knownFiles = new Set(["src/foo/index.tsx", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo/index.tsx",
    );
  });

  it("resolves ./foo to src/foo/index.js when only index.js exists", () => {
    const knownFiles = new Set(["src/foo/index.js", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo/index.js",
    );
  });

  it("prefers direct extension match over index file", () => {
    const knownFiles = new Set(["src/foo.ts", "src/foo/index.ts", "src/a.ts"]);
    expect(resolveImport("./foo", "src/a.ts", knownFiles, root)).toBe(
      "src/foo.ts",
    );
  });
});

describe("resolveImport — explicit extension", () => {
  const root = "/repo";

  it("resolves ./utils.ts when specifier already has explicit extension", () => {
    const knownFiles = new Set(["src/utils.ts", "src/a.ts"]);
    expect(resolveImport("./utils.ts", "src/a.ts", knownFiles, root)).toBe(
      "src/utils.ts",
    );
  });

  it("resolves ./logo.png when specifier has explicit non-TS extension", () => {
    const knownFiles = new Set(["src/logo.png", "src/a.ts"]);
    expect(resolveImport("./logo.png", "src/a.ts", knownFiles, root)).toBe(
      "src/logo.png",
    );
  });
});

describe("resolveImport — missing file", () => {
  const root = "/repo";
  const knownFiles = new Set(["src/a.ts"]);

  it("returns null when ./bar does not exist in any form", () => {
    expect(resolveImport("./bar", "src/a.ts", knownFiles, root)).toBeNull();
  });
});
