/**
 * scan.test.ts — standalone (tree-sitter-free) K8s Go scanner.
 * Ports the RBAC + watch contract from the removed tree-sitter Go extractor
 * (ADR-010).
 */
import { describe, expect, it } from "bun:test";
import { scanGoForK8s } from "../../../src/ingest/k8s/scan.js";

describe("scanGoForK8s — RBAC", () => {
  it("multi-group: one permission + grant per group", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,batch,resources=jobs,verbs=get
type FooReconciler struct{}`,
    );
    expect(r.permissions.map((p) => p.canonicalName).sort()).toEqual([
      "apps/jobs#get",
      "batch/jobs#get",
    ]);
    expect(r.grants).toHaveLength(2);
  });

  it("single verb: canonical group/resource#verb", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
type FooReconciler struct{}`,
    );
    expect(r.permissions).toHaveLength(1);
    expect(r.permissions[0].canonicalName).toBe("apps/deployments#get");
    expect(r.grants[0].struct).toBe("FooReconciler");
    expect(r.grants[0].permission).toBe("apps/deployments#get");
  });

  it("multi-verb (;-separated): one per verb", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch
type FooReconciler struct{}`,
    );
    expect(r.permissions).toHaveLength(3);
    expect(r.grants).toHaveLength(3);
  });

  it("empty group maps to core/", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups="",resources=pods,verbs=get
type FooReconciler struct{}`,
    );
    expect(r.permissions[0].canonicalName).toBe("core/pods#get");
  });

  it("missing required key → nothing", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,resources=deployments
type FooReconciler struct{}`,
    );
    expect(r.permissions).toHaveLength(0);
    expect(r.grants).toHaveLength(0);
  });

  it("marker not adjacent to struct (interrupted by code) → nothing", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
const X = 1
type FooReconciler struct{}`,
    );
    expect(r.permissions).toHaveLength(0);
  });

  it("multiple markers above same struct → all processed", () => {
    const r = scanGoForK8s(
      `// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get
// +kubebuilder:rbac:groups="",resources=pods,verbs=list
type FooReconciler struct{}`,
    );
    expect(r.permissions.map((p) => p.canonicalName).sort()).toEqual([
      "apps/deployments#get",
      "core/pods#list",
    ]);
  });
});

describe("scanGoForK8s — controller watches", () => {
  it("extracts For/Owns/Watches with package-qualified kinds", () => {
    const r = scanGoForK8s(
      `func (r *FooReconciler) SetupWithManager(mgr ctrl.Manager) error {
  return ctrl.NewControllerManagedBy(mgr).
    For(&appsv1.Deployment{}).
    Owns(&corev1.Pod{}).
    Watches(&source.Kind{Type: &batchv1.Job{}}).
    Complete(r)
}`,
    );
    const byKind = Object.fromEntries(
      r.watches.map((w) => [w.resourceKind, w.selector]),
    );
    expect(byKind.Deployment).toBe("For");
    expect(byKind.Pod).toBe("Owns");
    // Watches(&source.Kind{...}) captures the outer Kind type name
    expect(r.watches.some((w) => w.selector === "Watches")).toBe(true);
    expect(r.watches.every((w) => w.controller === "FooReconciler")).toBe(true);
  });
});
