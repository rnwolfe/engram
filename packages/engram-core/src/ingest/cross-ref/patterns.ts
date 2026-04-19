/**
 * patterns.ts — Reference pattern registry for cross-source edge resolution.
 */

import type { EngramGraph } from "../../format/index.js";

export interface ReferencePattern {
  /** episodes.source_type of the target */
  sourceType: string;
  /** Regex with capture group 1 = the identifier */
  pattern: RegExp;
  /** Map the match to a searchable ref value */
  normalizeRef: (match: string) => string;
  /** Confidence on the emitted edge, 0..1 */
  confidence: number;
  /**
   * Built-in override for non-standard entity lookup.
   * Not available to plugins (plugins use default source_type+source_ref lookup).
   */
  _lookupOverride?: (
    graph: EngramGraph,
    normalizedRef: string,
  ) => { id: string } | null;
}

/** Manifest-safe plugin pattern (no closures) */
export interface PluginReferencePattern {
  source_type: string;
  pattern: string;
  flags?: string;
  normalize_template: string;
  confidence: number;
}

/**
 * Compile a plugin manifest pattern into a ReferencePattern.
 * Throws if source_type or pattern.source collides with an existing registry entry.
 */
export function compilePluginPattern(
  manifest: PluginReferencePattern,
  existing: ReferencePattern[],
): ReferencePattern {
  const compiled = new RegExp(manifest.pattern, manifest.flags ?? "g");
  const collision = existing.find(
    (p) =>
      p.sourceType === manifest.source_type &&
      p.pattern.source === compiled.source,
  );
  if (collision) {
    throw new Error(
      `Plugin pattern collision on (source_type="${manifest.source_type}", pattern="${manifest.pattern}"): ` +
        `a built-in pattern already declares this combination`,
    );
  }
  return {
    sourceType: manifest.source_type,
    pattern: compiled,
    normalizeRef: (match: string) =>
      manifest.normalize_template.replaceAll("$1", match),
    confidence: manifest.confidence,
  };
}

/** Built-in reference patterns (ordered from most- to least-specific) */
export const BUILT_IN_PATTERNS: ReferencePattern[] = [
  // ── Full GitHub PR URL ────────────────────────────────────────────────────
  {
    sourceType: "github_pr",
    pattern: /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/(\d+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── Full GitHub Issue URL ─────────────────────────────────────────────────
  {
    sourceType: "github_issue",
    pattern: /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues\/(\d+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── Full Gerrit CL URL ────────────────────────────────────────────────────
  {
    sourceType: "gerrit_change",
    pattern: /https?:\/\/[^/\s]*googlesource\.com\/c\/[^/\s]+\/\+\/(\d+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── Full Google Doc URL ───────────────────────────────────────────────────
  {
    sourceType: "google_doc",
    pattern: /https?:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── Full Linear Issue URL ─────────────────────────────────────────────────
  {
    sourceType: "linear_issue",
    pattern: /https?:\/\/linear\.app\/[^/\s]+\/issue\/([A-Z]+-\d+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── Full Jira Issue URL ───────────────────────────────────────────────────
  {
    sourceType: "jira_issue",
    pattern:
      /https?:\/\/[^/\s]+\.atlassian\.net\/browse\/([A-Z][A-Z0-9]+-\d+)/gi,
    normalizeRef: (match) => match,
    confidence: 0.95,
  },
  // ── b/NNNN (Buganizer shorthand) ──────────────────────────────────────────
  {
    sourceType: "buganizer_issue",
    pattern: /\bb\/(\d{6,})\b/g,
    normalizeRef: (match) => `b/${match}`,
    confidence: 0.9,
  },
  // ── go/cl/NNNN (Gerrit shorthand) ─────────────────────────────────────────
  {
    sourceType: "gerrit_change",
    pattern: /\bgo\/cl\/(\d+)\b/g,
    normalizeRef: (match) => `go/cl/${match}`,
    confidence: 0.9,
  },
  // ── Full 40-char SHA ─────────────────────────────────────────────────────
  {
    sourceType: "git_commit",
    pattern: /\b([0-9a-f]{40})\b/gi,
    normalizeRef: (match) => match.toLowerCase(),
    confidence: 0.9,
  },
  // ── Short SHA (7–11 chars) ────────────────────────────────────────────────
  {
    sourceType: "git_commit",
    pattern: /\b([0-9a-f]{7,11})\b/gi,
    normalizeRef: (match) => match.toLowerCase(),
    confidence: 0.75,
  },
  // ── Repo-scoped #N reference (GitHub issue or PR) ─────────────────────────
  {
    sourceType: "github_issue",
    pattern: /#(\d+)\b/g,
    normalizeRef: (match) => `#${match}`,
    confidence: 0.85,
    _lookupOverride(graph, normalizedRef) {
      const num = normalizedRef.slice(1);
      const row = graph.db
        .query<{ id: string }, [string, string]>(
          `SELECT e.id FROM entities e
           WHERE (e.canonical_name LIKE ? OR e.canonical_name LIKE ?)
             AND e.entity_type IN ('issue', 'pull_request')
           LIMIT 1`,
        )
        .get(`%/issues/${num}`, `%/pull/${num}`);
      return row ?? null;
    },
  },
];
