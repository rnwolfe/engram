/**
 * temporal/index.ts — re-exports for the temporal engine module.
 */

export type { ResolvedAsOf } from "./as-of.js";
export { InvalidAsOfError, resolveAsOf } from "./as-of.js";
export { getFactHistory } from "./history.js";
export type { TemporalSnapshot } from "./snapshot.js";
export { getSnapshot } from "./snapshot.js";
export { checkActiveEdgeConflict, supersedeEdge } from "./supersession.js";
