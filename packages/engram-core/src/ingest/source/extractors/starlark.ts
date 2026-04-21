/**
 * extractors/starlark.ts — Starlark/BUILD file extractor.
 *
 * Produces `bazel_target` entities for each named rule and `build_depends_on`
 * edges for each string-literal dep entry. Non-string deps (select(), variables,
 * concatenation) are silently skipped. Rules without a `name` attribute are
 * silently skipped.
 *
 * Canonical target label: `//<pkg>:<name>`
 *   where `<pkg>` is the BUILD file's parent directory relative to walk root.
 *
 * Label resolution:
 *   `:bar`                  → `//<current-pkg>:bar`
 *   `//lib:baz`             → `//lib:baz` (unchanged)
 *   `@repo//pkg:target`     → `@repo//pkg:target` (unchanged)
 */

import path from "node:path";
import { ENTITY_TYPES, RELATION_TYPES } from "../../../vocab/index.js";
import type { QueryCapture } from "../parser.js";
import type { ExtractedEdge, ExtractedEntity, ExtractedFile } from "./types.js";

/**
 * Compute the Bazel package label component from a BUILD file path.
 * e.g.  "src/lib/BUILD"       → "src/lib"
 *       "BUILD"               → ""
 *       "a/b/BUILD.bazel"     → "a/b"
 */
function pkgFromFilePath(filePath: string, walkRoot: string): string {
  const absFile = path.resolve(walkRoot, filePath);
  const absRoot = path.resolve(walkRoot);
  const rel = path.relative(absRoot, path.dirname(absFile));
  // Normalise Windows separators and strip trailing/leading dots
  return rel === "." ? "" : rel.replace(/\\/g, "/");
}

/**
 * Resolve a dep label string relative to the current package.
 * - `:bar`           → `//<pkg>:bar`
 * - `//lib:baz`      → `//lib:baz`
 * - `@repo//...`     → `@repo//...`
 */
function resolveLabel(rawDep: string, currentPkg: string): string {
  if (rawDep.startsWith(":")) {
    return `//${currentPkg}${rawDep}`;
  }
  return rawDep;
}

/**
 * Find the enclosing `call` node for a capture node by walking up the tree.
 * Returns the call node, or null if none found.
 */
function enclosingCallKey(node: QueryCapture["node"]): string | null {
  let cur = node.parent;
  while (cur) {
    if (cur.type === "call") {
      return `${cur.startPosition.row}:${cur.startPosition.column}`;
    }
    cur = cur.parent;
  }
  return null;
}

export function extractStarlark(
  captures: QueryCapture[],
  filePath: string,
  walkRoot: string,
): ExtractedFile {
  const pkg = pkgFromFilePath(filePath, walkRoot);

  // Group captures by the enclosing call node (keyed by position string).
  // Each group has: ruleName (string | null), deps (string[])
  const callGroups = new Map<
    string,
    { ruleName: string | null; deps: string[] }
  >();

  for (const capture of captures) {
    const key = enclosingCallKey(capture.node);
    if (!key) continue;

    if (!callGroups.has(key)) {
      callGroups.set(key, { ruleName: null, deps: [] });
    }
    const group = callGroups.get(key);
    if (!group) continue;

    if (capture.name === "rule.name") {
      group.ruleName = capture.node.text;
    } else if (capture.name === "dep.entry") {
      group.deps.push(capture.node.text);
    }
    // _name_key and _deps_key are auxiliary captures used only for filtering in the
    // query (#eq? predicate) — ignore them in the extractor.
  }

  const extraEntities: ExtractedEntity[] = [];
  const extraEdges: ExtractedEdge[] = [];

  for (const { ruleName, deps } of callGroups.values()) {
    // Silently skip rules without a name attribute
    if (!ruleName) continue;

    const targetLabel = `//${pkg}:${ruleName}`;

    extraEntities.push({
      canonicalName: targetLabel,
      entityType: ENTITY_TYPES.BAZEL_TARGET,
    });

    for (const rawDep of deps) {
      const depLabel = resolveLabel(rawDep, pkg);

      // Upsert the dep target entity (may be in another package)
      extraEntities.push({
        canonicalName: depLabel,
        entityType: ENTITY_TYPES.BAZEL_TARGET,
      });

      extraEdges.push({
        source: {
          kind: "canonical",
          canonicalName: targetLabel,
          entityType: ENTITY_TYPES.BAZEL_TARGET,
        },
        target: {
          kind: "canonical",
          canonicalName: depLabel,
          entityType: ENTITY_TYPES.BAZEL_TARGET,
        },
        relationType: RELATION_TYPES.BUILD_DEPENDS_ON,
        edgeKind: "observed",
        fact: `${targetLabel} depends on ${depLabel}`,
      });
    }
  }

  return {
    symbols: [],
    rawImports: [],
    extraEntities,
    extraEdges,
  };
}
