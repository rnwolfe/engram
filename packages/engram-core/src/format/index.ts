/**
 * format/index.ts — public re-exports for the .engram format module.
 */

export type { CreateOpts, EngramGraph } from "./graph.js";
export {
  closeGraph,
  createGraph,
  EngramFormatError,
  openGraph,
} from "./graph.js";
export { SCHEMA_DDL } from "./schema.js";
