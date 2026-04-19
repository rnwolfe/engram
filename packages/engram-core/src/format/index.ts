/**
 * format/index.ts — public re-exports for the .engram format module.
 */

export type { CreateOpts, EngramGraph } from "./graph.js";
export {
  closeGraph,
  createGraph,
  EngramFormatError,
  openGraph,
  resolveDbPath,
} from "./graph.js";
export { migrate_0_1_0_to_0_2_0 } from "./migrations.js";
export { ADDITIVE_DDL, SCHEMA_DDL } from "./schema.js";
export type {
  VerifyOpts,
  VerifyResult,
  Violation,
  ViolationSeverity,
} from "./verify.js";
export { verifyGraph } from "./verify.js";
