import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { QueryCapture } from "web-tree-sitter";
import { Parser, Query, Language as TreeSitterLanguage } from "web-tree-sitter";

/** Languages supported by the source parser. */
export type Language =
  | "typescript"
  | "tsx"
  | "go"
  | "python"
  | "rust"
  | "java"
  | "ruby"
  | "c"
  | "cpp"
  | "c_sharp"
  | "starlark";

const GRAMMAR_FILES: Record<Language, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  go: "tree-sitter-go.wasm",
  python: "tree-sitter-python.wasm",
  rust: "tree-sitter-rust.wasm",
  java: "tree-sitter-java.wasm",
  ruby: "tree-sitter-ruby.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  c_sharp: "tree-sitter-c_sharp.wasm",
  starlark: "tree-sitter-starlark.wasm",
};

/** Maps each language to its tree-sitter query file. */
const QUERY_FILES: Record<Language, string> = {
  typescript: "typescript.scm",
  tsx: "typescript.scm",
  go: "go.scm",
  python: "python.scm",
  rust: "rust.scm",
  java: "java.scm",
  ruby: "ruby.scm",
  c: "c.scm",
  cpp: "cpp.scm",
  c_sharp: "c_sharp.scm",
  starlark: "starlark.scm",
};

const TS_EXTENSIONS: Set<string> = new Set([
  ".ts",
  ".cts",
  ".mts",
  ".js",
  ".cjs",
  ".mjs",
]);
const TSX_EXTENSIONS: Set<string> = new Set([".tsx", ".jsx"]);
const GO_EXTENSIONS: Set<string> = new Set([".go"]);
const PYTHON_EXTENSIONS: Set<string> = new Set([".py", ".pyw"]);
const RUST_EXTENSIONS: Set<string> = new Set([".rs"]);
const JAVA_EXTENSIONS: Set<string> = new Set([".java"]);
const RUBY_EXTENSIONS: Set<string> = new Set([".rb"]);
const C_EXTENSIONS: Set<string> = new Set([".c", ".h"]);
const CPP_EXTENSIONS: Set<string> = new Set([".cpp", ".cc", ".cxx", ".hpp"]);
const CSHARP_EXTENSIONS: Set<string> = new Set([".cs"]);

/** Bare filenames that are Starlark BUILD files (matched against basename). */
const STARLARK_BUILD_BASENAMES: Set<string> = new Set([
  "BUILD",
  "BUILD.bazel",
  "BUCK",
]);

/** Bare filenames that look like Starlark but should NOT be parsed (WORKSPACE files). */
const STARLARK_SKIP_BASENAMES: Set<string> = new Set([
  "WORKSPACE",
  "WORKSPACE.bazel",
  "MODULE.bazel",
]);

/**
 * Maps a relative file path to the Language enum value to
 * use when parsing it, or null if the file type is not
 * supported.
 */
export function languageForPath(relPath: string): Language | null {
  const basename = path.basename(relPath);

  // Starlark WORKSPACE/MODULE files are intentionally excluded
  if (STARLARK_SKIP_BASENAMES.has(basename)) return null;

  // Starlark BUILD files — match by basename, not extension
  if (STARLARK_BUILD_BASENAMES.has(basename)) return "starlark";

  const ext = path.extname(relPath).toLowerCase();
  if (TSX_EXTENSIONS.has(ext)) return "tsx";
  if (TS_EXTENSIONS.has(ext)) return "typescript";
  if (GO_EXTENSIONS.has(ext)) return "go";
  if (PYTHON_EXTENSIONS.has(ext)) return "python";
  if (RUST_EXTENSIONS.has(ext)) return "rust";
  if (JAVA_EXTENSIONS.has(ext)) return "java";
  if (RUBY_EXTENSIONS.has(ext)) return "ruby";
  if (C_EXTENSIONS.has(ext)) return "c";
  if (CPP_EXTENSIONS.has(ext)) return "cpp";
  if (CSHARP_EXTENSIONS.has(ext)) return "c_sharp";
  return null;
}

/** Re-export for consumers that only import from this module. */
export type { QueryCapture };

/**
 * Tree-sitter source parser for TypeScript and TSX.
 *
 * Use `SourceParser.create()` to initialize. WASM grammars are loaded once and
 * reused across all `parse()` calls on the same instance. Call `dispose()` when
 * finished to free native resources.
 */
export class SourceParser {
  private parsers: Map<Language, Parser>;
  /** Query cache — one Query per language, initialized lazily. */
  private queryCache: Map<Language, Query> = new Map();

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
   * Run the language-appropriate tree-sitter query against a parsed tree and
   * return all captures in document order.
   *
   * Queries are compiled once per language and cached for the lifetime of this
   * parser instance. The underlying WASM query objects are freed by `dispose()`.
   */
  runQuery(tree: Parser.Tree, lang: Language): QueryCapture[] {
    if (!this.queryCache.has(lang)) {
      const queryText = readFileSync(
        path.join(import.meta.dir, "queries", QUERY_FILES[lang]),
        "utf8",
      );
      const tsParser = this.parsers.get(lang);
      if (!tsParser) {
        throw new Error(`No parser loaded for language: ${lang}`);
      }
      const language = tsParser.language;
      if (!language) {
        throw new Error(`Parser has no language set for: ${lang}`);
      }
      const query = new Query(language, queryText);
      this.queryCache.set(lang, query);
    }
    const query = this.queryCache.get(lang);
    if (!query) {
      throw new Error(`Query not found for language: ${lang}`);
    }
    return query.captures(tree.rootNode);
  }

  /**
   * Release native resources held by the underlying parsers and query cache.
   * Do NOT call `.delete()` on trees — callers manage tree lifetime.
   */
  dispose(): void {
    for (const query of this.queryCache.values()) {
      query.delete();
    }
    this.queryCache.clear();
    for (const parser of this.parsers.values()) {
      parser.delete();
    }
    this.parsers.clear();
  }
}
