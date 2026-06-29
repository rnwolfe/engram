/**
 * markdown.ts — Markdown file ingestion.
 *
 * Reads markdown files (or globs) and creates episodes with source_type='document'.
 * No AI/entity extraction — just raw episode creation.
 * Optionally generates embeddings post-ingest when provider is set.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AIProvider } from "../ai/provider.js";
import { generateEpisodeEmbeddings } from "../ai/utils.js";
import type { EngramGraph } from "../format/index.js";
import { ENGINE_VERSION } from "../format/version.js";
import { addEpisode } from "../graph/episodes.js";
import { EPISODE_SOURCE_TYPES } from "../vocab/index.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarkdownIngestOpts {
  owner_id?: string;
  actor?: string;
  /** AI provider for post-ingest embedding generation (best-effort, never blocks ingest) */
  provider?: AIProvider;
  /**
   * Split a document into one episode per top-level (`##`) section instead of
   * one episode per file. Default true. A whole-file episode is a poor
   * retrieval unit for long design docs / ADRs: FTS ranks the file by aggregate
   * term density, so a query that matches one section surfaces the file's
   * densest (often oldest) section, and the excerpt shows the file head — the
   * relevant section is never reached. Per-section episodes let each section
   * (e.g. one ADR) rank and excerpt on its own. Falls back to a single
   * whole-file episode when the document has fewer than two `##` sections, so
   * simple notes keep file-level `source_ref` semantics.
   */
  sectionize?: boolean;
}

// One ingestable unit of a markdown file: either the whole file or one section.
interface MarkdownUnit {
  /** Unique source_ref for dedup: the file path, or `<path>#<idx>-<slug>`. */
  sourceRef: string;
  content: string;
  /** Section heading when this unit is a section; undefined for whole-file. */
  heading?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGlobPattern(input: string): boolean {
  return input.includes("*") || input.includes("?");
}

/** Recursively collect all .md files under a directory. */
function walkMarkdown(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkMarkdown(full));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Expand a path/glob/directory to a list of markdown file paths.
 * - Directory: recursively finds all .md files.
 * - Glob pattern (contains * or ?): expands within the parent directory.
 * - File path: returned as-is.
 */
async function expandPaths(input: string): Promise<string[]> {
  const resolved = path.resolve(input);

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    return walkMarkdown(resolved);
  }

  if (!isGlobPattern(input)) {
    return [input];
  }

  const dir = path.dirname(input);
  const pattern = path.basename(input);

  // Convert glob pattern to regex (supports * and ? only)
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexStr}$`);

  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir);
  return entries
    .filter((e) => regex.test(e))
    .map((e) => path.join(dir, e))
    .filter((p) => fs.statSync(p).isFile());
}

function computeHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function slugify(heading: string): string {
  return (
    heading
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "section"
  );
}

/**
 * Split a markdown document into ingestable units, one per top-level (`##`)
 * section, plus a leading preamble unit if there is content before the first
 * `##`. Returns a single whole-file unit (source_ref = file path) when the
 * document has fewer than two `##` sections, preserving file-level semantics
 * for simple notes. `sourceRef` is unique per unit for idempotent dedup.
 */
function splitMarkdownUnits(
  absolutePath: string,
  content: string,
): MarkdownUnit[] {
  const lines = content.split("\n");
  const headingIdx: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) headingIdx.push(i);
  }
  if (headingIdx.length === 0) {
    return [{ sourceRef: absolutePath, content }];
  }

  const units: MarkdownUnit[] = [];
  const preamble = lines.slice(0, headingIdx[0]).join("\n");
  if (preamble.trim().length > 0) {
    units.push({ sourceRef: `${absolutePath}#0-preamble`, content: preamble });
  }
  headingIdx.forEach((start, idx) => {
    const end =
      idx + 1 < headingIdx.length ? headingIdx[idx + 1] : lines.length;
    const heading = lines[start].replace(/^#+\s+/, "").trim();
    units.push({
      sourceRef: `${absolutePath}#${idx + 1}-${slugify(heading)}`,
      content: lines.slice(start, end).join("\n"),
      heading,
    });
  });

  // A single section with no preamble is effectively a whole-file doc — keep
  // file-level source_ref so dedup and downstream references stay stable.
  if (units.length < 2) {
    return [{ sourceRef: absolutePath, content }];
  }
  return units;
}

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingests one or more markdown files into an EngramGraph.
 *
 * - Accepts a file path or glob pattern.
 * - Creates one episode per `##` section (source_type='document'), or one
 *   whole-file episode for section-less docs / when `opts.sectionize === false`.
 * - source_ref is `<absPath>` (whole-file) or `<absPath>#<idx>-<slug>` (section),
 *   for idempotent dedup.
 * - Returns IngestResult.
 */
export async function ingestMarkdown(
  graph: EngramGraph,
  pathOrGlob: string,
  opts: MarkdownIngestOpts = {},
): Promise<IngestResult> {
  const counts: IngestResult = {
    episodesCreated: 0,
    episodesSkipped: 0,
    entitiesCreated: 0,
    entitiesResolved: 0,
    edgesCreated: 0,
    edgesSuperseded: 0,
    runId: "",
  };

  const paths = await expandPaths(pathOrGlob);
  const newEpisodeIds: string[] = [];

  for (const filePath of paths) {
    const absolutePath = path.resolve(filePath);

    // Validate path exists and is a file
    if (!fs.existsSync(absolutePath)) {
      // Skip silently — file may have been deleted since glob expansion
      continue;
    }

    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) {
      // Skip silently — not a regular file
      continue;
    }

    // Read file content (exact, no normalization)
    const content = fs.readFileSync(absolutePath, "utf-8");
    const timestamp = stat.mtime.toISOString();

    const units =
      opts.sectionize === false
        ? [{ sourceRef: absolutePath, content }]
        : splitMarkdownUnits(absolutePath, content);

    for (const unit of units) {
      // Check for existing episode by source_ref (idempotent, per unit)
      const existing = graph.db
        .query<{ id: string }, [string, string]>(
          "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
        )
        .get(EPISODE_SOURCE_TYPES.DOCUMENT, unit.sourceRef);

      if (existing) {
        counts.episodesSkipped++;
        continue;
      }

      const episode = addEpisode(graph, {
        source_type: EPISODE_SOURCE_TYPES.DOCUMENT,
        source_ref: unit.sourceRef,
        content: unit.content,
        actor: opts.actor,
        timestamp,
        owner_id: opts.owner_id,
        extractor_version: ENGINE_VERSION,
        metadata: {
          file_path: absolutePath,
          content_hash: computeHash(unit.content),
          size_bytes: Buffer.byteLength(unit.content, "utf-8"),
          ...(unit.heading ? { section_heading: unit.heading } : {}),
        },
      });

      newEpisodeIds.push(episode.id);
      counts.episodesCreated++;
    }
  }

  // Post-ingest: generate embeddings for new episodes (best-effort, never blocks)
  if (opts.provider && newEpisodeIds.length > 0) {
    await generateEpisodeEmbeddings(graph, opts.provider, newEpisodeIds);
  }

  return counts;
}
