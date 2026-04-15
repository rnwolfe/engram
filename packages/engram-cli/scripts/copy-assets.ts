/**
 * copy-assets.ts — post-bundle asset copy for engram-cli.
 *
 * Bun bundles all JS into dist/cli.js but leaves binary assets behind.
 * web-tree-sitter expects tree-sitter.wasm next to the running script,
 * and SourceParser loads grammar/query files via import.meta.dir at
 * runtime (which resolves to dist/ when running dist/cli.js).
 *
 * This script copies:
 *   - tree-sitter.wasm          → dist/tree-sitter.wasm
 *   - grammars/*.wasm           → dist/grammars/*.wasm
 *   - queries/*.scm             → dist/queries/*.scm
 */

import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const cliRoot = path.join(import.meta.dir, "..");
const coreRoot = path.join(cliRoot, "../engram-core");
const distDir = path.join(cliRoot, "dist");
const sourceDir = path.join(coreRoot, "src/ingest/source");

// tree-sitter.wasm lives in the web-tree-sitter package under engram-core
const treeSitterWasm = path.join(
  coreRoot,
  "node_modules/web-tree-sitter/tree-sitter.wasm",
);

mkdirSync(path.join(distDir, "grammars"), { recursive: true });
mkdirSync(path.join(distDir, "queries"), { recursive: true });

cpSync(treeSitterWasm, path.join(distDir, "tree-sitter.wasm"));
cpSync(path.join(sourceDir, "grammars"), path.join(distDir, "grammars"), {
  recursive: true,
});
cpSync(path.join(sourceDir, "queries"), path.join(distDir, "queries"), {
  recursive: true,
});

console.log("Assets copied to dist/");
