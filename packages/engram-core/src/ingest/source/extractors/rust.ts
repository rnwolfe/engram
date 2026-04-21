import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  fn: "function",
  "fn.exported": "function",
  struct: "type",
  "struct.exported": "type",
  enum: "enum",
  "enum.exported": "enum",
  trait: "interface",
  "trait.exported": "interface",
  type_alias: "type",
  "type_alias.exported": "type",
  const: "const",
  "const.exported": "const",
  static: "const",
  "static.exported": "const",
};

export function extractRust(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      rawImports.push(node.text);
      continue;
    }

    if (captureName.startsWith("symbol.")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/rust] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      const exported = captureName.endsWith(".exported");

      seenNames.add(symbolName);
      symbols.push({
        name: symbolName,
        kind,
        exported,
        startByte: node.startIndex,
        endByte: node.endIndex,
      });
    }
  }

  return { symbols, rawImports };
}
