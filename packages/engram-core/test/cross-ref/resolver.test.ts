/**
 * resolver.test.ts — Tests for cross-source reference edge resolution.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { EngramGraph } from "../../src/index.js";
import {
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  findEdges,
} from "../../src/index.js";
import type { ReferencePattern } from "../../src/ingest/cross-ref/index.js";
import {
  BUILT_IN_PATTERNS,
  compilePluginPattern,
  drainUnresolved,
  resolveReferences,
} from "../../src/ingest/cross-ref/index.js";
import { ensureUnresolvedRefsTable } from "../../src/ingest/cross-ref/schema.js";

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
  ensureUnresolvedRefsTable(graph);
});

afterEach(() => {
  closeGraph(graph);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEpisode(
  sourceType: string,
  sourceRef: string,
  content: string,
  timestamp = "2024-01-01T00:00:00Z",
) {
  return addEpisode(graph, {
    source_type: sourceType,
    source_ref: sourceRef,
    content,
    timestamp,
  });
}

function makeEntity(
  canonicalName: string,
  entityType: string,
  episodeId: string,
) {
  return addEntity(
    graph,
    { canonical_name: canonicalName, entity_type: entityType },
    [{ episode_id: episodeId, extractor: "test", confidence: 1.0 }],
  );
}

function getUnresolvedRefs(targetSourceType?: string, targetRef?: string) {
  if (targetSourceType && targetRef) {
    return graph.db
      .query<
        { id: string; source_episode_id: string; resolved_at: string | null },
        [string, string]
      >(
        "SELECT id, source_episode_id, resolved_at FROM unresolved_refs WHERE target_source_type = ? AND target_ref = ?",
      )
      .all(targetSourceType, targetRef);
  }
  return graph.db
    .query<
      { id: string; source_episode_id: string; resolved_at: string | null },
      []
    >("SELECT id, source_episode_id, resolved_at FROM unresolved_refs")
    .all();
}

// ---------------------------------------------------------------------------
// Test 1: Each built-in pattern matches its canonical example
// ---------------------------------------------------------------------------

describe("built-in patterns — canonical examples", () => {
  test("full GitHub PR URL emits edge at 0.95 confidence", () => {
    // Create target episode + entity
    const targetEp = makeEpisode(
      "github_pr",
      "https://github.com/owner/repo/pull/42",
      "PR body",
    );
    const targetEntity = makeEntity(
      "https://github.com/owner/repo/pull/42",
      "pull_request",
      targetEp.id,
    );

    // Create source episode + entity referencing the PR
    const sourceEp = makeEpisode(
      "git_commit",
      "abc1234567890123456789012345678901234abc1",
      "Fix bug, see https://github.com/owner/repo/pull/42 for context",
    );
    const sourceEntity = makeEntity(
      "abc1234567890123456789012345678901234abc1",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].target_id).toBe(targetEntity.id);
    expect(edges[0].confidence).toBe(0.95);
  });

  test("full GitHub issue URL emits edge at 0.95 confidence", () => {
    const targetEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/10",
      "Issue body",
    );
    const targetEntity = makeEntity(
      "https://github.com/owner/repo/issues/10",
      "issue",
      targetEp.id,
    );

    const sourceEp = makeEpisode(
      "git_commit",
      "def1234567890123456789012345678901234def1",
      "Closes https://github.com/owner/repo/issues/10",
    );
    const sourceEntity = makeEntity(
      "def1234567890123456789012345678901234def1",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].target_id).toBe(targetEntity.id);
    expect(edges[0].confidence).toBe(0.95);
  });

  test("b/NNNNNN buganizer shorthand emits edge at 0.9 confidence", () => {
    const targetEp = makeEpisode(
      "buganizer_issue",
      "b/123456",
      "Buganizer issue content",
    );
    const _targetEntity = makeEntity("b/123456", "issue", targetEp.id);

    const sourceEp = makeEpisode(
      "git_commit",
      "aaa1234567890123456789012345678901234aaa1",
      "Fix for b/123456 — memory leak in parser",
    );
    const sourceEntity = makeEntity(
      "aaa1234567890123456789012345678901234aaa1",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges[0].confidence).toBe(0.9);
  });

  test("go/cl/NNNN gerrit shorthand emits edge at 0.9 confidence", () => {
    const targetEp = makeEpisode("gerrit_change", "go/cl/999", "Gerrit CL");
    const _targetEntity = makeEntity("go/cl/999", "change", targetEp.id);

    const sourceEp = makeEpisode(
      "git_commit",
      "bbb1234567890123456789012345678901234bbb1",
      "Cherry-pick from go/cl/999",
    );
    const sourceEntity = makeEntity(
      "bbb1234567890123456789012345678901234bbb1",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges[0].confidence).toBe(0.9);
  });

  test("#N repo-scoped reference matches issue/pull_request entity via _lookupOverride", () => {
    const targetEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/7",
      "Issue 7",
    );
    const targetEntity = makeEntity(
      "https://github.com/owner/repo/issues/7",
      "issue",
      targetEp.id,
    );

    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/8",
      "Related to #7 from the issue body",
    );
    const sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/8",
      "issue",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].target_id).toBe(targetEntity.id);
    expect(edges[0].confidence).toBe(0.85);
  });
});

// ---------------------------------------------------------------------------
// Test 2: Full SHA vs short SHA confidence values
// ---------------------------------------------------------------------------

describe("SHA confidence levels", () => {
  test("full 40-char SHA produces confidence 0.9", () => {
    const fullSha = "abcdef1234567890abcdef1234567890abcdef12";
    const targetEp = makeEpisode("git_commit", fullSha, `commit ${fullSha}`);
    const targetEntity = makeEntity(fullSha, "commit", targetEp.id);

    const sourceEp = makeEpisode(
      "git_commit",
      "1111111111111111111111111111111111111111",
      `Reverts ${fullSha}`,
    );
    const sourceEntity = makeEntity(
      "1111111111111111111111111111111111111111",
      "commit",
      sourceEp.id,
    );

    const _result = resolveReferences(graph, [sourceEp.id]);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });

    // Should match the 40-char pattern at 0.9
    expect(edges.length).toBeGreaterThan(0);
    const fullShaEdge = edges.find((e) => e.target_id === targetEntity.id);
    expect(fullShaEdge).toBeDefined();
    expect(fullShaEdge?.confidence).toBe(0.9);
  });

  test("short 7-11 char SHA produces confidence 0.75", () => {
    const shortSha = "abcdef1";

    // Only use the short-SHA pattern to test it specifically
    const shortShaPattern = BUILT_IN_PATTERNS.find(
      (p) => p.sourceType === "git_commit" && p.confidence === 0.75,
    ) as ReferencePattern;
    expect(shortShaPattern).toBeDefined();

    // Target episode uses the short SHA as its source_ref so the resolver finds it
    const targetEp = makeEpisode("git_commit", shortSha, `commit ${shortSha}`);
    makeEntity(`commit-short-${shortSha}`, "commit", targetEp.id);

    const sourceEp = makeEpisode(
      "git_commit",
      "3333333333333333333333333333333333333333",
      `See ${shortSha} for the fix`,
    );
    const sourceEntity = makeEntity(
      "3333333333333333333333333333333333333333",
      "commit",
      sourceEp.id,
    );

    resolveReferences(graph, [sourceEp.id], [shortShaPattern]);

    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges.length).toBeGreaterThan(0);
    expect(edges[0].confidence).toBe(0.75);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Self-reference guard
// ---------------------------------------------------------------------------

describe("self-reference guard", () => {
  test("episode referencing its own source_ref does not create edge", () => {
    const sha = "cafebabe12345678cafebabe12345678cafebabe";

    // Episode with source_ref = sha, content that mentions sha
    const ep = makeEpisode(
      "git_commit",
      sha,
      `commit ${sha}\nThis reverts ${sha}`,
    );
    const entity = makeEntity(sha, "commit", ep.id);

    const _result = resolveReferences(graph, [ep.id]);

    // No self-reference edge should be created
    const edges = findEdges(graph, {
      source_id: entity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Unresolved refs when target not in graph
// ---------------------------------------------------------------------------

describe("unresolved_refs", () => {
  test("reference to entity not in graph lands in unresolved_refs", () => {
    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/99",
      "Related to https://github.com/owner/repo/pull/100 which fixed this",
    );
    const _sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/99",
      "issue",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.unresolved).toBeGreaterThan(0);
    // The PR URL pattern captures the PR number (100), which normalizeRef returns as-is
    // The resolver stores the normalized ref (capture group 1) in unresolved_refs
    const allRows = getUnresolvedRefs();
    const prRow = allRows.find(
      (r: { source_episode_id: string; resolved_at: string | null }) =>
        r.source_episode_id === sourceEp.id,
    );
    expect(prRow).toBeDefined();
    expect(prRow?.resolved_at).toBeNull();
  });

  test("later-ingested target drains matching unresolved_refs and sets resolved_at", () => {
    const prUrl = "https://github.com/owner/repo/pull/51";

    // First: source episode references a PR that doesn't exist yet
    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/50",
      `Fixed by ${prUrl}`,
    );
    const sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/50",
      "issue",
      sourceEp.id,
    );

    resolveReferences(graph, [sourceEp.id]);

    // The unresolved_ref is stored with the full URL as target_ref
    const rows = getUnresolvedRefs("github_pr", prUrl);
    expect(rows.length).toBe(1);
    expect(rows[0].resolved_at).toBeNull();

    // Now the target PR arrives
    const targetEp = makeEpisode("github_pr", prUrl, "PR #51: Fix the bug");
    const targetEntity = makeEntity(prUrl, "pull_request", targetEp.id);

    // Scanning this new episode triggers drain for the pending ref
    resolveReferences(graph, [targetEp.id]);

    // The unresolved_ref should now be resolved
    const rowsAfter = getUnresolvedRefs("github_pr", prUrl);
    expect(rowsAfter.length).toBe(1);
    expect(rowsAfter[0].resolved_at).not.toBeNull();

    // An edge should have been created
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges.length).toBeGreaterThan(0);
    const refEdge = edges.find((e) => e.target_id === targetEntity.id);
    expect(refEdge).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Test 5: Redacted episode target does not emit edge
// ---------------------------------------------------------------------------

describe("redacted episode guard", () => {
  test("target episode with status=redacted does not emit edge", () => {
    // Create target episode and mark it redacted
    const targetEp = makeEpisode(
      "git_commit",
      "deadbeef12345678deadbeef12345678deadbeef",
      "commit deadbeef12345678deadbeef12345678deadbeef",
    );
    const _targetEntity = makeEntity(
      "deadbeef12345678deadbeef12345678deadbeef",
      "commit",
      targetEp.id,
    );

    // Redact the target episode
    graph.db
      .prepare(
        "UPDATE episodes SET status = 'redacted', content = '' WHERE id = ?",
      )
      .run(targetEp.id);

    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/200",
      "Relates to commit deadbeef12345678deadbeef12345678deadbeef",
    );
    const sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/200",
      "issue",
      sourceEp.id,
    );

    resolveReferences(graph, [sourceEp.id]);

    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    // Should be 0 because target is redacted (findTargetEntityBySourceRef filters it)
    expect(edges).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Test 6: Plugin pattern — compilePluginPattern
// ---------------------------------------------------------------------------

describe("plugin patterns", () => {
  test("plugin pattern compiled from manifest string produces equivalent behavior", () => {
    const manifest = {
      source_type: "custom_tracker",
      pattern: "TICKET-(\\d+)",
      flags: "g",
      normalize_template: "TICKET-$1",
      confidence: 0.8,
    };

    const compiled = compilePluginPattern(manifest, []);

    // Create target episode with matching source_ref
    const targetEp = makeEpisode(
      "custom_tracker",
      "TICKET-42",
      "Custom tracker ticket 42",
    );
    const targetEntity = makeEntity("TICKET-42", "ticket", targetEp.id);

    const sourceEp = makeEpisode(
      "git_commit",
      "eeee111111111111111111111111111111111111",
      "Fix for TICKET-42 — see tracker for details",
    );
    const sourceEntity = makeEntity(
      "eeee111111111111111111111111111111111111",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id], [compiled]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);
    expect(edges[0].target_id).toBe(targetEntity.id);
    expect(edges[0].confidence).toBe(0.8);
  });

  test("plugin pattern collision on (source_type, pattern.source) raises error", () => {
    // The built-in pattern for github_pr has a specific pattern source
    const builtInPrPatternFound = BUILT_IN_PATTERNS.find(
      (p) => p.sourceType === "github_pr",
    );
    if (!builtInPrPatternFound) {
      throw new Error("github_pr pattern not found in BUILT_IN_PATTERNS");
    }
    const builtInPrPattern = builtInPrPatternFound;

    const collidingManifest = {
      source_type: "github_pr",
      pattern: builtInPrPattern.pattern.source,
      flags: builtInPrPattern.pattern.flags,
      normalize_template: "$1",
      confidence: 0.5,
    };

    expect(() =>
      compilePluginPattern(collidingManifest, BUILT_IN_PATTERNS),
    ).toThrow(/Plugin pattern collision/);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Deduplication — same (source, target) from two episodes → one edge, two evidence links
// ---------------------------------------------------------------------------

describe("deduplication", () => {
  test("same (source_entity, target_entity) from two episodes produces one edge, two evidence links", () => {
    const targetEp = makeEpisode(
      "github_pr",
      "https://github.com/owner/repo/pull/77",
      "PR body",
    );
    const _targetEntity = makeEntity(
      "https://github.com/owner/repo/pull/77",
      "pull_request",
      targetEp.id,
    );

    // Two source episodes that both reference the same PR
    const sourceEp1 = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/78",
      "See https://github.com/owner/repo/pull/77 for context",
    );
    const sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/78",
      "issue",
      sourceEp1.id,
    );

    const sourceEp2 = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/79",
      "Also related to https://github.com/owner/repo/pull/77",
    );
    // Link second episode to SAME entity (same issue author referencing same entity)
    graph.db
      .prepare(
        "INSERT INTO entity_evidence (entity_id, episode_id, extractor, confidence, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        sourceEntity.id,
        sourceEp2.id,
        "test",
        1.0,
        new Date().toISOString(),
      );

    resolveReferences(graph, [sourceEp1.id, sourceEp2.id]);

    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);

    // Check evidence count — should have 2 evidence links
    const evidenceLinks = graph.db
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) as count FROM edge_evidence WHERE edge_id = ?",
      )
      .get(edges[0].id);
    expect(evidenceLinks?.count).toBe(2);
  });

  test("same episode with same ref twice in content produces one edge", () => {
    const targetEp = makeEpisode(
      "github_pr",
      "https://github.com/owner/repo/pull/88",
      "PR body",
    );
    const _targetEntity = makeEntity(
      "https://github.com/owner/repo/pull/88",
      "pull_request",
      targetEp.id,
    );

    // Source episode references same URL twice
    const sourceEp = makeEpisode(
      "git_commit",
      "ffff111111111111111111111111111111111111",
      "Fix: closes https://github.com/owner/repo/pull/88 - see also https://github.com/owner/repo/pull/88",
    );
    const sourceEntity = makeEntity(
      "ffff111111111111111111111111111111111111",
      "commit",
      sourceEp.id,
    );

    const result = resolveReferences(graph, [sourceEp.id]);

    expect(result.edgesCreated).toBe(1);
    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Test 8: drainUnresolved re-scans all episodes
// ---------------------------------------------------------------------------

describe("drainUnresolved", () => {
  test("drainUnresolved resolves previously unresolved refs after target arrives", () => {
    const prUrl = "https://github.com/owner/repo/pull/301";

    // Create source episode with a reference that can't yet be resolved
    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/300",
      `Blocked by ${prUrl}`,
    );
    const sourceEntity = makeEntity(
      "https://github.com/owner/repo/issues/300",
      "issue",
      sourceEp.id,
    );

    // Initial scan — should produce unresolved
    resolveReferences(graph, [sourceEp.id]);
    const unresolved = getUnresolvedRefs("github_pr", prUrl);
    expect(unresolved.length).toBe(1);

    // Target arrives (added directly, not via resolveReferences yet)
    const targetEp = makeEpisode("github_pr", prUrl, "PR #301");
    const _targetEntity = makeEntity(prUrl, "pull_request", targetEp.id);

    // drainUnresolved should wire up the pending ref
    const result = drainUnresolved(graph);

    expect(result.edgesCreated).toBeGreaterThan(0);
    const rows = getUnresolvedRefs("github_pr", prUrl);
    expect(rows[0].resolved_at).not.toBeNull();

    const edges = findEdges(graph, {
      source_id: sourceEntity.id,
      relation_type: "references",
    });
    expect(edges.length).toBeGreaterThan(0);
  });

  test("drainUnresolved returns remaining unresolved count for unresolvable refs", () => {
    const sourceEp = makeEpisode(
      "github_issue",
      "https://github.com/owner/repo/issues/999",
      "See https://github.com/owner/repo/pull/1000 for details",
    );
    makeEntity(
      "https://github.com/owner/repo/issues/999",
      "issue",
      sourceEp.id,
    );

    resolveReferences(graph, [sourceEp.id]);

    // Target PR never arrives — drain should show remaining unresolved
    const result = drainUnresolved(graph);

    // unresolved_refs has at least 1 row still unresolved
    expect(result.unresolved).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test 9: resolveReferences with no patterns returns empty result
// ---------------------------------------------------------------------------

describe("empty patterns", () => {
  test("resolveReferences with empty patterns array returns zero edges and zero unresolved", () => {
    const ep = makeEpisode(
      "git_commit",
      "aaaa111111111111111111111111111111111111",
      "Some commit body with https://github.com/owner/repo/pull/5",
    );
    makeEntity("aaaa111111111111111111111111111111111111", "commit", ep.id);

    const result = resolveReferences(graph, [ep.id], []);
    expect(result.edgesCreated).toBe(0);
    expect(result.unresolved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Test 10: Redacted source episode is skipped
// ---------------------------------------------------------------------------

describe("redacted source episode", () => {
  test("redacted source episode is not scanned", () => {
    const targetEp = makeEpisode(
      "github_pr",
      "https://github.com/owner/repo/pull/400",
      "PR body",
    );
    makeEntity(
      "https://github.com/owner/repo/pull/400",
      "pull_request",
      targetEp.id,
    );

    const sourceEp = makeEpisode(
      "git_commit",
      "bbbb111111111111111111111111111111111111",
      "Fix: https://github.com/owner/repo/pull/400",
    );
    makeEntity(
      "bbbb111111111111111111111111111111111111",
      "commit",
      sourceEp.id,
    );

    // Redact the source episode
    graph.db
      .prepare(
        "UPDATE episodes SET status = 'redacted', content = '' WHERE id = ?",
      )
      .run(sourceEp.id);

    const result = resolveReferences(graph, [sourceEp.id]);
    expect(result.edgesCreated).toBe(0);
    expect(result.unresolved).toBe(0);
  });
});
