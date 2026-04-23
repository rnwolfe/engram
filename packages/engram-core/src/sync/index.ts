/**
 * sync/index.ts — barrel export for the sync orchestrator module.
 */

export type { ValidationFailure } from "./errors.js";
export {
  SyncConfigValidationError,
  SyncSourceError,
} from "./errors.js";
export { runSync, validateSyncConfig } from "./run.js";
export type {
  RunSyncOpts,
  SourceResult,
  SourceStatus,
  SyncAuthConfig,
  SyncConfig,
  SyncResult,
  SyncSource,
} from "./types.js";
export { resolveSyncAuth } from "./types.js";
