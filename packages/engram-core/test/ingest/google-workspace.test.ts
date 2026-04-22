/**
 * google-workspace.test.ts — Tests for the Google Workspace adapter.
 *
 * All tests use mock fetch — no real Google API calls are made.
 * Integration tests use in-memory SQLite and call verifyGraph().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getCurrentEpisode } from "../../src/graph/episodes.js";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph, verifyGraph } from "../../src/index.js";
import { GoogleWorkspaceAdapter } from "../../src/ingest/adapters/google-workspace.js";
import type {
  DocsDocument,
  DocsStructuralElement,
} from "../../src/ingest/adapters/google-workspace-helpers.js";
import {
  extractDocText,
  parseScope,
} from "../../src/ingest/adapters/google-workspace-helpers.js";
import { EPISODE_SOURCE_TYPES } from "../../src/vocab/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

const TEST_DOC_ID = "abc123testdocid";
const TEST_TOKEN = "test-bearer-token";

function makeDoc(
  docId = TEST_DOC_ID,
  revisionId = "rev1",
  title = "Test Document",
  elements: DocsStructuralElement[] = [],
): DocsDocument {
  return {
    documentId: docId,
    title,
    revisionId,
    body: { content: elements },
  };
}

function makeDriveMeta(
  ownerEmail = "alice@example.com",
  lastEditorEmail = "bob@example.com",
) {
  return {
    modifiedTime: "2024-06-01T12:00:00Z",
    owners: [{ emailAddress: ownerEmail, displayName: "Alice" }],
    lastModifyingUser: { emailAddress: lastEditorEmail, displayName: "Bob" },
    permissions: [],
  };
}

type FetchMap = Record<string, unknown>;

function makeFetch(
  map: FetchMap,
  statusOverrides?: Record<string, number>,
): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    for (const [key, body] of Object.entries(map)) {
      if (url.includes(key)) {
        const status = statusOverrides?.[key] ?? 200;
        return new Response(JSON.stringify(body), {
          status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function makeDefaultFetch(
  docId = TEST_DOC_ID,
  revisionId = "rev1",
): typeof fetch {
  return makeFetch({
    [`/documents/${docId}`]: makeDoc(docId, revisionId),
    [`/files/${docId}`]: makeDriveMeta(),
  });
}

// ---------------------------------------------------------------------------
// extractDocText — unit tests per element type
// ---------------------------------------------------------------------------

describe("extractDocText", () => {
  test("returns empty string for empty body", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "MyDoc");
    const text = extractDocText(doc);
    // Should at minimum have the title heading
    expect(text).toContain("# MyDoc");
  });

  test("extracts normal paragraph text", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Hello, world!" } }],
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
        },
      },
    ]);
    const text = extractDocText(doc);
    expect(text).toContain("Hello, world!");
  });

  test("prefixes HEADING_1 with #", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Section Title" } }],
          paragraphStyle: { namedStyleType: "HEADING_1" },
        },
      },
    ]);
    expect(extractDocText(doc)).toContain("# Section Title");
  });

  test("prefixes HEADING_2 with ##", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Sub Section" } }],
          paragraphStyle: { namedStyleType: "HEADING_2" },
        },
      },
    ]);
    expect(extractDocText(doc)).toContain("## Sub Section");
  });

  test("prefixes HEADING_3 with ###", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Deep" } }],
          paragraphStyle: { namedStyleType: "HEADING_3" },
        },
      },
    ]);
    expect(extractDocText(doc)).toContain("### Deep");
  });

  test("indents list items with bullet", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Item A" } }],
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          bullet: { nestingLevel: 0, listId: "list1" },
        },
      },
    ]);
    expect(extractDocText(doc)).toContain("- Item A");
  });

  test("indents nested list item by 2 spaces per level", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Nested" } }],
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
          bullet: { nestingLevel: 1, listId: "list1" },
        },
      },
    ]);
    expect(extractDocText(doc)).toContain("  - Nested");
  });

  test("extracts table cells in reading order with | separator", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        table: {
          tableRows: [
            {
              tableCells: [
                {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: "Cell A1" } }],
                        paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                      },
                    },
                  ],
                },
                {
                  content: [
                    {
                      paragraph: {
                        elements: [{ textRun: { content: "Cell B1" } }],
                        paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
    const text = extractDocText(doc);
    expect(text).toContain("Cell A1");
    expect(text).toContain("Cell B1");
    expect(text).toContain("|");
  });

  test("strips trailing newlines Docs inserts per paragraph", () => {
    const doc = makeDoc(TEST_DOC_ID, "r1", "Doc", [
      {
        paragraph: {
          elements: [{ textRun: { content: "Line\n" } }],
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" },
        },
      },
    ]);
    const text = extractDocText(doc);
    // Should not have double newlines mid-content
    expect(text).toContain("Line");
    expect(text).not.toContain("Line\n\n\n");
  });
});

// ---------------------------------------------------------------------------
// Scope parsing — unit tests
// ---------------------------------------------------------------------------

describe("parseScope", () => {
  test("parses doc:<id> as a single-element array", () => {
    expect(parseScope("doc:abc123")).toEqual(["abc123"]);
  });

  test("parses docs:<id>,<id> as multiple IDs", () => {
    expect(parseScope("docs:id1,id2,id3")).toEqual(["id1", "id2", "id3"]);
  });

  test("trims whitespace around IDs in docs: scope", () => {
    expect(parseScope("docs: id1 , id2 ")).toEqual(["id1", "id2"]);
  });

  test("throws on bare ID without prefix", () => {
    expect(() => parseScope("justanid")).toThrow();
  });

  test("throws on empty doc: scope", () => {
    expect(() => parseScope("doc:")).toThrow();
  });

  test("throws on empty docs: scope", () => {
    expect(() => parseScope("docs:")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Scope schema validation
// ---------------------------------------------------------------------------

describe("googleWorkspaceScopeSchema", () => {
  const adapter = new GoogleWorkspaceAdapter();

  test("accepts doc:<id>", () => {
    expect(() => adapter.scopeSchema.validate("doc:abc123")).not.toThrow();
  });

  test("accepts docs:<id>,<id>", () => {
    expect(() => adapter.scopeSchema.validate("docs:id1,id2")).not.toThrow();
  });

  test("rejects bare ID", () => {
    expect(() => adapter.scopeSchema.validate("abc123")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Adapter integration tests (real SQLite :memory:, mocked fetch)
// ---------------------------------------------------------------------------

describe("GoogleWorkspaceAdapter.enrich — integration", () => {
  test("first ingest creates episode, document entity, and person entities", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());

    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    expect(result.episodesCreated).toBe(1);
    expect(result.entitiesCreated).toBeGreaterThanOrEqual(2); // doc + person(s)
    expect(result.edgesCreated).toBeGreaterThanOrEqual(1);

    // Episode should exist in DB
    const ep = getCurrentEpisode(
      graph,
      EPISODE_SOURCE_TYPES.GOOGLE_DOC,
      `google_doc:${TEST_DOC_ID}`,
    );
    expect(ep).not.toBeNull();
    expect(ep?.metadata).toContain("rev1");

    // Graph integrity
    const verify = verifyGraph(graph);
    expect(
      verify.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("re-ingest with same revisionId skips without writing", async () => {
    const fetch1 = makeDefaultFetch(TEST_DOC_ID, "rev1");
    const adapter = new GoogleWorkspaceAdapter(fetch1);
    await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    // Second ingest same revision
    const adapter2 = new GoogleWorkspaceAdapter(fetch1);
    const result2 = await adapter2.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    expect(result2.episodesCreated).toBe(0);
    expect(result2.episodesSkipped).toBe(1);

    const verify = verifyGraph(graph);
    expect(
      verify.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("re-ingest with new revisionId supersedes existing episode", async () => {
    const adapter1 = new GoogleWorkspaceAdapter(
      makeDefaultFetch(TEST_DOC_ID, "rev1"),
    );
    await adapter1.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    const adapter2 = new GoogleWorkspaceAdapter(
      makeDefaultFetch(TEST_DOC_ID, "rev2"),
    );
    const result2 = await adapter2.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    expect(result2.episodesCreated).toBe(1);
    expect(result2.edgesSuperseded).toBe(1);

    // New episode should be rev2
    const ep = getCurrentEpisode(
      graph,
      EPISODE_SOURCE_TYPES.GOOGLE_DOC,
      `google_doc:${TEST_DOC_ID}`,
    );
    expect(ep).not.toBeNull();
    expect(ep?.metadata).toContain("rev2");

    // Old episode should be superseded
    const allEps = graph.db
      .query<{ id: string; superseded_by: string | null }, []>(
        "SELECT id, superseded_by FROM episodes ORDER BY ingested_at",
      )
      .all();
    expect(allEps).toHaveLength(2);
    expect(allEps[0].superseded_by).not.toBeNull();

    const verify = verifyGraph(graph);
    expect(
      verify.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("docs: scope with multiple IDs ingests each", async () => {
    const DOC_A = "docAAA";
    const DOC_B = "docBBB";
    const fetchFn = makeFetch({
      [`/documents/${DOC_A}`]: makeDoc(DOC_A, "rev1", "Doc A"),
      [`/documents/${DOC_B}`]: makeDoc(DOC_B, "rev1", "Doc B"),
      [`/files/${DOC_A}`]: makeDriveMeta("alice@example.com"),
      [`/files/${DOC_B}`]: makeDriveMeta("bob@example.com"),
    });

    const adapter = new GoogleWorkspaceAdapter(fetchFn);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `docs:${DOC_A},${DOC_B}`,
    });

    expect(result.episodesCreated).toBe(2);

    const verify = verifyGraph(graph);
    expect(
      verify.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("404 on one doc in docs: list logs and continues", async () => {
    const DOC_A = "docExists";
    const DOC_MISSING = "docMissing";
    const fetchFn = makeFetch({
      [`/documents/${DOC_A}`]: makeDoc(DOC_A, "rev1", "Exists"),
      [`/files/${DOC_A}`]: makeDriveMeta(),
      // DOC_MISSING not in map → 404
    });

    const adapter = new GoogleWorkspaceAdapter(fetchFn);
    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `docs:${DOC_A},${DOC_MISSING}`,
    });

    // One created, one skipped (404)
    expect(result.episodesCreated).toBe(1);
    expect(result.episodesSkipped).toBe(1);

    const verify = verifyGraph(graph);
    expect(
      verify.violations.filter((v) => v.severity === "error"),
    ).toHaveLength(0);
  });

  test("401 without refresh throws auth_failure immediately", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    const adapter = new GoogleWorkspaceAdapter(fetchFn as typeof fetch);

    await expect(
      adapter.enrich(graph, {
        auth: { kind: "bearer", token: "bad-token" },
        scope: `doc:${TEST_DOC_ID}`,
      }),
    ).rejects.toMatchObject({ code: "auth_failure" });
  });

  test("401 with refresh retries once and succeeds", async () => {
    // Returns 401 only when using "old-token", success with "new-token"
    const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const authHeader =
        (init?.headers as Record<string, string>)?.Authorization ?? "";
      const isOldToken = authHeader.includes("old-token");

      if (isOldToken) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Requests with new-token succeed
      if (url.includes("/documents/")) {
        return new Response(JSON.stringify(makeDoc(TEST_DOC_ID, "rev1")), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(makeDriveMeta()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new GoogleWorkspaceAdapter(fetchFn as typeof fetch);
    let refreshed = false;
    const result = await adapter.enrich(graph, {
      auth: {
        kind: "oauth2",
        token: "old-token",
        scopes: [],
        refresh: async () => {
          refreshed = true;
          return "new-token";
        },
      },
      scope: `doc:${TEST_DOC_ID}`,
    });

    expect(refreshed).toBe(true);
    expect(result.episodesCreated).toBe(1);
  });

  test("429 rate limit throws rate_limited with Retry-After", async () => {
    const fetchFn = async () =>
      new Response(JSON.stringify({ error: "rate limited" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "30",
        },
      });

    const adapter = new GoogleWorkspaceAdapter(fetchFn as typeof fetch);

    await expect(
      adapter.enrich(graph, {
        auth: { kind: "bearer", token: TEST_TOKEN },
        scope: `doc:${TEST_DOC_ID}`,
      }),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });

  test("dry-run does not write to graph", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());

    const result = await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
      dryRun: true,
    });

    expect(result.episodesCreated).toBe(0);
    expect(result.episodesSkipped).toBeGreaterThanOrEqual(1);

    const epCount = graph.db
      .query<{ n: number }, []>("SELECT COUNT(*) as n FROM episodes")
      .get();
    expect(epCount?.n).toBe(0);
  });

  test("oauth2 auth kind is accepted", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());
    const result = await adapter.enrich(graph, {
      auth: { kind: "oauth2", token: TEST_TOKEN, scopes: [] },
      scope: `doc:${TEST_DOC_ID}`,
    });
    expect(result.episodesCreated).toBe(1);
  });

  test("person entity aliases include email address", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());
    await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    const personEntity = graph.db
      .query<{ canonical_name: string }, []>(
        "SELECT canonical_name FROM entities WHERE entity_type = 'person' LIMIT 1",
      )
      .get();
    expect(personEntity?.canonical_name).toBe("alice@example.com");
  });

  test("document entity has expected aliases", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());
    await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    const aliases = graph.db
      .query<{ alias: string }, []>("SELECT alias FROM entity_aliases")
      .all()
      .map((r) => r.alias);

    expect(aliases).toContain(TEST_DOC_ID);
    expect(aliases).toContain(
      `https://docs.google.com/document/d/${TEST_DOC_ID}/edit`,
    );
    expect(aliases).toContain(`https://docs.google.com/d/${TEST_DOC_ID}`);
  });

  test("authored edge is created from owner to document", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());
    await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    const edge = graph.db
      .query<{ relation_type: string }, []>(
        "SELECT relation_type FROM edges WHERE relation_type = 'authored'",
      )
      .get();
    expect(edge?.relation_type).toBe("authored");
  });

  test("edited edge is created from last modifier to document", async () => {
    const adapter = new GoogleWorkspaceAdapter(makeDefaultFetch());
    await adapter.enrich(graph, {
      auth: { kind: "bearer", token: TEST_TOKEN },
      scope: `doc:${TEST_DOC_ID}`,
    });

    const edge = graph.db
      .query<{ relation_type: string }, []>(
        "SELECT relation_type FROM edges WHERE relation_type = 'edited'",
      )
      .get();
    expect(edge?.relation_type).toBe("edited");
  });
});
