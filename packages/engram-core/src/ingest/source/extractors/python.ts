import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  function: "function",
  class: "class",
};

/**
 * Extract top-level symbols and import module names from tree-sitter-python query captures.
 *
 * Python has no formal export mechanism — by convention, names starting with `_`
 * are private. All others are treated as exported.
 *
 * Import module names are unquoted dotted names (e.g. `os`, `pathlib`).
 */
export function extractPython(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      // Python import module names have no surrounding quotes
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
          `[engram extractor/python] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      // Python convention: _ prefix = private
      const exported = !symbolName.startsWith("_");

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
