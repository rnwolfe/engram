import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/format/index.js";
import {
  closeGraph,
  createGraph,
  verifyGraph,
} from "../../../src/format/index.js";
import { findEdges } from "../../../src/graph/edges.js";
import { findEntities } from "../../../src/graph/entities.js";
import { extractGo } from "../../../src/ingest/source/extractors/go.js";
import { ingestSource } from "../../../src/ingest/source/index.js";
import { SourceParser } from "../../../src/ingest/source/parser.js";
import { ENTITY_TYPES, RELATION_TYPES } from "../../../src/vocab/index.js";

let parser: SourceParser;

beforeAll(async () => {
  parser = await SourceParser.create();
});

afterAll(() => {
  parser.dispose();
});

function captureFor(src: string) {
  const tree = parser.parse(src, "go");
  return parser.runQuery(tree, "go");
}

// ---------------------------------------------------------------------------
// Unit tests — single verb
// ---------------------------------------------------------------------------

describe("extractGo — RBAC single verb", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
type FooReconciler struct{}
`;

  it("emits one rbac_permission entity", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const rbac = extraEntities?.filter(
      (e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION,
    );
    expect(rbac).toHaveLength(1);
    expect(rbac?.[0].canonicalName).toBe("apps/deployments#get");
  });

  it("emits one rbac_grants edge from FooReconciler", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.relationType === RELATION_TYPES.RBAC_GRANTS &&
        e.source.kind === "symbol" &&
        e.source.name === "FooReconciler",
    );
    expect(edge).toBeDefined();
    expect(edge?.target.kind).toBe("canonical");
    if (edge?.target.kind === "canonical") {
      expect(edge.target.canonicalName).toBe("apps/deployments#get");
      expect(edge.target.entityType).toBe(ENTITY_TYPES.RBAC_PERMISSION);
    }
    expect(edge?.edgeKind).toBe("observed");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — multi-verb (semicolon-separated)
// ---------------------------------------------------------------------------

describe("extractGo — RBAC multi-verb", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch
type BarReconciler struct{}
`;

  it("emits one entity per verb", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities
      ?.filter((e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION)
      .map((e) => e.canonicalName);
    expect(names).toContain("apps/deployments#get");
    expect(names).toContain("apps/deployments#list");
    expect(names).toContain("apps/deployments#watch");
    expect(names).toHaveLength(3);
  });

  it("emits one edge per verb", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const rbacEdges = extraEdges?.filter(
      (e) => e.relationType === RELATION_TYPES.RBAC_GRANTS,
    );
    expect(rbacEdges).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — wildcard verb
// ---------------------------------------------------------------------------

describe("extractGo — RBAC wildcard verb", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=*
type WildReconciler struct{}
`;

  it("emits a single entity with wildcard verb", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities
      ?.filter((e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION)
      .map((e) => e.canonicalName);
    expect(names).toContain("apps/deployments#*");
    expect(names).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — empty apiGroup (core API group)
// ---------------------------------------------------------------------------

describe("extractGo — RBAC empty apiGroup maps to core/", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups="",resources=pods,verbs=get;list
type CoreReconciler struct{}
`;

  it("empty groups='' maps to core/ prefix", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities
      ?.filter((e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION)
      .map((e) => e.canonicalName);
    expect(names).toContain("core/pods#get");
    expect(names).toContain("core/pods#list");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — missing required key → warn and skip
// ---------------------------------------------------------------------------

describe("extractGo — RBAC malformed marker (missing required key)", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments
type BadReconciler struct{}
`;

  it("emits no entities when verbs is missing", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const rbac = extraEntities?.filter(
      (e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION,
    );
    expect(rbac ?? []).toHaveLength(0);
  });

  it("emits no edges when verbs is missing", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const rbac = extraEdges?.filter(
      (e) => e.relationType === RELATION_TYPES.RBAC_GRANTS,
    );
    expect(rbac ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — marker not adjacent to struct
// ---------------------------------------------------------------------------

describe("extractGo — RBAC marker not adjacent to struct", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get

func helper() {}

type NotAdjacentReconciler struct{}
`;

  it("does not associate marker with struct when separated by non-comment node", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const rbac = extraEntities?.filter(
      (e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION,
    );
    expect(rbac ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — multiple markers above same struct
// ---------------------------------------------------------------------------

describe("extractGo — RBAC multiple markers above same struct", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
// +kubebuilder:rbac:groups="",resources=pods,verbs=list
type MultiMarkerReconciler struct{}
`;

  it("processes all adjacent markers", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities
      ?.filter((e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION)
      .map((e) => e.canonicalName);
    expect(names).toContain("apps/deployments#get");
    expect(names).toContain("core/pods#list");
  });

  it("emits edges from the struct for each permission", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const rbacEdges = extraEdges?.filter(
      (e) =>
        e.relationType === RELATION_TYPES.RBAC_GRANTS &&
        e.source.kind === "symbol" &&
        e.source.name === "MultiMarkerReconciler",
    );
    expect(rbacEdges).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — subresource (skip)
// ---------------------------------------------------------------------------

describe("extractGo — RBAC subresource skipped", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments/status,verbs=get
type SubReconciler struct{}
`;

  it("skips markers with subresource paths", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const rbac = extraEntities?.filter(
      (e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION,
    );
    expect(rbac ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — multi-resource (skip)
// ---------------------------------------------------------------------------

describe("extractGo — RBAC multi-resource skipped", () => {
  const src = `
package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments;replicasets,verbs=get
type MultiResReconciler struct{}
`;

  it("skips markers with multiple resources", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const rbac = extraEntities?.filter(
      (e) => e.entityType === ENTITY_TYPES.RBAC_PERMISSION,
    );
    expect(rbac ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration test — ingestSource on kubebuilder controller file
// ---------------------------------------------------------------------------

describe("ingestSource — Go kubebuilder RBAC integration", () => {
  let tmpDir: string;
  let graphPath: string;
  let graph: EngramGraph;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-go-rbac-test-"));
    graphPath = path.join(tmpDir, "test.engram");
    graph = await createGraph(graphPath);
  });

  afterEach(async () => {
    closeGraph(graph);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates rbac_permission entities and rbac_grants edges, verifyGraph passes", async () => {
    const root = tmpDir;
    fs.mkdirSync(path.join(root, "controllers"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "controllers", "foo_controller.go"),
      `package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch
// +kubebuilder:rbac:groups="",resources=pods,verbs=get
type FooReconciler struct{}
`,
    );

    const result = await ingestSource(graph, {
      root,
      respectGitignore: false,
    });

    expect(result.errors).toHaveLength(0);

    const rbacEntities = findEntities(graph, {
      entity_type: ENTITY_TYPES.RBAC_PERMISSION,
    });
    const rbacNames = rbacEntities.map((e) => e.canonical_name);
    expect(rbacNames).toContain("apps/deployments#get");
    expect(rbacNames).toContain("apps/deployments#list");
    expect(rbacNames).toContain("apps/deployments#watch");
    expect(rbacNames).toContain("core/pods#get");

    const rbacEdges = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.RBAC_GRANTS,
    });
    expect(rbacEdges.length).toBeGreaterThan(0);

    const vr = verifyGraph(graph);
    expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("does not throw when struct is defined in a different file than markers", async () => {
    const root = tmpDir;
    fs.mkdirSync(path.join(root, "controllers"), { recursive: true });

    // Markers adjacent to a method_declaration (not a struct) — should skip gracefully
    fs.writeFileSync(
      path.join(root, "controllers", "setup.go"),
      `package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
func (r *CrossFileReconciler) Reconcile() error {
  return nil
}
`,
    );

    const result = await ingestSource(graph, {
      root,
      respectGitignore: false,
    });

    expect(result.errors).toHaveLength(0);

    const vr = verifyGraph(graph);
    expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });
});
