/**
 * copy-assets.ts — post-bundle asset copy for engram-cli.
 *
 * Bun bundles all JS into dist/cli.js but leaves binary/static assets
 * behind. Several engram-core modules use import.meta.url to locate
 * sibling files at runtime; after bundling, import.meta.url resolves
 * to dist/cli.js, so those files must live in dist/.
 *
 * engram-web's UI assets are NOT copied here — server.ts imports them
 * with `with { type: "file" }` so they are embedded at bundle time by
 * both `bun build` and `bun build --compile`.
 *
 * This script copies:
 *   - kinds/*.yaml              → dist/kinds/*.yaml  (projection kind catalog)
 *
 * (tree-sitter grammars/queries removed with source ingestion — ADR-010.)
 */

import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const cliRoot = path.join(import.meta.dir, "..");
const coreRoot = path.join(cliRoot, "../engram-core");
const distDir = path.join(cliRoot, "dist");
const kindsDir = path.join(coreRoot, "src/ai/kinds");

mkdirSync(path.join(distDir, "kinds"), { recursive: true });
cpSync(kindsDir, path.join(distDir, "kinds"), { recursive: true });

console.log("Assets copied to dist/");
