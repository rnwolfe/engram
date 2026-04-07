/**
 * markdown.ts — Markdown file ingestion.
 *
 * Reads markdown files (or globs) and creates episodes with source_type='document'.
 * No AI/entity extraction — just raw episode creation.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { EngramGraph } from "../format/index.js";
import { ENGINE_VERSION } from "../format/version.js";
import { addEpisode } from "../graph/episodes.js";
import type { IngestResult } from "./git.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MarkdownIngestOpts {
  owner_id?: string;
  actor?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGlobPattern(input: string): boolean {
  return input.includes("*") || input.includes("?");
}

/**
 * Minimal glob expansion using node:fs.
 * Supports simple patterns like "/dir/*.md" where the directory is a literal path
 * and the filename portion may contain * or ? wildcards.
 */
async function expandPaths(input: string): Promise<string[]> {
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

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingests one or more markdown files into an EngramGraph.
 *
 * - Accepts a file path or glob pattern.
 * - Creates one episode per file with source_type='document'.
 * - source_ref is the absolute file path for idempotent dedup.
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

    // Check for existing episode by source_ref (idempotent)
    const existing = graph.db
      .query<{ id: string }, [string, string]>(
        "SELECT id FROM episodes WHERE source_type = ? AND source_ref = ?",
      )
      .get("document", absolutePath);

    if (existing) {
      counts.episodesSkipped++;
      continue;
    }

    // Read file content (exact, no normalization)
    const content = fs.readFileSync(absolutePath, "utf-8");
    const timestamp = stat.mtime.toISOString();

    addEpisode(graph, {
      source_type: "document",
      source_ref: absolutePath,
      content,
      actor: opts.actor,
      timestamp,
      owner_id: opts.owner_id,
      extractor_version: ENGINE_VERSION,
      metadata: {
        file_path: absolutePath,
        content_hash: computeHash(content),
        size_bytes: stat.size,
      },
    });

    counts.episodesCreated++;
  }

  return counts;
}
