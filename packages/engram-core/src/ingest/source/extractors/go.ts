import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  function: "function",
  type: "type",
  const: "const",
};

/**
 * Extract top-level symbols and import paths from tree-sitter-go query captures.
 *
 * In Go, exported symbols have names beginning with an uppercase letter.
 * Import paths are quoted string literals — quotes are stripped.
 */
export function extractGo(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      // Go import paths are interpreted_string_literal — strip surrounding quotes
      const raw = node.text.slice(1, -1);
      rawImports.push(raw);
      continue;
    }

    if (captureName.startsWith("symbol.")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/go] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      // In Go, exported = name starts with uppercase letter
      const exported = /^[A-Z]/.test(symbolName);

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
