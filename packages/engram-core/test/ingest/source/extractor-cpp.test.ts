import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractCpp } from "../../../src/ingest/source/extractors/cpp";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "cpp");
  return parser.runQuery(tree, "cpp");
}

describe("extractCpp — function definitions", () => {
  const src = `
int add(int a, int b) {
  return a + b;
}
`;

  it("extracts top-level function names", () => {
    const { symbols } = extractCpp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("add");
  });

  it("kind = function for function definitions", () => {
    const { symbols } = extractCpp(captureFor(src));
    const fn = symbols.find((s) => s.name === "add");
    expect(fn?.kind).toBe("function");
  });

  it("all top-level C++ symbols are exported", () => {
    const { symbols } = extractCpp(captureFor(src));
    for (const sym of symbols) {
      expect(sym.exported).toBe(true);
    }
  });
});

describe("extractCpp — class specifiers", () => {
  const src = `
class Animal {
public:
  virtual void speak() = 0;
};
`;

  it("extracts class names", () => {
    const { symbols } = extractCpp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Animal");
  });

  it("kind = class for class specifiers", () => {
    const { symbols } = extractCpp(captureFor(src));
    const cls = symbols.find((s) => s.name === "Animal");
    expect(cls?.kind).toBe("class");
  });
});

describe("extractCpp — struct specifiers", () => {
  const src = `
struct Vec3 {
  float x, y, z;
};
`;

  it("extracts struct names", () => {
    const { symbols } = extractCpp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Vec3");
  });

  it("kind = type for struct specifiers", () => {
    const { symbols } = extractCpp(captureFor(src));
    const s = symbols.find((sym) => sym.name === "Vec3");
    expect(s?.kind).toBe("type");
  });
});

describe("extractCpp — enum specifiers", () => {
  const src = `
enum class Direction { North, South, East, West };
`;

  it("extracts enum names", () => {
    const { symbols } = extractCpp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Direction");
  });

  it("kind = enum for enum specifiers", () => {
    const { symbols } = extractCpp(captureFor(src));
    const e = symbols.find((sym) => sym.name === "Direction");
    expect(e?.kind).toBe("enum");
  });
});

describe("extractCpp — namespace definitions", () => {
  const src = `
namespace utils {
  int helper() { return 0; }
}
`;

  it("extracts namespace names", () => {
    const { symbols } = extractCpp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("utils");
  });

  it("kind = namespace for namespace definitions", () => {
    const { symbols } = extractCpp(captureFor(src));
    const ns = symbols.find((s) => s.name === "utils");
    expect(ns?.kind).toBe("namespace");
  });
});

describe("extractCpp — include extraction", () => {
  const src = `
#include <vector>
#include "myheader.hpp"
`;

  it("extracts include paths without delimiters", () => {
    const { rawImports } = extractCpp(captureFor(src));
    expect(rawImports).toContain("vector");
    expect(rawImports).toContain("myheader.hpp");
  });
});

describe("extractCpp — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "int bar(int x) { return x; }\n";
    const { symbols } = extractCpp(captureFor(src));
    const sym = symbols.find((s) => s.name === "bar");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});
