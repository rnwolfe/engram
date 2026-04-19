/**
 * assert-auth-kind.test.ts — Unit tests for the assertAuthKind helper.
 *
 * assertAuthKind validates that opts.auth.kind is in adapter.supportedAuth.
 * It is a no-op when auth was synthesised by the compat shim.
 */

import { describe, expect, test } from "bun:test";
import {
  applyCompatShim,
  assertAuthKind,
  EnrichmentAdapterError,
} from "../../src/ingest/adapter.js";

// Minimal adapter stub for these tests
const githubStub = {
  name: "github",
  supportedAuth: ["bearer", "none"] as const,
};

const gerritStub = {
  name: "gerrit",
  supportedAuth: ["basic", "none"] as const,
};

// ---------------------------------------------------------------------------
// Matching kind — should NOT throw
// ---------------------------------------------------------------------------

describe("assertAuthKind — matching kind does not throw", () => {
  test("bearer auth matches github supportedAuth", () => {
    expect(() =>
      assertAuthKind(githubStub, { auth: { kind: "bearer", token: "tok" } }),
    ).not.toThrow();
  });

  test("none auth matches github supportedAuth", () => {
    expect(() =>
      assertAuthKind(githubStub, { auth: { kind: "none" } }),
    ).not.toThrow();
  });

  test("basic auth matches gerrit supportedAuth", () => {
    expect(() =>
      assertAuthKind(gerritStub, {
        auth: { kind: "basic", username: "user", secret: "pass" },
      }),
    ).not.toThrow();
  });

  test("none auth matches gerrit supportedAuth", () => {
    expect(() =>
      assertAuthKind(gerritStub, { auth: { kind: "none" } }),
    ).not.toThrow();
  });

  test("missing auth defaults to 'none' and matches when 'none' is supported", () => {
    expect(() => assertAuthKind(githubStub, {})).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Mismatched kind — should throw EnrichmentAdapterError with code: 'auth_failure'
// ---------------------------------------------------------------------------

describe("assertAuthKind — mismatched kind throws auth_failure", () => {
  test("basic auth against github (supports bearer, none) throws", () => {
    let caught: unknown;
    try {
      assertAuthKind(githubStub, {
        auth: { kind: "basic", username: "u", secret: "s" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnrichmentAdapterError);
    expect((caught as EnrichmentAdapterError).code).toBe("auth_failure");
    expect((caught as EnrichmentAdapterError).message).toContain("basic");
    expect((caught as EnrichmentAdapterError).message).toContain("github");
  });

  test("bearer auth against gerrit (supports basic, none) throws", () => {
    let caught: unknown;
    try {
      assertAuthKind(gerritStub, { auth: { kind: "bearer", token: "tok" } });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnrichmentAdapterError);
    expect((caught as EnrichmentAdapterError).code).toBe("auth_failure");
    expect((caught as EnrichmentAdapterError).message).toContain("bearer");
    expect((caught as EnrichmentAdapterError).message).toContain("gerrit");
  });

  test("service_account auth against github throws", () => {
    let caught: unknown;
    try {
      assertAuthKind(githubStub, {
        auth: { kind: "service_account", keyJson: "{}" },
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnrichmentAdapterError);
    expect((caught as EnrichmentAdapterError).code).toBe("auth_failure");
  });

  test("error message includes supported kinds", () => {
    let caught: unknown;
    try {
      assertAuthKind(githubStub, {
        auth: { kind: "basic", username: "u", secret: "s" },
      });
    } catch (e) {
      caught = e;
    }
    const msg = (caught as EnrichmentAdapterError).message;
    expect(msg).toContain("bearer");
    expect(msg).toContain("none");
  });
});

// ---------------------------------------------------------------------------
// Compat shim — shimmed auth bypasses assertAuthKind
// ---------------------------------------------------------------------------

describe("assertAuthKind — compat shim auth is not validated", () => {
  test("shimmed bearer auth on gerrit (supports basic, none) does NOT throw", () => {
    // applyCompatShim maps token→bearer and marks it as shimmed
    const opts = applyCompatShim({ token: "some-token" });
    // gerrit only supports basic and none, but shimmed auth is skipped
    expect(() => assertAuthKind(gerritStub, opts)).not.toThrow();
  });

  test("none kind in supportedAuth matches { kind: 'none' } credential", () => {
    const adapterWithNone = {
      name: "test",
      supportedAuth: ["none"] as const,
    };
    expect(() =>
      assertAuthKind(adapterWithNone, { auth: { kind: "none" } }),
    ).not.toThrow();
  });

  test("none kind in supportedAuth matches missing auth (defaults to none)", () => {
    const adapterWithNone = {
      name: "test",
      supportedAuth: ["none"] as const,
    };
    expect(() => assertAuthKind(adapterWithNone, {})).not.toThrow();
  });

  test("none NOT in supportedAuth with missing auth throws", () => {
    const strictAdapter = {
      name: "strict",
      supportedAuth: ["bearer"] as const,
    };
    // No auth provided → defaults to 'none' → not in supportedAuth → throws
    let caught: unknown;
    try {
      assertAuthKind(strictAdapter, {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EnrichmentAdapterError);
    expect((caught as EnrichmentAdapterError).code).toBe("auth_failure");
  });
});
