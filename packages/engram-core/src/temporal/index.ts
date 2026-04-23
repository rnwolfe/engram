/**
 * temporal/index.ts — re-exports for the temporal engine module.
 */

export type { ResolvedAsOf } from "./as-of.js";
export { InvalidAsOfError, resolveAsOf } from "./as-of.js";
export type {
  DecisionReversal,
  DiffEdgeEntry,
  DiffEdges,
  DiffOpts,
  DiffProjectionEntry,
  DiffProjections,
  GraphDiff,
  OwnershipShift,
} from "./diff.js";
export { diffGraph } from "./diff.js";
export { getFactHistory } from "./history.js";
export type { TemporalSnapshot } from "./snapshot.js";
export { getSnapshot } from "./snapshot.js";
export { checkActiveEdgeConflict, supersedeEdge } from "./supersession.js";
