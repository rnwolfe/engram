/**
 * adapter-contract.test.ts — Runtime shape checks for the EnrichmentAdapter contract.
 *
 * TypeScript's structural typing proves conformance at compile time; these tests
 * verify the runtime shape is also correct and that the error taxonomy works.
 */

import { describe, expect, test } from "bun:test";
import type { EnrichmentAdapter } from "../../src/ingest/adapter.js";
import { EnrichmentAdapterError } from "../../src/ingest/adapter.js";
import { GerritAdapter } from "../../src/ingest/adapters/gerrit.js";
import {
  GitHubAdapter,
  GitHubAuthError,
} from "../../src/ingest/adapters/github.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function assertAdapterShape(adapter: EnrichmentAdapter, label: string): void {
  expect(typeof adapter.name, `${label}.name`).toBe("string");
  expect(adapter.name.length, `${label}.name not empty`).toBeGreaterThan(0);
  expect(typeof adapter.kind, `${label}.kind`).toBe("string");
  expect(adapter.kind.length, `${label}.kind not empty`).toBeGreaterThan(0);
  expect(typeof adapter.enrich, `${label}.enrich`).toBe("function");
}

// ---------------------------------------------------------------------------
// Shape checks
// ---------------------------------------------------------------------------

describe("EnrichmentAdapter contract — runtime shape", () => {
  test("GitHubAdapter satisfies the contract", () => {
    const a = new GitHubAdapter();
    assertAdapterShape(a, "GitHubAdapter");
    expect(a.name).toBe("github");
    expect(a.kind).toBe("enrichment");
    expect(Array.isArray(a.supportedAuth)).toBe(true);
    expect(a.supportedAuth).toContain("bearer");
    expect(a.supportedAuth).toContain("none");
    expect(typeof a.scopeSchema).toBe("object");
    expect(typeof a.scopeSchema.validate).toBe("function");
    expect(a.supportsCursor).toBe(true);
  });

  test("GerritAdapter satisfies the contract", () => {
    const a = new GerritAdapter();
    assertAdapterShape(a, "GerritAdapter");
    expect(a.name).toBe("gerrit");
    expect(a.kind).toBe("enrichment");
    expect(Array.isArray(a.supportedAuth)).toBe(true);
    expect(a.supportedAuth).toContain("none");
    expect(typeof a.scopeSchema).toBe("object");
    expect(typeof a.scopeSchema.validate).toBe("function");
    expect(a.supportsCursor).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

describe("EnrichmentAdapterError", () => {
  test("can be constructed with a code and message", () => {
    const err = new EnrichmentAdapterError("rate_limited", "too many requests");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EnrichmentAdapterError);
    expect(err.code).toBe("rate_limited");
    expect(err.message).toBe("too many requests");
    expect(err.name).toBe("EnrichmentAdapterError");
  });

  test("supports all error codes", () => {
    const codes = [
      "auth_failure",
      "rate_limited",
      "server_error",
      "data_error",
    ] as const;
    for (const code of codes) {
      const err = new EnrichmentAdapterError(code, `test ${code}`);
      expect(err.code).toBe(code);
    }
  });
});

// ---------------------------------------------------------------------------
// GitHubAuthError subclass
// ---------------------------------------------------------------------------

describe("GitHubAuthError", () => {
  test("is an instanceof EnrichmentAdapterError", () => {
    const err = new GitHubAuthError("token invalid");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(EnrichmentAdapterError);
    expect(err.code).toBe("auth_failure");
    expect(err.name).toBe("GitHubAuthError");
    expect(err.message).toBe("token invalid");
  });
});
