import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDeadlineMs, withDeadline } from "./deadline.js";

function findEngramDb(cwd: string): string | null {
  const candidate = path.join(cwd, ".engram");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function findEngramCli(): string {
  // Try engram on PATH first, then fall back to built dist
  try {
    execSync("engram --version", { stdio: "ignore" });
    return "engram";
  } catch {
    // not on PATH
  }
  return "engram";
}

export async function assembleContextPack(
  cwd: string,
  prompt: string,
): Promise<string | null> {
  const db = findEngramDb(cwd);
  if (!db) return null;

  const cli = findEngramCli();
  const deadlineMs = getDeadlineMs();

  return withDeadline(async () => {
    try {
      const result = execSync(
        `${cli} context ${JSON.stringify(prompt)} --format md --token-budget 8000 --db ${JSON.stringify(db)}`,
        { encoding: "utf8", cwd, timeout: deadlineMs + 500 },
      );
      return result.trim();
    } catch {
      return null;
    }
  }, deadlineMs);
}

export async function emitStalenessBrief(cwd: string): Promise<string | null> {
  const db = findEngramDb(cwd);
  if (!db) return null;

  const cli = findEngramCli();
  const deadlineMs = getDeadlineMs();

  return withDeadline(async () => {
    try {
      const result = execSync(
        `${cli} verify --format json --db ${JSON.stringify(db)}`,
        { encoding: "utf8", cwd, timeout: deadlineMs + 500 },
      );
      const data = JSON.parse(result);
      const staleCount = data?.stale_projections ?? 0;
      if (staleCount === 0) return null;
      return `[engram: ${staleCount} stale projection(s) — run \`engram reconcile\` to refresh]`;
    } catch {
      return null;
    }
  }, deadlineMs);
}
