/**
 * git-parse.ts — helpers for parsing git log output.
 */

export interface CommitRecord {
  sha: string;
  authorEmail: string;
  authorName: string;
  timestampUnix: number;
  subject: string;
  body: string;
  files: string[];
}

const COMMIT_SEPARATOR = "---COMMIT-END---";

/**
 * Parses the output of:
 *   git log --format="%H%n%ae%n%an%n%at%n%s%n%b%n---COMMIT-END---" --name-only
 *
 * The actual format git produces (observed):
 *   <sha>
 *   <author_email>
 *   <author_name>
 *   <unix_timestamp>
 *   <subject>
 *   <optional body lines>
 *   ---COMMIT-END---
 *   <blank line>
 *   <file1>
 *   <file2>
 *   ...
 *   <sha of next commit>
 *   ...
 *
 * So file names appear AFTER the separator, before the next commit's sha.
 * Strategy: collect header blocks (sha...separator) and then grab the file
 * lines that follow each separator before the next sha line.
 */
export function parseGitLog(raw: string): CommitRecord[] {
  const commits: CommitRecord[] = [];
  if (!raw.trim()) return commits;

  const lines = raw.split("\n");

  // State machine:
  // We accumulate lines into a "header block" until we hit the separator,
  // then accumulate lines as "files" until the next 40-char hex sha.

  interface ParsedHeader {
    sha: string;
    authorEmail: string;
    authorName: string;
    timestampUnix: number;
    subject: string;
    body: string;
  }

  const SHA_RE = /^[0-9a-f]{40}$/i;

  const pendingHeaders: ParsedHeader[] = [];
  let currentHeaderLines: string[] = [];
  let inFiles = false;
  let currentFiles: string[] = [];

  const flushFiles = () => {
    const header = pendingHeaders[pendingHeaders.length - 1];
    if (header) {
      commits.push({
        ...header,
        files: currentFiles.filter((f) => f.length > 0),
      });
      pendingHeaders.pop();
    }
    currentFiles = [];
    inFiles = false;
  };

  for (const line of lines) {
    const trimmed = line.trimEnd();

    if (trimmed === COMMIT_SEPARATOR) {
      // Parse the accumulated header lines
      if (currentHeaderLines.length >= 5) {
        const sha = currentHeaderLines[0]?.trim() ?? "";
        const authorEmail = currentHeaderLines[1]?.trim() ?? "";
        const authorName = currentHeaderLines[2]?.trim() ?? "";
        const timestampUnix = Number.parseInt(
          currentHeaderLines[3]?.trim() ?? "0",
          10,
        );
        const subject = currentHeaderLines[4]?.trim() ?? "";
        const bodyLines = currentHeaderLines.slice(5);
        const body = bodyLines.join("\n").trim();

        if (sha && authorEmail && authorName && !Number.isNaN(timestampUnix)) {
          // If we were collecting files for a previous commit, flush it first
          if (inFiles) {
            flushFiles();
          }
          pendingHeaders.push({
            sha,
            authorEmail,
            authorName,
            timestampUnix,
            subject,
            body,
          });
          inFiles = true;
          currentFiles = [];
        }
      }
      currentHeaderLines = [];
      continue;
    }

    if (inFiles) {
      // Check if this line is the start of a new commit (40-char hex sha)
      if (SHA_RE.test(trimmed)) {
        // Flush current commit's files
        flushFiles();
        // Start new header block
        currentHeaderLines = [trimmed];
        continue;
      }
      // Otherwise it's a file path (skip blank lines)
      if (trimmed.length > 0) {
        currentFiles.push(trimmed);
      }
    } else {
      // Accumulating header lines
      currentHeaderLines.push(trimmed);
    }
  }

  // Flush any remaining
  if (inFiles && pendingHeaders.length > 0) {
    flushFiles();
  }

  return commits;
}

/**
 * Recency-weighted score for an author contribution.
 * weight = exp(-λ * days_ago), λ = ln(2)/90 (90-day half-life)
 */
export function recencyWeight(commitUnixSecs: number, nowMs: number): number {
  const LAMBDA = Math.LN2 / 90; // half-life = 90 days
  const daysAgo = (nowMs / 1000 - commitUnixSecs) / 86400;
  return Math.exp(-LAMBDA * Math.max(0, daysAgo));
}
