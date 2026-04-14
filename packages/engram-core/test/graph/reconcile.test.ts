/**
 * reconcile.test.ts — tests for reconcile(), softRefresh(), and currentInputState().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  currentInputState,
  listActiveProjections,
  NullGenerator,
  project,
  reconcile,
  softRefresh,
} from "../../src/index.js";

// ─── MockGenerator ────────────────────────────────────────────────────────────

interface MockGeneratorCall {
  method: "generate" | "assess" | "regenerate" | "discover";
  projectionId?: string;
}

function makeMockGenerator(opts?: {
  assessVerdict?: AssessVerdict;
  regenerateBody?: string;
  tokensPerCall?: number;
  discoverProposals?: ProjectionProposal[];
}): ProjectionGenerator & { calls: MockGeneratorCall[] } {
  const calls: MockGeneratorCall[] = [];

  return {
    calls,

    isConfigured(): boolean {
      return true;
    },

    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      calls.push({ method: "generate" });
      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();
      const body =
        `---\n` +
        `id: mock-id\n` +
        `kind: entity_summary\n` +
        `anchor: none\n` +
        `title: "Mock Projection"\n` +
        `model: mock\n` +
        `prompt_template_id: mock.v1\n` +
        `prompt_hash: mockhash\n` +
        `input_fingerprint: mockfp\n` +
        `valid_from: ${now}\n` +
        `valid_until: null\n` +
        `inputs:\n${inputList || "  []"}\n` +
        `---\n\n# Mock Projection\n\nContent.\n`;
      return { body, confidence: 1.0 };
    },

    async assess(
      projection: Projection,
      _currentInputs: ResolvedInput[],
    ): Promise<AssessVerdict> {
      calls.push({ method: "assess", projectionId: projection.id });
      return opts?.assessVerdict ?? { verdict: "still_accurate" };
    },

    async regenerate(
      projection: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      calls.push({ method: "regenerate", projectionId: projection.id });
      const body =
        opts?.regenerateBody ??
        (await (this as ProjectionGenerator).generate(inputs)).body;
      return { body, confidence: 0.9 };
    },

    async discover(_ctx: {
      delta: SubstrateDelta;
      catalog: ActiveProjectionSummary[];
      kinds: import("../../src/index.js").KindCatalog;
    }): Promise<ProjectionProposal[]> {
      calls.push({ method: "discover" });
      return opts?.discoverProposals ?? [];
    },
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

let graph: EngramGraph;

beforeEach(() => {
  graph = createGraph(":memory:");
});

afterEach(() => {
  closeGraph(graph);
});

function makeEpisode(content = "test content") {
  return addEpisode(graph, {
    source_type: "manual",
    content,
    timestamp: new Date().toISOString(),
  });
}

async function makeProjection(
  episodeId: string,
  gen: ProjectionGenerator,
  kind = "entity_summary",
  anchorId = "ent-test",
) {
  return project(graph, {
    kind,
    anchor: { type: "entity", id: anchorId },
    inputs: [{ type: "episode", id: episodeId }],
    generator: gen,
  });
}

// ─── reconcile() — no stale projections ──────────────────────────────────────

describe("reconcile() — no stale projections", () => {
  test("returns 0 assessed when there are no projections", async () => {
    const gen = makeMockGenerator();
    const result = await reconcile(graph, gen);

    expect(result.assessed).toBe(0);
    expect(result.superseded).toBe(0);
    expect(result.soft_refreshed).toBe(0);
    expect(result.status).toBe("completed");
    expect(result.run_id).toBeDefined();
    expect(result.started_at).toBeDefined();
    expect(result.completed_at).toBeDefined();
  });

  test("skips non-stale projections", async () => {
    const ep = makeEpisode("stable");
    const gen = makeMockGenerator();
    await makeProjection(ep.id, gen);

    const result = await reconcile(graph, gen);

    expect(result.assessed).toBe(0);
    expect(gen.calls.filter((c) => c.method === "assess").length).toBe(0);
  });
});

// ─── reconcile() — still_accurate verdict ────────────────────────────────────

describe("reconcile() assess — still_accurate verdict", () => {
  test("calls softRefresh: updates fingerprint and last_assessed_at", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });
    const proj = await makeProjection(ep.id, gen);

    // Make the projection stale by changing episode content
    const { createHash } = await import("node:crypto");
    const newHash = createHash("sha256").update("modified").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'modified', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    const result = await reconcile(graph, gen, { phases: ["assess"] });

    expect(result.assessed).toBe(1);
    expect(result.soft_refreshed).toBe(1);
    expect(result.superseded).toBe(0);
    expect(result.status).toBe("completed");

    // last_assessed_at should now be set
    const row = graph.db
      .query<{ last_assessed_at: string | null; id: string }, [string]>(
        "SELECT id, last_assessed_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(row?.last_assessed_at).not.toBeNull();

    // input_fingerprint should have been updated (no supersession)
    const row2 = graph.db
      .query<
        { input_fingerprint: string; invalidated_at: string | null },
        [string]
      >(
        "SELECT input_fingerprint, invalidated_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(row2?.invalidated_at).toBeNull(); // not superseded
    expect(row2?.input_fingerprint).not.toBe(proj.input_fingerprint); // fingerprint updated
  });

  test("assess() is called with the correct projection", async () => {
    const ep = makeEpisode("text");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });
    const proj = await makeProjection(ep.id, gen);

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("changed").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    await reconcile(graph, gen, { phases: ["assess"] });

    const assessCalls = gen.calls.filter((c) => c.method === "assess");
    expect(assessCalls.length).toBe(1);
    expect(assessCalls[0].projectionId).toBe(proj.id);
  });
});

// ─── reconcile() — needs_update verdict ──────────────────────────────────────

describe("reconcile() assess — needs_update verdict", () => {
  test("calls supersedeProjection: old projection is invalidated, new one is created", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: {
        verdict: "needs_update",
        reason: "content changed significantly",
      },
    });
    const proj = await makeProjection(ep.id, gen);

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("new content").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'new content', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    const result = await reconcile(graph, gen, { phases: ["assess"] });

    expect(result.assessed).toBe(1);
    expect(result.superseded).toBe(1);
    expect(result.soft_refreshed).toBe(0);

    // Old projection should be invalidated
    const oldRow = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(oldRow?.invalidated_at).not.toBeNull();

    // A new active projection should exist
    const activeRows = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM projections WHERE invalidated_at IS NULL",
      )
      .all();
    expect(activeRows.length).toBe(1);
    expect(activeRows[0].id).not.toBe(proj.id);
  });
});

// ─── reconcile() — contradicted verdict ──────────────────────────────────────

describe("reconcile() assess — contradicted verdict", () => {
  test("behaves same as needs_update: supersedes the projection", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: {
        verdict: "contradicted",
        reason: "PR reverted the change",
      },
    });
    const proj = await makeProjection(ep.id, gen);

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("reverted").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'reverted', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    const result = await reconcile(graph, gen, { phases: ["assess"] });

    expect(result.assessed).toBe(1);
    expect(result.superseded).toBe(1);
    expect(result.soft_refreshed).toBe(0);

    const oldRow = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(oldRow?.invalidated_at).not.toBeNull();
  });
});

// ─── reconcile() — dryRun ─────────────────────────────────────────────────────

describe("reconcile() — dryRun", () => {
  test("counts are correct but no writes happen (still_accurate)", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });
    const proj = await makeProjection(ep.id, gen);
    const originalFingerprint = proj.input_fingerprint;

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("changed").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    const result = await reconcile(graph, gen, {
      phases: ["assess"],
      dryRun: true,
    });

    expect(result.assessed).toBe(1);
    expect(result.soft_refreshed).toBe(1);

    // Projection should NOT be updated (dry run)
    const row = graph.db
      .query<
        { input_fingerprint: string; last_assessed_at: string | null },
        [string]
      >(
        "SELECT input_fingerprint, last_assessed_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(row?.input_fingerprint).toBe(originalFingerprint);
    expect(row?.last_assessed_at).toBeNull();
  });

  test("counts are correct but no writes happen (needs_update)", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "needs_update", reason: "changed" },
    });
    const proj = await makeProjection(ep.id, gen);

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("changed").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    const result = await reconcile(graph, gen, {
      phases: ["assess"],
      dryRun: true,
    });

    expect(result.assessed).toBe(1);
    expect(result.superseded).toBe(1);

    // Original projection must still be active
    const row = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM projections WHERE id = ?",
      )
      .get(proj.id);
    expect(row?.invalidated_at).toBeNull();

    // Only one projection should exist
    const all = graph.db
      .query<{ id: string }, []>("SELECT id FROM projections")
      .all();
    expect(all.length).toBe(1);
  });
});

// ─── reconcile() — budget exhaustion ─────────────────────────────────────────

describe("reconcile() — budget exhaustion", () => {
  test("stops early when budget is exhausted, status=partial", async () => {
    const ep1 = makeEpisode("first");
    const ep2 = makeEpisode("second");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });

    await makeProjection(ep1.id, gen, "entity_summary", "ent-1");
    await makeProjection(ep2.id, gen, "entity_summary", "ent-2");

    // Make both stale
    const { createHash } = await import("node:crypto");
    const h1 = createHash("sha256").update("changed1").digest("hex");
    const h2 = createHash("sha256").update("changed2").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed1', content_hash = ? WHERE id = ?",
      [h1, ep1.id],
    );
    graph.db.run(
      "UPDATE episodes SET content = 'changed2', content_hash = ? WHERE id = ?",
      [h2, ep2.id],
    );

    // Budget of 1 token — allows exactly 1 assess call before exhaustion
    // (budget.consume(1) is called after each assess, then checked)
    const result = await reconcile(graph, gen, {
      phases: ["assess"],
      maxCost: 1,
    });

    expect(result.status).toBe("partial");
    // assessed count depends on where budget hits: at least 1 was checked
    expect(result.assessed).toBeGreaterThan(0);
    expect(result.assessed).toBeLessThan(2);
  });
});

// ─── reconcile() — reconciliation_runs row ────────────────────────────────────

describe("reconcile() — reconciliation_runs table", () => {
  test("inserts and completes reconciliation_runs row", async () => {
    const gen = makeMockGenerator();
    const result = await reconcile(graph, gen);

    const row = graph.db
      .query<
        {
          id: string;
          started_at: string;
          completed_at: string | null;
          status: string;
          projections_checked: number;
          projections_refreshed: number;
          projections_superseded: number;
          dry_run: number;
        },
        [string]
      >("SELECT * FROM reconciliation_runs WHERE id = ?")
      .get(result.run_id);

    expect(row).not.toBeNull();
    expect(row?.status).toBe("completed");
    expect(row?.completed_at).not.toBeNull();
    expect(row?.started_at).toBeDefined();
    expect(row?.projections_checked).toBe(0);
    expect(row?.dry_run).toBe(0);
  });

  test("sets dry_run=1 in reconciliation_runs when dryRun=true", async () => {
    const gen = makeMockGenerator();
    const result = await reconcile(graph, gen, { dryRun: true });

    const row = graph.db
      .query<{ dry_run: number }, [string]>(
        "SELECT dry_run FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);

    expect(row?.dry_run).toBe(1);
  });

  test("records correct counts in reconciliation_runs", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });
    await makeProjection(ep.id, gen);

    // Make stale
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256").update("changed").digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'changed', content_hash = ? WHERE id = ?",
      [h, ep.id],
    );

    const result = await reconcile(graph, gen, { phases: ["assess"] });

    const row = graph.db
      .query<
        {
          projections_checked: number;
          projections_refreshed: number;
          projections_superseded: number;
        },
        [string]
      >(
        "SELECT projections_checked, projections_refreshed, projections_superseded FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);

    expect(row?.projections_checked).toBe(1);
    expect(row?.projections_refreshed).toBe(1);
    expect(row?.projections_superseded).toBe(0);
  });

  test("sets status=partial in reconciliation_runs when budget exhausted", async () => {
    const ep1 = makeEpisode("a");
    const ep2 = makeEpisode("b");
    const gen = makeMockGenerator({
      assessVerdict: { verdict: "still_accurate" },
    });

    await makeProjection(ep1.id, gen, "entity_summary", "ent-a");
    await makeProjection(ep2.id, gen, "entity_summary", "ent-b");

    // Make both stale
    const { createHash } = await import("node:crypto");
    graph.db.run(
      "UPDATE episodes SET content = 'x', content_hash = ? WHERE id = ?",
      [createHash("sha256").update("x").digest("hex"), ep1.id],
    );
    graph.db.run(
      "UPDATE episodes SET content = 'y', content_hash = ? WHERE id = ?",
      [createHash("sha256").update("y").digest("hex"), ep2.id],
    );

    const result = await reconcile(graph, gen, {
      phases: ["assess"],
      maxCost: 1,
    });

    const row = graph.db
      .query<{ status: string }, [string]>(
        "SELECT status FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);

    expect(row?.status).toBe("partial");
  });
});

// ─── softRefresh() ────────────────────────────────────────────────────────────

describe("softRefresh()", () => {
  test("updates input_fingerprint and last_assessed_at without supersession", async () => {
    const ep = makeEpisode("original");
    const gen = makeMockGenerator();
    const proj = await makeProjection(ep.id, gen);

    const now = new Date().toISOString();
    const newFp = "new-fingerprint-value";
    const inputs = currentInputState(graph, proj.id);

    softRefresh(graph, proj.id, newFp, now, inputs);

    const row = graph.db
      .query<
        {
          input_fingerprint: string;
          last_assessed_at: string | null;
          invalidated_at: string | null;
          superseded_by: string | null;
          valid_from: string;
        },
        [string]
      >(
        "SELECT input_fingerprint, last_assessed_at, invalidated_at, superseded_by, valid_from FROM projections WHERE id = ?",
      )
      .get(proj.id);

    expect(row?.input_fingerprint).toBe(newFp);
    expect(row?.last_assessed_at).toBe(now);
    expect(row?.invalidated_at).toBeNull();
    expect(row?.superseded_by).toBeNull();
    expect(row?.valid_from).toBe(proj.valid_from); // valid_from unchanged
  });

  test("updates content_hash values in projection_evidence", async () => {
    const ep = makeEpisode("original content");
    const gen = makeMockGenerator();
    const proj = await makeProjection(ep.id, gen);

    // Simulate new content hash
    const { createHash } = await import("node:crypto");
    const newContent = "new content for hash";
    const newHash = createHash("sha256").update(newContent).digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = ?, content_hash = ? WHERE id = ?",
      [newContent, newHash, ep.id],
    );

    const inputs = currentInputState(graph, proj.id);
    const now = new Date().toISOString();
    softRefresh(graph, proj.id, "new-fp", now, inputs);

    const evidenceRow = graph.db
      .query<{ content_hash: string | null }, [string, string]>(
        "SELECT content_hash FROM projection_evidence WHERE projection_id = ? AND target_id = ?",
      )
      .get(proj.id, ep.id);

    expect(evidenceRow?.content_hash).toBe(newHash);
  });
});

// ─── currentInputState() ─────────────────────────────────────────────────────

describe("currentInputState()", () => {
  test("resolves episode content from the substrate", async () => {
    const ep = makeEpisode("hello world");
    const gen = makeMockGenerator();
    const proj = await makeProjection(ep.id, gen);

    const inputs = currentInputState(graph, proj.id);

    expect(inputs.length).toBe(1);
    expect(inputs[0].type).toBe("episode");
    expect(inputs[0].id).toBe(ep.id);
    expect(inputs[0].content).toBe("hello world");
    expect(inputs[0].content_hash).toBeDefined();
  });

  test("returns null content for redacted episode", async () => {
    const ep = makeEpisode("sensitive");
    const gen = makeMockGenerator();
    const proj = await makeProjection(ep.id, gen);

    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    const inputs = currentInputState(graph, proj.id);

    expect(inputs[0].content).toBeNull();
    expect(inputs[0].content_hash).toBeNull();
  });

  test("returns empty array for projection with no evidence", () => {
    // Insert a bare projection row without evidence
    const now = new Date().toISOString();
    graph.db.run(
      `INSERT INTO projections
         (id, kind, anchor_type, anchor_id, title, body, body_format,
          model, prompt_template_id, prompt_hash, input_fingerprint,
          confidence, valid_from, valid_until, last_assessed_at,
          invalidated_at, superseded_by, created_at, owner_id)
       VALUES ('bare-id', 'test', 'none', NULL, 'T', '---\nid: x\nkind: test\nanchor: none\ntitle: T\nmodel: m\ninput_fingerprint: f\nvalid_from: 2026-01-01T00:00:00Z\ninputs:\n  []\n---\n', 'markdown',
               'm', NULL, NULL, 'fp', 1.0, ?, NULL, NULL, NULL, NULL, ?, NULL)`,
      [now, now],
    );

    const inputs = currentInputState(graph, "bare-id");
    expect(inputs).toEqual([]);
  });
});

// ─── reconcile() — discover phase ────────────────────────────────────────────

describe("reconcile() — discover phase — integration", () => {
  test("seeds substrate, discover proposals are authored, projections_discovered updated", async () => {
    // Seed substrate with an episode
    const ep = makeEpisode("some important event happened");

    // Generator returns one valid proposal for the episode
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "This episode describes an important event",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(1);
    expect(result.assessed).toBe(0);
    expect(result.status).toBe("completed");

    // Verify a projection was actually written
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(1);
    expect(projections[0].projection.kind).toBe("entity_summary");

    // Verify projections_discovered in reconciliation_runs
    const row = graph.db
      .query<{ projections_discovered: number }, [string]>(
        "SELECT projections_discovered FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(row?.projections_discovered).toBe(1);
  });

  test("discover phase is skipped when phases = ['assess'] only", async () => {
    const ep = makeEpisode("some episode");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "should not be called",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["assess"] });

    expect(result.discovered).toBe(0);
    // No projections should have been authored
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);
    // discover() should not have been called
    const discoverCalls = gen.calls.filter((c) => c.method === "discover");
    expect(discoverCalls.length).toBe(0);
  });

  test("discover phase runs when phases = ['discover'] only", async () => {
    const ep = makeEpisode("discover only test");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "a good reason",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(1);
    const discoverCalls = gen.calls.filter((c) => c.method === "discover");
    expect(discoverCalls.length).toBe(1);
  });

  test("cursor: dry run does not persist or advance cursor", async () => {
    const ep = makeEpisode("ephemeral");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "dry run proposal",
        },
      ],
    });

    // Run a dry run
    const dryResult = await reconcile(graph, gen, {
      phases: ["discover"],
      dryRun: true,
    });

    // Dry run counts the proposal but does NOT author the projection
    expect(dryResult.discovered).toBe(1);
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);

    // Dry run row is marked dry_run=1
    const runRow = graph.db
      .query<{ dry_run: number; status: string }, [string]>(
        "SELECT dry_run, status FROM reconciliation_runs WHERE id = ?",
      )
      .get(dryResult.run_id);
    expect(runRow?.dry_run).toBe(1);
    expect(runRow?.status).toBe("completed");

    // Cursor for subsequent non-dry-run discover phase should still be null
    // (no non-dry-run run has completed yet)
    const lastNonDryRun = graph.db
      .query<{ completed_at: string | null }, [number]>(
        "SELECT completed_at FROM reconciliation_runs WHERE dry_run = ? AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
      )
      .get(0);
    expect(lastNonDryRun).toBeNull();
  });

  test("cursor: second run only sees delta since first run completed", async () => {
    const ep1 = makeEpisode("first episode before cursor");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep1.id }],
          rationale: "first run proposal",
        },
      ],
    });

    // First non-dry-run discover
    const firstResult = await reconcile(graph, gen, { phases: ["discover"] });
    expect(firstResult.discovered).toBe(1);
    expect(firstResult.status).toBe("completed");

    // Second run — generator returns empty proposals
    // The delta since first run completed should be empty (no new substrate)
    let capturedDelta: SubstrateDelta | null = null;
    const gen2 = makeMockGenerator({ discoverProposals: [] });
    // Monkey-patch discover to capture the delta
    const originalDiscover = gen2.discover.bind(gen2);
    gen2.discover = async (ctx) => {
      capturedDelta = ctx.delta;
      return originalDiscover(ctx);
    };

    const secondResult = await reconcile(graph, gen2, { phases: ["discover"] });
    expect(secondResult.discovered).toBe(0);

    // Delta should have a non-null `since` (the first run's completed_at)
    expect(capturedDelta).not.toBeNull();
    expect((capturedDelta as SubstrateDelta | null)?.since).not.toBeNull();
    // ep1 should NOT be in the delta (it was ingested before the cursor)
    const deltaEpisodeIds =
      (capturedDelta as SubstrateDelta | null)?.episodes.map((e) => e.id) ?? [];
    expect(deltaEpisodeIds).not.toContain(ep1.id);
  });
});

// ─── reconcile() — discover phase — malformed proposals ─────────────────────

describe("reconcile() — discover phase — malformed proposal rejection", () => {
  test("rejects proposal with unknown kind", async () => {
    const ep = makeEpisode("content");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "nonexistent_kind",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "invalid kind",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    // Proposal should be skipped — no projection authored
    expect(result.discovered).toBe(0);
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);
  });

  test("rejects proposal with empty inputs array", async () => {
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [],
          rationale: "no inputs",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(0);
  });

  test("rejects proposal with invalid input type", async () => {
    const ep = makeEpisode("content");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [
            {
              type: "invalid_type" as "episode",
              id: ep.id,
            },
          ],
          rationale: "bad input type",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(0);
  });

  test("rejects proposal with invalid anchor type", async () => {
    const ep = makeEpisode("content");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: { type: "bad_anchor_type", id: "some-id" },
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "bad anchor type",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(0);
  });

  test("valid proposal passes validation and is authored", async () => {
    const ep = makeEpisode("valid content for projection");
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "valid proposal",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(1);
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(1);
  });
});

// ─── reconcile() — discover phase — budget exhaustion ────────────────────────

describe("reconcile() — discover phase — budget exhaustion", () => {
  test("budget exhaustion during discover sets status=partial with error reason", async () => {
    const ep1 = makeEpisode("episode one");
    const ep2 = makeEpisode("episode two");

    // Two proposals — budget of 1 means only the first project() call succeeds
    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep1.id }],
          rationale: "first",
        },
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep2.id }],
          rationale: "second",
        },
      ],
    });

    // Budget of 2: 1 for discover() call + 1 for first project() call → exhausted before second
    const result = await reconcile(graph, gen, {
      phases: ["discover"],
      maxCost: 2,
    });

    expect(result.status).toBe("partial");
    expect(result.error).toBeDefined();
    expect(result.discovered).toBeGreaterThan(0);

    const runRow = graph.db
      .query<{ status: string; error: string | null }, [string]>(
        "SELECT status, error FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(runRow?.status).toBe("partial");
    expect(runRow?.error).not.toBeNull();
  });
});

// ─── reconcile() — discover phase — substrate delta content ──────────────────

describe("reconcile() — discover phase — substrate delta", () => {
  test("delta includes episodes, entities, and edges", async () => {
    // Seed entities and edges
    const ep = makeEpisode("entity evidence");
    const ep2 = addEpisode(graph, {
      source_type: "manual",
      content: "other entity evidence",
      timestamp: new Date().toISOString(),
    });
    const ep3 = addEpisode(graph, {
      source_type: "manual",
      content: "edge evidence",
      timestamp: new Date().toISOString(),
    });
    const entity = addEntity(
      graph,
      { canonical_name: "TestEntity", entity_type: "module" },
      [{ episode_id: ep.id, extractor: "manual" }],
    );
    const entity2 = addEntity(
      graph,
      { canonical_name: "OtherEntity", entity_type: "module" },
      [{ episode_id: ep2.id, extractor: "manual" }],
    );
    addEdge(
      graph,
      {
        source_id: entity.id,
        target_id: entity2.id,
        relation_type: "depends_on",
        edge_kind: "observed",
        fact: "TestEntity depends on OtherEntity",
      },
      [{ episode_id: ep3.id, extractor: "manual" }],
    );

    let capturedDelta: SubstrateDelta | null = null;
    const gen = makeMockGenerator({ discoverProposals: [] });
    gen.discover = async (ctx) => {
      capturedDelta = ctx.delta;
      return [];
    };

    await reconcile(graph, gen, { phases: ["discover"] });

    expect(capturedDelta).not.toBeNull();
    const delta = capturedDelta as SubstrateDelta;
    expect(delta.episodes.length).toBeGreaterThan(0);
    expect(delta.entities.length).toBeGreaterThan(0);
    expect(delta.edges.length).toBeGreaterThan(0);
    // Verify episode is in delta
    expect(delta.episodes.map((e) => e.id)).toContain(ep.id);
    // Verify entity is in delta
    expect(delta.entities.map((e) => e.id)).toContain(entity.id);
  });

  test("delta passed to discover includes catalog of active projections", async () => {
    const ep = makeEpisode("pre-existing projection episode");
    const preGen = makeMockGenerator();
    // Author a projection first
    await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: preGen,
    });

    let capturedCatalog: ActiveProjectionSummary[] | null = null;
    const gen = makeMockGenerator({ discoverProposals: [] });
    gen.discover = async (ctx) => {
      capturedCatalog = ctx.catalog;
      return [];
    };

    await reconcile(graph, gen, { phases: ["discover"] });

    expect(capturedCatalog).not.toBeNull();
    const catalog = capturedCatalog as ActiveProjectionSummary[];
    expect(catalog.length).toBe(1);
    expect(catalog[0].kind).toBe("entity_summary");
  });
});

// ─── NullGenerator.discover() ────────────────────────────────────────────────

describe("NullGenerator", () => {
  test("discover() returns [] without throwing", async () => {
    const nullGen = new NullGenerator();
    const ep = makeEpisode("some episode");
    const delta: SubstrateDelta = {
      since: null,
      episodes: [
        {
          type: "episode",
          id: ep.id,
          summary: "some episode",
          changed_at: new Date().toISOString(),
        },
      ],
      entities: [],
      edges: [],
    };
    const result = await nullGen.discover({ delta, catalog: [], kinds: [] });
    expect(result).toEqual([]);
  });
});

// ─── reconcile() — budget exhausted before any authoring ─────────────────────

describe("reconcile() — discover phase — budget exhausted before any authoring", () => {
  test("status=partial with discovered=0 when budget is gone after discover() call", async () => {
    const ep = makeEpisode("episode for budget test");

    const gen = makeMockGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: ep.id }],
          rationale: "should not be authored — budget gone",
        },
      ],
    });

    // Budget of 1: the discover() call itself consumes 1 unit (budget.consume(1)),
    // leaving nothing for any project() calls. discovered stays 0.
    const result = await reconcile(graph, gen, {
      phases: ["discover"],
      maxCost: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.discovered).toBe(0);

    // Verify no projection was authored
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);

    // reconciliation_runs row should reflect partial
    const runRow = graph.db
      .query<{ status: string; projections_discovered: number }, [string]>(
        "SELECT status, projections_discovered FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(runRow?.status).toBe("partial");
    expect(runRow?.projections_discovered).toBe(0);
  });
});
