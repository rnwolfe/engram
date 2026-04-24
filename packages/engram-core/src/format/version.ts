/**
 * version.ts — canonical version constants for format and engine.
 *
 * Extracted from index.ts to break circular imports between format/ and graph/ modules.
 */

export const FORMAT_VERSION = "0.2.0";
export const ENGINE_VERSION = "0.3.2";

/**
 * The oldest schema version this engine can read.
 * v0.2 can read v0.1 files (projection-layer queries return empty sets).
 */
export const MIN_READABLE_VERSION = "0.1.0";

/**
 * The minimum schema version required before any write operation.
 * Opening a v0.1 file for writes must first migrate it to v0.2.
 */
export const MIN_WRITABLE_VERSION = "0.2.0";
