/**
 * copy-assets.ts — post-bundle asset copy for engram-cli.
 *
 * Bun bundles all JS into dist/cli.js but leaves binary/static assets
 * behind. Several engram-core modules use import.meta.url to locate
 * sibling files at runtime; after bundling, import.meta.url resolves
 * to dist/cli.js, so those files must live in dist/.
 *
 * This script copies:
 *   - tree-sitter.wasm          → dist/tree-sitter.wasm
 *   - grammars/*.wasm           → dist/grammars/*.wasm
 *   - queries/*.scm             → dist/queries/*.scm
 *   - kinds/*.yaml              → dist/kinds/*.yaml  (projection kind catalog)
 */

import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const cliRoot = path.join(import.meta.dir, "..");
const coreRoot = path.join(cliRoot, "../engram-core");
const distDir = path.join(cliRoot, "dist");
const sourceDir = path.join(coreRoot, "src/ingest/source");
const kindsDir = path.join(coreRoot, "src/ai/kinds");

// tree-sitter.wasm lives in the web-tree-sitter package under engram-core
const treeSitterWasm = path.join(
  coreRoot,
  "node_modules/web-tree-sitter/tree-sitter.wasm",
);

mkdirSync(path.join(distDir, "grammars"), { recursive: true });
mkdirSync(path.join(distDir, "queries"), { recursive: true });
mkdirSync(path.join(distDir, "kinds"), { recursive: true });

cpSync(treeSitterWasm, path.join(distDir, "tree-sitter.wasm"));
cpSync(path.join(sourceDir, "grammars"), path.join(distDir, "grammars"), {
  recursive: true,
});
cpSync(path.join(sourceDir, "queries"), path.join(distDir, "queries"), {
  recursive: true,
});
cpSync(kindsDir, path.join(distDir, "kinds"), { recursive: true });

console.log("Assets copied to dist/");
