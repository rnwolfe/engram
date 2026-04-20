import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractGo } from "../../../src/ingest/source/extractors/go";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "go");
  return parser.runQuery(tree, "go");
}

describe("extractGo — function declarations", () => {
  const src = `
package main

func ExportedFunc() {}
func unexportedFunc() {}
`;

  it("extracts both exported and unexported functions", () => {
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedFunc");
    expect(names).toContain("unexportedFunc");
  });

  it("exported = true for uppercase-named function", () => {
    const { symbols } = extractGo(captureFor(src));
    const exp = symbols.find((s) => s.name === "ExportedFunc");
    expect(exp?.exported).toBe(true);
  });

  it("exported = false for lowercase-named function", () => {
    const { symbols } = extractGo(captureFor(src));
    const unexp = symbols.find((s) => s.name === "unexportedFunc");
    expect(unexp?.exported).toBe(false);
  });

  it("kind = function for function declarations", () => {
    const { symbols } = extractGo(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("function");
    }
  });
});

describe("extractGo — type declarations", () => {
  const src = `
package main

type Server struct {
  port int
}

type Handler interface {
  Handle()
}

type Config = Server
`;

  it("extracts struct type", () => {
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Server");
  });

  it("extracts interface type", () => {
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Handler");
  });

  it("kind = type for type declarations", () => {
    const { symbols } = extractGo(captureFor(src));
    const typeSyms = symbols.filter((s) =>
      ["Server", "Handler", "Config"].includes(s.name),
    );
    for (const sym of typeSyms) {
      expect(sym.kind).toBe("type");
    }
  });
});

describe("extractGo — const declarations", () => {
  const src = `
package main

const MaxRetries = 3

const (
  StatusOK  = 200
  StatusErr = 500
)
`;

  it("extracts single const", () => {
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MaxRetries");
  });

  it("extracts block consts", () => {
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("StatusOK");
    expect(names).toContain("StatusErr");
  });

  it("kind = const for const declarations", () => {
    const { symbols } = extractGo(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("const");
    }
  });
});

describe("extractGo — import extraction", () => {
  const src = `
package main

import (
  "fmt"
  "os"
)
`;

  it("extracts import paths without quotes", () => {
    const { rawImports } = extractGo(captureFor(src));
    expect(rawImports).toContain("fmt");
    expect(rawImports).toContain("os");
  });

  it("single import statement", () => {
    const src2 = `package main\nimport "net/http"\n`;
    const { rawImports } = extractGo(captureFor(src2));
    expect(rawImports).toContain("net/http");
  });

  it("raw string literal import (backticks)", () => {
    const src2 = "package main\nimport `net/http`\n";
    const { rawImports } = extractGo(captureFor(src2));
    expect(rawImports).toContain("net/http");
  });
});

describe("extractGo — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "package main\nfunc Foo() {}\n";
    const { symbols } = extractGo(captureFor(src));
    const sym = symbols.find((s) => s.name === "Foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});

describe("extractGo — method declarations not extracted as top-level", () => {
  it("method on a type is not extracted as a top-level symbol", () => {
    const src = `
package main

type Server struct{}

func (s *Server) Start() {}
func FreeFunc() {}
`;
    const { symbols } = extractGo(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("FreeFunc");
    expect(names).not.toContain("Start");
  });
});
