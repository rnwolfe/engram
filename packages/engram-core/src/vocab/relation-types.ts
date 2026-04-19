export const RELATION_TYPES = {
  LIKELY_OWNER_OF: "likely_owner_of",
  CO_CHANGES_WITH: "co_changes_with",
  REVIEWED_BY: "reviewed_by",
  AUTHORED_BY: "authored_by",
  REFERENCES: "references",
} as const;

export type RelationType = (typeof RELATION_TYPES)[keyof typeof RELATION_TYPES];
