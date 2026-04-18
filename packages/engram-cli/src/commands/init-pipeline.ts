/**
 * init-pipeline.ts — Helper logic for the engram init 5-step pipeline.
 *
 * Extracted from init.ts to keep each file under 500 lines.
 *
 * Covers:
 *  - GitHub remote detection (SSH + HTTPS + credentialed HTTPS + ssh://)
 *  - Harness file detection (CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules)
 *  - Companion append logic
 *  - GitHub enrichment runner
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { log, spinner } from "@clack/prompts";
import type { EngramGraph } from "engram-core";
import { GitHubAdapter } from "engram-core";
// HarnessName is defined in overrides.ts; import locally and re-export for
// consumers who previously imported it from this module.
import type { HarnessName } from "../templates/companion/overrides.js";
import { buildCompanionFragment, companionSentinel } from "./companion.js";

export type { HarnessName } from "../templates/companion/overrides.js";

// ---------------------------------------------------------------------------
// Remote detection
// ---------------------------------------------------------------------------

export interface DetectedRemote {
  /** "owner/repo" format, or null when detection fails. */
  repo: string | null;
  /** Human-readable reason when repo is null. */
  hint: string | null;
}

// Standard SSH shorthand: git@github.com:org/repo.git
const SSH_SCP_RE =
  /^git@github\.com:([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/;

// ssh:// protocol: ssh://git@github.com/org/repo.git
const SSH_URL_RE =
  /^ssh:\/\/(?:[^@]+@)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

// HTTPS with optional credentials: https://user:token@github.com/org/repo.git
const HTTPS_RE =
  /^https?:\/\/(?:[^@/]+@)?github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?(?:\/.*)?$/;

function parseGitHubUrl(url: string): string | null {
  const sshScp = SSH_SCP_RE.exec(url);
  if (sshScp) return sshScp[1];
  const sshUrl = SSH_URL_RE.exec(url);
  if (sshUrl) return sshUrl[1];
  const https = HTTPS_RE.exec(url);
  if (https) return https[1];
  return null;
}

/**
 * Detect a GitHub remote from the git repository at `repoPath`.
 * Handles SSH shorthand, ssh://, and HTTPS (including credentialed) remotes.
 * When multiple remotes are found pointing to different repos, emits a hint
 * and returns null.
 */
export function detectGitHubRemote(repoPath: string): DetectedRemote {
  let raw: string;
  try {
    raw = execSync("git remote -v", { cwd: repoPath, encoding: "utf8" });
  } catch {
    return {
      repo: null,
      hint: "Could not run `git remote -v` — not a git repository?",
    };
  }

  // Collect unique remote URLs
  const urls = new Set<string>();
  for (const line of raw.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2) urls.add(parts[1]);
  }

  const repos = new Set<string>();
  for (const url of urls) {
    const r = parseGitHubUrl(url);
    if (r) repos.add(r);
  }

  if (repos.size === 0) {
    return {
      repo: null,
      hint: "No GitHub remote detected — GitHub enrichment skipped. Set GITHUB_TOKEN and add a GitHub remote to enable.",
    };
  }
  if (repos.size > 1) {
    return {
      repo: null,
      hint: `Multiple GitHub repos detected (${[...repos].join(", ")}) — cannot auto-select. Pass --github-repo owner/repo explicitly.`,
    };
  }
  return { repo: [...repos][0], hint: null };
}

// ---------------------------------------------------------------------------
// Harness file detection
// ---------------------------------------------------------------------------

export interface HarnessFile {
  file: string;
  harness: HarnessName;
}

const HARNESS_FILES: HarnessFile[] = [
  { file: "CLAUDE.md", harness: "claude-code" },
  { file: "AGENTS.md", harness: "generic" },
  { file: "GEMINI.md", harness: "gemini" },
  { file: ".cursor/rules", harness: "cursor" },
];

/** Return harness files that exist in `dir`. */
export function detectHarnessFiles(dir: string): HarnessFile[] {
  return HARNESS_FILES.filter((h) => fs.existsSync(path.join(dir, h.file)));
}

// ---------------------------------------------------------------------------
// Companion append logic
// ---------------------------------------------------------------------------

export interface CompanionSummary {
  appended: string[];
  created: string[];
  skipped: string[];
}

/**
 * Append the companion fragment for each harness to its file.
 * Never overwrites existing content — only appends if sentinel is absent.
 */
export function appendCompanionToFiles(
  dir: string,
  files: HarnessFile[],
): CompanionSummary {
  const summary: CompanionSummary = { appended: [], created: [], skipped: [] };
  for (const { file, harness } of files) {
    const filePath = path.join(dir, file);
    const sentinel = companionSentinel(harness);
    const fragment = buildCompanionFragment(harness);

    if (fs.existsSync(filePath)) {
      const existing = fs.readFileSync(filePath, "utf8");
      if (existing.includes(sentinel)) {
        summary.skipped.push(file);
        continue;
      }
      const suffix = existing.endsWith("\n") ? "" : "\n";
      fs.appendFileSync(filePath, `${suffix}\n${fragment}\n`);
      summary.appended.push(file);
    } else {
      // Create parent dirs if needed (e.g. .cursor/)
      const parentDir = path.dirname(filePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(filePath, `${fragment}\n`);
      summary.created.push(file);
    }
  }
  return summary;
}

// ---------------------------------------------------------------------------
// GitHub enrichment runner
// ---------------------------------------------------------------------------

export interface GitHubEnrichSummary {
  prs: number;
  issues: number;
}

/**
 * Run GitHub enrichment for `repo` using `token`.
 * Returns null on failure (errors are logged).
 */
export async function runGitHubEnrich(
  graph: EngramGraph,
  repo: string,
  token: string,
): Promise<GitHubEnrichSummary | null> {
  const s = spinner();
  s.start(`GitHub enrichment: ${repo}…`);

  let prsIngested = 0;
  let issuesIngested = 0;

  try {
    const adapter = new GitHubAdapter();
    const result = await adapter.enrich(graph, {
      repo,
      token,
      onProgress: (p) => {
        s.message(
          `GitHub enrichment: ${p.phase} — ${p.fetched} fetched, ${p.created} created`,
        );
        // Heuristic: count by phase label
        if (p.phase.toLowerCase().includes("pr")) {
          prsIngested = p.created;
        } else if (p.phase.toLowerCase().includes("issue")) {
          issuesIngested = p.created;
        }
      },
    });

    // Use episodesCreated as a proxy for items ingested when progress counters
    // were not set (e.g. adapter that doesn't call onProgress for both phases).
    if (prsIngested === 0 && issuesIngested === 0) {
      // Split roughly — adapter creates ~1 episode per PR and 1 per issue
      prsIngested = result.episodesCreated;
    }

    s.stop(
      `GitHub enrichment complete — ${result.episodesCreated} episodes, ` +
        `${result.entitiesCreated} entities created`,
    );
    return { prs: prsIngested, issues: issuesIngested };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    s.stop(`GitHub enrichment failed: ${msg}`);
    log.warn("Skipping GitHub enrichment. Check GITHUB_TOKEN and repo access.");
    return null;
  }
}
