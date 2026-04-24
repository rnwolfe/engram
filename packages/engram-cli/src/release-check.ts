/**
 * release-check.ts — shared helpers for querying the GitHub Releases API to
 * decide whether the running engram binary is out of date.
 *
 * Used by:
 *   - `engram doctor` (the `update_available` check)
 *   - `engram update` (the --check subcommand and the self-updater)
 *
 * Design notes:
 *   - Results are cached under $XDG_CACHE_HOME/engram/latest-release.json for
 *     24h by default. Without the cache, every `doctor` run would hit GitHub.
 *   - Unauthenticated GitHub API is 60 req/hr per IP; the cache keeps us well
 *     below that on any reasonable developer machine.
 *   - Network failure is surfaced via `error` on the return value — callers
 *     decide whether to treat it as fail, warn, or skip.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** Default repo to query; overridable via env for forks / pre-release channels. */
const DEFAULT_REPO = "rnwolfe/engram";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface LatestRelease {
  /** Plain version (no "v" prefix), e.g. "0.3.0". */
  version: string;
  /** Raw tag as GitHub reports it, e.g. "v0.3.0". */
  tag: string;
  /** URL to the release page on GitHub. */
  url: string;
  /** ISO timestamp of when we fetched this record. */
  fetchedAt: string;
}

export interface UpdateCheck {
  current: string;
  latest: LatestRelease | null;
  /** True when we have a confirmed newer release. */
  updateAvailable: boolean;
  /** True when the cached record was used and no network call happened. */
  fromCache: boolean;
  /** Non-null if the check could not complete (offline, API error, etc). */
  error: string | null;
}

export interface CheckForUpdateOptions {
  currentVersion: string;
  /** Force a network call, ignoring the cache. */
  noCache?: boolean;
  /** Skip the network entirely; returns cached data or `error="offline"`. */
  offline?: boolean;
  /** Override the cache TTL in ms (default 24h). */
  cacheTtlMs?: number;
  /** Override the repo to query. Defaults to `rnwolfe/engram` or env. */
  repo?: string;
  /** Injected for tests — replaces the default HTTPS fetcher. */
  fetcher?: (
    url: string,
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  /** Injected for tests — overrides `$XDG_CACHE_HOME`/`HOME`. */
  cacheDir?: string;
}

function resolveCacheDir(override?: string): string {
  if (override) return override;
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return path.join(xdg, "engram");
  return path.join(os.homedir(), ".cache", "engram");
}

function cacheFilePath(dir: string): string {
  return path.join(dir, "latest-release.json");
}

function parseVersionFromTag(tag: string): string {
  return tag.startsWith("v") ? tag.slice(1) : tag;
}

/**
 * Strict numeric-triple semver comparison. Returns negative if a<b, 0 if equal,
 * positive if a>b. Pre-release suffixes (`-alpha.1`) compare as older than
 * their release counterpart, matching npm semver semantics closely enough.
 */
export function compareSemver(a: string, b: string): number {
  const stripV = (s: string) => (s.startsWith("v") ? s.slice(1) : s);
  const [coreA = "", preA = ""] = stripV(a).split("-", 2);
  const [coreB = "", preB = ""] = stripV(b).split("-", 2);
  const pa = coreA.split(".").map((n) => Number.parseInt(n, 10));
  const pb = coreB.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (preA && !preB) return -1;
  if (!preA && preB) return 1;
  if (preA && preB) return preA < preB ? -1 : preA > preB ? 1 : 0;
  return 0;
}

function readCache(cacheFile: string, ttlMs: number): LatestRelease | null {
  try {
    const raw = fs.readFileSync(cacheFile, "utf8");
    const parsed = JSON.parse(raw) as LatestRelease;
    const age = Date.now() - new Date(parsed.fetchedAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < ttlMs) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeCache(cacheFile: string, release: LatestRelease): void {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(release, null, 2), "utf8");
  } catch {
    // Cache write failure is non-fatal — the check still works, just slower next time.
  }
}

async function fetchLatestRelease(
  repo: string,
  fetcher?: CheckForUpdateOptions["fetcher"],
): Promise<LatestRelease> {
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const doFetch =
    fetcher ??
    ((u: string) =>
      fetch(u, {
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": `engram/${process.env.ENGRAM_USER_AGENT ?? "cli"}`,
        },
      }));
  const res = await doFetch(url);
  if (!res.ok) {
    throw new Error(`github releases API ${res.status}`);
  }
  const body = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
  };
  if (!body.tag_name) {
    throw new Error("github releases API returned no tag_name");
  }
  return {
    version: parseVersionFromTag(body.tag_name),
    tag: body.tag_name,
    url:
      body.html_url ??
      `https://github.com/${repo}/releases/tag/${body.tag_name}`,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Returns whether a newer engram release is available, using a 24h cache to
 * avoid hammering the GitHub API. On offline/error, returns a filled-in
 * `UpdateCheck` with `error` set rather than throwing.
 */
export async function checkForUpdate(
  opts: CheckForUpdateOptions,
): Promise<UpdateCheck> {
  const ttlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const repo = opts.repo ?? process.env.ENGRAM_RELEASES_REPO ?? DEFAULT_REPO;
  const cacheDir = resolveCacheDir(opts.cacheDir);
  const cacheFile = cacheFilePath(cacheDir);

  const cached = opts.noCache ? null : readCache(cacheFile, ttlMs);
  if (cached) {
    return {
      current: opts.currentVersion,
      latest: cached,
      updateAvailable: compareSemver(cached.version, opts.currentVersion) > 0,
      fromCache: true,
      error: null,
    };
  }

  if (opts.offline) {
    return {
      current: opts.currentVersion,
      latest: null,
      updateAvailable: false,
      fromCache: false,
      error: "offline (no cache available)",
    };
  }

  try {
    const release = await fetchLatestRelease(repo, opts.fetcher);
    writeCache(cacheFile, release);
    return {
      current: opts.currentVersion,
      latest: release,
      updateAvailable: compareSemver(release.version, opts.currentVersion) > 0,
      fromCache: false,
      error: null,
    };
  } catch (err) {
    return {
      current: opts.currentVersion,
      latest: null,
      updateAvailable: false,
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
