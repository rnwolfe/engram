/**
 * scan.ts — tree-sitter-free Kubernetes-operator extraction from Go source.
 *
 * Preserves the kubebuilder RBAC + controller-runtime watch extraction that used
 * to ride the tree-sitter Go extractor (removed in ADR-010), reimplemented as
 * line/regex scanning over raw Go text — no AST, no WASM grammars. These
 * extract cross-file operator *semantics* (the RBAC permission graph, the
 * watch/owns graph) that a single-file read does not reveal.
 *
 * Pure functions: input Go source text, output structured entities/edges. The
 * RBAC marker parsing is ported verbatim from the old extractor.
 */

export interface K8sRbacPermission {
  /** `<group-or-core>/<resource>#<verb>` */
  canonicalName: string;
}
export interface K8sRbacGrant {
  struct: string;
  permission: string; // canonicalName
  fact: string;
}
export interface K8sWatch {
  controller: string; // receiver type
  selector: "For" | "Owns" | "Watches";
  resourceKind: string;
  fact: string;
}

export interface K8sScanResult {
  permissions: K8sRbacPermission[];
  grants: K8sRbacGrant[];
  watches: K8sWatch[];
}

const KUBEBUILDER_RBAC_RE = /^\s*\/\/\s*\+kubebuilder:rbac:(.+)$/;
// Only struct declarations carry kubebuilder RBAC markers (reconcilers). The old
// tree-sitter query matched struct types only; requiring `struct` here avoids
// associating markers with aliases/interfaces (false-positive permissions).
const TYPE_DECL_RE = /^\s*type\s+([A-Za-z_]\w*)\s+struct\b/;
const SETUP_RE =
  /func\s*\(\s*\w+\s+\*?([A-Za-z_]\w*)\s*\)\s*SetupWithManager\b/g;
// `\.\s*` tolerates fluent method chains that put `.` at the end of one line
// and the method at the start of the next.
const WATCH_CALL_RE =
  /\.\s*(For|Owns|Watches)\(\s*&(?:\w+\.)?([A-Za-z_]\w*)\s*\{/g;

/**
 * Scan Go source for kubebuilder RBAC markers and controller-runtime watches.
 */
export function scanGoForK8s(content: string): K8sScanResult {
  const permissions: K8sRbacPermission[] = [];
  const grants: K8sRbacGrant[] = [];
  const watches: K8sWatch[] = [];
  const seenPerms = new Set<string>();
  const seenGrants = new Set<string>();
  const seenWatch = new Set<string>();

  // --- RBAC: contiguous `// +kubebuilder:rbac` comments immediately above a
  // `type X ...` declaration. A non-comment, non-blank line breaks the block.
  const lines = content.split("\n");
  let pending: string[] = [];
  for (const line of lines) {
    if (KUBEBUILDER_RBAC_RE.test(line)) {
      pending.push(line.trim());
      continue;
    }
    if (/^\s*\/\//.test(line) || line.trim() === "") {
      // other comment or blank — does not break the marker→type adjacency
      continue;
    }
    const typeMatch = TYPE_DECL_RE.exec(line);
    if (typeMatch && pending.length > 0) {
      const struct = typeMatch[1];
      for (const marker of pending) {
        processRbacMarker(
          marker,
          struct,
          permissions,
          grants,
          seenPerms,
          seenGrants,
        );
      }
    }
    pending = []; // any non-marker code line resets the pending block
  }

  // --- Watches: within each SetupWithManager method body, find
  // .For/.Owns/.Watches(&Kind{}) calls.
  for (const { controller, body } of setupBodies(content)) {
    WATCH_CALL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
    while ((m = WATCH_CALL_RE.exec(body)) !== null) {
      const selector = m[1] as K8sWatch["selector"];
      const resourceKind = m[2];
      const key = `${controller}::${selector}::${resourceKind}`;
      if (seenWatch.has(key)) continue;
      seenWatch.add(key);
      watches.push({
        controller,
        selector,
        resourceKind,
        fact: `${controller}.SetupWithManager calls .${selector}(&${resourceKind}{})`,
      });
    }
  }

  return { permissions, grants, watches };
}

/**
 * Yield each SetupWithManager method's receiver type + body (brace-matched).
 */
function setupBodies(content: string): { controller: string; body: string }[] {
  const out: { controller: string; body: string }[] = [];
  SETUP_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop
  while ((m = SETUP_RE.exec(content)) !== null) {
    const controller = m[1];
    const braceStart = content.indexOf("{", m.index);
    if (braceStart === -1) continue;
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < content.length; i++) {
      if (content[i] === "{") depth++;
      else if (content[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push({ controller, body: content.slice(braceStart, end + 1) });
  }
  return out;
}

// --- RBAC marker parsing (ported verbatim from the removed Go extractor) -----

function processRbacMarker(
  line: string,
  structName: string,
  permissions: K8sRbacPermission[],
  grants: K8sRbacGrant[],
  seenPerms: Set<string>,
  seenGrants: Set<string>,
): void {
  const match = KUBEBUILDER_RBAC_RE.exec(line);
  if (!match) return;
  const params = parseMarkerParams(match[1]);
  const groupsRaw = params.get("groups");
  const resourcesRaw = params.get("resources");
  const verbsRaw = params.get("verbs");
  if (
    groupsRaw === undefined ||
    resourcesRaw === undefined ||
    verbsRaw === undefined
  ) {
    return; // missing required key
  }
  if (resourcesRaw.includes("/")) return; // subresource — unsupported
  if (params.has("urls")) return; // urls — unsupported
  const resources = resourcesRaw
    .split(/[,;]/)
    .map((r) => r.trim())
    .filter(Boolean);
  if (resources.length > 1) return; // multi-resource — unsupported
  const resource = resources[0];
  if (!resource) return;

  const groups = groupsRaw
    .split(",")
    .map((g) => g.trim().replace(/^["']|["']$/g, ""));
  const verbs = verbsRaw
    .split(";")
    .map((v) => v.trim())
    .filter(Boolean);

  for (const group of groups) {
    const groupPrefix = group === "" ? "core/" : `${group}/`;
    for (const verb of verbs) {
      const canonicalName = `${groupPrefix}${resource}#${verb}`;
      if (!seenPerms.has(canonicalName)) {
        seenPerms.add(canonicalName);
        permissions.push({ canonicalName });
      }
      const edgeKey = `${structName}::${canonicalName}`;
      if (!seenGrants.has(edgeKey)) {
        seenGrants.add(edgeKey);
        grants.push({
          struct: structName,
          permission: canonicalName,
          fact: `${structName} is granted ${verb} on ${groupPrefix}${resource} via kubebuilder RBAC marker`,
        });
      }
    }
  }
}

function parseMarkerParams(paramStr: string): Map<string, string> {
  const result = new Map<string, string>();
  const parts = paramStr.split(/,(?=[a-zA-Z]+=)/);
  for (const part of parts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    result.set(part.slice(0, eqIdx).trim(), part.slice(eqIdx + 1).trim());
  }
  return result;
}
