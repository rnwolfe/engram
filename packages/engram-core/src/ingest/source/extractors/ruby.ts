import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  class: "class",
  module: "namespace",
  method: "function",
  singleton_method: "function",
};

/**
 * Extract top-level symbols and import paths from
 * tree-sitter-ruby query captures.
 *
 * All module-level symbols are treated as exported
 * (first-pass heuristic — no private/protected block
 * detection).
 */
export function extractRuby(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      rawImports.push(node.text);
      continue;
    }

    // Skip predicate captures used only for filtering
    if (captureName === "_fn") continue;

    if (captureName.startsWith("symbol.") && !captureName.endsWith(".vis")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/ruby] duplicate symbol` +
            ` '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      seenNames.add(symbolName);
      symbols.push({
        name: symbolName,
        kind,
        // All module-level Ruby symbols are treated as
        // exported (no visibility keyword at top level)
        exported: true,
        startByte: node.startIndex,
        endByte: node.endIndex,
      });
    }
  }

  return { symbols, rawImports };
}
