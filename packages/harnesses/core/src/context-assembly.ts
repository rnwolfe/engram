import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { getDeadlineMs } from "./deadline.js";

function findEngramDb(cwd: string): string | null {
  const candidate = path.join(cwd, ".engram");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function findEngramCli(): string {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineMs);

  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile(
        cli,
        [
          "context",
          prompt,
          "--format",
          "md",
          "--token-budget",
          "8000",
          "--db",
          db,
        ],
        { encoding: "utf8", cwd, signal: controller.signal },
        (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        },
      );
    });
    return result.trim();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function emitStalenessBrief(_cwd: string): Promise<string | null> {
  // TODO: engram verify --format json outputs { ok, violations }, not a stale_projections
  // count. Wire this to a real command that reports projection staleness when available.
  return null;
}
