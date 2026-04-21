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
// Unit tests — extractGo extraEntities / extraEdges
// ---------------------------------------------------------------------------

describe("extractGo — SetupWithManager .For only", () => {
  const src = `
package controllers

type FooReconciler struct{}

func (r *FooReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&appsv1.Deployment{}).Complete(r)
}
`;

  it("emits a k8s_resource_kind entity for Deployment", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("Deployment");
  });

  it("entity has correct entity type", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const e = extraEntities?.find((e) => e.canonicalName === "Deployment");
    expect(e?.entityType).toBe(ENTITY_TYPES.K8S_RESOURCE_KIND);
  });

  it("emits a controller_watches edge from FooReconciler to Deployment", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.source.kind === "symbol" &&
        e.source.name === "FooReconciler" &&
        e.target.kind === "canonical" &&
        e.target.canonicalName === "Deployment",
    );
    expect(edge).toBeDefined();
    expect(edge?.relationType).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
    expect(edge?.edgeKind).toBe("observed");
  });
});

describe("extractGo — SetupWithManager .For + .Owns", () => {
  const src = `
package controllers

type BarReconciler struct{}

func (r *BarReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&appsv1.Deployment{}).Owns(&appsv1.ReplicaSet{}).Complete(r)
}
`;

  it("emits both resource kinds as entities", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("Deployment");
    expect(names).toContain("ReplicaSet");
  });

  it("For produces controller_watches edge", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.source.kind === "symbol" &&
        e.source.name === "BarReconciler" &&
        e.target.kind === "canonical" &&
        e.target.canonicalName === "Deployment",
    );
    expect(edge?.relationType).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
  });

  it("Owns produces controller_owns edge", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.source.kind === "symbol" &&
        e.source.name === "BarReconciler" &&
        e.target.kind === "canonical" &&
        e.target.canonicalName === "ReplicaSet",
    );
    expect(edge?.relationType).toBe(RELATION_TYPES.CONTROLLER_OWNS);
  });
});

describe("extractGo — SetupWithManager .For + .Watches", () => {
  const src = `
package controllers

type BazReconciler struct{}

func (r *BazReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&MyKind{}).Watches(&OtherKind{}).Complete(r)
}
`;

  it("For produces controller_watches edge", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.source.kind === "symbol" &&
        e.source.name === "BazReconciler" &&
        e.target.kind === "canonical" &&
        e.target.canonicalName === "MyKind",
    );
    expect(edge?.relationType).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
  });

  it("Watches produces controller_watches edge", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const edge = extraEdges?.find(
      (e) =>
        e.source.kind === "symbol" &&
        e.source.name === "BazReconciler" &&
        e.target.kind === "canonical" &&
        e.target.canonicalName === "OtherKind",
    );
    expect(edge?.relationType).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
  });
});

describe("extractGo — package-qualified type", () => {
  const src = `
package controllers

type QReconciler struct{}

func (r *QReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&appsv1.Deployment{}).Complete(r)
}
`;

  it("strips package qualifier and uses bare type name", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("Deployment");
    expect(names).not.toContain("appsv1.Deployment");
  });
});

describe("extractGo — bare type (no package qualifier)", () => {
  const src = `
package controllers

type BareReconciler struct{}

func (r *BareReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&MyResource{}).Complete(r)
}
`;

  it("extracts bare type name directly", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("MyResource");
  });
});

describe("extractGo — top-level function (skipped)", () => {
  const src = `
package controllers

func SetupWithManager(mgr interface{}) error {
  return x.For(&appsv1.Deployment{}).Complete(nil)
}
`;

  it("does not emit extras for top-level function (no receiver)", () => {
    const { extraEntities, extraEdges } = extractGo(captureFor(src));
    expect(extraEntities ?? []).toHaveLength(0);
    expect(extraEdges ?? []).toHaveLength(0);
  });
});

describe("extractGo — variable-ref argument (skipped)", () => {
  const src = `
package controllers

type VarReconciler struct{}

func (r *VarReconciler) SetupWithManager(mgr interface{}) error {
  obj := &appsv1.Deployment{}
  return x.For(obj).Complete(r)
}
`;

  it("skips non-composite-literal argument", () => {
    const { extraEdges } = extractGo(captureFor(src));
    expect(extraEdges ?? []).toHaveLength(0);
  });
});

describe("extractGo — multi-line call chain", () => {
  const src = `
package controllers

type ChainReconciler struct{}

func (r *ChainReconciler) SetupWithManager(mgr interface{}) error {
  return x.NewControllerManagedBy(mgr).
    For(&appsv1.Deployment{}).
    Owns(&appsv1.ReplicaSet{}).
    Watches(&appsv1.StatefulSet{}).
    Complete(r)
}
`;

  it("extracts all three resource kinds across a multi-line chain", () => {
    const { extraEntities } = extractGo(captureFor(src));
    const names = extraEntities?.map((e) => e.canonicalName) ?? [];
    expect(names).toContain("Deployment");
    expect(names).toContain("ReplicaSet");
    expect(names).toContain("StatefulSet");
  });

  it("For and Watches produce controller_watches, Owns produces controller_owns", () => {
    const { extraEdges } = extractGo(captureFor(src));
    const byTarget = new Map(
      extraEdges?.map((e) => [
        e.target.kind === "canonical" ? e.target.canonicalName : "",
        e.relationType,
      ]) ?? [],
    );
    expect(byTarget.get("Deployment")).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
    expect(byTarget.get("ReplicaSet")).toBe(RELATION_TYPES.CONTROLLER_OWNS);
    expect(byTarget.get("StatefulSet")).toBe(RELATION_TYPES.CONTROLLER_WATCHES);
  });
});

// ---------------------------------------------------------------------------
// Integration test — ingestSource + verifyGraph
// ---------------------------------------------------------------------------

describe("ingestSource — Go controller watches integration", () => {
  let tmpDir: string;
  let graphPath: string;
  let graph: EngramGraph;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-go-watches-test-"));
    graphPath = path.join(tmpDir, "test.engram");
    graph = await createGraph(graphPath);
  });

  afterEach(async () => {
    closeGraph(graph);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates k8s_resource_kind entities and controller edges, verifyGraph passes", async () => {
    const root = tmpDir;
    fs.mkdirSync(path.join(root, "controllers"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "controllers", "foo_controller.go"),
      `package controllers

type FooReconciler struct{}

func (r *FooReconciler) SetupWithManager(mgr interface{}) error {
  return x.For(&appsv1.Deployment{}).Owns(&appsv1.ReplicaSet{}).Complete(r)
}
`,
    );

    const result = await ingestSource(graph, {
      root,
      respectGitignore: false,
    });

    expect(result.errors).toHaveLength(0);

    const k8sEntities = findEntities(graph, {
      entity_type: ENTITY_TYPES.K8S_RESOURCE_KIND,
    });
    const k8sNames = k8sEntities.map((e) => e.canonical_name);
    expect(k8sNames).toContain("Deployment");
    expect(k8sNames).toContain("ReplicaSet");

    const watchEdges = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.CONTROLLER_WATCHES,
    });
    expect(watchEdges.length).toBeGreaterThan(0);

    const ownsEdges = findEdges(graph, {
      active_only: true,
      relation_type: RELATION_TYPES.CONTROLLER_OWNS,
    });
    expect(ownsEdges.length).toBeGreaterThan(0);

    const vr = verifyGraph(graph);
    expect(vr.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });
});
