/**
 * index.ts — Google Workspace enrichment adapter (in-repo plugin).
 *
 * Ported from packages/engram-core/src/ingest/adapters/google-workspace.ts
 * into the in-repo plugin package.
 *
 * Ingests explicitly-specified Google Docs as revision-aware episodes.
 * Supports oauth2 (ADC-minted at CLI layer) and bearer token auth.
 *
 * Scope formats:
 *   doc:<docId>          — single document
 *   docs:<id>,<id>,...   — comma-separated list
 *   folder:<id>          — all docs in a Drive folder (flat)
 *   folder:<id>?recursive=true — all docs in a folder tree (BFS)
 *   query:<drive-q>      — arbitrary Drive search query
 *
 * Revision-aware supersession:
 *   - First ingest: addEpisode()
 *   - Re-ingest, same revisionId: skip
 *   - Re-ingest, new revisionId: supersedeEpisode()
 *
 * Default export: GoogleWorkspaceAdapter instance (required by js-module plugin contract).
 */

import type {
  AuthCredential,
  EngramGraph,
  EnrichmentAdapter,
  EnrichOpts,
  IngestResult,
  ScopeSchema,
} from "engram-core";
import {
  addEdge,
  addEntity,
  addEntityAlias,
  addEpisode,
  applyCompatShim,
  assertAuthKind,
  ENGINE_VERSION,
  ENTITY_TYPES,
  EnrichmentAdapterError,
  EPISODE_SOURCE_TYPES,
  findEdges,
  getCurrentEpisode,
  INGESTION_SOURCE_TYPES,
  RELATION_TYPES,
  readIsoCursor,
  resolveEntity,
  supersedeEpisode,
  writeCursor,
} from "engram-core";
import { ulid } from "ulid";
import type { DriveFileItem } from "./discovery.js";
import {
  computeDiscoveryCursor,
  enumerateFolderDocs,
  enumerateQueryDocs,
  parseFolderScope,
} from "./discovery.js";
import type { GWFetchFn } from "./helpers.js";
import {
  extractDocText,
  fetchDoc,
  fetchDriveMeta,
  parseScope,
  validateScope,
} from "./helpers.js";

// ---------------------------------------------------------------------------
// Scope schema
// ---------------------------------------------------------------------------

/**
 * ScopeSchema for the Google Workspace adapter.
 *
 * Accepted formats:
 *   doc:<id>                     — single document
 *   docs:<id>,<id>,...          — comma-separated list
 *   folder:<id>                  — all docs in a Drive folder (flat)
 *   folder:<id>?recursive=true  — all docs in a folder tree (BFS)
 *   query:<drive-q>             — arbitrary Drive search query
 */
export const googleWorkspaceScopeSchema: ScopeSchema = {
  description:
    "Google Workspace scope. " +
    "Use 'doc:<id>' for a single document, 'docs:<id>,<id>,...' for multiple, " +
    "'folder:<id>' (or 'folder:<id>?recursive=true') for folder enumeration, " +
    "or 'query:<drive-q>' for a Drive search.",
  validate(scope: string): void {
    validateScope(scope);
  },
};

// ---------------------------------------------------------------------------
// Ingestion run helpers (Google Workspace–specific source_type)
// ---------------------------------------------------------------------------

const INGESTION_SOURCE = INGESTION_SOURCE_TYPES.GOOGLE_WORKSPACE;
const EPISODE_SOURCE = EPISODE_SOURCE_TYPES.GOOGLE_DOC;

interface IngestionRun {
  id: string;
}

