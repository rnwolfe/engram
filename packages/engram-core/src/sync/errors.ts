/**
 * sync/errors.ts — error types for the sync orchestrator.
 */

// ---------------------------------------------------------------------------
// Validation error
// ---------------------------------------------------------------------------

export interface ValidationFailure {
  /** JSON path to the failing field, e.g. 'sources[1].auth.tokenEnv'. */
  field: string;
  /** Human-readable reason. */
  reason: string;
}

/**
 * Thrown when `.engram.config.json` fails validation.
 * Reports ALL failures at once so the user can fix everything in one edit.
 */
export class SyncConfigValidationError extends Error {
  readonly failures: ValidationFailure[];

  constructor(failures: ValidationFailure[]) {
    const lines = failures.map((f) => `  ${f.field}: ${f.reason}`).join("\n");
    super(`Sync config validation failed:\n${lines}`);
    this.name = "SyncConfigValidationError";
    this.failures = failures;
  }
}

// ---------------------------------------------------------------------------
// Source execution error
// ---------------------------------------------------------------------------

/**
 * Thrown (or caught and converted to SourceResult) when a single source fails.
 * Wraps the underlying cause with source name and type context.
 */
export class SyncSourceError extends Error {
  readonly sourceName: string;
  readonly sourceType: string;
  readonly cause: unknown;

  constructor(sourceName: string, sourceType: string, cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause);
    super(`source '${sourceName}' (${sourceType}) failed: ${msg}`);
    this.name = "SyncSourceError";
    this.sourceName = sourceName;
    this.sourceType = sourceType;
    this.cause = cause;
  }
}
