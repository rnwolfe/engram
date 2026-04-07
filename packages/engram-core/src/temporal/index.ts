/**
 * temporal/index.ts — re-exports for the temporal engine module.
 */

export { getFactHistory } from "./history.js";
export type { TemporalSnapshot } from "./snapshot.js";
export { getSnapshot } from "./snapshot.js";
export { checkActiveEdgeConflict, supersedeEdge } from "./supersession.js";
