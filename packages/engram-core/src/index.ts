/**
 * engram-core — Temporal knowledge graph engine for developer memory.
 *
 * Public API surface. All consumer-facing types and functions are re-exported from here.
 */

export const FORMAT_VERSION = "0.1.0";
export const ENGINE_VERSION = "0.1.0";

export type { CreateOpts, EngramGraph } from "./format/index.js";
export {
  closeGraph,
  createGraph,
  EngramFormatError,
  openGraph,
  SCHEMA_DDL,
} from "./format/index.js";
