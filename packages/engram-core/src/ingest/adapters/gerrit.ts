/**
 * gerrit.ts — Gerrit enrichment adapter (stub).
 *
 * This stub implements the full `EnrichmentAdapter` contract as a type-level
 * proof that the interface can accommodate adapters with different shapes.
 *
 * ## Gerrit-specific fields that would need to be added to `EnrichOpts` when
 * implementing this adapter fully:
 *
 *   - `gerrit_host?: string`  — base URL of the Gerrit instance
 *     (e.g. 'https://gerrit.example.com'). Overrides `endpoint` for Gerrit.
 *   - `gerrit_project?: string` — Gerrit project name (not the same as `repo`
 *     which is GitHub-centric).
 *   - `gerrit_query?: string` — additional change search query in Gerrit query
 *     syntax (e.g. 'status:merged branch:main').
 *
 * Authentication notes:
 *   - Open-source Gerrit instances typically allow unauthenticated REST access
 *     (`supportsAuth` includes 'none').
 *   - Authenticated access uses HTTP Basic with a generated HTTP password;
 *     pass it via `opts.token` as `<user>:<password>` or via a pre-encoded
 *     Authorization header value.
 */

import type { EngramGraph } from "../../format/index.js";
import type { EnrichmentAdapter, EnrichOpts } from "../adapter.js";
import { EnrichmentAdapterError } from "../adapter.js";
import type { IngestResult } from "../git.js";

export class GerritAdapter implements EnrichmentAdapter {
  name = "gerrit";
  kind = "enrichment";
  /** @experimental */
  supportsAuth: string[] = ["none", "token"];
  /** @experimental */
  supportsCursor = true;

  enrich(_graph: EngramGraph, _opts: EnrichOpts): Promise<IngestResult> {
    throw new EnrichmentAdapterError(
      "server_error",
      "GerritAdapter: not implemented",
    );
  }
}
