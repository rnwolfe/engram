/**
 * git.ts — Git VCS ingestion: the money command engine.
 *
 * Walks git log and extracts entities + edges into an EngramGraph.
 * Requires no external API tokens — git commands only.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { ulid } from "ulid";
import type { AIProvider } from "../ai/provider.js";
import { generateEpisodeEmbeddings } from "../ai/utils.js";
import type { EngramGraph } from "../format/index.js";
import { ENGINE_VERSION } from "../format/version.js";
import { resolveEntity } from "../graph/aliases.js";
import { addEdge } from "../graph/edges.js";
import { addEntity, type EvidenceInput } from "../graph/entities.js";
import { addEpisode } from "../graph/episodes.js";
import { supersedeEdge } from "../temporal/supersession.js";
import { parseGitLog, recencyWeight } from "./git-parse.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GitIngestOpts {
  /** ISO8601 date or relative like "6 months ago" */
  since?: string;
  /** Branch or ref to walk (default: HEAD) */
  branch?: string;
  /** Only include commits touching these paths */
  path_filter?: string[];
  /** Min shared commits for co-change edge (default 3) */
  cochange_threshold?: number;
  /** AI provider for post-ingest embedding generation (best-effort, never blocks ingest) */
  provider?: AIProvider;
}

export interface IngestResult {
  episodesCreated: number;
  episodesSkipped: number;
  entitiesCreated: number;
  entitiesResolved: number;
  edgesCreated: number;
  edgesSuperseded: number;
  runId: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface IngestionRun {
  id: string;
  source_type: string;
  source_scope: string;
  started_at: string;
  completed_at: string | null;
  cursor: string | null;
  extractor_version: string;
  episodes_created: number;
  entities_created: number;
  edges_created: number;
  status: string;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Security: path validation
// ---------------------------------------------------------------------------

function validateRepoPath(repoPath: string): string {
  const resolved = path.resolve(repoPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`ingestGitRepo: path does not exist: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`ingestGitRepo: path is not a directory: ${resolved}`);
  }

  const gitDir = path.join(resolved, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new Error(
      `ingestGitRepo: not a git repository (no .git found): ${resolved}`,
    );
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// ingestion_runs helpers
// ---------------------------------------------------------------------------

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
      "git_commit",
      sourceScope,
      now,
      ENGINE_VERSION,
      0,
      0,
      0,
      "running",
    );

  return graph.db
    .query<IngestionRun, [string]>("SELECT * FROM ingestion_runs WHERE id = ?")
    .get(id) as IngestionRun;
}

function completeIngestionRun(
  graph: EngramGraph,
  runId: string,
  cursor: string | null,
  counts: { episodes: number; entities: number; edges: number },
): void {
  const now = new Date().toISOString();
  graph.db
    .prepare<void, [string, string | null, number, number, number, string]>(
      `UPDATE ingestion_runs
       SET completed_at = ?, cursor = ?, episodes_created = ?,
           entities_created = ?, edges_created = ?, status = 'completed'
       WHERE id = ?`,
    )
    .run(now, cursor, counts.episodes, counts.entities, counts.edges, runId);
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

function getLastCursor(graph: EngramGraph, sourceScope: string): string | null {
  const row = graph.db
    .query<{ cursor: string | null }, [string]>(
      `SELECT cursor FROM ingestion_runs
       WHERE source_type = 'git_commit' AND source_scope = ? AND status = 'completed'
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get(sourceScope);

  return row?.cursor ?? null;
}

// ---------------------------------------------------------------------------
// Git log execution
// ---------------------------------------------------------------------------

function validatePathFilter(pathFilter: string[]): string[] {
  const validated: string[] = [];
  for (const p of pathFilter) {
    // Reject absolute paths
    if (path.isAbsolute(p)) {
      throw new Error(
        `ingestGitRepo: path_filter entry must be a relative path, got: ${p}`,
      );
    }
    // Reject path traversal
    const normalized = path.normalize(p);
    if (normalized.startsWith("..")) {
      throw new Error(
        `ingestGitRepo: path_filter entry must not traverse parent directories, got: ${p}`,
      );
    }
    // Reject pathspec magic (starts with ':')
    if (p.startsWith(":")) {
      throw new Error(
        `ingestGitRepo: path_filter entry must not use pathspec magic, got: ${p}`,
      );
    }
    validated.push(normalized);
  }
  return validated;
}

function runGitLog(
  repoPath: string,
  opts: GitIngestOpts,
  afterSha: string | null,
): string {
  const format = "%H%n%ae%n%an%n%at%n%s%n%b%n---COMMIT-END---";

  const args: string[] = [
    "-C",
    repoPath,
    "log",
    `--format=${format}`,
    "--name-only",
  ];

  if (opts.since) {
    args.push(`--since=${opts.since}`);
  }

  const branch = opts.branch ?? "HEAD";

  if (afterSha) {
    args.push(`${afterSha}..${branch}`);
  } else {
    args.push(branch);
  }

  if (opts.path_filter && opts.path_filter.length > 0) {
    const validated = validatePathFilter(opts.path_filter);
    args.push("--");
    for (const p of validated) {
      args.push(p);
    }
  }

  try {
    const result = execFileSync("git", args, {
      maxBuffer: 100 * 1024 * 1024, // 100 MB
      encoding: "utf8",
    });
    return result;
  } catch (err: unknown) {
    if (err instanceof Error && "stdout" in err) {
      // execFileSync throws on non-zero exit but may still have output
      return (err as { stdout: string }).stdout ?? "";
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

const EXTRACTOR = "git-ingest";

function getOrCreatePerson(
  graph: EngramGraph,
  email: string,
  name: string,
  episodeId: string,
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  // Try canonical name (email) first, then name
  const existing =
    resolveEntity(graph, email, "person") ??
    resolveEntity(graph, name, "person");

  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }

  const entity = addEntity(
    graph,
    {
      canonical_name: email,
      entity_type: "person",
      summary: name !== email ? name : undefined,
    },
    [{ episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 }],
  );

  counts.entitiesCreated++;
  return entity.id;
}

function getOrCreateModule(
  graph: EngramGraph,
  filePath: string,
  episodeId: string,
  counts: { entitiesCreated: number; entitiesResolved: number },
): string {
  const existing = resolveEntity(graph, filePath, "module");

  if (existing) {
    counts.entitiesResolved++;
    return existing.id;
  }

  const entity = addEntity(
    graph,
    {
      canonical_name: filePath,
      entity_type: "module",
    },
    [{ episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 }],
  );

  counts.entitiesCreated++;
  return entity.id;
}

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingests git commit history into an EngramGraph.
 *
 * Extracts:
 * - Person entities (authors by email)
 * - Module entities (changed files)
 * - Observed edges: authored_by (commit episode → author)
 * - Observed edges: modified (file → commit episode context)
 * - Inferred edges: co_changes_with (files changed together ≥ threshold)
 * - Inferred edges: likely_owner_of (recency-weighted most frequent author)
 *
 * Idempotent via ingestion_runs cursors and episode dedup.
 */
export async function ingestGitRepo(
  graph: EngramGraph,
  repoPath: string,
  opts: GitIngestOpts = {},
): Promise<IngestResult> {
  const validatedPath = validateRepoPath(repoPath);
  const threshold = opts.cochange_threshold ?? 3;

  if (threshold < 1) {
    throw new Error(
      `ingestGitRepo: cochange_threshold must be >= 1, got: ${threshold}`,
    );
  }

  // Build source_scope that includes significant opts for cursor scoping
  const sourceScope = `${validatedPath}::branch=${opts.branch ?? "HEAD"}`;

  // Create ingestion run record
  const run = createIngestionRun(graph, sourceScope);
  const runId = run.id;

  const counts = {
    episodesCreated: 0,
    episodesSkipped: 0,
    entitiesCreated: 0,
    entitiesResolved: 0,
    edgesCreated: 0,
    edgesSuperseded: 0,
  };

  try {
    // Get last cursor for idempotency
    const lastCursor = getLastCursor(graph, sourceScope);

    // Run git log
    const rawLog = runGitLog(validatedPath, opts, lastCursor);
    const commits = parseGitLog(rawLog);

    if (commits.length === 0) {
      completeIngestionRun(graph, runId, lastCursor ?? null, {
        episodes: 0,
        entities: 0,
        edges: 0,
      });
      return { ...counts, runId };
    }

    // Track co-change data: Map<fileA_fileB_sorted_key, count>
    // Key format: "fileA|||fileB" (sorted alphabetically)
    const cochangeMap = new Map<string, number>();

    // Track file → [(authorEmail, timestamp)] for likely_owner computation
    const fileAuthorMap = new Map<
      string,
      Array<{ email: string; ts: number }>
    >();

    // Track entityIds for files and authors (cached across commits)
    const fileEntityCache = new Map<string, string>(); // filePath → entity_id
    const authorEntityCache = new Map<string, string>(); // email → entity_id

    // For co-change: we need entity IDs. Collect file→entityId after processing all commits.
    // Track which commits touched which files (for co-change counting)
    const commitFiles = new Map<string, string[]>(); // sha → [filePaths]

    // Map episode IDs per commit SHA (for evidence links)
    const episodeIds = new Map<string, string>(); // sha → episode_id

    const nowMs = Date.now();
    let latestSha: string | null = null;

    // -------------------------------------------------------------------
    // Pass 1: create episodes, person entities, file entities, observed edges
    // -------------------------------------------------------------------
    for (const commit of commits) {
      if (!latestSha) latestSha = commit.sha;

      const timestamp = new Date(commit.timestampUnix * 1000).toISOString();

      // Create episode (idempotent via source_ref dedup)
      const episodeBefore = graph.db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
        )
        .get("git_commit", commit.sha);

      let episodeId: string;
      if (episodeBefore) {
        episodeId = episodeBefore.id;
        counts.episodesSkipped++;
      } else {
        const content = [
          `commit ${commit.sha}`,
          `Author: ${commit.authorName} <${commit.authorEmail}>`,
          `Date: ${timestamp}`,
          "",
          commit.subject,
          commit.body ? `\n${commit.body}` : "",
          "",
          commit.files.length > 0 ? `Files:\n${commit.files.join("\n")}` : "",
        ]
          .join("\n")
          .trim();

        const episode = addEpisode(graph, {
          source_type: "git_commit",
          source_ref: commit.sha,
          content,
          actor: commit.authorEmail,
          timestamp,
          extractor_version: ENGINE_VERSION,
          metadata: {
            sha: commit.sha,
            author_name: commit.authorName,
            author_email: commit.authorEmail,
            subject: commit.subject,
            files: commit.files,
          },
        });

        episodeId = episode.id;
        counts.episodesCreated++;
      }

      episodeIds.set(commit.sha, episodeId);
      commitFiles.set(commit.sha, commit.files);

      const evidence: EvidenceInput[] = [
        { episode_id: episodeId, extractor: EXTRACTOR, confidence: 1.0 },
      ];

      // Get or create author entity
      let authorId = authorEntityCache.get(commit.authorEmail);
      if (!authorId) {
        authorId = getOrCreatePerson(
          graph,
          commit.authorEmail,
          commit.authorName,
          episodeId,
          counts,
        );
        authorEntityCache.set(commit.authorEmail, authorId);
      } else {
        counts.entitiesResolved++;
      }

      // Process each changed file
      for (const filePath of commit.files) {
        let fileId = fileEntityCache.get(filePath);
        if (!fileId) {
          fileId = getOrCreateModule(graph, filePath, episodeId, counts);
          fileEntityCache.set(filePath, fileId);
        } else {
          counts.entitiesResolved++;
        }

        // Observed edge: file modified_by author (via commit)
        // Use file→author direction for "authored_by"
        const existingAuthoredBy = graph.db
          .query<{ id: string }, [string, string, string, string]>(
            `SELECT id FROM edges
             WHERE source_id = ? AND target_id = ? AND relation_type = ?
               AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
          )
          .get(fileId, authorId, "authored_by", "observed");

        if (!existingAuthoredBy) {
          addEdge(
            graph,
            {
              source_id: fileId,
              target_id: authorId,
              relation_type: "authored_by",
              edge_kind: "observed",
              fact: `${filePath} was authored/modified by ${commit.authorEmail} in commit ${commit.sha.slice(0, 8)}`,
              valid_from: timestamp,
              confidence: 1.0,
            },
            evidence,
          );
          counts.edgesCreated++;
        }

        // Track for likely_owner computation
        if (!fileAuthorMap.has(filePath)) {
          fileAuthorMap.set(filePath, []);
        }
        fileAuthorMap
          .get(filePath)
          ?.push({ email: commit.authorEmail, ts: commit.timestampUnix });
      }

      // Co-change tracking: count pairwise file co-occurrences
      const files = commit.files;
      if (files.length >= 2) {
        for (let i = 0; i < files.length; i++) {
          for (let j = i + 1; j < files.length; j++) {
            const [a, b] = [files[i], files[j]].sort() as [string, string];
            const key = `${a}|||${b}`;
            cochangeMap.set(key, (cochangeMap.get(key) ?? 0) + 1);
          }
        }
      }
    }

    // -------------------------------------------------------------------
    // Pass 2: co_changes_with edges (inferred)
    // -------------------------------------------------------------------
    for (const [key, count] of cochangeMap) {
      if (count < threshold) continue;

      const [fileA, fileB] = key.split("|||") as [string, string];
      const entityA = fileEntityCache.get(fileA);
      const entityB = fileEntityCache.get(fileB);

      if (!entityA || !entityB) continue;

      // Find a representative episode for evidence (use most recent commit touching both)
      // We just use the first available episode id for these files
      let evidenceEpisodeId: string | null = null;
      for (const [sha, files] of commitFiles) {
        if (files.includes(fileA) && files.includes(fileB)) {
          evidenceEpisodeId = episodeIds.get(sha) ?? null;
          if (evidenceEpisodeId) break;
        }
      }

      if (!evidenceEpisodeId) continue;

      const evidence: EvidenceInput[] = [
        {
          episode_id: evidenceEpisodeId,
          extractor: EXTRACTOR,
          confidence: 0.8,
        },
      ];

      // Check for existing co_changes_with edge (either direction)
      const existingAB = graph.db
        .query<{ id: string }, [string, string, string, string]>(
          `SELECT id FROM edges
           WHERE source_id = ? AND target_id = ? AND relation_type = ?
             AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
        )
        .get(entityA, entityB, "co_changes_with", "inferred");

      const existingBA = graph.db
        .query<{ id: string }, [string, string, string, string]>(
          `SELECT id FROM edges
           WHERE source_id = ? AND target_id = ? AND relation_type = ?
             AND edge_kind = ? AND invalidated_at IS NULL LIMIT 1`,
        )
        .get(entityB, entityA, "co_changes_with", "inferred");

      if (!existingAB && !existingBA) {
        addEdge(
          graph,
          {
            source_id: entityA,
            target_id: entityB,
            relation_type: "co_changes_with",
            edge_kind: "inferred",
            fact: `${fileA} and ${fileB} co-change frequently (${count} shared commits)`,
            weight: Math.min(count / 10, 1.0),
            confidence: 0.8,
          },
          evidence,
        );
        counts.edgesCreated++;
      }
    }

    // -------------------------------------------------------------------
    // Pass 3: likely_owner_of edges (inferred, recency-weighted)
    // -------------------------------------------------------------------
    for (const [filePath, authorEntries] of fileAuthorMap) {
      const fileId = fileEntityCache.get(filePath);
      if (!fileId) continue;

      // Sum recency-weighted scores per author
      const authorScores = new Map<string, number>();
      for (const { email, ts } of authorEntries) {
        const w = recencyWeight(ts, nowMs);
        authorScores.set(email, (authorScores.get(email) ?? 0) + w);
      }

      // Find top author
      let topEmail: string | null = null;
      let topScore = -1;
      for (const [email, score] of authorScores) {
        if (score > topScore) {
          topScore = score;
          topEmail = email;
        }
      }

      if (!topEmail) continue;

      const ownerId = authorEntityCache.get(topEmail);
      if (!ownerId) continue;

      // Find a representative episode
      let evidenceEpisodeId: string | null = null;
      for (const [sha, files] of commitFiles) {
        const ep = episodeIds.get(sha);
        if (ep && files.includes(filePath)) {
          // Try to find the commit by this author
          const commit = commits.find(
            (c) => c.sha === sha && c.authorEmail === topEmail,
          );
          if (commit) {
            evidenceEpisodeId = ep;
            break;
          }
        }
      }
      // Fallback: any episode touching this file
      if (!evidenceEpisodeId) {
        for (const [sha, files] of commitFiles) {
          if (files.includes(filePath)) {
            evidenceEpisodeId = episodeIds.get(sha) ?? null;
            if (evidenceEpisodeId) break;
          }
        }
      }

      if (!evidenceEpisodeId) continue;

      const evidence: EvidenceInput[] = [
        {
          episode_id: evidenceEpisodeId,
          extractor: EXTRACTOR,
          confidence: topScore,
        },
      ];

      // Check for existing likely_owner_of edge for this file
      const existing = graph.db
        .query<{ id: string; target_id: string }, [string, string, string]>(
          `SELECT id, target_id FROM edges
           WHERE source_id = ? AND relation_type = ? AND edge_kind = ?
             AND invalidated_at IS NULL LIMIT 1`,
        )
        .get(fileId, "likely_owner_of", "inferred");

      if (existing) {
        if (existing.target_id !== ownerId) {
          // Owner changed — supersede
          supersedeEdge(
            graph,
            existing.id,
            {
              source_id: fileId,
              target_id: ownerId,
              relation_type: "likely_owner_of",
              edge_kind: "inferred",
              fact: `${filePath} is likely owned by ${topEmail} (recency-weighted score: ${topScore.toFixed(3)})`,
              confidence: Math.min(topScore, 1.0),
            },
            evidence,
          );
          counts.edgesSuperseded++;
          counts.edgesCreated++;
        }
        // else same owner — skip
      } else {
        addEdge(
          graph,
          {
            source_id: fileId,
            target_id: ownerId,
            relation_type: "likely_owner_of",
            edge_kind: "inferred",
            fact: `${filePath} is likely owned by ${topEmail} (recency-weighted score: ${topScore.toFixed(3)})`,
            confidence: Math.min(topScore, 1.0),
          },
          evidence,
        );
        counts.edgesCreated++;
      }
    }

    // -------------------------------------------------------------------
    // Finalize
    // -------------------------------------------------------------------
    completeIngestionRun(graph, runId, latestSha, {
      episodes: counts.episodesCreated,
      entities: counts.entitiesCreated,
      edges: counts.edgesCreated,
    });

    // Post-ingest: generate embeddings for new episodes (best-effort, never blocks)
    if (opts.provider && counts.episodesCreated > 0) {
      await generateEpisodeEmbeddings(graph, opts.provider, [
        ...episodeIds.values(),
      ]);
    }

    return { ...counts, runId };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    failIngestionRun(graph, runId, msg);
    throw err;
  }
}
