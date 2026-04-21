/**
 * ingest/source/index.ts — source-file ingestion orchestrator.
 *
 * Wires walker + parser + extractor into the engram graph with full evidence-first
 * invariant, idempotency fast path, and supersession on file change.
 *
 * In dryRun mode the walker, parser, and extractor run normally but no rows
 * are written to the database. Counts in the result reflect what would be created
 * on a fresh ingest, including module hierarchy and import edges.
 */

import path from "node:path";
import type { EngramGraph } from "../../format/index.js";
import { addEdge } from "../../graph/edges.js";
import type { EvidenceInput } from "../../graph/entities.js";
import { addEntity, findEntities } from "../../graph/entities.js";
import { addEpisode } from "../../graph/episodes.js";
import {
  ENTITY_TYPES,
  EPISODE_SOURCE_TYPES,
  INGESTION_SOURCE_TYPES,
  RELATION_TYPES,
} from "../../vocab/index.js";
import { extractC } from "./extractors/c.js";
import { extractCSharp } from "./extractors/c_sharp.js";
import { extractCpp } from "./extractors/cpp.js";
import { extractGo } from "./extractors/go.js";
import { extractJava } from "./extractors/java.js";
import { extractPython } from "./extractors/python.js";
import { extractRuby } from "./extractors/ruby.js";
import { extractRust } from "./extractors/rust.js";
import { extractStarlark } from "./extractors/starlark.js";
import type { EntityRef, ExtractedFile } from "./extractors/types.js";
import { extractTypeScript, resolveImport } from "./extractors/typescript.js";
import type { Language } from "./parser.js";
import { languageForPath, SourceParser } from "./parser.js";
import { walk } from "./walker.js";

const SOURCE_TYPE = INGESTION_SOURCE_TYPES.SOURCE;
const EXTRACTOR = "source";

function extractFile(
  captures: ReturnType<SourceParser["runQuery"]>,
  lang: Language,
  filePath: string,
  root: string,
): ExtractedFile {
  if (lang === "go") return extractGo(captures);
  if (lang === "java") return extractJava(captures);
  if (lang === "python") return extractPython(captures);
  if (lang === "rust") return extractRust(captures);
  if (lang === "ruby") return extractRuby(captures);
  if (lang === "c") return extractC(captures);
  if (lang === "cpp") return extractCpp(captures);
  if (lang === "c_sharp") return extractCSharp(captures);
  if (lang === "starlark") return extractStarlark(captures, filePath, root);
  return extractTypeScript(captures);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ProgressEvent {
  type: "file_scanned" | "file_skipped" | "file_parsed" | "file_error";
  relPath: string;
  message?: string;
}

export interface SourceIngestOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean;
  dryRun?: boolean;
  onProgress?: (event: ProgressEvent) => void;
}

