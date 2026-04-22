/**
 * google-workspace-discovery.test.ts — Tests for Drive discovery helpers.
 *
 * All tests use injected fetch functions — no real Google API calls.
 * Integration tests use in-memory SQLite and call verifyGraph().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph, verifyGraph } from "../../src/index.js";
import { GoogleWorkspaceAdapter } from "../../src/ingest/adapters/google-workspace.js";
import {
  computeDiscoveryCursor,
  enumerateFolderDocs,
  enumerateQueryDocs,
  parseFolderScope,
} from "../../src/ingest/adapters/google-workspace-discovery.js";
import type { DocsDocument } from "../../src/ingest/adapters/google-workspace-helpers.js";
import { validateScope } from "../../src/ingest/adapters/google-workspace-helpers.js";
import { readIsoCursor } from "../../src/ingest/cursor.js";
import { INGESTION_SOURCE_TYPES } from "../../src/vocab/index.js";

// ---------------------------------------------------------------------------
// Test fixtures & helpers
// ---------------------------------------------------------------------------

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

const TOKEN = "test-token";

/**
 * Build a minimal mock fetch that handles Drive files.list and Docs API calls.
 *
 * `driveFiles` maps folderId → list of { id, modifiedTime } objects for docs.
 * `driveFolders` maps folderId → list of subfolder IDs.
 * `docs` maps docId → DocsDocument stub.
 * `driveFileMeta` maps docId → drive metadata stub.
 */
interface DiscoveryFetchConfig {
  driveFiles?: Record<string, Array<{ id: string; modifiedTime?: string }>>;
  driveQueryResults?: Array<{ id: string; modifiedTime?: string }>;
  driveFolders?: Record<string, string[]>;
  docs?: Record<string, DocsDocument>;
  driveFileMeta?: Record<string, object>;
  statusOverrides?: Record<string, number>;
}

