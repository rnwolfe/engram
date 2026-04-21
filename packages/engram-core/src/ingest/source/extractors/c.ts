import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  function_definition: "function",
  struct_specifier: "type",
  enum_specifier: "enum",
  typedef_declaration: "type",
};

/**
 * Extract top-level symbols and include paths from
 * tree-sitter-c query captures.
 *
 * C has no formal visibility — all top-level declarations
 * are treated as exported.
 */
export function extractC(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      // Strip surrounding quotes or angle brackets
      const text = node.text.slice(1, -1);
      rawImports.push(text);
      continue;
    }

    if (captureName.startsWith("symbol.")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/c] duplicate symbol` +
            ` '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      seenNames.add(symbolName);
      symbols.push({
        name: symbolName,
        kind,
        // C has no formal visibility — all top-level
        // declarations are considered exported
        exported: true,
        startByte: node.startIndex,
        endByte: node.endIndex,
      });
    }
  }

  return { symbols, rawImports };
}
