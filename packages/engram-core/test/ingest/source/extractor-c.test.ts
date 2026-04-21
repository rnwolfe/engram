import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractC } from "../../../src/ingest/source/extractors/c";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "c");
  return parser.runQuery(tree, "c");
}

describe("extractC — function definitions", () => {
  const src = `
int add(int a, int b) {
  return a + b;
}

void reset(void) {}
`;

  it("extracts top-level function names", () => {
    const { symbols } = extractC(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("add");
    expect(names).toContain("reset");
  });

  it("kind = function for function definitions", () => {
    const { symbols } = extractC(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("function");
    }
  });

  it("all top-level C symbols are exported", () => {
    const { symbols } = extractC(captureFor(src));
    for (const sym of symbols) {
      expect(sym.exported).toBe(true);
    }
  });
});

describe("extractC — struct specifiers", () => {
  const src = `
struct Point {
  int x;
  int y;
};
`;

  it("extracts named struct names", () => {
    const { symbols } = extractC(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Point");
  });

  it("kind = type for struct specifiers", () => {
    const { symbols } = extractC(captureFor(src));
    const s = symbols.find((sym) => sym.name === "Point");
    expect(s?.kind).toBe("type");
  });
});

describe("extractC — enum specifiers", () => {
  const src = `
enum Color {
  RED,
  GREEN,
  BLUE
};
`;

  it("extracts named enum names", () => {
    const { symbols } = extractC(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Color");
  });

  it("kind = enum for enum specifiers", () => {
    const { symbols } = extractC(captureFor(src));
    const e = symbols.find((sym) => sym.name === "Color");
    expect(e?.kind).toBe("enum");
  });
});

describe("extractC — typedef declarations", () => {
  const src = `
typedef unsigned int uint32_t;
typedef struct { int x; int y; } Vec2;
`;

  it("extracts typedef names", () => {
    const { symbols } = extractC(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("uint32_t");
    expect(names).toContain("Vec2");
  });

  it("kind = type for typedef declarations", () => {
    const { symbols } = extractC(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("type");
    }
  });
});

describe("extractC — include extraction", () => {
  const src = `
#include <stdio.h>
#include "mylib.h"
`;

  it("extracts quoted include paths without delimiters", () => {
    const { rawImports } = extractC(captureFor(src));
    expect(rawImports).toContain("stdio.h");
    expect(rawImports).toContain("mylib.h");
  });
});

describe("extractC — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "int foo(void) { return 0; }\n";
    const { symbols } = extractC(captureFor(src));
    const sym = symbols.find((s) => s.name === "foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});
