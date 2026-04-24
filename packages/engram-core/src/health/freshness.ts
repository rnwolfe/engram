/**
 * freshness.ts — compute a staleness verdict for the graph's ingested data.
 *
 * Two signals combine:
 *   1. Days since the most recent successful ingestion per source_type.
 *   2. For git sources, commits-behind HEAD of the current working-tree repo,
 *      computed by comparing the cursor SHA against `git rev-list HEAD`.
 *
 * Commits-behind is the stronger signal for fast-moving repos — 14 days with
 * 2 commits is different from 14 days with 200 commits. Both signals feed
 * into the severity, and the worse one wins.
 *
 * Non-git sources (github, source, markdown, plugins) fall back to the
 * time-based signal only, because their cursor shapes are adapter-specific.
 */

import { execFileSync } from "node:child_process";
import type { EngramGraph } from "../format/graph.js";
import { INGESTION_SOURCE_TYPES } from "../vocab/source-types.js";

export type FreshnessSeverity = "fresh" | "warn" | "stale" | "unknown";

export interface SourceFreshness {
  /** The `ingestion_runs.source_type` value (e.g. "git", "github"). */
  sourceType: string;
  /** The stored `source_scope` (e.g. "/path/to/repo::branch=main" for git). */
  sourceScope: string | null;
  /** ISO timestamp of the most recent successful run, or null if never. */
  lastCompletedAt: string | null;
  /**
   * Stored ingestion cursor for this run (git SHA for git; adapter-specific
   * otherwise). Null if the run completed without writing a cursor.
   */
  cursor: string | null;
  /** Days since `lastCompletedAt`. Null if the source never ran. */
  daysSince: number | null;
  /**
   * Git only: commits in HEAD that are not ancestors of the stored cursor SHA.
   * Null if not applicable (non-git source) or if the cursor SHA isn't
   * reachable from the current repo (force-push / history rewrite).
   */
  commitsBehind: number | null;
  /** True if the stored cursor SHA is missing from or unreachable in the repo (force-push / history rewrite). */
  cursorLost: boolean;
  severity: FreshnessSeverity;
  /** One-line human explanation, safe to print directly. */
  reason: string;
}

export interface FreshnessReport {
  /** Worst severity across reported sources. */
  overall: FreshnessSeverity;
  sources: SourceFreshness[];
}

export interface FreshnessThresholds {
  /** Days since last ingest that triggers "warn" (default 7). */
  warnDays: number;
  /** Days since last ingest that triggers "stale" (default 30). */
  staleDays: number;
  /** Commits behind HEAD that triggers "warn" on git sources (default 20). */
  warnCommits: number;
  /** Commits behind HEAD that triggers "stale" on git sources (default 100). */
  staleCommits: number;
}

export const DEFAULT_FRESHNESS_THRESHOLDS: FreshnessThresholds = {
  warnDays: 7,
  staleDays: 30,
  warnCommits: 20,
  staleCommits: 100,
};

export interface FreshnessOptions {
  /** Reference time. Defaults to now; overridable for tests. */
  now?: Date;
  /** Override default severity thresholds. */
  thresholds?: Partial<FreshnessThresholds>;
  /**
   * Override where to run `git rev-list` for git source_scopes. Normally we
   * parse the scope (`"<repo-path>::branch=<branch>"`) and use that path. Set
   * this to force a single repo for all git sources (useful in tests).
   */
  repoPathOverride?: string;
}

interface IngestionRunRow {
  source_type: string;
  source_scope: string | null;
  completed_at: string | null;
  cursor: string | null;
}

const SEVERITY_RANK: Record<FreshnessSeverity, number> = {
  fresh: 0,
  unknown: 1,
  warn: 2,
  stale: 3,
};

function worseSeverity(
  a: FreshnessSeverity,
  b: FreshnessSeverity,
): FreshnessSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function severityFromDays(
  days: number | null,
  t: FreshnessThresholds,
): FreshnessSeverity {
  if (days === null) return "unknown";
  if (days >= t.staleDays) return "stale";
  if (days >= t.warnDays) return "warn";
  return "fresh";
}

function severityFromCommits(
  commits: number | null,
  t: FreshnessThresholds,
): FreshnessSeverity {
  if (commits === null) return "unknown";
  if (commits >= t.staleCommits) return "stale";
  if (commits >= t.warnCommits) return "warn";
  return "fresh";
}

/**
 * Extracts the repo path from a git ingestion's `source_scope` string. Git
 * scopes follow the convention `"<repo-path>::branch=<branch>"` (see
 * `ingest/git.ts`). Returns null if the scope doesn't parse.
 */
function parseGitRepoPath(sourceScope: string | null): string | null {
  if (!sourceScope) return null;
  const [path] = sourceScope.split("::");
  return path?.trim() || null;
}

