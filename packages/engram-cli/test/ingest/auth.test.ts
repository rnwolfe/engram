/**
 * auth.test.ts — Unit tests for buildAuthCredential().
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildAuthCredential } from "../../src/ingest/auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearEnv(keys: string[]): void {
  for (const k of keys) {
    delete process.env[k];
  }
}

// ---------------------------------------------------------------------------
// bearer
// ---------------------------------------------------------------------------

describe("buildAuthCredential — bearer", () => {
  afterEach(() => clearEnv(["GITHUB_TOKEN", "GERRIT_TOKEN"]));

  it("returns bearer when --token flag provided", () => {
    const cred = buildAuthCredential({ token: "ghp_abc123" }, "github", [
      "bearer",
      "none",
    ]);
    expect(cred).toEqual({ kind: "bearer", token: "ghp_abc123" });
  });

  it("returns bearer from env var when flag absent", () => {
    process.env.GITHUB_TOKEN = "ghp_from_env";
    const cred = buildAuthCredential({}, "github", ["bearer", "none"]);
    expect(cred).toEqual({ kind: "bearer", token: "ghp_from_env" });
  });

  it("flag takes precedence over env var", () => {
    process.env.GITHUB_TOKEN = "ghp_env";
    const cred = buildAuthCredential({ token: "ghp_flag" }, "github", [
      "bearer",
      "none",
    ]);
    expect(cred).toEqual({ kind: "bearer", token: "ghp_flag" });
  });
});

// ---------------------------------------------------------------------------
// none
// ---------------------------------------------------------------------------

describe("buildAuthCredential — none", () => {
  it("returns none when adapter supports it and no creds provided", () => {
    const cred = buildAuthCredential({}, "github", ["bearer", "none"]);
    expect(cred).toEqual({ kind: "none" });
  });

  it("returns none for none-only adapter", () => {
    const cred = buildAuthCredential({}, "local", ["none"]);
    expect(cred).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// basic
// ---------------------------------------------------------------------------

describe("buildAuthCredential — basic", () => {
  afterEach(() => clearEnv(["GERRIT_USERNAME", "GERRIT_PASSWORD"]));

  it("returns basic when --username and --password provided", () => {
    const cred = buildAuthCredential(
      { username: "alice", password: "s3cr3t" },
      "gerrit",
      ["basic", "none"],
    );
    expect(cred).toEqual({
      kind: "basic",
      username: "alice",
      secret: "s3cr3t",
    });
  });

  it("returns basic from env vars when flags absent", () => {
    process.env.GERRIT_USERNAME = "bob";
    process.env.GERRIT_PASSWORD = "pass123";
    const cred = buildAuthCredential({}, "gerrit", ["basic", "none"]);
    expect(cred).toEqual({ kind: "basic", username: "bob", secret: "pass123" });
  });

  it("falls through to none when only username provided without password", () => {
    const cred = buildAuthCredential({ username: "alice" }, "gerrit", [
      "basic",
      "none",
    ]);
    // Only username — can't build basic, so falls to none
    expect(cred).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// service_account
// ---------------------------------------------------------------------------

describe("buildAuthCredential — service_account", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `sa-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, JSON.stringify({ type: "service_account" }));
  });

  afterEach(() => {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
    clearEnv(["GCLOUD_SERVICE_ACCOUNT_JSON"]);
  });

  it("reads file from --service-account flag", () => {
    const cred = buildAuthCredential({ serviceAccount: tmpFile }, "gcloud", [
      "service_account",
    ]);
    expect(cred.kind).toBe("service_account");
    if (cred.kind === "service_account") {
      expect(JSON.parse(cred.keyJson)).toEqual({ type: "service_account" });
    }
  });

  it("throws when service account file not found", () => {
    expect(() =>
      buildAuthCredential(
        { serviceAccount: "/nonexistent/sa.json" },
        "gcloud",
        ["service_account"],
      ),
    ).toThrow(/Failed to read service account file/);
  });
});

// ---------------------------------------------------------------------------
// oauth2
// ---------------------------------------------------------------------------

describe("buildAuthCredential — oauth2", () => {
  afterEach(() => clearEnv(["GDOCS_OAUTH_TOKEN", "GDOCS_OAUTH_SCOPES"]));

  it("returns oauth2 with token and scopes from flags", () => {
    const cred = buildAuthCredential(
      { oauthToken: "ya29.token", oauthScopes: "read,write" },
      "gdocs",
      ["oauth2"],
    );
    expect(cred).toMatchObject({
      kind: "oauth2",
      token: "ya29.token",
      scopes: ["read", "write"],
    });
  });

  it("returns oauth2 with empty scopes when scopes flag absent", () => {
    const cred = buildAuthCredential({ oauthToken: "ya29.token" }, "gdocs", [
      "oauth2",
    ]);
    expect(cred).toMatchObject({
      kind: "oauth2",
      token: "ya29.token",
      scopes: [],
    });
  });

  it("reads oauth2 creds from env when flags absent", () => {
    process.env.GDOCS_OAUTH_TOKEN = "ya29.env";
    process.env.GDOCS_OAUTH_SCOPES = "scope1,scope2";
    const cred = buildAuthCredential({}, "gdocs", ["oauth2", "none"]);
    expect(cred).toMatchObject({
      kind: "oauth2",
      token: "ya29.env",
      scopes: ["scope1", "scope2"],
    });
  });
});

// ---------------------------------------------------------------------------
// mismatch / error
// ---------------------------------------------------------------------------

describe("buildAuthCredential — mismatch", () => {
  it("throws when adapter does not support any provided kind", () => {
    // Adapter only supports service_account, but user gave --token
    expect(() =>
      buildAuthCredential({ token: "tok" }, "myadapter", ["service_account"]),
    ).toThrow(/adapter 'myadapter' supports auth: service_account/);
  });

  it("throws listing all supported kinds", () => {
    expect(() =>
      buildAuthCredential({}, "myadapter", ["basic", "service_account"]),
    ).toThrow(/basic, service_account/);
  });
});
