import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractPython } from "../../../src/ingest/source/extractors/python";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "python");
  return parser.runQuery(tree, "python");
}

describe("extractPython — function definitions", () => {
  const src = `
def public_func():
    pass

def _private_func():
    pass
`;

  it("extracts both public and private functions", () => {
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("public_func");
    expect(names).toContain("_private_func");
  });

  it("exported = true for non-underscore function", () => {
    const { symbols } = extractPython(captureFor(src));
    const sym = symbols.find((s) => s.name === "public_func");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for underscore-prefixed function", () => {
    const { symbols } = extractPython(captureFor(src));
    const sym = symbols.find((s) => s.name === "_private_func");
    expect(sym?.exported).toBe(false);
  });

  it("kind = function for function definitions", () => {
    const { symbols } = extractPython(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("function");
    }
  });
});

describe("extractPython — class definitions", () => {
  const src = `
class PublicClass:
    def method(self):
        pass

class _PrivateClass:
    pass
`;

  it("extracts both public and private classes", () => {
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("PublicClass");
    expect(names).toContain("_PrivateClass");
  });

  it("kind = class for class definitions", () => {
    const { symbols } = extractPython(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("class");
    }
  });

  it("method inside class is not extracted as top-level symbol", () => {
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).not.toContain("method");
  });
});

describe("extractPython — decorated definitions", () => {
  const src = `
import functools

@staticmethod
def decorated_func():
    pass

@functools.wraps
class DecoratedClass:
    pass
`;

  it("extracts decorated top-level function", () => {
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("decorated_func");
  });

  it("extracts decorated top-level class", () => {
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("DecoratedClass");
  });
});

describe("extractPython — import extraction", () => {
  const src = `
import os
import os.path
from pathlib import Path
from collections import defaultdict, OrderedDict
`;

  it("extracts bare import module names", () => {
    const { rawImports } = extractPython(captureFor(src));
    expect(rawImports).toContain("os");
  });

  it("extracts dotted import module names", () => {
    const { rawImports } = extractPython(captureFor(src));
    expect(rawImports).toContain("os.path");
  });

  it("extracts from-import module name", () => {
    const { rawImports } = extractPython(captureFor(src));
    expect(rawImports).toContain("pathlib");
  });

  it("extracts aliased import module name (import os as o)", () => {
    const src2 = "import os as o\n";
    const { rawImports } = extractPython(captureFor(src2));
    expect(rawImports).toContain("os");
  });

  it("extracts relative import (from . import foo)", () => {
    const src2 = "from . import foo\n";
    const { rawImports } = extractPython(captureFor(src2));
    expect(rawImports.length).toBeGreaterThan(0);
  });
});

describe("extractPython — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "def foo():\n    pass\n";
    const { symbols } = extractPython(captureFor(src));
    const sym = symbols.find((s) => s.name === "foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});

describe("extractPython — nested definitions not extracted", () => {
  it("function nested inside another function is not top-level", () => {
    const src = `
def outer():
    def inner():
        pass
`;
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("outer");
    expect(names).not.toContain("inner");
  });

  it("method inside class is not extracted", () => {
    const src = `
class MyClass:
    def my_method(self):
        pass
`;
    const { symbols } = extractPython(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyClass");
    expect(names).not.toContain("my_method");
  });
});
