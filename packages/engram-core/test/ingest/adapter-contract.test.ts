/**
 * adapter-contract.test.ts — Runtime shape checks for the EnrichmentAdapter contract (v2).
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

  // v2 required fields
  expect(Array.isArray(adapter.supportedAuth), `${label}.supportedAuth`).toBe(
    true,
  );
  expect(
    adapter.supportedAuth.length,
    `${label}.supportedAuth not empty`,
  ).toBeGreaterThan(0);
  expect(typeof adapter.scopeSchema, `${label}.scopeSchema`).toBe("object");
  expect(
    typeof adapter.scopeSchema.description,
    `${label}.scopeSchema.description`,
  ).toBe("string");
  expect(
    typeof adapter.scopeSchema.validate,
    `${label}.scopeSchema.validate`,
  ).toBe("function");
}

// ---------------------------------------------------------------------------
// Shape checks
// ---------------------------------------------------------------------------

describe("EnrichmentAdapter contract — runtime shape (v2)", () => {
  test("GitHubAdapter satisfies the contract", () => {
    const a = new GitHubAdapter();
    assertAdapterShape(a, "GitHubAdapter");
    expect(a.name).toBe("github");
    expect(a.kind).toBe("enrichment");

    // v2: supportedAuth is typed
    expect(a.supportedAuth).toContain("bearer");
    expect(a.supportedAuth).toContain("none");

    // v2: scopeSchema
    expect(a.scopeSchema.description).toBe(
      "GitHub repository in owner/repo format",
    );

    // v1 compat: supportsAuth still present
    expect(Array.isArray(a.supportsAuth)).toBe(true);

    expect(a.supportsCursor).toBe(true);
  });

  test("GerritAdapter satisfies the contract", () => {
    const a = new GerritAdapter();
    assertAdapterShape(a, "GerritAdapter");
    expect(a.name).toBe("gerrit");
    expect(a.kind).toBe("enrichment");
    expect(Array.isArray(a.supportedAuth)).toBe(true);
    expect(a.supportedAuth).toContain("none");
    expect(a.supportsCursor).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// supportedAuth — typed values
// ---------------------------------------------------------------------------

describe("supportedAuth — valid AuthCredential kinds", () => {
  const VALID_KINDS = [
    "none",
    "bearer",
    "basic",
    "service_account",
    "oauth2",
  ] as const;

  test("GitHubAdapter.supportedAuth values are all valid kinds", () => {
    const a = new GitHubAdapter();
    for (const kind of a.supportedAuth) {
      expect(VALID_KINDS).toContain(kind as (typeof VALID_KINDS)[number]);
    }
  });

  test("GerritAdapter.supportedAuth values are all valid kinds", () => {
    const a = new GerritAdapter();
    for (const kind of a.supportedAuth) {
      expect(VALID_KINDS).toContain(kind as (typeof VALID_KINDS)[number]);
    }
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

// ---------------------------------------------------------------------------
// JSON round-trip — supportedAuth and scopeSchema.description are serializable
// ---------------------------------------------------------------------------

describe("JSON round-trip — adapter metadata", () => {
  test("GitHubAdapter supportedAuth and scopeSchema.description survive JSON round-trip", () => {
    const adapter = new GitHubAdapter();
    const roundTripped = JSON.parse(
      JSON.stringify({
        supportedAuth: adapter.supportedAuth,
        scopeSchema: { description: adapter.scopeSchema.description },
      }),
    );
    expect(roundTripped.supportedAuth).toEqual(adapter.supportedAuth);
    expect(roundTripped.scopeSchema.description).toBe(
      adapter.scopeSchema.description,
    );
  });

  test("GerritAdapter supportedAuth and scopeSchema.description survive JSON round-trip", () => {
    const adapter = new GerritAdapter();
    const roundTripped = JSON.parse(
      JSON.stringify({
        supportedAuth: adapter.supportedAuth,
        scopeSchema: { description: adapter.scopeSchema.description },
      }),
    );
    expect(roundTripped.supportedAuth).toEqual(adapter.supportedAuth);
    expect(roundTripped.scopeSchema.description).toBe(
      adapter.scopeSchema.description,
    );
  });
});
