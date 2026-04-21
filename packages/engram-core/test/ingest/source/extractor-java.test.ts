import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractJava } from "../../../src/ingest/source/extractors/java";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "java");
  return parser.runQuery(tree, "java");
}

describe("extractJava — class declarations", () => {
  const src = `
public class ExportedClass {}
class PackageClass {}
`;

  it("extracts both public and package-private classes", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedClass");
    expect(names).toContain("PackageClass");
  });

  it("exported = true for public class", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedClass");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for package-private class", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "PackageClass");
    expect(sym?.exported).toBe(false);
  });

  it("kind = class for class declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("class");
    }
  });
});

describe("extractJava — interface declarations", () => {
  const src = `
public interface ExportedIface {}
interface PackageIface {}
`;

  it("extracts public and package-private interfaces", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedIface");
    expect(names).toContain("PackageIface");
  });

  it("exported = true for public interface", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedIface");
    expect(sym?.exported).toBe(true);
  });

  it("kind = interface for interface declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("interface");
    }
  });
});

describe("extractJava — enum declarations", () => {
  const src = `
public enum ExportedEnum { A, B }
enum PackageEnum { X }
`;

  it("extracts public and package-private enums", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedEnum");
    expect(names).toContain("PackageEnum");
  });

  it("exported = true for public enum", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedEnum");
    expect(sym?.exported).toBe(true);
  });

  it("kind = enum for enum declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("enum");
    }
  });
});

describe("extractJava — record declarations", () => {
  const src = `
public record ExportedRecord(int x, int y) {}
record PackageRecord(String s) {}
`;

  it("extracts public and package-private records", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedRecord");
    expect(names).toContain("PackageRecord");
  });

  it("exported = true for public record", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedRecord");
    expect(sym?.exported).toBe(true);
  });

  it("kind = type for record declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("type");
    }
  });
});

describe("extractJava — method declarations", () => {
  const src = `
public class MyClass {
  public void exportedMethod() {}
  private void privateMethod() {}
  void packageMethod() {}
}
`;

  it("extracts public, private, and package-private methods", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("exportedMethod");
    expect(names).toContain("privateMethod");
    expect(names).toContain("packageMethod");
  });

  it("exported = true for public method", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "exportedMethod");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for private method", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "privateMethod");
    expect(sym?.exported).toBe(false);
  });

  it("exported = false for package-private method", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "packageMethod");
    expect(sym?.exported).toBe(false);
  });

  it("kind = function for method declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    const methods = symbols.filter((s) => s.kind === "function");
    expect(methods.length).toBeGreaterThan(0);
  });
});

describe("extractJava — field declarations", () => {
  const src = `
public class MyClass {
  public int exportedField = 1;
  private int privateField = 2;
  int packageField = 3;
}
`;

  it("extracts public, private, and package-private fields", () => {
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("exportedField");
    expect(names).toContain("privateField");
    expect(names).toContain("packageField");
  });

  it("exported = true for public field", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "exportedField");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for private field", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "privateField");
    expect(sym?.exported).toBe(false);
  });

  it("kind = const for field declarations", () => {
    const { symbols } = extractJava(captureFor(src));
    const fields = symbols.filter((s) => s.kind === "const");
    expect(fields.length).toBeGreaterThan(0);
  });
});

describe("extractJava — import declarations", () => {
  const src = `
import java.util.List;
import java.io.IOException;
import com.example.MyService;
`;

  it("extracts dotted import paths", () => {
    const { rawImports } = extractJava(captureFor(src));
    expect(rawImports).toContain("java.util.List");
    expect(rawImports).toContain("java.io.IOException");
    expect(rawImports).toContain("com.example.MyService");
  });
});

describe("extractJava — private/protected visibility", () => {
  const src = `
public class MyClass {
  protected void protectedMethod() {}
}
`;

  it("exported = false for protected method", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "protectedMethod");
    expect(sym?.exported).toBe(false);
  });
});

describe("extractJava — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "public class Foo {}\n";
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "Foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});

describe("extractJava — annotated public method", () => {
  const src = `
public class MyClass {
  @Override
  public String toString() { return ""; }
}
`;

  it("exported = true for annotated public method", () => {
    const { symbols } = extractJava(captureFor(src));
    const sym = symbols.find((s) => s.name === "toString");
    expect(sym?.exported).toBe(true);
  });
});

describe("extractJava — nested classes not extracted", () => {
  it("inner class is not extracted as top-level symbol", () => {
    const src = `
public class Outer {
  public class Inner {}
  public void method() {}
}
`;
    const { symbols } = extractJava(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("Outer");
    expect(names).not.toContain("Inner");
  });
});