export interface SourceIngestResult {
  filesScanned: number;
  filesParsed: number;
  filesSkipped: number;
  episodesCreated: number;
  entitiesCreated: number;
  edgesCreated: number;
  /** Number of episodes archived because their file was no longer found under the walk root. */
  deletedArchived: number;
  errors: Array<{ relPath: string; message: string }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Upsert an entity by canonical_name. Returns {id, created}.
 * If entity already exists, adds a new evidence link (INSERT OR IGNORE — safe to
 * call multiple times for same episode due to PK constraint on entity_evidence).
 */
function upsertEntity(
  graph: EngramGraph,
  input: { canonical_name: string; entity_type: string },
  evidence: EvidenceInput[],
): { id: string; created: boolean } {
  const existing = findEntities(graph, {
    canonical_name: input.canonical_name,
  });
  if (existing.length > 0) {
    const entity = existing[0];
    const now = new Date().toISOString();
    const stmt = graph.db.prepare(
      `INSERT OR IGNORE INTO entity_evidence (entity_id, episode_id, extractor, confidence, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const ev of evidence) {
      stmt.run(
        entity.id,
        ev.episode_id,
        ev.extractor,
        ev.confidence ?? 1.0,
        now,
      );
    }
    return { id: entity.id, created: false };
  }

  const entity = addEntity(graph, input, evidence);
  return { id: entity.id, created: true };
}

/**
 * Upsert an active edge by (source_id, target_id, relation_type). Returns true if
 * a new edge was created, false if an existing active edge was found (evidence link
 * still added in the latter case).
 */
function upsertEdge(
  graph: EngramGraph,
  input: {
    source_id: string;
    target_id: string;
    relation_type: string;
    edge_kind: string;
    fact: string;
  },
  evidence: EvidenceInput[],
): boolean {
  const existing = graph.db
    .query<{ id: string }, [string, string, string]>(
      `SELECT id FROM edges
       WHERE source_id = ? AND target_id = ? AND relation_type = ?
         AND invalidated_at IS NULL
       LIMIT 1`,
    )
    .get(input.source_id, input.target_id, input.relation_type);

  if (existing) {
    const now = new Date().toISOString();
    const stmt = graph.db.prepare(
      `INSERT OR IGNORE INTO edge_evidence (edge_id, episode_id, extractor, confidence, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const ev of evidence) {
      stmt.run(
        existing.id,
        ev.episode_id,
        ev.extractor,
        ev.confidence ?? 1.0,
        now,
      );
    }
    return false;
  }

  addEdge(graph, input, evidence);
  return true;
}

/**
 * Find an active source episode whose source_ref begins with "${relPath}@".
 * Returns the episode id and full source_ref, or null if none found.
 */
function findActiveEpisodeForPath(
  graph: EngramGraph,
  relPath: string,
): { id: string; source_ref: string } | null {
  const prefix = `${relPath}@`;
  return (
    graph.db
      .query<{ id: string; source_ref: string }, [string, number, string]>(
        `SELECT id, source_ref FROM episodes
         WHERE source_type = ?
           AND status = 'active'
           AND SUBSTR(source_ref, 1, ?) = ?
         LIMIT 1`,
      )
      .get(EPISODE_SOURCE_TYPES.SOURCE_FILE, prefix.length, prefix) ?? null
  );
}

/**
 * Mark an episode as superseded (status = 'superseded').
 */
function supersedeEpisode(graph: EngramGraph, episodeId: string): void {
  graph.db
    .prepare(`UPDATE episodes SET status = 'superseded' WHERE id = ?`)
    .run(episodeId);
}

/**
 * Resolve an EntityRef to a ULID given the context of a single file's pass.
 *
 * @param ref - The EntityRef to resolve (see EntityRef JSDoc for semantics).
 * @param fileEntityId - ULID of the current file entity.
 * @param symbolEntityIds - Map from bare symbol name to its ULID within this file.
 * @param graph - The EngramGraph instance (used for canonical lookups/upserts).
 * @param evidence - Evidence inputs to attach when upserting a new canonical entity.
 * @returns The resolved entity id and whether it was newly created, or null if a symbol
 * reference cannot be resolved in the current file (e.g. cross-file Go receiver).
 */
export function resolveEntityRef(
  ref: EntityRef,
  fileEntityId: string,
  symbolEntityIds: Map<string, string>,
  graph: EngramGraph,
  evidence: EvidenceInput[],
): { id: string; created: boolean } | null {
  if (ref.kind === "file") {
    return { id: fileEntityId, created: false };
  }

  if (ref.kind === "symbol") {
    const symId = symbolEntityIds.get(ref.name);
    if (!symId) {
      console.warn(
        `[engram source] symbol ref "${ref.name}" not found in this file — skipping edge (may be defined in another file)`,
      );
      return null;
    }
    return { id: symId, created: false };
  }

  // ref.kind === "canonical"
  return upsertEntity(
    graph,
    { canonical_name: ref.canonicalName, entity_type: ref.entityType },
    evidence,
  );
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function ingestSource(
  graph: EngramGraph,
  opts: SourceIngestOptions,
): Promise<SourceIngestResult> {
  const { root, exclude, respectGitignore, dryRun = false, onProgress } = opts;

  const result: SourceIngestResult = {
    filesScanned: 0,
    filesParsed: 0,
    filesSkipped: 0,
    episodesCreated: 0,
    entitiesCreated: 0,
    edgesCreated: 0,
    deletedArchived: 0,
    errors: [],
  };

  const absRoot = path.resolve(root);
  // Track every relPath visited in this walk so the sweep pass can identify deletions.
  const visitedRelPaths = new Set<string>();

  const parser = await SourceParser.create();

  // Per-file data for post-processing passes.
  // In dryRun mode, episodeId and entity IDs are placeholder strings ("dry:…")
  // since nothing is written to the DB; they are only used for edge counting logic.
  const fileData = new Map<
    string,
    { episodeId: string; rawImports: string[] }
  >();
  // relPath → entity id (real ULID in normal mode, "dry:…" placeholder in dryRun)
  const fileEntityIds = new Map<string, string>();
  // dirPath → representative episode id (first file episode seen for this dir)
  const dirEpisodes = new Map<string, string>();

  // Monotone counter used to generate unique placeholder IDs in dryRun mode.
  let dryCounter = 0;

  try {
    for await (const entry of walk({ root, exclude, respectGitignore })) {
      result.filesScanned++;
      const { relPath, contentHash, body } = entry;
      const sourceRef = `${relPath}@${contentHash}`;
      const now = new Date().toISOString();

      onProgress?.({ type: "file_scanned", relPath });

      // IDEMPOTENCY FAST PATH — skip unchanged files entirely (no parser invocation)
      if (!dryRun) {
        const existing = graph.db
          .query<{ id: string }, [string, string]>(
            `SELECT id FROM episodes WHERE source_type = ? AND source_ref = ? LIMIT 1`,
          )
          .get(EPISODE_SOURCE_TYPES.SOURCE_FILE, sourceRef);
        if (existing) {
          result.filesSkipped++;
          visitedRelPaths.add(relPath);
          // Still record the file entity id so the import resolution pass can use it.
          const fe = findEntities(graph, { canonical_name: relPath });
          if (fe.length > 0) fileEntityIds.set(relPath, fe[0].id);
          onProgress?.({ type: "file_skipped", relPath });
          continue;
        }
      }

      // Parse file if language is supported.
      // On parse error, execution continues — an episode is still created with no
      // symbols so that the idempotency fast path will fire on the next run.
      let extracted: ExtractedFile = { symbols: [], rawImports: [] };
      const lang = languageForPath(relPath);
      if (lang !== null) {
        try {
          const tree = parser.parse(body, lang);
          if (tree.rootNode.hasError) {
            result.errors.push({
              relPath,
              message: `parse error in ${relPath}: tree has errors`,
            });
            onProgress?.({
              type: "file_error",
              relPath,
              message: "tree has errors",
            });
            // extracted remains empty — episode is still created below
          } else {
            const captures = parser.runQuery(tree, lang);
            extracted = extractFile(captures, lang, relPath, absRoot);
            result.filesParsed++;
            onProgress?.({ type: "file_parsed", relPath });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          result.errors.push({ relPath, message });
          onProgress?.({ type: "file_error", relPath, message });
        }
      }

      // Assign an episode id and file entity id.
      // In dryRun mode these are placeholder strings; in normal mode they are real ULIDs
      // written to the DB.
      let episodeId: string;
      let fileEntityId: string;

      if (dryRun) {
        episodeId = `dry:ep:${dryCounter}`;
        fileEntityId = `dry:file:${dryCounter}`;
        dryCounter++;
        result.episodesCreated++;
        result.entitiesCreated++; // file entity
        result.entitiesCreated += extracted.symbols.length;
        result.edgesCreated += extracted.symbols.length * 2; // file→contains + symbol→defined_in
        result.entitiesCreated += extracted.extraEntities?.length ?? 0;
        result.edgesCreated += extracted.extraEdges?.length ?? 0;
      } else {
        // SUPERSESSION — invalidate old episode if file content changed
        const oldEpisode = findActiveEpisodeForPath(graph, relPath);
        if (oldEpisode) {
          supersedeEpisode(graph, oldEpisode.id);
        }

        const episode = addEpisode(graph, {
          source_type: SOURCE_TYPE,
          source_ref: sourceRef,
          content: body,
          timestamp: now,
          metadata: { walk_root: absRoot },
        });
        episodeId = episode.id;
        result.episodesCreated++;

        const ev: EvidenceInput[] = [
          { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
        ];

        // Upsert file entity
        const { id, created: fileCreated } = upsertEntity(
          graph,
          { canonical_name: relPath, entity_type: ENTITY_TYPES.FILE },
          ev,
        );
        fileEntityId = id;
        if (fileCreated) result.entitiesCreated++;

        // Map from bare symbol name → ULID for EntityRef resolution.
        const symbolEntityIds = new Map<string, string>();

        // Upsert symbol entities + file→contains + symbol→defined_in edges
        for (const sym of extracted.symbols) {
          const symName = `${relPath}::${sym.name}`;
          const { id: symEntityId, created: symCreated } = upsertEntity(
            graph,
            { canonical_name: symName, entity_type: ENTITY_TYPES.SYMBOL },
            ev,
          );
          if (symCreated) result.entitiesCreated++;
          symbolEntityIds.set(sym.name, symEntityId);

          const c1 = upsertEdge(
            graph,
            {
              source_id: fileEntityId,
              target_id: symEntityId,
              relation_type: RELATION_TYPES.CONTAINS,
              edge_kind: "observed",
              fact: `${relPath} defines ${sym.name}`,
            },
            ev,
          );
          if (c1) result.edgesCreated++;

          const c2 = upsertEdge(
            graph,
            {
              source_id: symEntityId,
              target_id: fileEntityId,
              relation_type: RELATION_TYPES.DEFINED_IN,
              edge_kind: "observed",
              fact: `${sym.name} is defined in ${relPath}`,
            },
            ev,
          );
          if (c2) result.edgesCreated++;
        }

        // Extra entities declared by the extractor
        for (const extra of extracted.extraEntities ?? []) {
          const { created } = upsertEntity(
            graph,
            {
              canonical_name: extra.canonicalName,
              entity_type: extra.entityType,
            },
            ev,
          );
          if (created) result.entitiesCreated++;
        }

        // Extra edges declared by the extractor
        for (const edge of extracted.extraEdges ?? []) {
          const srcResolved = resolveEntityRef(
            edge.source,
            fileEntityId,
            symbolEntityIds,
            graph,
            ev,
          );
          if (!srcResolved) continue;
          if (srcResolved.created) result.entitiesCreated++;

          const tgtResolved = resolveEntityRef(
            edge.target,
            fileEntityId,
            symbolEntityIds,
            graph,
            ev,
          );
          if (!tgtResolved) continue;
          if (tgtResolved.created) result.entitiesCreated++;

          const created = upsertEdge(
            graph,
            {
              source_id: srcResolved.id,
              target_id: tgtResolved.id,
              relation_type: edge.relationType,
              edge_kind: edge.edgeKind,
              fact: edge.fact,
            },
            ev,
          );
          if (created) result.edgesCreated++;
        }
      }

      // Populate tracking maps for post-processing passes (both modes).
      visitedRelPaths.add(relPath);
      fileEntityIds.set(relPath, fileEntityId);
      fileData.set(relPath, {
        episodeId,
        rawImports: extracted.rawImports,
      });

      // Record this episode for the directory and all ancestors.
      const dirParts = relPath.split("/");
      for (let i = 1; i < dirParts.length; i++) {
        const dirPath = dirParts.slice(0, i).join("/");
        if (!dirEpisodes.has(dirPath)) {
          dirEpisodes.set(dirPath, episodeId);
        }
      }
    }
  } finally {
    parser.dispose();
  }

  // ---------------------------------------------------------------------------
  // MODULE HIERARCHY PASS
  // Runs in both normal and dryRun mode: counts entities/edges either way,
  // only writes to DB when !dryRun.
  // ---------------------------------------------------------------------------

  const sortedDirs = Array.from(dirEpisodes.keys()).sort(
    (a, b) => a.split("/").length - b.split("/").length,
  );

  // dirPath → entity id (real or placeholder)
  const moduleEntityIds = new Map<string, string>();

  for (const dirPath of sortedDirs) {
    const episodeId = dirEpisodes.get(dirPath);
    if (!episodeId) continue;

    let modEntityId: string;

    if (dryRun) {
      modEntityId = `dry:mod:${dryCounter++}`;
      result.entitiesCreated++;
    } else {
      const ev: EvidenceInput[] = [
        { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
      ];
      const { id, created: modCreated } = upsertEntity(
        graph,
        { canonical_name: dirPath, entity_type: ENTITY_TYPES.MODULE },
        ev,
      );
      modEntityId = id;
      if (modCreated) result.entitiesCreated++;
    }
    moduleEntityIds.set(dirPath, modEntityId);

    // Parent module → contains → this module
    const parentDir = path.posix.dirname(dirPath);
    if (
      parentDir !== "." &&
      parentDir !== "" &&
      moduleEntityIds.has(parentDir)
    ) {
      if (dryRun) {
        result.edgesCreated++;
      } else {
        const parentEpisodeId = dirEpisodes.get(parentDir) ?? episodeId;
        const parentEv: EvidenceInput[] = [
          {
            episode_id: parentEpisodeId,
            extractor: EXTRACTOR,
            confidence: 1.0,
          },
        ];
        const parentModId = moduleEntityIds.get(parentDir);
        if (parentModId) {
          const created = upsertEdge(
            graph,
            {
              source_id: parentModId,
              target_id: modEntityId,
              relation_type: RELATION_TYPES.CONTAINS,
              edge_kind: "observed",
              fact: `${parentDir} contains module ${dirPath}`,
            },
            parentEv,
          );
          if (created) result.edgesCreated++;
        }
      }
    }
  }

  // module → contains → file edges
  for (const [relPath, fileEntityId] of fileEntityIds) {
    const fileDir = path.posix.dirname(relPath);
    const normalizedDir = fileDir === "." ? "" : fileDir;
    const modEntityId = moduleEntityIds.get(normalizedDir);
    if (!modEntityId) continue;

    if (dryRun) {
      result.edgesCreated++;
    } else {
      const fileEpData = fileData.get(relPath);
      if (!fileEpData) continue;

      const ev: EvidenceInput[] = [
        {
          episode_id: fileEpData.episodeId,
          extractor: EXTRACTOR,
          confidence: 1.0,
        },
      ];
      const created = upsertEdge(
        graph,
        {
          source_id: modEntityId,
          target_id: fileEntityId,
          relation_type: RELATION_TYPES.CONTAINS,
          edge_kind: "observed",
          fact: `${normalizedDir} contains file ${relPath}`,
        },
        ev,
      );
      if (created) result.edgesCreated++;
    }
  }

  // ---------------------------------------------------------------------------
  // IMPORT RESOLUTION PASS
  // Build known-files set, resolve imports, emit file → imports → file edges.
  // Runs in both normal and dryRun mode.
  // ---------------------------------------------------------------------------

  const knownFiles = new Set<string>(fileEntityIds.keys());

  for (const [relPath, { episodeId, rawImports }] of fileData) {
    const fromEntityId = fileEntityIds.get(relPath);
    if (!fromEntityId) continue;

    for (const specifier of rawImports) {
      const resolved = resolveImport(specifier, relPath, knownFiles, root);
      if (!resolved) continue;

      const toEntityId = fileEntityIds.get(resolved);
      if (!toEntityId) continue;

      if (dryRun) {
        result.edgesCreated++;
      } else {
        const ev: EvidenceInput[] = [
          { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
        ];
        const created = upsertEdge(
          graph,
          {
            source_id: fromEntityId,
            target_id: toEntityId,
            relation_type: RELATION_TYPES.IMPORTS,
            edge_kind: "observed",
            fact: `${relPath} imports ${resolved}`,
          },
          ev,
        );
        if (created) result.edgesCreated++;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // SWEEP PASS — archive episodes for files no longer present under walk root.
  // Queries only episodes whose metadata.walk_root matches this run's absRoot
  // so that partial-ingest runs from different roots don't archive each other.
  // Runs in both normal and dryRun mode (counts deletedArchived either way).
  // ---------------------------------------------------------------------------

  if (!dryRun) {
    const sweepCandidates = graph.db
      .query<{ id: string; source_ref: string }, [string, string]>(
        `SELECT id, source_ref FROM episodes
         WHERE source_type = ?
           AND status = 'active'
           AND json_extract(metadata, '$.walk_root') = ?`,
      )
      .all(EPISODE_SOURCE_TYPES.SOURCE_FILE, absRoot);

    for (const ep of sweepCandidates) {
      if (!ep.source_ref) continue;
      const atIdx = ep.source_ref.lastIndexOf("@");
      if (atIdx < 0) continue; // malformed source_ref — skip rather than over-archive
      const epRelPath = ep.source_ref.slice(0, atIdx);
      if (!visitedRelPaths.has(epRelPath)) {
        graph.db
          .prepare(`UPDATE episodes SET status = 'archived' WHERE id = ?`)
          .run(ep.id);
        result.deletedArchived++;
      }
    }
  } else {
    // dryRun: count what would be archived without writing
    const sweepCandidates = graph.db
      .query<{ source_ref: string }, [string, string]>(
        `SELECT source_ref FROM episodes
         WHERE source_type = ?
           AND status = 'active'
           AND json_extract(metadata, '$.walk_root') = ?`,
      )
      .all(EPISODE_SOURCE_TYPES.SOURCE_FILE, absRoot);

    for (const ep of sweepCandidates) {
      if (!ep.source_ref) continue;
      const atIdx = ep.source_ref.lastIndexOf("@");
      if (atIdx < 0) continue; // malformed source_ref — skip rather than over-archive
      const epRelPath = ep.source_ref.slice(0, atIdx);
      if (!visitedRelPaths.has(epRelPath)) {
        result.deletedArchived++;
      }
    }
  }

  return result;
}
