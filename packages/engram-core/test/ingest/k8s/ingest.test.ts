/**
 * ingest.test.ts — ingestK8s orchestrator (walk Go files → graph entities/edges).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/index.js";
import { closeGraph, createGraph } from "../../../src/index.js";
import { ingestK8s } from "../../../src/ingest/k8s/index.js";

let graph: EngramGraph;
let dir: string;

beforeEach(() => {
  graph = createGraph(":memory:");
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-k8s-ingest-"));
});
afterEach(() => {
  closeGraph(graph);
  fs.rmSync(dir, { recursive: true, force: true });
});

const CONTROLLER_GO = `package controllers

// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch
type FooReconciler struct{}

func (r *FooReconciler) SetupWithManager(mgr ctrl.Manager) error {
  return ctrl.NewControllerManagedBy(mgr).
    For(&appsv1.Deployment{}).
    Owns(&corev1.Pod{}).
    Complete(r)
}
`;

describe("ingestK8s", () => {
  test("creates rbac + watch entities and edges from a controller dir", () => {
    fs.writeFileSync(path.join(dir, "controller.go"), CONTROLLER_GO);
    // a non-operator Go file produces nothing
    fs.writeFileSync(path.join(dir, "plain.go"), "package x\nfunc Y() {}\n");

    const r = ingestK8s(graph, dir);

    expect(r.episodesCreated).toBe(1); // only the controller file
    expect(r.entitiesCreated).toBeGreaterThan(0);
    expect(r.edgesCreated).toBeGreaterThan(0);

    const rbacPerms = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) n FROM entities WHERE entity_type = 'rbac_permission'",
      )
      .get();
    expect(rbacPerms?.n).toBe(3); // get;list;watch

    const grants = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) n FROM edges WHERE relation_type = 'rbac_grants'",
      )
      .get();
    expect(grants?.n).toBe(3);

    const watches = graph.db
      .query<{ n: number }, []>(
        "SELECT COUNT(*) n FROM edges WHERE relation_type IN ('controller_watches','controller_owns')",
      )
      .get();
    expect(watches?.n).toBe(2); // For(Deployment) + Owns(Pod)
  });

  test("idempotent entity reuse across files", () => {
    fs.writeFileSync(path.join(dir, "a.go"), CONTROLLER_GO);
    const r = ingestK8s(graph, dir);
    // FooReconciler module entity is created once and reused for grants+watches
    const fooCount = graph.db
      .query<{ n: number }, [string]>(
        "SELECT COUNT(*) n FROM entities WHERE canonical_name = ? AND entity_type = 'module'",
      )
      .get("FooReconciler");
    expect(fooCount?.n).toBe(1);
    expect(r.entitiesResolved).toBeGreaterThan(0);
  });
});
