/**
 * test/sync/run.test.ts — unit tests for runSync and validateSyncConfig.
 *
 * Uses real SQLite (:memory:) and stub implementations. No mocks.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createGraph } from "../../src/format/index.js";
import { SyncConfigValidationError } from "../../src/sync/errors.js";
import { runSync, validateSyncConfig } from "../../src/sync/run.js";
import type { SyncConfig } from "../../src/sync/types.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeConfig(
  overrides: Partial<SyncConfig> = {},
  sourcesOverride?: SyncConfig["sources"],
): SyncConfig {
  return {
    version: 1,
    sources: sourcesOverride ?? [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateSyncConfig
// ---------------------------------------------------------------------------

describe("validateSyncConfig", () => {
  test("accepts valid config with no sources", () => {
    const config = validateSyncConfig({ version: 1, sources: [] });
    expect(config.version).toBe(1);
    expect(config.sources).toHaveLength(0);
  });

  test("accepts valid config with git and source entries", () => {
    const config = validateSyncConfig({
      version: 1,
      sources: [
        { name: "repo-git", type: "git", path: "." },
        { name: "repo-src", type: "source", root: "packages/" },
      ],
    });
    expect(config.sources).toHaveLength(2);
  });

  test("accepts github source with bearer auth", () => {
    const config = validateSyncConfig({
      version: 1,
      sources: [
        {
          name: "gh",
          type: "github",
          scope: "owner/repo",
          auth: { kind: "bearer", tokenEnv: "GITHUB_TOKEN" },
        },
      ],
    });
    expect(config.sources[0].auth).toEqual({
      kind: "bearer",
      tokenEnv: "GITHUB_TOKEN",
    });
  });

  test("rejects non-object root", () => {
    expect(() => validateSyncConfig(null)).toThrow(SyncConfigValidationError);
    expect(() => validateSyncConfig([])).toThrow(SyncConfigValidationError);
    expect(() => validateSyncConfig("string")).toThrow(
      SyncConfigValidationError,
    );
  });

  test("rejects missing version field", () => {
    expect(() => validateSyncConfig({ sources: [] })).toThrow(
      SyncConfigValidationError,
    );
  });

  test("rejects version !== 1", () => {
    try {
      validateSyncConfig({ version: 2, sources: [] });
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures[0].field).toBe("version");
      expect(e.failures[0].reason).toContain("upgrade");
    }
  });

  test("rejects missing sources field", () => {
    expect(() => validateSyncConfig({ version: 1 })).toThrow(
      SyncConfigValidationError,
    );
  });

  test("rejects unknown top-level field", () => {
    try {
      validateSyncConfig({ version: 1, sources: [], extra: true });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field === "extra")).toBe(true);
    }
  });

  test("rejects duplicate source names", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [
          { name: "dup", type: "git" },
          { name: "dup", type: "source" },
        ],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.reason.includes("duplicate"))).toBe(true);
    }
  });

  test("rejects unknown source fields (fail-closed)", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [{ name: "s", type: "git", extraField: "bad" }],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("extraField"))).toBe(true);
    }
  });

  test("rejects missing source name", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [{ type: "git" }],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("name"))).toBe(true);
    }
  });

  test("rejects missing source type", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [{ name: "s" }],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("type"))).toBe(true);
    }
  });

  test("collects ALL validation errors, not just first", () => {
    try {
      validateSyncConfig({
        version: 2, // wrong version
        sources: [
          { type: "git" }, // missing name
        ],
        badField: true, // unknown field
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      // Should have multiple failures
      expect(e.failures.length).toBeGreaterThan(1);
    }
  });

  test("rejects unknown auth kind", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [
          {
            name: "s",
            type: "github",
            auth: { kind: "magic", token: "x" },
          },
        ],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("kind"))).toBe(true);
    }
  });

  test("rejects unknown auth fields (fail-closed)", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [
          {
            name: "s",
            type: "github",
            auth: { kind: "bearer", tokenEnv: "GH_TOKEN", extra: "bad" },
          },
        ],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("extra"))).toBe(true);
    }
  });

  test("rejects bearer auth missing tokenEnv", () => {
    try {
      validateSyncConfig({
        version: 1,
        sources: [
          {
            name: "s",
            type: "github",
            auth: { kind: "bearer" },
          },
        ],
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(SyncConfigValidationError);
      const e = err as SyncConfigValidationError;
      expect(e.failures.some((f) => f.field.includes("tokenEnv"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// runSync — ordering and flow control
// ---------------------------------------------------------------------------

describe("runSync", () => {
  let graph: ReturnType<typeof createGraph>;

  beforeEach(() => {
    graph = createGraph(":memory:");
  });

  afterEach(() => {
    try {
      graph.db.close();
    } catch {
      // already closed
    }
  });

  test("empty sources returns success with no cross-refs when --no-cross-refs", async () => {
    const config = makeConfig({}, []);
    const result = await runSync(graph, config, { noCrossRefs: true });
    expect(result.status).toBe("success");
    expect(result.sources).toHaveLength(0);
    expect(result.crossRefs).toBeNull();
  });

  test("--only filters to named subset in declaration order", async () => {
    // Use git sources with a real-ish path that will just fail gracefully
    const config = makeConfig({}, [
      { name: "a", type: "git", path: "/nonexistent-a" },
      { name: "b", type: "git", path: "/nonexistent-b" },
      { name: "c", type: "git", path: "/nonexistent-c" },
    ]);

    const visited: string[] = [];
    const result = await runSync(graph, config, {
      only: ["c", "a"], // out of declaration order — should be normalized to a, c
      noCrossRefs: true,
      continueOnError: true,
      onSourceStart: (name) => visited.push(name),
    });

    // Declaration order: a before c, even though --only specified c,a
    expect(visited).toEqual(["a", "c"]);
    // b was not included
    expect(result.sources.map((r) => r.name)).toEqual(["a", "c"]);
  });

  test("fail-fast: first failure aborts remaining sources", async () => {
    const config = makeConfig({}, [
      { name: "fail", type: "git", path: "/nonexistent-fail" },
      { name: "should-skip", type: "git", path: "/nonexistent-skip" },
    ]);

    const visited: string[] = [];
    const result = await runSync(graph, config, {
      noCrossRefs: true,
      continueOnError: false,
      onSourceStart: (name) => visited.push(name),
    });

    expect(result.status).toBe("failed");
    // Only the first source was attempted
    expect(visited).toEqual(["fail"]);
    // Second source is skipped
    const skipResult = result.sources.find((r) => r.name === "should-skip");
    expect(skipResult?.status).toBe("skipped");
  });

  test("--continue-on-error: runs all sources even after failure", async () => {
    const config = makeConfig({}, [
      { name: "fail", type: "git", path: "/nonexistent-fail" },
      { name: "also-fail", type: "git", path: "/nonexistent-also" },
    ]);

    const visited: string[] = [];
    const result = await runSync(graph, config, {
      noCrossRefs: true,
      continueOnError: true,
      onSourceStart: (name) => visited.push(name),
    });

    expect(result.status).toBe("failed");
    expect(visited).toHaveLength(2);
    expect(visited).toEqual(["fail", "also-fail"]);
  });

  test("cross-refs skipped when --no-cross-refs", async () => {
    const config = makeConfig({}, []);
    const result = await runSync(graph, config, { noCrossRefs: true });
    expect(result.crossRefs).toBeNull();
  });

  test("cross-refs run after empty source list", async () => {
    const config = makeConfig({}, []);
    const result = await runSync(graph, config, { noCrossRefs: false });
    // With no episodes, cross-ref resolver should succeed and return zero counts
    expect(result.crossRefs).not.toBeNull();
    expect(result.crossRefs?.edgesCreated).toBe(0);
  });

  test("cross-refs skipped on fail-fast abort", async () => {
    const config = makeConfig({}, [
      { name: "fail", type: "git", path: "/nonexistent" },
    ]);

    const result = await runSync(graph, config, {
      noCrossRefs: false,
      continueOnError: false,
    });

    expect(result.status).toBe("failed");
    expect(result.crossRefs).toBeNull();
  });

  test("--continue-on-error: cross-refs run even with partial failure", async () => {
    const config = makeConfig({}, [
      { name: "fail", type: "git", path: "/nonexistent" },
    ]);

    const result = await runSync(graph, config, {
      noCrossRefs: false,
      continueOnError: true,
    });

    expect(result.status).toBe("failed");
    // Cross-refs still run
    expect(result.crossRefs).not.toBeNull();
  });

  test("dry-run: returns success without executing", async () => {
    const config = makeConfig({}, [
      { name: "a", type: "git", path: "/nonexistent" },
    ]);

    const result = await runSync(graph, config, {
      dryRun: true,
      noCrossRefs: true,
    });

    expect(result.status).toBe("success");
    // All sources have success status in dry-run
    for (const s of result.sources) {
      expect(s.status).toBe("success");
    }
  });

  test("result includes per-source elapsed time", async () => {
    const config = makeConfig({}, [
      { name: "a", type: "git", path: "/nonexistent" },
    ]);

    const result = await runSync(graph, config, {
      noCrossRefs: true,
      continueOnError: true,
    });

    expect(result.sources[0].elapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  test("result status: success when all sources succeed", async () => {
    // Use dry-run so no actual git calls are made
    const config = makeConfig({}, [{ name: "a", type: "git", path: "." }]);
    const result = await runSync(graph, config, {
      dryRun: true,
      noCrossRefs: true,
    });
    expect(result.status).toBe("success");
  });

  test("result status: failed when any source fails", async () => {
    const config = makeConfig({}, [
      { name: "broken", type: "git", path: "/nonexistent" },
    ]);
    const result = await runSync(graph, config, {
      noCrossRefs: true,
      continueOnError: true,
    });
    expect(result.status).toBe("failed");
  });

  test("missing auth env var throws SyncSourceError before any source runs", async () => {
    // Set env to ensure the var doesn't exist
    const envVar = "ENGRAM_TEST_MISSING_TOKEN_12345";
    delete process.env[envVar];

    const config = makeConfig({}, [
      {
        name: "gh",
        type: "github",
        scope: "owner/repo",
        auth: { kind: "bearer", tokenEnv: envVar },
      },
    ]);

    const { SyncSourceError } = await import("../../src/sync/errors.js");
    await expect(
      runSync(graph, config, { noCrossRefs: true }),
    ).rejects.toBeInstanceOf(SyncSourceError);
  });
});
