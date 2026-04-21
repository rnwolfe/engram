import type { SyntaxNode } from "web-tree-sitter";
import { ENTITY_TYPES, RELATION_TYPES } from "../../../vocab/index.js";
import type { QueryCapture } from "../parser";
import type {
  ExtractedEdge,
  ExtractedEntity,
  ExtractedFile,
  ExtractedSymbol,
} from "./types.js";

export type { ExtractedFile, ExtractedSymbol };

const KIND_MAP: Record<string, ExtractedSymbol["kind"]> = {
  function: "function",
  type: "type",
  const: "const",
};

const WATCH_METHODS = new Set(["For", "Owns", "Watches"]);

/**
 * Extract top-level symbols and import paths from tree-sitter-go query captures.
 *
 * In Go, exported symbols have names beginning with an uppercase letter.
 * Import paths are quoted string literals — quotes are stripped.
 *
 * Also extracts controller-runtime SetupWithManager watch/owns edges.
 */
export function extractGo(captures: QueryCapture[]): ExtractedFile {
  const symbols: ExtractedSymbol[] = [];
  const rawImports: string[] = [];
  const seenNames = new Set<string>();
  const extraEntities: ExtractedEntity[] = [];
  const extraEdges: ExtractedEdge[] = [];
  const seenResourceKinds = new Set<string>();

  // Group setup.* captures by position so we can pair receiver + name + body.
  // Each triplet shares the same method_declaration parent start index.
  const setupGroups = new Map<
    number,
    { receiver?: SyntaxNode; name?: SyntaxNode; body?: SyntaxNode }
  >();

  for (const capture of captures) {
    const { name: captureName, node } = capture;

    if (captureName === "import.source") {
      const raw = node.text.slice(1, -1);
      rawImports.push(raw);
      continue;
    }

    if (captureName.startsWith("symbol.")) {
      const kindKey = captureName.slice("symbol.".length);
      const kind = KIND_MAP[kindKey];
      if (!kind) continue;

      const symbolName = node.text;
      if (seenNames.has(symbolName)) {
        console.warn(
          `[engram extractor/go] duplicate symbol name '${symbolName}' — keeping first occurrence`,
        );
        continue;
      }

      const exported = /^[A-Z]/.test(symbolName);

      seenNames.add(symbolName);
      symbols.push({
        name: symbolName,
        kind,
        exported,
        startByte: node.startIndex,
        endByte: node.endIndex,
      });
      continue;
    }

    if (captureName.startsWith("setup.")) {
      // Group by the method_declaration's start index (parent of each capture)
      const methodNode = node.parent;
      if (!methodNode) continue;
      const key = methodNode.startIndex;
      if (!setupGroups.has(key)) setupGroups.set(key, {});
      const group = setupGroups.get(key);
      if (!group) continue;
      const part = captureName.slice("setup.".length);
      if (part === "receiver") group.receiver = node;
      else if (part === "name") group.name = node;
      else if (part === "body") group.body = node;
    }
  }

  for (const group of setupGroups.values()) {
    if (!group.receiver || !group.body) continue;

    const receiverType = extractReceiverType(group.receiver);
    if (!receiverType) continue;

    const calls = collectWatchCalls(group.body);

    for (const { selector, resourceKind } of calls) {
      if (!seenResourceKinds.has(resourceKind)) {
        seenResourceKinds.add(resourceKind);
        extraEntities.push({
          canonicalName: resourceKind,
          entityType: ENTITY_TYPES.K8S_RESOURCE_KIND,
        });
      }

      const relationType =
        selector === "Owns"
          ? RELATION_TYPES.CONTROLLER_OWNS
          : RELATION_TYPES.CONTROLLER_WATCHES;

      extraEdges.push({
        source: { kind: "symbol", name: receiverType },
        target: {
          kind: "canonical",
          canonicalName: resourceKind,
          entityType: ENTITY_TYPES.K8S_RESOURCE_KIND,
        },
        relationType,
        edgeKind: "observed",
        fact: `${receiverType}.SetupWithManager calls .${selector}(&${resourceKind}{})`,
      });
    }
  }

  return { symbols, rawImports, extraEntities, extraEdges };
}

/**
 * Extract the receiver struct name from a parameter_list node.
 * Handles both pointer (`*FooReconciler`) and value (`FooReconciler`) receivers.
 * Returns null if the receiver cannot be resolved to a type name.
 */
function extractReceiverType(paramList: SyntaxNode): string | null {
  for (let i = 0; i < paramList.childCount; i++) {
    const child = paramList.child(i);
    if (!child || child.type !== "parameter_declaration") continue;
    const typeChild = child.childForFieldName("type");
    if (!typeChild) continue;
    if (typeChild.type === "pointer_type") {
      const inner = typeChild.child(1);
      if (inner?.type === "type_identifier") return inner.text;
    } else if (typeChild.type === "type_identifier") {
      return typeChild.text;
    }
  }
  return null;
}

/**
 * Walk a block node recursively to collect all call_expression nodes whose
 * selector is For, Owns, or Watches. Returns the selector name and normalized
 * resource kind (package-qualifier stripped, bare type name only).
 * Skips arguments that are not unary `&composite_literal` expressions.
 */
function collectWatchCalls(
  node: SyntaxNode,
): { selector: string; resourceKind: string }[] {
  const results: { selector: string; resourceKind: string }[] = [];

  if (node.type === "call_expression") {
    const fn = node.childForFieldName("function");
    if (fn?.type === "selector_expression") {
      const field = fn.childForFieldName("field");
      if (field && WATCH_METHODS.has(field.text)) {
        const args = node.childForFieldName("arguments");
        if (args) {
          const resourceKind = extractResourceKindFromArgs(args);
          if (resourceKind) {
            results.push({ selector: field.text, resourceKind });
          }
        }
      }
    }
  }

  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) results.push(...collectWatchCalls(child));
  }

  return results;
}

/**
 * Extract the bare type name from an argument_list containing `&T{}` or
 * `&pkg.T{}`. Returns null when the argument is not a composite literal pointer.
 */
function extractResourceKindFromArgs(args: SyntaxNode): string | null {
  for (let i = 0; i < args.childCount; i++) {
    const child = args.child(i);
    if (!child || child.type !== "unary_expression") continue;

    const op = child.child(0);
    if (op?.text !== "&") continue;

    const inner = child.child(1);
    if (!inner || inner.type !== "composite_literal") continue;

    const typeNode = inner.childForFieldName("type");
    if (!typeNode) continue;

    if (typeNode.type === "qualified_type") {
      const nameNode = typeNode.childForFieldName("name");
      return nameNode?.text ?? null;
    }
    if (typeNode.type === "type_identifier") {
      return typeNode.text;
    }
  }
  return null;
}
