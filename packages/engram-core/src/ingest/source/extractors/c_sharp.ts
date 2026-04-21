import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  class_declaration: "class",
  interface_declaration: "interface",
  enum_declaration: "enum",
  struct_declaration: "type",
  record_declaration: "type",
  method_declaration: "function",
};

function hasPublicModifier(modifiersText: string): boolean {
  return /\bpublic\b/.test(modifiersText);
}

/**
 * Extract top-level symbols and using directives from
 * tree-sitter-c-sharp query captures.
 *
 * Exported = has a `public` modifier.
 */
export function extractCSharp(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  // First pass: collect modifier text keyed by parent
  // startIndex (same pattern as Rust/Java extractors).
  const visMap = new Map<number, string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;
    if (captureName.endsWith(".vis") && node.parent) {
      visMap.set(node.parent.startIndex, node.text);
    }
  }

  // Second pass: process symbol name captures.
  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      rawImports.push(node.text);
      continue;
    }

    if (captureName.startsWith("symbol.") && !captureName.endsWith(".vis")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/c_sharp] duplicate symbol` +
            ` '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      const parentStart = node.parent?.startIndex;
      const modText =
        parentStart !== undefined ? visMap.get(parentStart) : undefined;
      const exported = modText !== undefined && hasPublicModifier(modText);

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