function countCommitsBehind(
  repoPath: string,
  cursorSha: string,
): { count: number | null; cursorLost: boolean } {
  // Cheap existence check first — `cat-file -e` exits non-zero if the object
  // isn't in the repo (force-push or unrelated repo at this path).
  try {
    execFileSync("git", ["-C", repoPath, "cat-file", "-e", cursorSha], {
      stdio: "ignore",
    });
  } catch {
    return { count: null, cursorLost: true };
  }
  try {
    const out = execFileSync(
      "git",
      ["-C", repoPath, "rev-list", "--count", `${cursorSha}..HEAD`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    const n = Number.parseInt(out.trim(), 10);
    return { count: Number.isFinite(n) ? n : null, cursorLost: false };
  } catch {
    return { count: null, cursorLost: false };
  }
}

function buildReason(
  source: Omit<SourceFreshness, "reason" | "severity">,
): string {
  if (source.lastCompletedAt === null) {
    return "never run";
  }
  const daysStr =
    source.daysSince === null
      ? "unknown age"
      : source.daysSince === 0
        ? "today"
        : source.daysSince === 1
          ? "1 day ago"
          : `${source.daysSince} days ago`;

  if (source.sourceType === INGESTION_SOURCE_TYPES.GIT) {
    if (source.cursorLost) {
      return `cursor SHA not in repo (history rewritten?); last ingest ${daysStr}`;
    }
    if (source.commitsBehind !== null) {
      const commitsStr =
        source.commitsBehind === 0
          ? "0 commits behind"
          : source.commitsBehind === 1
            ? "1 commit behind"
            : `${source.commitsBehind} commits behind`;
      return `${commitsStr} HEAD, last ingest ${daysStr}`;
    }
    return `last ingest ${daysStr} (commits-behind unavailable)`;
  }

  return `last ingest ${daysStr}`;
}

/**
 * Computes a freshness report for every source_type that has at least one
 * successful ingestion run in the graph. Sources that have never run are
 * omitted — a never-run source is a discovery gap, not a staleness gap.
 */
export function computeFreshness(
  graph: EngramGraph,
  opts: FreshnessOptions = {},
): FreshnessReport {
  const thresholds: FreshnessThresholds = {
    ...DEFAULT_FRESHNESS_THRESHOLDS,
    ...(opts.thresholds ?? {}),
  };
  const now = opts.now ?? new Date();

  // Latest successful run per (source_type, source_scope). Keeping scope in
  // the key means a repo ingested across two branches shows up twice.
  const rows = graph.db
    .query<IngestionRunRow, []>(
      `SELECT source_type, source_scope, completed_at, cursor
       FROM ingestion_runs
       WHERE status = 'completed'
         AND completed_at IS NOT NULL
       ORDER BY completed_at DESC`,
    )
    .all();

  const seen = new Set<string>();
  const sources: SourceFreshness[] = [];

  for (const row of rows) {
    const key = `${row.source_type}::${row.source_scope ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const lastCompletedAt = row.completed_at;
    const daysSince =
      lastCompletedAt === null
        ? null
        : Math.floor(
            (now.getTime() - new Date(lastCompletedAt).getTime()) /
              (1000 * 60 * 60 * 24),
          );

    let commitsBehind: number | null = null;
    let cursorLost = false;

    if (row.source_type === INGESTION_SOURCE_TYPES.GIT && row.cursor) {
      const repoPath =
        opts.repoPathOverride ?? parseGitRepoPath(row.source_scope);
      if (repoPath) {
        const { count, cursorLost: lost } = countCommitsBehind(
          repoPath,
          row.cursor,
        );
        commitsBehind = count;
        cursorLost = lost;
      }
    }

    const daySeverity = severityFromDays(daysSince, thresholds);
    // commits-behind only contributes when we have a git source with a
    // reachable cursor. Missing or unparseable cursor → not applicable, fall
    // back to day-based severity only; don't poison "fresh" with "unknown".
    let commitSeverity: FreshnessSeverity = "fresh";
    if (row.source_type === INGESTION_SOURCE_TYPES.GIT) {
      if (cursorLost) commitSeverity = "stale";
      else if (commitsBehind !== null)
        commitSeverity = severityFromCommits(commitsBehind, thresholds);
    }
    const severity = worseSeverity(daySeverity, commitSeverity);

    const partial: Omit<SourceFreshness, "reason" | "severity"> = {
      sourceType: row.source_type,
      sourceScope: row.source_scope,
      lastCompletedAt,
      cursor: row.cursor,
      daysSince,
      commitsBehind,
      cursorLost,
    };

    sources.push({
      ...partial,
      severity,
      reason: buildReason(partial),
    });
  }

  const overall: FreshnessSeverity = sources.reduce<FreshnessSeverity>(
    (acc, s) => worseSeverity(acc, s.severity),
    "fresh",
  );

  return { overall, sources };
}
