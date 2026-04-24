import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkForUpdate, compareSemver } from "../src/release-check.js";

describe("compareSemver", () => {
  it("orders basic triples", () => {
    expect(compareSemver("0.2.0", "0.1.9")).toBeGreaterThan(0);
    expect(compareSemver("0.2.0", "0.3.0")).toBeLessThan(0);
    expect(compareSemver("0.2.0", "0.2.0")).toBe(0);
  });

  it("accepts v-prefixed tags", () => {
    expect(compareSemver("v0.3.0", "0.2.0")).toBeGreaterThan(0);
    expect(compareSemver("v0.2.0", "v0.2.0")).toBe(0);
  });

  it("treats pre-releases as older than their release", () => {
    expect(compareSemver("0.3.0-alpha.1", "0.3.0")).toBeLessThan(0);
    expect(compareSemver("0.3.0", "0.3.0-alpha.1")).toBeGreaterThan(0);
  });
});

describe("checkForUpdate", () => {
  let cacheDir: string;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "engram-release-check-"));
  });

  afterEach(() => {
    if (existsSync(cacheDir)) {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  const makeFetcher = (tag: string) => async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({
      tag_name: tag,
      html_url: `https://github.com/x/y/releases/tag/${tag}`,
    }),
  });

  it("reports an update when the fetched tag is newer", async () => {
    const result = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: makeFetcher("v0.3.0"),
    });
    expect(result.updateAvailable).toBe(true);
    expect(result.latest?.version).toBe("0.3.0");
    expect(result.fromCache).toBe(false);
    expect(result.error).toBeNull();
  });

  it("reports no update when versions match", async () => {
    const result = await checkForUpdate({
      currentVersion: "0.3.0",
      cacheDir,
      fetcher: makeFetcher("v0.3.0"),
    });
    expect(result.updateAvailable).toBe(false);
    expect(result.latest?.version).toBe("0.3.0");
  });

  it("persists the result to cache for subsequent calls", async () => {
    const result1 = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: makeFetcher("v0.3.0"),
    });
    expect(result1.fromCache).toBe(false);

    const cachePath = join(cacheDir, "latest-release.json");
    expect(existsSync(cachePath)).toBe(true);
    const stored = JSON.parse(readFileSync(cachePath, "utf8"));
    expect(stored.version).toBe("0.3.0");

    let refetched = 0;
    const result2 = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: async (_url) => {
        refetched++;
        return makeFetcher("v0.3.0")(_url);
      },
    });
    expect(result2.fromCache).toBe(true);
    expect(refetched).toBe(0);
  });

  it("bypasses cache when noCache=true", async () => {
    await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: makeFetcher("v0.3.0"),
    });

    let refetched = 0;
    await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      noCache: true,
      fetcher: async (_url) => {
        refetched++;
        return makeFetcher("v0.4.0")(_url);
      },
    });
    expect(refetched).toBe(1);
  });

  it("returns error=offline when no cache exists and offline=true", async () => {
    const result = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      offline: true,
      fetcher: async () => {
        throw new Error("should not hit network");
      },
    });
    expect(result.error).toContain("offline");
    expect(result.updateAvailable).toBe(false);
    expect(result.latest).toBeNull();
  });

  it("uses cache when offline=true and cache is fresh", async () => {
    await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: makeFetcher("v0.3.0"),
    });

    const result = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      offline: true,
    });
    expect(result.fromCache).toBe(true);
    expect(result.updateAvailable).toBe(true);
    expect(result.error).toBeNull();
  });

  it("surfaces fetch errors in error field instead of throwing", async () => {
    const result = await checkForUpdate({
      currentVersion: "0.2.0",
      cacheDir,
      fetcher: async () => ({
        ok: false,
        status: 503,
        json: async () => ({}),
      }),
    });
    expect(result.error).toContain("503");
    expect(result.updateAvailable).toBe(false);
  });
});
