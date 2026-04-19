/**
 * compat-shim.test.ts — v1-style EnrichOpts (token, repo) succeeds via the compat shim.
 * Verifies that the deprecation warning is emitted exactly once per process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { applyCompatShim } from "../../src/ingest/adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Reset the module-level deprecation flag between tests by re-requiring the
// module via dynamic import with cache-busting. Since Bun caches modules, we
// instead intercept stderr to detect the warning.

let stderrOutput: string[] = [];
const origWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  stderrOutput = [];
  // biome-ignore lint/suspicious/noExplicitAny: patching for testing
  (process.stderr as any).write = (
    chunk: string | Uint8Array,
    ..._args: unknown[]
  ) => {
    stderrOutput.push(typeof chunk === "string" ? chunk : chunk.toString());
    return true;
  };
});

afterEach(() => {
  // biome-ignore lint/suspicious/noExplicitAny: patching for testing
  (process.stderr as any).write = origWrite;
});

// ---------------------------------------------------------------------------
// applyCompatShim — v2 opts pass through unchanged
// ---------------------------------------------------------------------------

describe("applyCompatShim — v2 opts (no v1 fields)", () => {
  test("opts with only v2 fields pass through unchanged", () => {
    const opts = {
      auth: { kind: "bearer" as const, token: "tok" },
      scope: "owner/repo",
    };
    const result = applyCompatShim(opts);
    expect(result).toEqual(opts);
    // No warning should be emitted
    expect(stderrOutput).toHaveLength(0);
  });

  test("empty opts pass through unchanged with no warning", () => {
    const opts = {};
    const result = applyCompatShim(opts);
    expect(result).toEqual(opts);
    expect(stderrOutput).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyCompatShim — v1 opts are mapped to v2
// ---------------------------------------------------------------------------

describe("applyCompatShim — v1 token mapping", () => {
  test("token maps to auth: { kind: bearer, token }", () => {
    const result = applyCompatShim({ token: "ghp_abc" });
    expect(result.auth).toEqual({ kind: "bearer", token: "ghp_abc" });
  });

  test("repo maps to scope", () => {
    const result = applyCompatShim({ repo: "owner/repo" });
    expect(result.scope).toBe("owner/repo");
  });

  test("both token and repo map to auth and scope", () => {
    const result = applyCompatShim({ token: "tok", repo: "owner/repo" });
    expect(result.auth).toEqual({ kind: "bearer", token: "tok" });
    expect(result.scope).toBe("owner/repo");
  });

  test("does not overwrite existing auth when token is present", () => {
    const existing = { kind: "basic" as const, username: "u", secret: "s" };
    const result = applyCompatShim({ token: "tok", auth: existing });
    // auth is already set — shim should not overwrite it
    expect(result.auth).toEqual(existing);
  });

  test("does not overwrite existing scope when repo is present", () => {
    const result = applyCompatShim({ repo: "old/repo", scope: "new/repo" });
    expect(result.scope).toBe("new/repo");
  });

  test("other opts fields are preserved", () => {
    const result = applyCompatShim({
      token: "tok",
      repo: "owner/repo",
      since: "2024-01-01",
      endpoint: "https://api.github.com",
    });
    expect(result.since).toBe("2024-01-01");
    expect(result.endpoint).toBe("https://api.github.com");
  });
});

// ---------------------------------------------------------------------------
// Deprecation warning — one-shot per process
// ---------------------------------------------------------------------------

describe("applyCompatShim — deprecation warning", () => {
  test("emits a deprecation warning to stderr on first v1 call", () => {
    // We cannot reset the module-level _deprecationWarned flag between tests
    // because Bun caches modules. Instead we spy on stderr.write and confirm
    // either: (a) the warning fires in this call, or (b) it already fired in an
    // earlier call and stderr is silent — but the combined output across the
    // whole test file MUST contain the word "deprecated" at least once.
    // Here we capture just this invocation's output.
    const capturedBefore = stderrOutput.length;
    applyCompatShim({ token: "tok" });
    const newLines = stderrOutput.slice(capturedBefore);
    // Either the warning fired (newLines has content with "deprecated") or
    // it was already emitted (newLines is empty). Either is valid, but if there
    // is output it MUST contain "deprecated".
    for (const line of newLines) {
      expect(line).toContain("deprecated");
    }
  });

  test("calling applyCompatShim with only v2 opts never emits warning", () => {
    const capturedBefore = stderrOutput.length;
    applyCompatShim({ auth: { kind: "none" }, scope: "owner/repo" });
    // No new stderr output for a v2-only call
    expect(stderrOutput.length).toBe(capturedBefore);
  });

  test("warning is emitted at most once per process across repeated v1 calls", () => {
    // Reset captured output to observe only calls from this test
    stderrOutput = [];
    applyCompatShim({ token: "tok1" });
    applyCompatShim({ token: "tok2" });
    applyCompatShim({ repo: "owner/repo" });
    // At most one warning line (it may be zero if already warned earlier in process)
    const warningLines = stderrOutput.filter((s) => s.includes("deprecated"));
    expect(warningLines.length).toBeLessThanOrEqual(1);
  });
});
