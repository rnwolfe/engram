/**
 * relation-types.ts — canonical relation_type vocabulary for edges.
 *
 * New adapters must import from here rather than inlining string literals.
 * Retired values stay with @deprecated rather than being removed (removal is breaking).
 */

export const RELATION_TYPES = {
  // VCS / authorship
  AUTHORED_BY: "authored_by",
  LIKELY_OWNER_OF: "likely_owner_of",
  CO_CHANGES_WITH: "co_changes_with",
  // Code review
  REVIEWED_BY: "reviewed_by",
  // Cross-source references
  REFERENCES: "references",
  // Source code structure (from source ingestion)
  CONTAINS: "contains",
  DEFINED_IN: "defined_in",
  IMPORTS: "imports",
  // Kubernetes controller-runtime relationships
  CONTROLLER_WATCHES: "controller_watches",
  CONTROLLER_OWNS: "controller_owns",
  // Kubernetes RBAC
  RBAC_GRANTS: "rbac_grants",
  // Build graph (from Bazel/Starlark ingestion)
  BUILD_DEPENDS_ON: "build_depends_on",
} as const;

export type RelationType = (typeof RELATION_TYPES)[keyof typeof RELATION_TYPES];
