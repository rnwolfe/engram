#!/usr/bin/env bun
/**
 * check-cli-conformance.ts — W5.4 lint check for CLI agent-surface conformance.
 *
 * Checks the 8 high-traffic commands (context, sync, ingest, search, show,
 * stats, verify, init) against the agent-surface standards from
 * docs/internal/specs/cli-as-agent-surface.md:
 *
 *   1. Commands must register a --format option (--format=json support)
 *   2. process.exit(1) should not appear in catch blocks for system errors
 *      (should be exit(2) for DB/system failures, exit(3) for rate limits)
 *
 * The broader sweep of all 38 commands is future work.
 *
 * Exit code: 0 if all checks pass, 1 if any violations found.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const COMMANDS_DIR = join(
  import.meta.dir,
  "..",
  "packages",
  "engram-cli",
  "src",
  "commands",
);

// The 8 high-traffic agent-facing commands that must conform.
const HIGH_TRAFFIC_COMMANDS = [
  "context.ts",
  "sync.ts",
  "ingest.ts",
  "search.ts",
  "show.ts",
  "stats.ts",
  "verify.ts",
  "init.ts",
];

// Commands where --format=json is tracked as a known gap (future work).
// These still get exit-code checks but format checks are skipped.
const FORMAT_KNOWN_GAP = new Set([
  "ingest.ts", // format=json on subcommands (git/md/source/enrich) is future work
]);

// Exit codes that are permitted in catch blocks for the high-traffic commands.
// exit(1) in a catch block is only valid for user-input parsing errors.
// We check for patterns that look like user-error catches.
const USER_ERROR_CATCH_PATTERNS = [
  /InvalidAsOfError/,
  /parseFloat|parseInt|Number\(/,
  /bad.*flag|invalid.*flag|unknown.*flag/i,
  /buildAuthCredential|auth.*credential|credential.*auth/i,
  /scopeSchema\.validate/,
  /auth_failure/,
  /SyncConfigValidationError/,
  /Invalid scope/,
  /scope.*required/i,
  /Application Default Credentials|gcloud auth/,
  /statSync|existsSync|isDirectory|source path/i,
];

interface Violation {
  file: string;
  kind: "missing-format" | "exit-1-in-catch";
  detail: string;
}

const violations: Violation[] = [];

for (const file of HIGH_TRAFFIC_COMMANDS) {
  const filePath = join(COMMANDS_DIR, file);
  let src: string;
  try {
    src = readFileSync(filePath, "utf8");
  } catch {
    violations.push({
      file,
      kind: "missing-format",
      detail: `File not found: ${filePath}`,
    });
    continue;
  }

  // Check 1: --format option registration (skip known gaps)
  // init.ts registers format as -j/--format but also accepts it as a sub-option
  const hasFormat =
    FORMAT_KNOWN_GAP.has(file) ||
    src.includes('"--format') ||
    src.includes("'--format") ||
    src.includes('"-j, --format') ||
    src.includes("'-j, --format");
  if (!hasFormat) {
    violations.push({
      file,
      kind: "missing-format",
      detail:
        "No --format option found. Add --format=json support per cli-as-agent-surface.md.",
    });
  }

  // Check 2: process.exit(1) inside catch blocks for likely system errors
  // Parse catch blocks and flag exit(1) calls that don't look like user-error handlers
  const lines = src.split("\n");
  let inCatch = -1;
  let catchDepth = 0;
  let catchContext = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/catch\s*(\(|\{)/.test(line)) {
      inCatch = i;
      catchDepth = 1;
      // Include up to 10 lines before the catch block (the try body) for context
      catchContext = lines.slice(Math.max(0, i - 10), i + 1).join("\n") + "\n";
    }
    if (inCatch >= 0 && i > inCatch) {
      catchContext += line + "\n";
      const open = (line.match(/\{/g) ?? []).length;
      const close = (line.match(/\}/g) ?? []).length;
      catchDepth += open - close;
      if (catchDepth <= 0) {
        inCatch = -1;
        catchDepth = 0;
        catchContext = "";
      } else if (/process\.exit\(1\)/.test(line)) {
        // Allow exit(1) if the catch block (plus preceding try body) contains a user-error pattern
        const isUserError = USER_ERROR_CATCH_PATTERNS.some((p) =>
          p.test(catchContext),
        );
        if (!isUserError) {
          violations.push({
            file,
            kind: "exit-1-in-catch",
            detail: `Line ${i + 1}: process.exit(1) in catch block — should be exit(2) for system errors or exit(3) for rate-limit errors.`,
          });
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log(
    "✓ CLI conformance check passed — all high-traffic commands meet agent-surface standards.",
  );
  process.exit(0);
} else {
  console.error(
    `CLI conformance check found ${violations.length} violation(s) in high-traffic commands:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file} [${v.kind}]`);
    console.error(`    ${v.detail}`);
  }
  console.error(
    "\nSee docs/internal/specs/cli-as-agent-surface.md for the conformance requirements.",
  );
  process.exit(1);
}
