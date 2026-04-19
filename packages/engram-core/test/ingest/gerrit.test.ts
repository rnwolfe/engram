/**
 * gerrit.test.ts — Tests for GerritAdapter with mocked fetch.
 *
 * All tests use mock fetch — no real Gerrit API calls are made.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveEntity } from "../../src/graph/aliases.js";
import {
  closeGraph,
  createGraph,
  type EngramGraph,
  verifyGraph,
} from "../../src/index.js";
import { GerritAdapter } from "../../src/ingest/adapters/gerrit.js";

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

// Gerrit prefixes all JSON responses with this XSSI protection prefix.
function gerritBody(data: unknown): string {
  return `)]}'
${JSON.stringify(data)}`;
}

function makeFetch(responses: Record<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return new Response(gerritBody(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(gerritBody([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const TEST_PROJECT = "tools/test-project";
const TEST_ENDPOINT = "https://gerrit.example.com";
const TEST_TOKEN = "user:secret";

function makeChange(
  overrides: Partial<{
    _number: number;
    subject: string;
    status: "NEW" | "MERGED" | "ABANDONED";
    owner: { _account_id: number; email: string; username: string };
    reviewers: { REVIEWER: Array<{ _account_id: number; email: string }> };
    _more_changes: boolean;
  }> = {},
) {
  const n = overrides._number ?? 1001;
  return {
    id: `${TEST_PROJECT.replace("/", "~")}~main~Iabcdef${n}`,
    _number: n,
    project: TEST_PROJECT,
    branch: "main",
    subject: overrides.subject ?? `Change ${n}`,
    status: overrides.status ?? ("MERGED" as const),
    owner: overrides.owner ?? {
      _account_id: 1,
      email: "alice@example.com",
      username: "alice",
    },
    reviewers: overrides.reviewers ?? {},
    created: "2024-01-01T00:00:00.000000000Z",
    updated: "2024-01-02T00:00:00.000000000Z",
    ...(overrides._more_changes !== undefined
      ? { _more_changes: overrides._more_changes }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Basic ingestion
// ---------------------------------------------------------------------------

describe("GerritAdapter — basic ingestion", () => {
  test("creates episode for fetched change", async () => {
    const change = makeChange({ _number: 1001 });
    const adapter = new GerritAdapter(makeFetch({ "/changes/": [change] }));

    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    expect(result.episodesCreated).toBe(1);
    expect(result.runId).toBeTruthy();

    const episode = graph.db
      .query<{ source_type: string; source_ref: string }, [string]>(
        "SELECT source_type, source_ref FROM episodes WHERE source_ref LIKE ?",
      )
      .get("%/1001");

    expect(episode).toBeTruthy();
    expect(episode?.source_type).toBe("gerrit_change");
    expect(verifyGraph(graph).valid).toBe(true);
  });

  test("creates person entity for change owner", async () => {
    const adapter = new GerritAdapter(
      makeFetch({ "/changes/": [makeChange({ _number: 1002 })] }),
    );
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    const person = graph.db
      .query<{ canonical_name: string }, [string]>(
        "SELECT canonical_name FROM entities WHERE canonical_name = ? AND entity_type = 'person'",
      )
      .get("alice@example.com");

    expect(person).toBeTruthy();
  });

  test("creates reviewed_by edge for reviewer", async () => {
    const change = makeChange({
      _number: 1003,
      reviewers: {
        REVIEWER: [{ _account_id: 2, email: "bob@example.com" }],
      },
    });
    const adapter = new GerritAdapter(makeFetch({ "/changes/": [change] }));
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    const edge = graph.db
      .query<{ relation_type: string }, [string, string]>(
        `SELECT e.relation_type FROM edges e
         JOIN entities src ON src.id = e.source_id
         JOIN entities tgt ON tgt.id = e.target_id
         WHERE src.canonical_name = ? AND tgt.canonical_name = ?
           AND e.invalidated_at IS NULL`,
      )
      .get("bob@example.com", "alice@example.com");

    expect(edge).toBeTruthy();
    expect(edge?.relation_type).toBe("reviewed_by");
  });

  test("skips self-review edge", async () => {
    const change = makeChange({
      _number: 1004,
      reviewers: {
        REVIEWER: [{ _account_id: 1, email: "alice@example.com" }],
      },
    });
    const adapter = new GerritAdapter(makeFetch({ "/changes/": [change] }));
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    const edges = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM edges WHERE relation_type = 'reviewed_by' AND invalidated_at IS NULL",
      )
      .all();

    expect(edges.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Alias convention
// ---------------------------------------------------------------------------

describe("GerritAdapter — shorthand aliases", () => {
  test("resolveEntity('CL/N') returns change entity after ingest", async () => {
    const adapter = new GerritAdapter(
      makeFetch({ "/changes/": [makeChange({ _number: 2001 })] }),
    );
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    const entity = resolveEntity(graph, "CL/2001");
    expect(entity).not.toBeNull();
    expect(entity?.entity_type).toBe("pull_request");
  });

  test("resolveEntity('project/N') returns change entity after ingest", async () => {
    const adapter = new GerritAdapter(
      makeFetch({ "/changes/": [makeChange({ _number: 2002 })] }),
    );
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    const entity = resolveEntity(graph, `${TEST_PROJECT}/2002`);
    expect(entity).not.toBeNull();
    expect(entity?.entity_type).toBe("pull_request");
  });
});

// ---------------------------------------------------------------------------
// Idempotency and cursor
// ---------------------------------------------------------------------------

describe("GerritAdapter — idempotency", () => {
  test("second run skips already-ingested changes", async () => {
    const change = makeChange({ _number: 3001 });
    const adapter = new GerritAdapter(makeFetch({ "/changes/": [change] }));

    const first = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });
    expect(first.episodesCreated).toBe(1);

    const second = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });
    expect(second.episodesCreated).toBe(0);
    expect(second.episodesSkipped).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// XSSI prefix handling
// ---------------------------------------------------------------------------

describe("GerritAdapter — XSSI prefix", () => {
  test("handles response without XSSI prefix", async () => {
    const fetchNoPrefix: typeof fetch = async () => {
      return new Response(JSON.stringify([makeChange({ _number: 4001 })]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new GerritAdapter(fetchNoPrefix);
    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
    });

    expect(result.episodesCreated).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("GerritAdapter — validation", () => {
  test("throws if repo is missing", async () => {
    const adapter = new GerritAdapter(makeFetch({}));
    await expect(
      adapter.enrich(graph, { token: TEST_TOKEN, endpoint: TEST_ENDPOINT }),
    ).rejects.toThrow("opts.scope is required");
  });

  test("uses custom endpoint", async () => {
    const urls: string[] = [];
    const capturingFetch: typeof fetch = async (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return new Response(gerritBody([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new GerritAdapter(capturingFetch);
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: "https://chromium-review.googlesource.com",
    });

    expect(
      urls.some((u) =>
        u.startsWith("https://chromium-review.googlesource.com"),
      ),
    ).toBe(true);
  });

  test("dry-run returns counts without writing to graph", async () => {
    const changes = [
      makeChange({ _number: 5001 }),
      makeChange({ _number: 5002 }),
    ];
    const adapter = new GerritAdapter(makeFetch({ "/changes/": changes }));

    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_PROJECT,
      endpoint: TEST_ENDPOINT,
      dryRun: true,
    });

    expect(result.episodesCreated).toBe(2);

    // Nothing written to DB
    const episodes = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM episodes WHERE source_type = 'gerrit_change'",
      )
      .all();
    expect(episodes.length).toBe(0);

    // No ingestion_runs created — cursor must not be poisoned
    const runs = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM ingestion_runs WHERE source_type = 'gerrit'",
      )
      .all();
    expect(runs.length).toBe(0);
  });
});
