/**
 * schema.ts — Re-exports the unresolved_refs DDL constants and exposes an
 * idempotent setup helper for contexts that don't go through openGraph (tests,
 * migration scripts, etc.).
 *
 * The table is created by openGraph automatically on every open via ADDITIVE_DDL.
 */

import type { EngramGraph } from "../../format/index.js";
import {
  CREATE_UNRESOLVED_REFS,
  CREATE_UNRESOLVED_REFS_INDEX,
} from "../../format/schema.js";

export { CREATE_UNRESOLVED_REFS, CREATE_UNRESOLVED_REFS_INDEX };

/** Idempotent: create unresolved_refs table if it does not exist. */
export function ensureUnresolvedRefsTable(graph: EngramGraph): void {
  graph.db.exec(CREATE_UNRESOLVED_REFS);
  graph.db.exec(CREATE_UNRESOLVED_REFS_INDEX);
}
