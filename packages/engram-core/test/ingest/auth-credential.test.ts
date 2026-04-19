/**
 * auth-credential.test.ts — Construction and JSON round-trip tests for AuthCredential variants.
 *
 * Note: the `oauth2.refresh` callback is a function and will be lost during
 * JSON serialization. This is documented in the AuthCredential type JSDoc.
 * JSON round-trip for the oauth2 variant only covers the serializable fields
 * (token, scopes, kind).
 */

import { describe, expect, test } from "bun:test";
import type { AuthCredential } from "../../src/ingest/adapter.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// ---------------------------------------------------------------------------
// Per-kind construction
// ---------------------------------------------------------------------------

describe("AuthCredential — construction", () => {
  test("none", () => {
    const cred: AuthCredential = { kind: "none" };
    expect(cred.kind).toBe("none");
  });

  test("bearer", () => {
    const cred: AuthCredential = { kind: "bearer", token: "ghp_abc123" };
    expect(cred.kind).toBe("bearer");
    if (cred.kind === "bearer") {
      expect(cred.token).toBe("ghp_abc123");
    }
  });

  test("basic", () => {
    const cred: AuthCredential = {
      kind: "basic",
      username: "admin",
      secret: "s3cr3t",
    };
    expect(cred.kind).toBe("basic");
    if (cred.kind === "basic") {
      expect(cred.username).toBe("admin");
      expect(cred.secret).toBe("s3cr3t");
    }
  });

  test("service_account", () => {
    const cred: AuthCredential = {
      kind: "service_account",
      keyJson: '{"type":"service_account"}',
    };
    expect(cred.kind).toBe("service_account");
    if (cred.kind === "service_account") {
      expect(cred.keyJson).toContain("service_account");
    }
  });

  test("oauth2 without refresh", () => {
    const cred: AuthCredential = {
      kind: "oauth2",
      token: "ya29.xyz",
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
    };
    expect(cred.kind).toBe("oauth2");
    if (cred.kind === "oauth2") {
      expect(cred.token).toBe("ya29.xyz");
      expect(cred.scopes).toHaveLength(1);
      expect(cred.refresh).toBeUndefined();
    }
  });

  test("oauth2 with refresh callback", () => {
    const refresh = async () => "new-token";
    const cred: AuthCredential = {
      kind: "oauth2",
      token: "ya29.xyz",
      scopes: ["openid"],
      refresh,
    };
    expect(cred.kind).toBe("oauth2");
    if (cred.kind === "oauth2") {
      expect(typeof cred.refresh).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// JSON round-trip (serializable variants only)
// ---------------------------------------------------------------------------

describe("AuthCredential — JSON round-trip", () => {
  test("none round-trips", () => {
    const cred: AuthCredential = { kind: "none" };
    expect(roundTrip(cred)).toEqual(cred);
  });

  test("bearer round-trips", () => {
    const cred: AuthCredential = { kind: "bearer", token: "tok_abc" };
    expect(roundTrip(cred)).toEqual(cred);
  });

  test("basic round-trips", () => {
    const cred: AuthCredential = {
      kind: "basic",
      username: "user",
      secret: "pass",
    };
    expect(roundTrip(cred)).toEqual(cred);
  });

  test("service_account round-trips", () => {
    const cred: AuthCredential = {
      kind: "service_account",
      keyJson: '{"project_id":"my-project"}',
    };
    expect(roundTrip(cred)).toEqual(cred);
  });

  test("oauth2 without refresh round-trips (refresh omitted as expected)", () => {
    const cred: AuthCredential = {
      kind: "oauth2",
      token: "ya29.xyz",
      scopes: ["openid", "email"],
    };
    const rt = roundTrip(cred);
    // JSON.parse(JSON.stringify) drops undefined fields — shape should match
    expect(rt.kind).toBe("oauth2");
    if (rt.kind === "oauth2") {
      expect(rt.token).toBe("ya29.xyz");
      expect(rt.scopes).toEqual(["openid", "email"]);
      // refresh was not defined, so it is still absent after round-trip
      expect(rt.refresh).toBeUndefined();
    }
  });

  test("oauth2 with refresh: callback is lost in JSON round-trip (documented limitation)", () => {
    const cred: AuthCredential = {
      kind: "oauth2",
      token: "ya29.xyz",
      scopes: ["openid"],
      refresh: async () => "new-token",
    };
    const rt = roundTrip(cred);
    expect(rt.kind).toBe("oauth2");
    if (rt.kind === "oauth2") {
      expect(rt.token).toBe("ya29.xyz");
      // Function is not JSON-serializable — refresh is lost
      expect(rt.refresh).toBeUndefined();
    }
  });
});
