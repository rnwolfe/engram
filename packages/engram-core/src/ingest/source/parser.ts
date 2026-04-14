import { readFile } from "node:fs/promises";
import path from "node:path";
import { Parser, Language as TreeSitterLanguage } from "web-tree-sitter";

/** Languages supported by the source parser. */
export type Language = "typescript" | "tsx";

const GRAMMAR_FILES: Record<Language, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
};

const TS_EXTENSIONS: Set<string> = new Set([".ts", ".cts", ".mts", ".js", ".cjs", ".mjs"]);
const TSX_EXTENSIONS: Set<string> = new Set([".tsx", ".jsx"]);

/**
 * Maps a relative file path to the Language enum value to use when parsing it,
 * or null if the file type is not supported.
 */
export function languageForPath(relPath: string): Language | null {
  const ext = path.extname(relPath).toLowerCase();
  if (TSX_EXTENSIONS.has(ext)) return "tsx";
  if (TS_EXTENSIONS.has(ext)) return "typescript";
  return null;
}

/**
 * Tree-sitter source parser for TypeScript and TSX.
 *
 * Use `SourceParser.create()` to initialize. WASM grammars are loaded once and
 * reused across all `parse()` calls on the same instance. Call `dispose()` when
 * finished to free native resources.
 */
export class SourceParser {
  private parsers: Map<Language, Parser>;

  private constructor(parsers: Map<Language, Parser>) {
    this.parsers = parsers;
  }

  /**
   * Initialize the WASM runtime and load both grammar files.
   * This is the only way to create a SourceParser.
   */
  static async create(): Promise<SourceParser> {
    await Parser.init();

    const grammarDir = path.join(import.meta.dir, "grammars");
    const parsers = new Map<Language, Parser>();

    for (const [lang, filename] of Object.entries(GRAMMAR_FILES) as [
      Language,
      string,
    ][]) {
      const wasmPath = path.join(grammarDir, filename);
      const wasmBuffer = await readFile(wasmPath);
      const language = await TreeSitterLanguage.load(wasmBuffer);
      const parser = new Parser();
      parser.setLanguage(language);
      parsers.set(lang, parser);
    }

    return new SourceParser(parsers);
  }

  /**
   * Parse source code with the given language grammar.
   *
   * Always returns a tree even for malformed input — check `tree.rootNode.hasError`
   * to detect parse errors.
   */
  parse(body: string, lang: Language): Parser.Tree {
    const parser = this.parsers.get(lang);
    if (!parser) {
      throw new Error(`No parser loaded for language: ${lang}`);
    }
    const tree = parser.parse(body);
    if (!tree) {
      throw new Error(`Parser returned null for language: ${lang}`);
    }
    return tree;
  }

  /**
   * Release native resources held by the underlying parsers.
   * Do NOT call `.delete()` on trees — callers manage tree lifetime.
   */
  dispose(): void {
    for (const parser of this.parsers.values()) {
      parser.delete();
    }
    this.parsers.clear();
  }
}