function createIngestionRun(
  graph: EngramGraph,
  sourceScope: string,
): IngestionRun {
  const id = ulid();
  const now = new Date().toISOString();
  graph.db
    .prepare<
      void,
      [string, string, string, string, string, number, number, number, string]
    >(
      `INSERT INTO ingestion_runs
         (id, source_type, source_scope, started_at, extractor_version,
          episodes_created, entities_created, edges_created, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      INGESTION_SOURCE,
      sourceScope,
      now,
      ENGINE_VERSION,
      0,
      0,
      0,
      "running",
    );
  return { id };
}

function completeIngestionRun(
  graph: EngramGraph,
  runId: string,
  cursor: string | null,
  counts: { episodes: number; entities: number; edges: number },
): void {
  const now = new Date().toISOString();
  writeCursor(graph, runId, cursor);
  graph.db
    .prepare<void, [string, number, number, number, string]>(
      `UPDATE ingestion_runs
       SET completed_at = ?, episodes_created = ?,
           entities_created = ?, edges_created = ?, status = 'completed'
       WHERE id = ?`,
    )
    .run(now, counts.episodes, counts.entities, counts.edges, runId);
}

function failIngestionRun(
  graph: EngramGraph,
  runId: string,
  error: string,
): void {
  const now = new Date().toISOString();
  graph.db
    .prepare<void, [string, string, string]>(
      `UPDATE ingestion_runs SET completed_at = ?, status = 'failed', error = ? WHERE id = ?`,
    )
    .run(now, error, runId);
}

// ---------------------------------------------------------------------------
// GoogleWorkspaceAdapter
// ---------------------------------------------------------------------------

export class GoogleWorkspaceAdapter implements EnrichmentAdapter {
  name = "google-workspace";
  kind = "enrichment";

  supportedAuth: AuthCredential["kind"][] = ["oauth2", "bearer"];

  scopeSchema: ScopeSchema = googleWorkspaceScopeSchema;

  supportsCursor = true;

  private fetchFn: GWFetchFn;

  constructor(fetchFn?: GWFetchFn) {
    this.fetchFn = fetchFn ?? fetch;
  }

  async enrich(graph: EngramGraph, opts: EnrichOpts): Promise<IngestResult> {
    opts = applyCompatShim(opts);
    assertAuthKind(this, opts);

    const scope = opts.scope;
    if (!scope) {
      throw new EnrichmentAdapterError(
        "data_error",
        "GoogleWorkspaceAdapter: opts.scope is required (e.g. doc:<id>)",
      );
    }

    googleWorkspaceScopeSchema.validate(scope);

    // Resolve token from auth credential
    const auth = opts.auth;
    let token: string | undefined;
    let refreshFn: (() => Promise<string>) | undefined;

    if (auth?.kind === "oauth2") {
      token = auth.token;
      refreshFn = auth.refresh;
    } else if (auth?.kind === "bearer") {
      token = auth.token;
    }

    if (!token) {
      throw new EnrichmentAdapterError(
        "auth_failure",
        "GoogleWorkspaceAdapter: a bearer or oauth2 token is required",
      );
    }

    const run = opts.dryRun ? null : createIngestionRun(graph, scope);
    const runId = run?.id ?? "";

    const counts = {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      entitiesResolved: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
      episodeIds: [] as string[],
    };

    try {
      // Discovery scopes (folder:, query:) need Drive enumeration first
      if (scope.startsWith("folder:") || scope.startsWith("query:")) {
        await this.enrichDiscovery(
          graph,
          scope,
          token,
          refreshFn,
          runId,
          counts,
          opts.dryRun,
        );
      } else {
        // Explicit doc / docs scopes
        const docIds = parseScope(scope);
        for (const docId of docIds) {
          await this.ingestDoc(
            graph,
            docId,
            token,
            refreshFn,
            counts,
            opts.dryRun,
          );
        }

        if (!opts.dryRun && run) {
          completeIngestionRun(graph, runId, null, {
            episodes: counts.episodesCreated,
            entities: counts.entitiesCreated,
            edges: counts.edgesCreated,
          });
        }
      }

      return { ...counts, runId };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!opts.dryRun && run) {
        failIngestionRun(graph, runId, msg);
      }
      throw err;
    }
  }

  /**
   * Handle folder:<id> and query:<q> discovery scopes.
   * Enumerates docs via Drive API, fans out to ingestDoc, and stores cursor.
   */
  private async enrichDiscovery(
    graph: EngramGraph,
    scope: string,
    token: string,
    refreshFn: (() => Promise<string>) | undefined,
    runId: string,
    counts: {
      episodesCreated: number;
      episodesSkipped: number;
      entitiesCreated: number;
      entitiesResolved: number;
      edgesCreated: number;
      edgesSuperseded: number;
      episodeIds: string[];
    },
    dryRun?: boolean,
  ): Promise<void> {
    // Read cursor from last successful run for this scope.
    // In dry-run mode skip cursor so the count reflects all in-scope docs.
    const since = dryRun ? null : readIsoCursor(graph, INGESTION_SOURCE, scope);

    // Enumerate docs from Drive
    let discoveredDocs: DriveFileItem[];

    if (scope.startsWith("folder:")) {
      const { folderId, recursive } = parseFolderScope(scope);
      discoveredDocs = await enumerateFolderDocs(
        this.fetchFn,
        token,
        folderId,
        recursive,
        since,
      );
    } else {
      // query: scope
      const userQuery = scope.slice("query:".length).trim();
      discoveredDocs = await enumerateQueryDocs(
        this.fetchFn,
        token,
        userQuery,
        since,
      );
    }

    if (dryRun) {
      const docIds = discoveredDocs.map((d) => d.id);
      process.stderr.write(
        `[dry-run] google-workspace: scope '${scope}' would ingest ${docIds.length} doc(s): ${docIds.slice(0, 5).join(", ")}${docIds.length > 5 ? ` ... and ${docIds.length - 5} more` : ""}\n`,
      );
      counts.episodesSkipped += docIds.length;
      return;
    }

    // Fan out: ingest each discovered doc
    for (const driveItem of discoveredDocs) {
      try {
        await this.ingestDoc(
          graph,
          driveItem.id,
          token,
          refreshFn,
          counts,
          false,
        );
      } catch (err) {
        if (
          err instanceof EnrichmentAdapterError &&
          err.code === "data_error"
        ) {
          // Individual doc 404 or similar: log and continue
          process.stderr.write(
            `google-workspace: skipping doc ${driveItem.id}: ${err.message}\n`,
          );
          counts.episodesSkipped++;
        } else {
          throw err;
        }
      }
    }

    // Compute and store cursor (max modifiedTime seen in this batch)
    const newCursor = computeDiscoveryCursor(discoveredDocs);

    if (runId) {
      completeIngestionRun(graph, runId, newCursor, {
        episodes: counts.episodesCreated,
        entities: counts.entitiesCreated,
        edges: counts.edgesCreated,
      });
    }
  }

  /**
   * Ingest a single Google Doc, applying revision-aware supersession.
   * On 401/403, attempts one token refresh if `refreshFn` is available.
   */
  private async ingestDoc(
    graph: EngramGraph,
    docId: string,
    token: string,
    refreshFn: (() => Promise<string>) | undefined,
    counts: {
      episodesCreated: number;
      episodesSkipped: number;
      entitiesCreated: number;
      entitiesResolved: number;
      edgesCreated: number;
      edgesSuperseded: number;
      episodeIds: string[];
    },
    dryRun?: boolean,
  ): Promise<void> {
    let currentToken = token;

    /**
     * Wraps a fetch operation with one-refresh-retry on auth failure.
     * Returns the result of `fn(currentToken)`, or retries once after refresh.
     */
    const withRefresh = async <T>(
      fn: (tok: string) => Promise<T>,
    ): Promise<T> => {
      try {
        return await fn(currentToken);
      } catch (err) {
        if (
          err instanceof EnrichmentAdapterError &&
          err.code === "auth_failure" &&
          refreshFn
        ) {
          currentToken = await refreshFn();
          return fn(currentToken);
        }
        throw err;
      }
    };

    // Fetch the doc first; if 404 skip without fetching drive metadata
    const doc = await withRefresh((tok) => fetchDoc(this.fetchFn, docId, tok));

    if (doc === null) {
      // 404 — log and skip (only when processing a multi-doc scope)
      process.stderr.write(
        `google-workspace: document ${docId} not found (404), skipping\n`,
      );
      counts.episodesSkipped++;
      return;
    }

    const driveMeta = await withRefresh((tok) =>
      fetchDriveMeta(this.fetchFn, docId, tok),
    );

    const revisionId = doc.revisionId ?? "";
    const docTitle = doc.title ?? docId;
    const sourceRef = `google_doc:${docId}`;
    const content = extractDocText(doc);
    const modifiedTime = driveMeta.modifiedTime ?? new Date().toISOString();

    // Revision-aware supersession decision tree
    const current = getCurrentEpisode(graph, EPISODE_SOURCE, sourceRef);

    if (dryRun) {
      if (current === null) {
        process.stderr.write(
          `[dry-run] google-workspace: would create episode for doc ${docId} (rev ${revisionId})\n`,
        );
      } else {
        const currentRevId =
          (current.metadata
            ? (JSON.parse(current.metadata) as Record<string, unknown>)
                .revisionId
            : undefined) ?? "";
        if (currentRevId === revisionId) {
          process.stderr.write(
            `[dry-run] google-workspace: doc ${docId} unchanged (rev ${revisionId}), would skip\n`,
          );
        } else {
          process.stderr.write(
            `[dry-run] google-workspace: would supersede episode for doc ${docId} (rev ${currentRevId} → ${revisionId})\n`,
          );
        }
      }
      counts.episodesSkipped++;
      return;
    }

    let episodeId: string;

    if (current === null) {
      // First ingest
      const ep = addEpisode(graph, {
        source_type: EPISODE_SOURCE,
        source_ref: sourceRef,
        content,
        timestamp: modifiedTime,
        metadata: { revisionId, docId, title: docTitle },
        extractor_version: ENGINE_VERSION,
      });
      episodeId = ep.id;
      counts.episodesCreated++;
    } else {
      // Check if revision changed
      const currentMeta = current.metadata
        ? (JSON.parse(current.metadata) as Record<string, unknown>)
        : {};
      const storedRevId = (currentMeta.revisionId as string | undefined) ?? "";

      if (storedRevId === revisionId) {
        // Unchanged — skip
        counts.episodesSkipped++;
        return;
      }

      // Revision advanced — supersede
      const ep = supersedeEpisode(graph, current.id, {
        source_type: EPISODE_SOURCE,
        source_ref: sourceRef,
        content,
        timestamp: modifiedTime,
        metadata: { revisionId, docId, title: docTitle },
        extractor_version: ENGINE_VERSION,
      });
      episodeId = ep.id;
      counts.episodesCreated++;
      counts.edgesSuperseded++;
    }

    counts.episodeIds.push(episodeId);
    const evidence = [{ episode_id: episodeId, extractor: "google-workspace" }];

    // Create or resolve document entity
    const canonicalName = `google_docs:doc:${docId}`;
    let docEntityId: string;

    const existing = resolveEntity(graph, canonicalName);
    if (existing) {
      docEntityId = existing.id;
      counts.entitiesResolved++;
    } else {
      const docEntity = addEntity(
        graph,
        {
          canonical_name: canonicalName,
          entity_type: ENTITY_TYPES.DOCUMENT,
          summary: docTitle,
        },
        evidence,
      );
      docEntityId = docEntity.id;
      counts.entitiesCreated++;

      // Register aliases
      const aliases = [
        docId,
        `https://docs.google.com/document/d/${docId}/edit`,
        `https://docs.google.com/d/${docId}`,
      ];
      for (const alias of aliases) {
        addEntityAlias(graph, {
          entity_id: docEntityId,
          alias,
          episode_id: episodeId,
        });
      }
    }

    // Ingest owner person entities + authored edges
    for (const owner of driveMeta.owners ?? []) {
      if (!owner.emailAddress) continue;
      const personCanon = owner.emailAddress;
      const ownerEntityId = ensurePersonEntity(
        graph,
        personCanon,
        owner.displayName,
        evidence,
        counts,
      );

      const existingAuthoredEdges = findEdges(graph, {
        source_id: ownerEntityId,
        target_id: docEntityId,
        relation_type: RELATION_TYPES.AUTHORED,
        edge_kind: "observed",
      });
      if (existingAuthoredEdges.length === 0) {
        addEdge(
          graph,
          {
            source_id: ownerEntityId,
            target_id: docEntityId,
            relation_type: RELATION_TYPES.AUTHORED,
            edge_kind: "observed",
            fact: `${owner.emailAddress} authored ${canonicalName}`,
            valid_from: modifiedTime,
            confidence: 1.0,
          },
          evidence,
        );
        counts.edgesCreated++;
      }
    }

    // Ingest last modifying user + edited edge
    const lastEditor = driveMeta.lastModifyingUser;
    if (lastEditor?.emailAddress) {
      const editorCanon = lastEditor.emailAddress;
      const editorEntityId = ensurePersonEntity(
        graph,
        editorCanon,
        lastEditor.displayName,
        evidence,
        counts,
      );

      const existingEditedEdges = findEdges(graph, {
        source_id: editorEntityId,
        target_id: docEntityId,
        relation_type: RELATION_TYPES.EDITED,
        edge_kind: "observed",
      });
      if (existingEditedEdges.length === 0) {
        addEdge(
          graph,
          {
            source_id: editorEntityId,
            target_id: docEntityId,
            relation_type: RELATION_TYPES.EDITED,
            edge_kind: "observed",
            fact: `${lastEditor.emailAddress} last edited ${canonicalName}`,
            valid_from: modifiedTime,
            confidence: 1.0,
          },
          evidence,
        );
        counts.edgesCreated++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensurePersonEntity(
  graph: EngramGraph,
  email: string,
  displayName: string | undefined,
  evidence: { episode_id: string; extractor: string }[],
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  const existing = resolveEntity(graph, email);
  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }
  const entity = addEntity(
    graph,
    {
      canonical_name: email,
      entity_type: ENTITY_TYPES.PERSON,
      summary: displayName,
    },
    evidence,
  );
  counts.entitiesCreated++;
  return entity.id;
}

// Default export required by the js-module plugin transport contract.
export default new GoogleWorkspaceAdapter();