function makeDiscoveryFetch(config: DiscoveryFetchConfig): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Drive files.list endpoint
    if (url.includes("www.googleapis.com/drive/v3/files")) {
      const parsed = new URL(url);
      const q = parsed.searchParams.get("q") ?? "";
      const fields = parsed.searchParams.get("fields") ?? "";

      // Is this looking for subfolders?
      if (q.includes("mimeType='application/vnd.google-apps.folder'")) {
        // Extract the parent folder ID from the query
        const match = q.match(/'([^']+)' in parents/);
        const parentId = match?.[1] ?? "";
        const subfolderIds = config.driveFolders?.[parentId] ?? [];
        const files = subfolderIds.map((id) => ({ id }));
        return new Response(JSON.stringify({ files }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Is this looking for docs?
      if (q.includes("mimeType='application/vnd.google-apps.document'")) {
        let files: Array<{ id: string; modifiedTime?: string }> = [];

        if (q.includes("in parents")) {
          // folder-based query
          const match = q.match(/'([^']+)' in parents/);
          const parentId = match?.[1] ?? "";
          files = config.driveFiles?.[parentId] ?? [];
        } else {
          // query-based (no "in parents")
          files = config.driveQueryResults ?? [];
        }

        // Only return id if fields don't include modifiedTime
        const responseFiles = fields.includes("modifiedTime")
          ? files
          : files.map((f) => ({ id: f.id }));

        return new Response(JSON.stringify({ files: responseFiles }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Drive metadata for a specific file (fetchDriveMeta)
      const fileMatch = url.match(/\/drive\/v3\/files\/([^?]+)/);
      if (fileMatch && !url.includes("drive/v3/files?")) {
        const docId = fileMatch[1];
        const meta = config.driveFileMeta?.[docId];
        if (meta) {
          return new Response(JSON.stringify(meta), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Drive metadata for specific doc — must be before docs API to avoid match collision
    if (url.includes("www.googleapis.com/drive/v3/files/")) {
      const fileMatch = url.match(/\/files\/([^?]+)/);
      const docId = fileMatch?.[1] ?? "";
      const meta = config.driveFileMeta?.[docId];
      if (meta) {
        return new Response(JSON.stringify(meta), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Docs API
    if (url.includes("docs.googleapis.com")) {
      const match = url.match(/\/documents\/([^?]+)/);
      const docId = match?.[1] ?? "";
      const doc = config.docs?.[docId];
      if (doc) {
        const status = config.statusOverrides?.[docId] ?? 200;
        return new Response(JSON.stringify(doc), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "unexpected url" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function makeDoc(
  docId: string,
  revisionId = "rev1",
  title = "Test",
): DocsDocument {
  return { documentId: docId, title, revisionId, body: { content: [] } };
}

function makeDriveMeta(ownerEmail = "owner@example.com") {
  return {
    modifiedTime: "2024-06-01T12:00:00Z",
    owners: [{ emailAddress: ownerEmail, displayName: "Owner" }],
    lastModifyingUser: { emailAddress: ownerEmail, displayName: "Owner" },
    permissions: [],
  };
}

// ---------------------------------------------------------------------------
// parseFolderScope — unit tests
// ---------------------------------------------------------------------------

describe("parseFolderScope", () => {
  test("parses plain folder:<id>", () => {
    expect(parseFolderScope("folder:abc123")).toEqual({
      folderId: "abc123",
      recursive: false,
    });
  });

  test("parses folder:<id>?recursive=true", () => {
    expect(parseFolderScope("folder:abc123?recursive=true")).toEqual({
      folderId: "abc123",
      recursive: true,
    });
  });

  test("parses folder:<id>?recursive=false as non-recursive", () => {
    expect(parseFolderScope("folder:abc123?recursive=false")).toEqual({
      folderId: "abc123",
      recursive: false,
    });
  });

  test("throws on empty folder ID", () => {
    expect(() => parseFolderScope("folder:")).toThrow(
      "folder scope must include a folder ID",
    );
  });

  test("throws on unknown query param", () => {
    expect(() => parseFolderScope("folder:abc?foo=bar")).toThrow(
      "Unknown query parameter in folder scope: 'foo'",
    );
  });

  test("throws on invalid recursive value", () => {
    expect(() => parseFolderScope("folder:abc?recursive=yes")).toThrow(
      "Invalid value for recursive",
    );
  });

  test("throws on folder ID containing single quote (injection guard)", () => {
    expect(() => parseFolderScope("folder:abc'def")).toThrow(
      "invalid folder ID",
    );
  });

  test("throws on folder ID with query string containing single quote", () => {
    expect(() => parseFolderScope("folder:abc'def?recursive=true")).toThrow(
      "invalid folder ID",
    );
  });
});

// ---------------------------------------------------------------------------
// validateScope — unit tests (all patterns)
// ---------------------------------------------------------------------------

describe("validateScope", () => {
  test("accepts doc:<id>", () => {
    expect(() => validateScope("doc:abc123")).not.toThrow();
  });

  test("accepts docs:<id>,<id>", () => {
    expect(() => validateScope("docs:id1,id2")).not.toThrow();
  });

  test("accepts folder:<id>", () => {
    expect(() => validateScope("folder:folderXYZ")).not.toThrow();
  });

  test("accepts folder:<id>?recursive=true", () => {
    expect(() =>
      validateScope("folder:folderXYZ?recursive=true"),
    ).not.toThrow();
  });

  test("accepts folder:<id>?recursive=false", () => {
    expect(() =>
      validateScope("folder:folderXYZ?recursive=false"),
    ).not.toThrow();
  });

  test("accepts query:<non-empty>", () => {
    expect(() => validateScope("query:name contains 'spec'")).not.toThrow();
  });

  test("rejects doc: (empty id)", () => {
    expect(() => validateScope("doc:")).toThrow();
  });

  test("rejects docs: (empty list)", () => {
    expect(() => validateScope("docs:")).toThrow();
  });

  test("rejects folder: (empty id)", () => {
    expect(() => validateScope("folder:")).toThrow();
  });

  test("rejects folder:<id>?foo=bar (unknown param)", () => {
    expect(() => validateScope("folder:abc?foo=bar")).toThrow(
      "Unknown query parameter",
    );
  });

  test("rejects query: (empty query)", () => {
    expect(() => validateScope("query:")).toThrow();
  });

  test("rejects unknown prefix", () => {
    expect(() => validateScope("drive:abc")).toThrow(
      "Unsupported scope format",
    );
  });
});

// ---------------------------------------------------------------------------
// enumerateFolderDocs — unit tests
// ---------------------------------------------------------------------------

describe("enumerateFolderDocs", () => {
  test("returns docs from a flat folder", async () => {
    const fetchFn = makeDiscoveryFetch({
      driveFiles: {
        folder1: [
          { id: "doc1", modifiedTime: "2024-01-01T00:00:00Z" },
          { id: "doc2", modifiedTime: "2024-02-01T00:00:00Z" },
        ],
      },
    });

    const docs = await enumerateFolderDocs(
      fetchFn,
      TOKEN,
      "folder1",
      false,
      null,
    );
    expect(docs.map((d) => d.id)).toEqual(["doc1", "doc2"]);
  });

  test("returns empty array for empty folder", async () => {
    const fetchFn = makeDiscoveryFetch({
      driveFiles: { folder1: [] },
    });

    const docs = await enumerateFolderDocs(
      fetchFn,
      TOKEN,
      "folder1",
      false,
      null,
    );
    expect(docs).toHaveLength(0);
  });

  test("recursive mode traverses subfolders via BFS", async () => {
    const fetchFn = makeDiscoveryFetch({
      driveFiles: {
        root: [{ id: "rootDoc", modifiedTime: "2024-01-01T00:00:00Z" }],
        child1: [{ id: "childDoc1", modifiedTime: "2024-01-02T00:00:00Z" }],
        child2: [{ id: "childDoc2", modifiedTime: "2024-01-03T00:00:00Z" }],
      },
      driveFolders: {
        root: ["child1", "child2"],
        child1: [],
        child2: [],
      },
    });

    const docs = await enumerateFolderDocs(fetchFn, TOKEN, "root", true, null);
    const ids = docs.map((d) => d.id).sort();
    expect(ids).toEqual(["childDoc1", "childDoc2", "rootDoc"]);
  });

  test("cycle guard prevents infinite loop on shared-drive shortcut loop", async () => {
    // child1 → child2 → child1 (cycle)
    const fetchFn = makeDiscoveryFetch({
      driveFiles: {
        root: [],
        child1: [{ id: "doc1", modifiedTime: "2024-01-01T00:00:00Z" }],
        child2: [],
      },
      driveFolders: {
        root: ["child1"],
        child1: ["child2"],
        child2: ["child1"], // creates a cycle
      },
    });

    // Should complete without hanging
    const docs = await enumerateFolderDocs(fetchFn, TOKEN, "root", true, null);
    expect(docs.map((d) => d.id)).toContain("doc1");
  });

  test("since cursor is included in query URL", async () => {
    const capturedUrls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      capturedUrls.push(url);
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await enumerateFolderDocs(
      fetchFn as typeof fetch,
      TOKEN,
      "folder1",
      false,
      "2024-06-01T00:00:00Z",
    );

    const driveUrl = capturedUrls.find((u) => u.includes("drive/v3/files"));
    expect(driveUrl).toBeDefined();
    // The 'q' param should contain modifiedTime filter
    const parsed = new URL(driveUrl as string);
    expect(parsed.searchParams.get("q")).toContain(
      "modifiedTime > '2024-06-01T00:00:00Z'",
    );
  });

  test("non-recursive mode does not enumerate subfolders", async () => {
    const capturedUrls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      capturedUrls.push(url);
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await enumerateFolderDocs(
      fetchFn as typeof fetch,
      TOKEN,
      "folder1",
      false,
      null,
    );

    // Should only have one Drive API call (for docs), not two (docs + subfolders)
    const driveCalls = capturedUrls.filter((u) => u.includes("drive/v3/files"));
    expect(driveCalls).toHaveLength(1);
    const q = new URL(driveCalls[0]).searchParams.get("q") ?? "";
    // The query should be for docs (not for subfolders)
    expect(q).toContain("mimeType='application/vnd.google-apps.document'");
    expect(q).not.toContain("application/vnd.google-apps.folder");
  });
});

// ---------------------------------------------------------------------------
// enumerateQueryDocs — unit tests
// ---------------------------------------------------------------------------

describe("enumerateQueryDocs", () => {
  test("returns docs matching the query", async () => {
    const fetchFn = makeDiscoveryFetch({
      driveQueryResults: [
        { id: "qDoc1", modifiedTime: "2024-03-01T00:00:00Z" },
        { id: "qDoc2", modifiedTime: "2024-03-02T00:00:00Z" },
      ],
    });

    const docs = await enumerateQueryDocs(
      fetchFn,
      TOKEN,
      "name contains 'spec'",
      null,
    );
    expect(docs.map((d) => d.id)).toEqual(["qDoc1", "qDoc2"]);
  });

  test("AND-injects mimeType constraint into query", async () => {
    const capturedUrls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      capturedUrls.push(url);
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await enumerateQueryDocs(
      fetchFn as typeof fetch,
      TOKEN,
      "name contains 'spec'",
      null,
    );

    const driveUrl = capturedUrls.find((u) => u.includes("drive/v3/files"));
    expect(driveUrl).toBeDefined();
    const q = new URL(driveUrl as string).searchParams.get("q") ?? "";
    // Must include mimeType AND-injection
    expect(q).toContain("mimeType='application/vnd.google-apps.document'");
    // Must include trashed=false
    expect(q).toContain("trashed=false");
    // Must include user query wrapped in parens
    expect(q).toContain("(name contains 'spec')");
  });

  test("since cursor appends modifiedTime filter", async () => {
    const capturedUrls: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      capturedUrls.push(url);
      return new Response(JSON.stringify({ files: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await enumerateQueryDocs(
      fetchFn as typeof fetch,
      TOKEN,
      "name contains 'spec'",
      "2024-05-01T00:00:00Z",
    );

    const driveUrl = capturedUrls.find((u) => u.includes("drive/v3/files"));
    const q = new URL(driveUrl as string).searchParams.get("q") ?? "";
    expect(q).toContain("modifiedTime > '2024-05-01T00:00:00Z'");
  });

  test("empty query throws data_error", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ files: [] }), { status: 200 });

    await expect(
      enumerateQueryDocs(fetchFn as typeof fetch, TOKEN, "", null),
    ).rejects.toMatchObject({ code: "data_error" });
  });

  test("400 response from Drive throws data_error", async () => {
    const fetchFn = async () =>
      new Response(
        JSON.stringify({ error: { code: 400, message: "Bad query" } }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );

    await expect(
      enumerateQueryDocs(
        fetchFn as typeof fetch,
        TOKEN,
        "bad query syntax !!!",
        null,
      ),
    ).rejects.toMatchObject({ code: "data_error" });
  });
});

// ---------------------------------------------------------------------------
// computeDiscoveryCursor — unit tests
// ---------------------------------------------------------------------------

describe("computeDiscoveryCursor", () => {
  test("returns null for empty list", () => {
    expect(computeDiscoveryCursor([])).toBeNull();
  });

  test("returns the single item's modifiedTime", () => {
    expect(
      computeDiscoveryCursor([
        { id: "x", modifiedTime: "2024-01-01T00:00:00Z" },
      ]),
    ).toBe("2024-01-01T00:00:00Z");
  });

  test("returns the maximum modifiedTime", () => {
    expect(
      computeDiscoveryCursor([
        { id: "a", modifiedTime: "2024-01-01T00:00:00Z" },
        { id: "b", modifiedTime: "2024-06-01T00:00:00Z" },
        { id: "c", modifiedTime: "2024-03-01T00:00:00Z" },
      ]),
    ).toBe("2024-06-01T00:00:00Z");
  });

  test("ignores items without modifiedTime", () => {
    expect(
      computeDiscoveryCursor([
        { id: "a" },
        { id: "b", modifiedTime: "2024-04-01T00:00:00Z" },
      ]),
    ).toBe("2024-04-01T00:00:00Z");
  });
});

// ---------------------------------------------------------------------------
// Integration: folder scope → adapter.enrich
// ---------------------------------------------------------------------------

describe("GoogleWorkspaceAdapter.enrich — folder scope integration", () => {
  test("folder: scope ingests all docs and verifyGraph passes", async () => {
    const DOC_A = "folderDocA";
    const DOC_B = "folderDocB";
    const FOLDER = "folderXYZ";

    const fetchFn = makeDiscoveryFetch({
      driveFiles: {
        [FOLDER]: [
          { id: DOC_A, modifiedTime: "2024-01-10T00:00:00Z" },
          { id: DOC_B, modifiedTime: "2024-01-11T00:00:00Z" },
        ],
      },
      docs: {
        [DOC_A]: makeDoc(DOC_A, "rev1", "Doc A"),
        [DOC_B]: makeDoc(DOC_B, "rev1", "Doc B"),
      },
      driveFileMeta: {
        [DOC_A]: makeDriveMeta("alice@example.com"),
        [DOC_B]: makeDriveMeta("bob@example.com"),
      },
    });

    const adapter = new GoogleWorkspaceAdapter(fetchFn);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: `folder:${FOLDER}`,
    });

    expect(result.episodesCreated).toBe(2);
    expect(result.entitiesCreated).toBeGreaterThanOrEqual(2);

    const verify = verifyGraph(graph);
    expect(verify.violations).toHaveLength(0);
  });

  test("folder: scope with recursive=true traverses subfolders", async () => {
    const DOC_ROOT = "docRoot";
    const DOC_CHILD = "docChild";
    const FOLDER = "rootFolder";
    const SUBFOLDER = "subFolder1";

    const fetchFn = makeDiscoveryFetch({
      driveFiles: {
        [FOLDER]: [{ id: DOC_ROOT, modifiedTime: "2024-01-10T00:00:00Z" }],
        [SUBFOLDER]: [{ id: DOC_CHILD, modifiedTime: "2024-01-11T00:00:00Z" }],
      },
      driveFolders: {
        [FOLDER]: [SUBFOLDER],
        [SUBFOLDER]: [],
      },
      docs: {
        [DOC_ROOT]: makeDoc(DOC_ROOT, "rev1", "Root Doc"),
        [DOC_CHILD]: makeDoc(DOC_CHILD, "rev1", "Child Doc"),
      },
      driveFileMeta: {
        [DOC_ROOT]: makeDriveMeta("alice@example.com"),
        [DOC_CHILD]: makeDriveMeta("alice@example.com"),
      },
    });

    const adapter = new GoogleWorkspaceAdapter(fetchFn);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: `folder:${FOLDER}?recursive=true`,
    });

    expect(result.episodesCreated).toBe(2);

    const verify = verifyGraph(graph);
    expect(verify.violations).toHaveLength(0);
  });

  test("second run uses cursor — only fetches docs modified after cursor", async () => {
    const DOC_OLD = "docOld";
    const DOC_NEW = "docNew";
    const FOLDER = "folderCursor";

    // First run: return both docs
    const fetchFn1 = makeDiscoveryFetch({
      driveFiles: {
        [FOLDER]: [
          { id: DOC_OLD, modifiedTime: "2024-01-01T00:00:00Z" },
          { id: DOC_NEW, modifiedTime: "2024-06-01T00:00:00Z" },
        ],
      },
      docs: {
        [DOC_OLD]: makeDoc(DOC_OLD, "rev1", "Old Doc"),
        [DOC_NEW]: makeDoc(DOC_NEW, "rev1", "New Doc"),
      },
      driveFileMeta: {
        [DOC_OLD]: makeDriveMeta(),
        [DOC_NEW]: makeDriveMeta(),
      },
    });

    const adapter1 = new GoogleWorkspaceAdapter(fetchFn1);
    const result1 = await adapter1.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: `folder:${FOLDER}`,
    });

    expect(result1.episodesCreated).toBe(2);

    // Assert cursor was stored after the first run
    const storedCursor = readIsoCursor(
      graph,
      INGESTION_SOURCE_TYPES.GOOGLE_WORKSPACE,
      `folder:${FOLDER}`,
    );
    expect(storedCursor).toBe("2024-06-01T00:00:00Z");

    // Second run: only DOC_NEW has a newer modifiedTime beyond the cursor
    // The cursor after run 1 is 2024-06-01T00:00:00Z
    // We simulate only the new-doc being returned (cursor filtered by Drive)
    const capturedQueries: string[] = [];
    const fetchFn2 = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("drive/v3/files") && url.includes("q=")) {
        const q = new URL(url).searchParams.get("q") ?? "";
        capturedQueries.push(q);
        // Return empty (no docs changed since cursor)
        return new Response(JSON.stringify({ files: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const adapter2 = new GoogleWorkspaceAdapter(fetchFn2 as typeof fetch);
    await adapter2.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: `folder:${FOLDER}`,
    });

    // The cursor should have been included in the query
    expect(capturedQueries.some((q) => q.includes("modifiedTime >"))).toBe(
      true,
    );
    expect(
      capturedQueries.some((q) => q.includes("2024-06-01T00:00:00Z")),
    ).toBe(true);
  });

  test("dry-run for folder scope skips content fetch and returns 0 episodes created", async () => {
    const DOC = "dryRunDoc";
    const FOLDER = "dryRunFolder";

    const contentFetchCalled: string[] = [];
    const fetchFn = async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("docs.googleapis.com")) {
        contentFetchCalled.push(url);
      }
      if (url.includes("drive/v3/files") && url.includes("q=")) {
        return new Response(
          JSON.stringify({
            files: [{ id: DOC, modifiedTime: "2024-01-01T00:00:00Z" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    const adapter = new GoogleWorkspaceAdapter(fetchFn as typeof fetch);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: `folder:${FOLDER}`,
      dryRun: true,
    });

    expect(result.episodesCreated).toBe(0);
    expect(contentFetchCalled).toHaveLength(0); // no Docs API calls in dry-run
  });
});

// ---------------------------------------------------------------------------
// Integration: query scope → adapter.enrich
// ---------------------------------------------------------------------------

describe("GoogleWorkspaceAdapter.enrich — query scope integration", () => {
  test("query: scope ingests matching docs and verifyGraph passes", async () => {
    const DOC = "queryDoc1";

    const fetchFn = makeDiscoveryFetch({
      driveQueryResults: [{ id: DOC, modifiedTime: "2024-04-01T00:00:00Z" }],
      docs: { [DOC]: makeDoc(DOC, "rev1", "Query Doc") },
      driveFileMeta: { [DOC]: makeDriveMeta() },
    });

    const adapter = new GoogleWorkspaceAdapter(fetchFn);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: "query:name contains 'spec'",
    });

    expect(result.episodesCreated).toBe(1);

    const verify = verifyGraph(graph);
    expect(verify.violations).toHaveLength(0);
  });

  test("incremental second run: advanced modifiedTime triggers supersession, unchanged skips", async () => {
    const DOC = "incrDoc";

    // First run: ingest rev1
    const fetchFn1 = makeDiscoveryFetch({
      driveQueryResults: [{ id: DOC, modifiedTime: "2024-04-01T00:00:00Z" }],
      docs: { [DOC]: makeDoc(DOC, "rev1", "Incremental Doc") },
      driveFileMeta: {
        [DOC]: {
          modifiedTime: "2024-04-01T00:00:00Z",
          owners: [{ emailAddress: "owner@example.com", displayName: "Owner" }],
          lastModifyingUser: {
            emailAddress: "owner@example.com",
            displayName: "Owner",
          },
          permissions: [],
        },
      },
    });

    const adapter1 = new GoogleWorkspaceAdapter(fetchFn1);
    const result1 = await adapter1.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: "query:name contains 'incrDoc'",
    });

    expect(result1.episodesCreated).toBe(1);

    // Second run: same query, doc at rev2 (content changed)
    const fetchFn2 = makeDiscoveryFetch({
      driveQueryResults: [{ id: DOC, modifiedTime: "2024-05-01T00:00:00Z" }],
      docs: { [DOC]: makeDoc(DOC, "rev2", "Incremental Doc Updated") },
      driveFileMeta: {
        [DOC]: {
          modifiedTime: "2024-05-01T00:00:00Z",
          owners: [{ emailAddress: "owner@example.com", displayName: "Owner" }],
          lastModifyingUser: {
            emailAddress: "owner@example.com",
            displayName: "Owner",
          },
          permissions: [],
        },
      },
    });

    const adapter2 = new GoogleWorkspaceAdapter(fetchFn2);
    const result2 = await adapter2.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: "query:name contains 'incrDoc'",
    });

    expect(result2.episodesCreated).toBe(1); // superseded
    expect(result2.edgesSuperseded).toBe(1);

    // Third run: same revision — skip
    const adapter3 = new GoogleWorkspaceAdapter(fetchFn2);
    const result3 = await adapter3.enrich(graph, {
      auth: { kind: "bearer", token: TOKEN },
      scope: "query:name contains 'incrDoc'",
    });

    // Drive returns doc (since modifiedTime cursor may or may not filter)
    // but revision hasn't changed → skip
    expect(result3.episodesCreated).toBe(0);

    const verify = verifyGraph(graph);
    expect(verify.violations).toHaveLength(0);
  });
});
