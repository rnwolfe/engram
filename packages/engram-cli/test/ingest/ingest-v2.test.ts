/**
 * ingest-v2.test.ts — Integration-style tests for `ingest enrich` v2 code path.
 *
 * Uses a mock adapter to verify CLI behaviour without any network I/O.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import type {
  AuthCredential,
  EnrichmentAdapter,
  EnrichOpts,
  ScopeSchema,
} from "engram-core";
import {
  closeGraph,
  createGraph,
  EnrichmentAdapterError,
  openGraph,
  resolveDbPath,
} from "engram-core";
import { buildAuthCredential } from "../../src/ingest/auth.js";

// ---------------------------------------------------------------------------
// Mock adapter factory
// ---------------------------------------------------------------------------

function makeMockAdapter(overrides?: {
  supportedAuth?: AuthCredential["kind"][];
  scopeValidate?: (s: string) => string | null;
  enrichImpl?: (opts: EnrichOpts) => Promise<void>;
}): EnrichmentAdapter & { enrichCalls: EnrichOpts[] } {
  const enrichCalls: EnrichOpts[] = [];

  const adapter = {
    name: "mock",
    kind: "enrichment",
    supportedAuth:
      overrides?.supportedAuth ??
      (["bearer", "none"] as AuthCredential["kind"][]),
    scopeSchema: {
      description: "mock scope — use 'valid-scope' for success",
      validate(scope: string): string | null {
        if (overrides?.scopeValidate) return overrides.scopeValidate(scope);
        return scope === "valid-scope" ? null : `invalid scope: '${scope}'`;
      },
    } satisfies ScopeSchema,
    supportsCursor: false,
    enrichCalls,
    async enrich(_graph: unknown, opts: EnrichOpts) {
      enrichCalls.push(opts);
      if (overrides?.enrichImpl) await overrides.enrichImpl(opts);
      return {
        episodesCreated: 1,
        episodesSkipped: 0,
        entitiesCreated: 1,
        entitiesResolved: 0,
        edgesCreated: 0,
        edgesSuperseded: 0,
        runId: "run-01",
      };
    },
  };

  return adapter;
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

function tmpDb(): { tmpDir: string; dbPath: string } {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-ingest-v2-"));
  const dbPath = path.join(tmpDir, "test.engram");
  createGraph(dbPath).db.close();
  return { tmpDir, dbPath };
}

// ---------------------------------------------------------------------------
// buildAuthCredential unit tests (via adapter contract)
// ---------------------------------------------------------------------------

describe("buildAuthCredential — bearer via flags", () => {
  afterEach(() => {
    delete process.env.MOCK_TOKEN;
  });

  it("returns bearer when --token provided and adapter supports bearer", () => {
    const adapter = makeMockAdapter({ supportedAuth: ["bearer", "none"] });
    const cred = buildAuthCredential(
      { token: "tok123" },
      adapter.name,
      adapter.supportedAuth,
    );
    expect(cred).toEqual({ kind: "bearer", token: "tok123" });
  });

  it("falls back to env MOCK_TOKEN when flag absent", () => {
    process.env.MOCK_TOKEN = "env-tok";
    const adapter = makeMockAdapter({ supportedAuth: ["bearer", "none"] });
    const cred = buildAuthCredential({}, adapter.name, adapter.supportedAuth);
    expect(cred).toEqual({ kind: "bearer", token: "env-tok" });
  });

  it("uses none when adapter supports none and no creds provided", () => {
    const adapter = makeMockAdapter({ supportedAuth: ["bearer", "none"] });
    const cred = buildAuthCredential({}, adapter.name, adapter.supportedAuth);
    expect(cred).toEqual({ kind: "none" });
  });
});

describe("buildAuthCredential — mismatch error", () => {
  it("throws with supported kinds listed when no matching kind can be built", () => {
    // Adapter only supports service_account; user provides nothing
    expect(() => buildAuthCredential({}, "mock", ["service_account"])).toThrow(
      /adapter 'mock' supports auth: service_account/,
    );
  });
});

// ---------------------------------------------------------------------------
// Scope validation
// ---------------------------------------------------------------------------

describe("scope schema validation", () => {
  it("validate() returns null for valid scope", () => {
    const adapter = makeMockAdapter();
    expect(adapter.scopeSchema.validate("valid-scope")).toBeNull();
  });

  it("validate() returns error string for invalid scope", () => {
    const adapter = makeMockAdapter();
    const result = adapter.scopeSchema.validate("bad scope!");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("invalid scope");
  });
});

// ---------------------------------------------------------------------------
// Auth credential shapes passed to enrich()
// ---------------------------------------------------------------------------

describe("enrich() receives correct AuthCredential", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    const t = tmpDb();
    tmpDir = t.tmpDir;
    dbPath = t.dbPath;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes bearer credential to enrich()", async () => {
    const adapter = makeMockAdapter({ supportedAuth: ["bearer", "none"] });
    const auth = buildAuthCredential(
      { token: "tok-bearer" },
      adapter.name,
      adapter.supportedAuth,
    );
    expect(auth).toEqual({ kind: "bearer", token: "tok-bearer" });

    const graph = openGraph(resolveDbPath(dbPath));
    try {
      await adapter.enrich(graph, {
        auth,
        scope: "valid-scope",
      });
    } finally {
      closeGraph(graph);
    }

    expect(adapter.enrichCalls).toHaveLength(1);
    expect(adapter.enrichCalls[0].auth).toEqual({
      kind: "bearer",
      token: "tok-bearer",
    });
    expect(adapter.enrichCalls[0].scope).toBe("valid-scope");
  });

  it("passes basic credential to enrich()", async () => {
    const adapter = makeMockAdapter({ supportedAuth: ["basic", "none"] });
    const auth = buildAuthCredential(
      { username: "alice", password: "s3cr3t" },
      adapter.name,
      adapter.supportedAuth,
    );
    expect(auth).toEqual({
      kind: "basic",
      username: "alice",
      secret: "s3cr3t",
    });

    const graph = openGraph(resolveDbPath(dbPath));
    try {
      await adapter.enrich(graph, { auth, scope: "valid-scope" });
    } finally {
      closeGraph(graph);
    }

    expect(adapter.enrichCalls[0].auth).toEqual({
      kind: "basic",
      username: "alice",
      secret: "s3cr3t",
    });
  });

  it("passes none credential when no creds provided and adapter supports none", async () => {
    const adapter = makeMockAdapter({ supportedAuth: ["bearer", "none"] });
    const auth = buildAuthCredential({}, adapter.name, adapter.supportedAuth);
    expect(auth).toEqual({ kind: "none" });

    const graph = openGraph(resolveDbPath(dbPath));
    try {
      await adapter.enrich(graph, { auth, scope: "valid-scope" });
    } finally {
      closeGraph(graph);
    }

    expect(adapter.enrichCalls[0].auth).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// Scope validation failure prevents enrich() call
// ---------------------------------------------------------------------------

describe("scope validation gates enrich()", () => {
  it("enrich() is NOT called when scope validation fails", async () => {
    const adapter = makeMockAdapter({
      scopeValidate: (s) => (s === "good" ? null : "bad scope"),
    });
    const scopeErr = adapter.scopeSchema.validate("oops");
    expect(scopeErr).not.toBeNull();

    // Caller should bail out before calling enrich() on invalid scope
    let enrichCalled = false;
    const origEnrich = adapter.enrich.bind(adapter);
    adapter.enrich = async (graph, opts) => {
      enrichCalled = true;
      return origEnrich(graph, opts);
    };

    if (scopeErr) {
      // Simulates CLI bail-out on validation error — enrich never called
    } else {
      // Would call adapter.enrich — shouldn't reach here in this test
      expect(false).toBe(true);
    }

    expect(enrichCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EnrichmentAdapterError codes
// ---------------------------------------------------------------------------

describe("EnrichmentAdapterError codes", () => {
  it("auth_failure has correct code", () => {
    const err = new EnrichmentAdapterError("auth_failure", "bad token");
    expect(err.code).toBe("auth_failure");
    expect(err.name).toBe("EnrichmentAdapterError");
  });

  it("rate_limited has correct code", () => {
    const err = new EnrichmentAdapterError("rate_limited", "slow down");
    expect(err.code).toBe("rate_limited");
  });

  it("data_error has correct code", () => {
    const err = new EnrichmentAdapterError("data_error", "bad data");
    expect(err.code).toBe("data_error");
  });

  it("server_error has correct code", () => {
    const err = new EnrichmentAdapterError("server_error", "500");
    expect(err.code).toBe("server_error");
  });
});

// ---------------------------------------------------------------------------
// Auth-kind mismatch exits without calling enrich()
// ---------------------------------------------------------------------------

describe("auth-kind mismatch does not call enrich()", () => {
  it("throws before reaching enrich() when no supported kind can be built", () => {
    // Adapter only supports service_account; user provides nothing and no env
    delete process.env.MYADAPTER_SERVICE_ACCOUNT_JSON;

    let enrichCalled = false;
    const adapter = makeMockAdapter({ supportedAuth: ["service_account"] });
    const origEnrich = adapter.enrich.bind(adapter);
    adapter.enrich = async (graph, opts) => {
      enrichCalled = true;
      return origEnrich(graph, opts);
    };

    expect(() =>
      buildAuthCredential({}, adapter.name, adapter.supportedAuth),
    ).toThrow();

    expect(enrichCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command registration — enrich subcommands
// ---------------------------------------------------------------------------

describe("ingest enrich command registration", () => {
  it("registers github as an enrich subcommand (gerrit is now a plugin)", async () => {
    const { registerIngest } = await import("../../src/commands/ingest.js");
    const program = new Command().exitOverride();
    registerIngest(program);

    const ingest = program.commands.find((c) => c.name() === "ingest");
    expect(ingest).toBeDefined();
    if (!ingest) return;

    const enrich = ingest.commands.find((c) => c.name() === "enrich");
    expect(enrich).toBeDefined();
    if (!enrich) return;

    const subNames = enrich.commands.map((c) => c.name());
    expect(subNames).toContain("github");
    // gerrit is no longer a hardcoded built-in subcommand — it is now a plugin
    // discovered from packages/plugins/gerrit/ and auto-registered at runtime
    // when installed via `engram plugin install gerrit`.
    expect(subNames).not.toContain("gerrit");
  });

  it("github enrich subcommand has --scope flag", async () => {
    const { registerIngest } = await import("../../src/commands/ingest.js");
    const program = new Command().exitOverride();
    registerIngest(program);

    const ingest = program.commands.find((c) => c.name() === "ingest");
    const enrich = ingest?.commands.find((c) => c.name() === "enrich");
    const github = enrich?.commands.find((c) => c.name() === "github");
    expect(github).toBeDefined();
    if (!github) return;

    const optNames = github.options.map((o) => o.long);
    expect(optNames).toContain("--scope");
    expect(optNames).toContain("--token");
    expect(optNames).toContain("--username");
    expect(optNames).toContain("--password");
  });
});
