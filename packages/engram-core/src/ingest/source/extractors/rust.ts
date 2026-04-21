import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  fn: "function",
  struct: "type",
  enum: "enum",
  trait: "interface",
  type_alias: "type",
  const: "const",
  static: "const",
};

/**
 * Returns true only when the visibility modifier is bare `pub`.
 * Restricted forms (`pub(crate)`, `pub(super)`, `pub(in path)`) are NOT
 * considered part of the public API surface.
 */
function isBarePub(visText: string): boolean {
  return visText.trim() === "pub";
}

export function extractRust(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  // First pass: collect all visibility captures, keyed by the text ID of their
  // parent node (the item node). Each `.vis` capture node's parent is the
  // function_item / struct_item / etc. node that also contains the name node.
  // We use startIndex of the parent as a stable key (unique within one file).
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
          `[engram extractor/rust] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      // Look up whether the parent item node had a visibility_modifier, and if
      // so whether it was bare `pub` (not `pub(crate)` / `pub(super)` etc.).
      const parentStart = node.parent?.startIndex;
      const visText = parentStart !== undefined ? visMap.get(parentStart) : undefined;
      const exported = visText !== undefined && isBarePub(visText);

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
