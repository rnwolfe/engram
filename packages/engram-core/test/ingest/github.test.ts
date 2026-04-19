/**
 * github.test.ts — Tests for the GitHubAdapter with mocked fetch.
 *
 * All tests use mock fetch — no real GitHub API calls are made.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolveEntity } from "../../src/graph/aliases.js";
import { closeGraph, createGraph, type EngramGraph } from "../../src/index.js";
import { GitHubAdapter } from "../../src/ingest/adapters/github.js";

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

function makeFetch(responses: Record<string, unknown>): typeof fetch {
  return async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    // Find matching response by URL substring
    for (const [key, body] of Object.entries(responses)) {
      if (url.includes(key)) {
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Default empty array (simulates no more pages)
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

const TEST_REPO = "owner/test-repo";
const TEST_TOKEN = "test-token-never-stored";

// ---------------------------------------------------------------------------
// PR enrichment tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter — PR enrichment", () => {
  test("creates episodes for fetched PRs", async () => {
    const fakePRs = [
      {
        number: 1,
        html_url: "https://github.com/owner/test-repo/pull/1",
        title: "Add feature X",
        body: "This PR adds feature X.",
        state: "closed",
        user: { login: "alice" },
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        requested_reviewers: [],
        assignees: [],
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/pulls": fakePRs }));
    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });

    expect(result.episodesCreated).toBe(1);
    expect(result.runId).toBeTruthy();

    // Verify episode in DB
    const episode = graph.db
      .query<{ source_type: string; source_ref: string }, [string]>(
        "SELECT source_type, source_ref FROM episodes WHERE source_ref = ?",
      )
      .get("https://github.com/owner/test-repo/pull/1");

    expect(episode).toBeTruthy();
    expect(episode?.source_type).toBe("github_pr");
  });

  test("creates reviewed_by edge for PR reviewer", async () => {
    const fakePRs = [
      {
        number: 2,
        html_url: "https://github.com/owner/test-repo/pull/2",
        title: "Refactor Y",
        body: "Refactoring Y module.",
        state: "closed",
        user: { login: "bob" },
        created_at: "2024-02-01T00:00:00Z",
        updated_at: "2024-02-02T00:00:00Z",
        requested_reviewers: [{ login: "carol" }],
        assignees: [],
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/pulls": fakePRs }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    // Verify reviewed_by edge exists
    const edge = graph.db
      .query<{ relation_type: string; edge_kind: string }, [string, string]>(
        `SELECT e.relation_type, e.edge_kind FROM edges e
         JOIN entities src ON src.id = e.source_id
         JOIN entities tgt ON tgt.id = e.target_id
         WHERE src.canonical_name = ? AND tgt.canonical_name = ?
           AND e.invalidated_at IS NULL`,
      )
      .get("carol", "bob");

    expect(edge).toBeTruthy();
    expect(edge?.relation_type).toBe("reviewed_by");
    expect(edge?.edge_kind).toBe("observed");
  });

  test("creates person entities for PR author and reviewers", async () => {
    const fakePRs = [
      {
        number: 3,
        html_url: "https://github.com/owner/test-repo/pull/3",
        title: "Fix bug Z",
        body: null,
        state: "closed",
        user: { login: "dave" },
        created_at: "2024-03-01T00:00:00Z",
        updated_at: "2024-03-02T00:00:00Z",
        requested_reviewers: [{ login: "eve" }],
        assignees: [],
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/pulls": fakePRs }));
    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });

    const dave = graph.db
      .query<{ canonical_name: string }, [string]>(
        "SELECT canonical_name FROM entities WHERE canonical_name = ? AND entity_type = 'person'",
      )
      .get("dave");
    const eve = graph.db
      .query<{ canonical_name: string }, [string]>(
        "SELECT canonical_name FROM entities WHERE canonical_name = ? AND entity_type = 'person'",
      )
      .get("eve");

    expect(dave).toBeTruthy();
    expect(eve).toBeTruthy();
    expect(result.entitiesCreated).toBeGreaterThan(0);
  });

  test("does not create reviewed_by edge for self-review", async () => {
    const fakePRs = [
      {
        number: 4,
        html_url: "https://github.com/owner/test-repo/pull/4",
        title: "Self review PR",
        body: null,
        state: "closed",
        user: { login: "frank" },
        created_at: "2024-04-01T00:00:00Z",
        updated_at: "2024-04-02T00:00:00Z",
        requested_reviewers: [{ login: "frank" }], // same as author
        assignees: [],
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/pulls": fakePRs }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const edges = graph.db
      .query<{ id: string }, []>(
        `SELECT id FROM edges WHERE relation_type = 'reviewed_by' AND invalidated_at IS NULL`,
      )
      .all();

    expect(edges.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Issue enrichment tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter — Issue enrichment", () => {
  test("creates episodes for fetched issues", async () => {
    const fakeIssues = [
      {
        number: 10,
        html_url: "https://github.com/owner/test-repo/issues/10",
        title: "Bug report",
        body: "Something is broken.",
        state: "open",
        user: { login: "alice" },
        created_at: "2024-05-01T00:00:00Z",
        updated_at: "2024-05-02T00:00:00Z",
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/issues": fakeIssues }));
    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });

    expect(result.episodesCreated).toBe(1);

    const episode = graph.db
      .query<{ source_type: string }, [string]>(
        "SELECT source_type FROM episodes WHERE source_ref = ?",
      )
      .get("https://github.com/owner/test-repo/issues/10");

    expect(episode?.source_type).toBe("github_issue");
  });

  test("skips issues that are actually PRs (pull_request field present)", async () => {
    const fakeIssues = [
      {
        number: 11,
        html_url: "https://github.com/owner/test-repo/pull/11",
        title: "PR as issue",
        body: "This comes from /issues endpoint but is a PR.",
        state: "closed",
        user: { login: "bob" },
        created_at: "2024-05-03T00:00:00Z",
        updated_at: "2024-05-04T00:00:00Z",
        pull_request: { url: "https://api.github.com/..." },
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/issues": fakeIssues }));
    const result = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });

    // Should have skipped the PR-as-issue
    expect(result.episodesCreated).toBe(0);
  });

  test("creates issue entity with references edge to mentioned PR entity", async () => {
    // First create a PR entity so the reference can be resolved
    const fakePRs = [
      {
        number: 5,
        html_url: "https://github.com/owner/test-repo/pull/5",
        title: "PR being referenced",
        body: null,
        state: "closed",
        user: { login: "carol" },
        created_at: "2024-06-01T00:00:00Z",
        updated_at: "2024-06-02T00:00:00Z",
        requested_reviewers: [],
        assignees: [],
      },
    ];

    const fakeIssues = [
      {
        number: 12,
        html_url: "https://github.com/owner/test-repo/issues/12",
        title: "Issue referencing PR",
        body: "This is fixed by #5.",
        state: "open",
        user: { login: "dave" },
        created_at: "2024-06-03T00:00:00Z",
        updated_at: "2024-06-04T00:00:00Z",
      },
    ];

    const adapter = new GitHubAdapter(
      makeFetch({ "/pulls": fakePRs, "/issues": fakeIssues }),
    );
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    // The issue entity should exist
    const issueEntity = graph.db
      .query<{ id: string }, [string]>(
        "SELECT id FROM entities WHERE canonical_name = ? AND entity_type = 'issue'",
      )
      .get("https://github.com/owner/test-repo/issues/12");

    expect(issueEntity).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Idempotency tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter — Idempotency", () => {
  test("second run skips already-processed items via cursor", async () => {
    const fakePRs = [
      {
        number: 20,
        html_url: "https://github.com/owner/test-repo/pull/20",
        title: "First PR",
        body: "Content.",
        state: "closed",
        user: { login: "alice" },
        created_at: "2024-07-01T00:00:00Z",
        updated_at: "2024-07-02T00:00:00Z",
        requested_reviewers: [],
        assignees: [],
      },
    ];

    const adapter = new GitHubAdapter(makeFetch({ "/pulls": fakePRs }));

    // First run
    const first = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });
    expect(first.episodesCreated).toBe(1);

    // Second run with same data — cursor should skip PR #20
    const second = await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });
    expect(second.episodesCreated).toBe(0);
    expect(second.episodesSkipped).toBe(1);
  });

  test("second run picks up new items beyond cursor", async () => {
    const firstBatch = [
      {
        number: 30,
        html_url: "https://github.com/owner/test-repo/pull/30",
        title: "Older PR",
        body: null,
        state: "closed",
        user: { login: "bob" },
        created_at: "2024-08-01T00:00:00Z",
        updated_at: "2024-08-02T00:00:00Z",
        requested_reviewers: [],
        assignees: [],
      },
    ];

    const secondBatch = [
      ...firstBatch,
      {
        number: 31,
        html_url: "https://github.com/owner/test-repo/pull/31",
        title: "Newer PR",
        body: null,
        state: "closed",
        user: { login: "carol" },
        created_at: "2024-08-03T00:00:00Z",
        updated_at: "2024-08-04T00:00:00Z",
        requested_reviewers: [],
        assignees: [],
      },
    ];

    const adapterFirst = new GitHubAdapter(makeFetch({ "/pulls": firstBatch }));
    await adapterFirst.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const adapterSecond = new GitHubAdapter(
      makeFetch({ "/pulls": secondBatch }),
    );
    const second = await adapterSecond.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
    });

    expect(second.episodesCreated).toBe(1); // only PR #31 is new
    expect(second.episodesSkipped).toBe(1); // PR #30 skipped
  });
});

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter — Validation", () => {
  test("throws if repo is missing", async () => {
    const adapter = new GitHubAdapter(makeFetch({}));
    await expect(adapter.enrich(graph, { token: TEST_TOKEN })).rejects.toThrow(
      "opts.repo is required",
    );
  });

  test("throws if repo format is invalid", async () => {
    const adapter = new GitHubAdapter(makeFetch({}));
    await expect(
      adapter.enrich(graph, { token: TEST_TOKEN, repo: "not-valid" }),
    ).rejects.toThrow("owner/repo");
  });

  test("uses custom endpoint (GitHub Enterprise)", async () => {
    const urls: string[] = [];
    const capturingFetch: typeof fetch = async (
      input: RequestInfo | URL,
      _init?: RequestInit,
    ) => {
      urls.push(typeof input === "string" ? input : input.toString());
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const adapter = new GitHubAdapter(capturingFetch);
    await adapter.enrich(graph, {
      token: TEST_TOKEN,
      repo: TEST_REPO,
      endpoint: "https://github.example.com/api/v3",
    });

    expect(
      urls.some((u) => u.startsWith("https://github.example.com/api/v3")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Alias convention tests
// ---------------------------------------------------------------------------

describe("GitHubAdapter — shorthand aliases", () => {
  const fakePR = {
    number: 123,
    html_url: "https://github.com/owner/test-repo/pull/123",
    title: "Add widget",
    body: "Adds a widget.",
    state: "closed",
    user: { login: "alice" },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    requested_reviewers: [],
    assignees: [],
  };

  const fakeIssue = {
    number: 456,
    html_url: "https://github.com/owner/test-repo/issues/456",
    title: "Bug report",
    body: "Something is broken.",
    state: "open",
    user: { login: "bob" },
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-02-02T00:00:00Z",
  };

  test("resolveEntity('#N') returns PR entity after ingest", async () => {
    const adapter = new GitHubAdapter(makeFetch({ "/pulls": [fakePR] }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const entity = resolveEntity(graph, "#123");
    expect(entity).not.toBeNull();
    expect(entity?.canonical_name).toBe(
      "https://github.com/owner/test-repo/pull/123",
    );
  });

  test("resolveEntity('owner/repo#N') returns PR entity after ingest", async () => {
    const adapter = new GitHubAdapter(makeFetch({ "/pulls": [fakePR] }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const entity = resolveEntity(graph, "owner/test-repo#123");
    expect(entity).not.toBeNull();
    expect(entity?.entity_type).toBe("pr");
  });

  test("resolveEntity('#N') returns issue entity after ingest", async () => {
    const adapter = new GitHubAdapter(makeFetch({ "/issues": [fakeIssue] }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const entity = resolveEntity(graph, "#456");
    expect(entity).not.toBeNull();
    expect(entity?.canonical_name).toBe(
      "https://github.com/owner/test-repo/issues/456",
    );
  });

  test("resolveEntity('owner/repo#N') returns issue entity after ingest", async () => {
    const adapter = new GitHubAdapter(makeFetch({ "/issues": [fakeIssue] }));
    await adapter.enrich(graph, { token: TEST_TOKEN, repo: TEST_REPO });

    const entity = resolveEntity(graph, "owner/test-repo#456");
    expect(entity).not.toBeNull();
    expect(entity?.entity_type).toBe("issue");
  });
});
