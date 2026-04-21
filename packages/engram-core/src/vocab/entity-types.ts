/**
 * entity-types.ts — canonical entity_type vocabulary.
 *
 * New adapters must import from here rather than inlining string literals.
 * To add a value: add it here, document in docs/internal/specs/vocabulary.md,
 * and re-export from vocab/index.ts. Retired values stay with @deprecated rather
 * than being removed (removal is breaking).
 */

export const ENTITY_TYPES = {
  PERSON: "person",
  MODULE: "module",
  SERVICE: "service",
  FILE: "file",
  SYMBOL: "symbol",
  COMMIT: "commit",
  PULL_REQUEST: "pull_request",
  ISSUE: "issue",
  K8S_RESOURCE_KIND: "k8s_resource_kind",
  RBAC_PERMISSION: "rbac_permission",
} as const;

export type EntityType = (typeof ENTITY_TYPES)[keyof typeof ENTITY_TYPES];
