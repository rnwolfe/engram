import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { extractRust } from "../../../src/ingest/source/extractors/rust";
import { SourceParser } from "../../../src/ingest/source/parser";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "rust");
  return parser.runQuery(tree, "rust");
}

describe("extractRust — function declarations", () => {
  const src = `
pub fn exported_fn() -> u32 { 0 }
fn private_fn() {}
`;

  it("extracts both exported and private functions", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("exported_fn");
    expect(names).toContain("private_fn");
  });

  it("exported = true for pub fn", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "exported_fn");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for private fn", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "private_fn");
    expect(sym?.exported).toBe(false);
  });

  it("kind = function for fn declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("function");
    }
  });
});

describe("extractRust — struct declarations", () => {
  const src = `
pub struct ExportedStruct { value: u32 }
struct PrivateStruct {}
`;

  it("extracts both exported and private structs", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedStruct");
    expect(names).toContain("PrivateStruct");
  });

  it("exported = true for pub struct", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedStruct");
    expect(sym?.exported).toBe(true);
  });

  it("exported = false for private struct", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "PrivateStruct");
    expect(sym?.exported).toBe(false);
  });

  it("kind = type for struct declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("type");
    }
  });
});

describe("extractRust — enum declarations", () => {
  const src = `
pub enum ExportedEnum { A, B }
enum PrivateEnum { X }
`;

  it("extracts both exported and private enums", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedEnum");
    expect(names).toContain("PrivateEnum");
  });

  it("exported = true for pub enum", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedEnum");
    expect(sym?.exported).toBe(true);
  });

  it("kind = enum for enum declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("enum");
    }
  });
});

describe("extractRust — trait declarations", () => {
  const src = `
pub trait ExportedTrait { fn method(&self); }
trait PrivateTrait {}
`;

  it("extracts both exported and private traits", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedTrait");
    expect(names).toContain("PrivateTrait");
  });

  it("exported = true for pub trait", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedTrait");
    expect(sym?.exported).toBe(true);
  });

  it("kind = interface for trait declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("interface");
    }
  });
});

describe("extractRust — type alias declarations", () => {
  const src = `
pub type ExportedAlias = u32;
type PrivateAlias = i32;
`;

  it("extracts both exported and private type aliases", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("ExportedAlias");
    expect(names).toContain("PrivateAlias");
  });

  it("exported = true for pub type", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "ExportedAlias");
    expect(sym?.exported).toBe(true);
  });

  it("kind = type for type alias declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("type");
    }
  });
});

describe("extractRust — const declarations", () => {
  const src = `
pub const EXPORTED_CONST: u32 = 42;
const PRIVATE_CONST: u32 = 7;
`;

  it("extracts both exported and private consts", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("EXPORTED_CONST");
    expect(names).toContain("PRIVATE_CONST");
  });

  it("exported = true for pub const", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "EXPORTED_CONST");
    expect(sym?.exported).toBe(true);
  });

  it("kind = const for const declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("const");
    }
  });
});

describe("extractRust — static declarations", () => {
  const src = `
pub static EXPORTED_STATIC: u32 = 1;
static PRIVATE_STATIC: u32 = 2;
`;

  it("extracts both exported and private statics", () => {
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("EXPORTED_STATIC");
    expect(names).toContain("PRIVATE_STATIC");
  });

  it("exported = true for pub static", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "EXPORTED_STATIC");
    expect(sym?.exported).toBe(true);
  });

  it("kind = const for static declarations", () => {
    const { symbols } = extractRust(captureFor(src));
    for (const sym of symbols) {
      expect(sym.kind).toBe("const");
    }
  });
});

describe("extractRust — import extraction", () => {
  const src = `
use std::collections::HashMap;
use std::io;
use crate::foo::bar;
`;

  it("extracts scoped use paths", () => {
    const { rawImports } = extractRust(captureFor(src));
    expect(rawImports).toContain("std::collections::HashMap");
  });

  it("extracts simple module use", () => {
    const { rawImports } = extractRust(captureFor(src));
    expect(rawImports).toContain("std::io");
  });

  it("extracts crate-relative use paths", () => {
    const { rawImports } = extractRust(captureFor(src));
    expect(rawImports).toContain("crate::foo::bar");
  });
});

describe("extractRust — byte offsets", () => {
  it("startByte and endByte are populated and in range", () => {
    const src = "pub fn foo() {}\n";
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "foo");
    expect(sym).toBeDefined();
    expect(sym?.startByte).toBeGreaterThanOrEqual(0);
    expect(sym?.endByte).toBeGreaterThan(sym?.startByte ?? 0);
    expect(sym?.endByte).toBeLessThanOrEqual(src.length);
  });
});

describe("extractRust — restricted visibility (pub(crate), pub(super))", () => {
  const src = `
pub(crate) fn crate_fn() {}
pub(super) struct SuperStruct {}
pub(crate) const CRATE_CONST: u32 = 1;
pub fn truly_public() {}
`;

  it("exported = false for pub(crate) fn", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "crate_fn");
    expect(sym).toBeDefined();
    expect(sym?.exported).toBe(false);
  });

  it("exported = false for pub(super) struct", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "SuperStruct");
    expect(sym).toBeDefined();
    expect(sym?.exported).toBe(false);
  });

  it("exported = false for pub(crate) const", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "CRATE_CONST");
    expect(sym).toBeDefined();
    expect(sym?.exported).toBe(false);
  });

  it("exported = true for bare pub fn", () => {
    const { symbols } = extractRust(captureFor(src));
    const sym = symbols.find((s) => s.name === "truly_public");
    expect(sym).toBeDefined();
    expect(sym?.exported).toBe(true);
  });
});

describe("extractRust — methods inside impl not extracted as top-level", () => {
  it("method inside impl block is not extracted as a top-level symbol", () => {
    const src = `
pub struct MyStruct {}
impl MyStruct {
  pub fn method(&self) {}
}
pub fn free_fn() {}
`;
    const { symbols } = extractRust(captureFor(src));
    const names = symbols.map((s) => s.name);
    expect(names).toContain("free_fn");
    expect(names).toContain("MyStruct");
    expect(names).not.toContain("method");
  });
});
