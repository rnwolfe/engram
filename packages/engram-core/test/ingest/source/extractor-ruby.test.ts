import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractRuby } from "../../../src/ingest/source/extractors/ruby";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "ruby");
  return parser.runQuery(tree, "ruby");
}

describe("extractRuby — class definitions", () => {
  const src = `
class MyClass
end

class Outer::Inner
end
`;

  it("extracts top-level class names", () => {
    const { symbols } = extractRuby(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyClass");
  });

  it("kind = class for class definitions", () => {
    const { symbols } = extractRuby(captureFor(src));
    const cls = symbols.find((s) => s.name === "MyClass");
    expect(cls?.kind).toBe("class");
  });

  it("all top-level classes are exported", () => {
    const { symbols } = extractRuby(captureFor(src));
    for (const sym of symbols.filter((s) => s.kind === "class")) {
      expect(sym.exported).toBe(true);
    }
  });
});

describe("extractRuby — module definitions", () => {
  const src = `
module Utilities
end
`;

  it("extracts module names", () => {
    const { symbols } = extractRuby(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Utilities");
  });

  it("kind = namespace for module definitions", () => {
    const { symbols } = extractRuby(captureFor(src));
    const mod = symbols.find((s) => s.name === "Utilities");
    expect(mod?.kind).toBe("namespace");
  });
});

describe("extractRuby — method definitions", () => {
  const src = `
def greet(name)
  puts name
end

def self.create
end
`;

  it("extracts top-level method names", () => {
    const { symbols } = extractRuby(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("greet");
  });

  it("kind = function for method definitions", () => {
    const { symbols } = extractRuby(captureFor(src));
    const m = symbols.find((s) => s.name === "greet");
    expect(m?.kind).toBe("function");
  });

  it("kind = function for singleton method definitions", () => {
    const { symbols } = extractRuby(captureFor(src));
    const m = symbols.find((s) => s.name === "create");
    expect(m?.kind).toBe("function");
  });
});

describe("extractRuby — import extraction", () => {
  const src = `
require 'json'
require_relative 'helpers/util'
`;

  it("extracts require paths without quotes", () => {
    const { rawImports } = extractRuby(captureFor(src));
    expect(rawImports).toContain("json");
    expect(rawImports).toContain("helpers/util");
  });
});

describe("extractRuby — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "class Foo\nend\n";
    const { symbols } = extractRuby(captureFor(src));
    const sym = symbols.find((s) => s.name === "Foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});
