#!/usr/bin/env bun
/**
 * check-versions.ts — verify version numbers agree across the monorepo.
 *
 * Source of truth: `packages/engram-core/src/format/version.ts`'s `ENGINE_VERSION`.
 * Every workspace package.json's `version` field must match it exactly.
 *
 * Run from the repo root via `bun scripts/check-versions.ts`. Exits non-zero on
 * mismatch so CI / release flows fail loudly instead of publishing drifted metadata.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dir, "..");

function readEngineVersion(): string {
  const versionPath = path.join(
    REPO_ROOT,
    "packages/engram-core/src/format/version.ts",
  );
  const src = readFileSync(versionPath, "utf8");
  const match = src.match(/ENGINE_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(
      `could not find ENGINE_VERSION in ${versionPath} — update check-versions.ts if the constant moved`,
    );
  }
  return match[1];
}

function findWorkspacePackages(): string[] {
  const roots = [
    path.join(REPO_ROOT, "packages"),
    path.join(REPO_ROOT, "packages/plugins"),
  ];
  const packages: string[] = [];
  for (const root of roots) {
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const pkgPath = path.join(root, entry, "package.json");
      try {
        if (statSync(pkgPath).isFile()) packages.push(pkgPath);
      } catch {
        // no package.json here — not a workspace package
      }
    }
  }
  return packages;
}

function main() {
  const engineVersion = readEngineVersion();
  const packages = findWorkspacePackages();
  const mismatches: string[] = [];

  for (const pkgPath of packages) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (pkg.version !== engineVersion) {
      mismatches.push(
        `  ${path.relative(REPO_ROOT, pkgPath)}: ${pkg.version} (expected ${engineVersion})`,
      );
    }
  }

  if (mismatches.length > 0) {
    console.error(
      `version drift detected — ENGINE_VERSION is ${engineVersion} but these packages disagree:`,
    );
    for (const line of mismatches) console.error(line);
    console.error(
      "\nTo fix: bump the mismatched package.json versions to match ENGINE_VERSION,",
    );
    console.error(
      "or update ENGINE_VERSION in packages/engram-core/src/format/version.ts.",
    );
    process.exit(1);
  }

  console.log(
    `ok: ENGINE_VERSION=${engineVersion} across ${packages.length} workspace packages`,
  );
}

main();
