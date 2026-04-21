import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  class: "class",
  interface: "interface",
  enum: "enum",
  record: "type",
  method: "function",
  field: "const",
};

function hasPublicModifier(modifiersText: string): boolean {
  return modifiersText.split(/\s+/).includes("public");
}

export function extractJava(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();

  const visMap = new Map<number, string>();

  for (const capture of captures) {
    const { name: captureName, node } = capture;
    if (captureName.endsWith(".vis") && node.parent) {
      visMap.set(node.parent.startIndex, node.text);
    }
  }

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
          `[engram extractor/java] duplicate symbol '${symbolName}'` +
            " — keeping first occurrence",
        );
        continue;
      }

      // For field symbols the identifier lives inside variable_declarator
      // which is inside field_declaration. Check both levels; for all other
      // kinds the direct parent is sufficient.
      const parentStart = node.parent?.startIndex;
      let modText =
        parentStart !== undefined ? visMap.get(parentStart) : undefined;
      if (modText === undefined && kindKey === "field") {
        const gpStart = node.parent?.parent?.startIndex;
        modText = gpStart !== undefined ? visMap.get(gpStart) : undefined;
      }
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
