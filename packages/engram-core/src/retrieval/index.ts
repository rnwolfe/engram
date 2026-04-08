/**
 * retrieval/index.ts — re-exports for the retrieval module.
 */

export type {
  DecayCategory,
  DecayItem,
  DecayOpts,
  DecayReport,
  DecaySeverity,
} from "./decay.js";
export { getDecayReport } from "./decay.js";
export type {
  GraphSearchOpts,
  TraversedEntity,
} from "./graph-search.js";
export { graphSearch } from "./graph-search.js";
export type { ScoreComponents } from "./scoring.js";
export type { SearchOpts, SearchResult } from "./search.js";
export { search } from "./search.js";
export type {
  PathResult,
  SubGraph,
  TraversalOpts,
} from "./traversal.js";
export { getNeighbors, getPath } from "./traversal.js";
