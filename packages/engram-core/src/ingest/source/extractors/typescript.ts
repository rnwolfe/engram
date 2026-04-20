import path from "node:path";
import type { QueryCapture } from "../parser";
import type { ExtractedFile, ExtractedSymbol } from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

/** Map from capture name prefix to ExtractedSymbol kind. */
const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  function: "function",
  class: "class",
  interface: "interface",
  type: "type",
  enum: "enum",
  const: "const",
  default: "default",
};

/**
 * Extract top-level symbols and raw import specifiers from tree-sitter query
 * captures produced by `SourceParser.runQuery()`.
 *
 * Pure function — no IO, no DB writes.
 */
export function extractTypeScript(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Map<string, number>(); // name -> index in symbols array

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      // node.text includes surrounding quotes — strip them
      const raw = node.text.slice(1, -1);
      rawImports.push(raw);
      continue;
    }

    if (captureName.startsWith("symbol.")) {
      // e.g. "symbol.function.exported" → parts = ["function", "exported"]
      const rest = captureName.slice("symbol.".length); // "function.exported"
      const parts = rest.split(".");
      const kindKey = parts[0]; // "function", "class", ..., "default"
      const exported = parts[1] === "exported" || kindKey === "default";

      const kind = KIND_MAP[kindKey];
      if (!kind) {
        // Unknown capture kind — skip silently
        continue;
      }

      const symbolName = node.text;

      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      const symbol: ExtractedSymbol = {
        name: symbolName,
        kind,
        exported,
        startByte: node.startIndex,
        endByte: node.endIndex,
      };

      seenNames.set(symbolName, symbols.length);
      symbols.push(symbol);
    }
  }

  return { symbols, rawImports };
}

/**
 * Resolve a module import specifier to a relative path within the project.
 *
 * Returns `null` for:
 * - Non-relative specifiers (no `./` or `../` prefix): npm packages, scoped packages
 * - Relative paths that don't resolve to any known file
 *
 * @param specifier   The raw import string, e.g. `'./utils'`, `'react'`
 * @param fromRelPath Repo-relative path of the file containing the import (POSIX)
 * @param knownFiles  Set of all known repo-relative file paths (POSIX)
 * @param root        Absolute path to the repo root
 */
export function resolveImport(
  specifier: string,
  fromRelPath: string,
  knownFiles: Set<string>,
  root: string,
): string | null {
  // Non-relative imports are external packages — not resolvable within the repo
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }

  const fromDir = path.dirname(fromRelPath);
  // Resolve the specifier relative to the importing file's directory
  const resolvedAbs = path.resolve(root, fromDir, specifier);

  // Extensions to try in order (TypeScript-first, then JS variants)
  const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  const INDEX_FILES = ["index.ts", "index.tsx", "index.js"];

  // 0. Check if specifier already includes an explicit known extension (e.g. './utils.ts')
  const asIs = path.relative(root, resolvedAbs).split(path.sep).join("/");
  if (knownFiles.has(asIs)) {
    return asIs;
  }

  // 1. Try adding an extension directly
  for (const ext of EXTENSIONS) {
    const candidate = path.relative(root, resolvedAbs + ext);
    // Normalize to POSIX separators
    const posix = candidate.split(path.sep).join("/");
    if (knownFiles.has(posix)) {
      return posix;
    }
  }

  // 2. Try as a directory with an index file
  for (const idx of INDEX_FILES) {
    const candidate = path.relative(root, path.join(resolvedAbs, idx));
    const posix = candidate.split(path.sep).join("/");
    if (knownFiles.has(posix)) {
      return posix;
    }
  }

  return null;
}
