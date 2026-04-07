/**
 * adapter.ts — EnrichmentAdapter interface for pluggable enrichment sources.
 *
 * Each enrichment adapter (GitHub, Gerrit, Jira, etc.) implements this interface
 * and is called after the VCS layer to add context to the graph.
 */

import type { EngramGraph } from "../format/index.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EnrichOpts {
  /** Auth token for the remote API. NEVER stored in the graph. */
  token: string;
  /** ISO8601 date — only fetch items updated after this date */
  since?: string;
  /** API endpoint base URL (default: 'https://api.github.com') */
  endpoint?: string;
  /** Repository in 'owner/repo' format */
  repo?: string;
}

export interface EnrichmentAdapter {
  /** Unique adapter name (e.g. 'github') */
  name: string;
  /** Adapter category (e.g. 'enrichment') */
  kind: string;
  /**
   * Enrich the graph with data from the remote source.
   * Must be idempotent — safe to call multiple times.
   */
  enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult>;
}
