import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractCSharp } from "../../../src/ingest/source/extractors/c_sharp";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "c_sharp");
  return parser.runQuery(tree, "c_sharp");
}

describe("extractCSharp — class declarations", () => {
  const src = `
public class MyService {
  public void Run() {}
}

internal class HelperClass {}
`;

  it("extracts class names", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("MyService");
    expect(names).toContain("HelperClass");
  });

  it("kind = class for class declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const cls = symbols.find((s) => s.name === "MyService");
    expect(cls?.kind).toBe("class");
  });

  it("exported = true for public class", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const pub = symbols.find((s) => s.name === "MyService");
    expect(pub?.exported).toBe(true);
  });

  it("exported = false for internal class", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const internal = symbols.find((s) => s.name === "HelperClass");
    expect(internal?.exported).toBe(false);
  });
});

describe("extractCSharp — interface declarations", () => {
  const src = `
public interface IRepository {
  void Save();
}
`;

  it("extracts interface names", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("IRepository");
  });

  it("kind = interface for interface declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const iface = symbols.find((s) => s.name === "IRepository");
    expect(iface?.kind).toBe("interface");
  });

  it("exported = true for public interface", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const iface = symbols.find((s) => s.name === "IRepository");
    expect(iface?.exported).toBe(true);
  });
});

describe("extractCSharp — enum declarations", () => {
  const src = `
public enum Status { Active, Inactive }
private enum InternalFlag { On, Off }
`;

  it("extracts enum names", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Status");
    expect(names).toContain("InternalFlag");
  });

  it("kind = enum for enum declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    for (const sym of symbols.filter((s) => s.kind !== undefined)) {
      if (["Status", "InternalFlag"].includes(sym.name)) {
        expect(sym.kind).toBe("enum");
      }
    }
  });

  it("exported = true for public enum, false for private", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const pub = symbols.find((s) => s.name === "Status");
    const priv = symbols.find((s) => s.name === "InternalFlag");
    expect(pub?.exported).toBe(true);
    expect(priv?.exported).toBe(false);
  });
});

describe("extractCSharp — struct declarations", () => {
  const src = `
public struct Point {
  public int X;
  public int Y;
}
`;

  it("extracts struct names", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Point");
  });

  it("kind = type for struct declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const s = symbols.find((sym) => sym.name === "Point");
    expect(s?.kind).toBe("type");
  });
});

describe("extractCSharp — record declarations", () => {
  const src = `
public record Person(string Name, int Age);
`;

  it("extracts record names", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Person");
  });

  it("kind = type for record declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const r = symbols.find((sym) => sym.name === "Person");
    expect(r?.kind).toBe("type");
  });
});

describe("extractCSharp — method declarations", () => {
  const src = `
public class Calculator {
  public int Add(int a, int b) { return a + b; }
  private void Reset() {}
}
`;

  it("extracts method names inside top-level class", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Add");
    expect(names).toContain("Reset");
  });

  it("kind = function for method declarations", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const m = symbols.find((s) => s.name === "Add");
    expect(m?.kind).toBe("function");
  });

  it("exported = true for public method", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const pub = symbols.find((s) => s.name === "Add");
    expect(pub?.exported).toBe(true);
  });

  it("exported = false for private method", () => {
    const { symbols } = extractCSharp(captureFor(src));
    const priv = symbols.find((s) => s.name === "Reset");
    expect(priv?.exported).toBe(false);
  });
});

describe("extractCSharp — using directives", () => {
  const src = `
using System;
using System.Collections.Generic;
`;

  it("extracts using directive names", () => {
    const { rawImports } = extractCSharp(captureFor(src));
    expect(rawImports).toContain("System");
    expect(rawImports).toContain("System.Collections.Generic");
  });
});

describe("extractCSharp — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "public class Foo {}\n";
    const { symbols } = extractCSharp(captureFor(src));
    const sym = symbols.find((s) => s.name === "Foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});
