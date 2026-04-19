/**
 * reconcile-discover.test.ts — integration tests for the reconcile() discover phase.
 *
 * Covers:
 * - Integration: 10+ episodes seeded, 2 proposals authored, projections_discovered=2
 * - Dry-run: proposals counted but no projections written, cursor not advanced
 * - Malformed proposal: one valid + one missing kind → only valid one authored
 * - Budget exhaustion: status='partial'
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
  addEpisode,
  closeGraph,
  createGraph,
  listActiveProjections,
  NullGenerator,
  reconcile,
} from "../../src/index.js";

// ─── Stub generator ───────────────────────────────────────────────────────────

function makeStubGenerator(opts?: {
  discoverProposals?: ProjectionProposal[];
}): ProjectionGenerator & { discoverCalls: number } {
  let discoverCalls = 0;

  return {
    get discoverCalls() {
      return discoverCalls;
    },

    isConfigured(): boolean {
      return true;
    },

    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();
      const body =
        `---\n` +
        `id: stub-id\n` +
        `kind: entity_summary\n` +
        `anchor: none\n` +
        `title: "Stub Projection"\n` +
        `model: stub\n` +
        `prompt_template_id: stub.v1\n` +
        `prompt_hash: stubhash\n` +
        `input_fingerprint: stubfp\n` +
        `valid_from: ${now}\n` +
        `valid_until: null\n` +
        `inputs:\n${inputList || "  []"}\n` +
        `---\n\n# Stub Projection\n\nContent.\n`;
      return { body, confidence: 1.0 };
    },

    async assess(
      _projection: Projection,
      _currentInputs: ResolvedInput[],
    ): Promise<AssessVerdict> {
      return { verdict: "still_accurate" };
    },

    async regenerate(
      _projection: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      return this.generate(inputs);
    },

    async discover(_ctx: {
      delta: SubstrateDelta;
      catalog: ActiveProjectionSummary[];
      kinds: import("../../src/index.js").KindCatalog;
    }): Promise<ProjectionProposal[]> {
      discoverCalls++;
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

function seedEpisodes(count: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const ep = addEpisode(graph, {
      source_type: "manual",
      content: `Episode ${i}: content about feature ${i} being implemented`,
      timestamp: new Date().toISOString(),
    });
    ids.push(ep.id);
  }
  return ids;
}

// ─── Integration: 10+ episodes, 2 proposals authored ─────────────────────────

describe("reconcile discover — integration", () => {
  test("seeds 10+ episodes, generator returns 2 proposals, both are authored and projections_discovered=2", async () => {
    const episodeIds = seedEpisodes(12);

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          // entity_summary anchored to none
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "First proposal from delta",
        },
        {
          // topic_cluster with different kind — distinct from the first proposal
          kind: "topic_cluster",
          anchor: null,
          inputs: [
            { type: "episode", id: episodeIds[1] },
            { type: "episode", id: episodeIds[2] },
          ],
          rationale: "Second proposal from delta",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    // Both proposals should be authored
    expect(result.discovered).toBe(2);
    expect(result.assessed).toBe(0);
    expect(result.status).toBe("completed");

    // Both projections should exist in the graph
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(2);

    // projections_discovered column should be updated
    const row = graph.db
      .query<{ projections_discovered: number }, [string]>(
        "SELECT projections_discovered FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(row?.projections_discovered).toBe(2);

    // discover() should have been called exactly once
    expect(gen.discoverCalls).toBe(1);
  });

  test("delta passed to discover contains all 10+ seeded episodes", async () => {
    const episodeIds = seedEpisodes(10);

    let capturedDelta: SubstrateDelta | null = null;
    const gen = makeStubGenerator({ discoverProposals: [] });
    const baseDiscover = gen.discover.bind(gen);
    gen.discover = async (ctx) => {
      capturedDelta = ctx.delta;
      return baseDiscover(ctx);
    };

    await reconcile(graph, gen, { phases: ["discover"] });

    expect(capturedDelta).not.toBeNull();
    const deltaEpIds = (capturedDelta as SubstrateDelta).episodes.map(
      (e) => e.id,
    );
    for (const id of episodeIds) {
      expect(deltaEpIds).toContain(id);
    }
  });
});

// ─── Dry-run: no writes, cursor not advanced ──────────────────────────────────

describe("reconcile discover — dry-run", () => {
  test("proposals are counted but no projections are written to the DB", async () => {
    const episodeIds = seedEpisodes(3);

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "dry run proposal one",
        },
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[1] }],
          rationale: "dry run proposal two",
        },
      ],
    });

    const result = await reconcile(graph, gen, {
      phases: ["discover"],
      dryRun: true,
    });

    // Proposals should be counted
    expect(result.discovered).toBe(2);
    expect(result.status).toBe("completed");

    // But no projections should be written
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);

    // The reconciliation_runs row should be marked dry_run=1
    const runRow = graph.db
      .query<{ dry_run: number; status: string }, [string]>(
        "SELECT dry_run, status FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(runRow?.dry_run).toBe(1);
    expect(runRow?.status).toBe("completed");
  });

  test("cursor is not advanced after a dry run — next non-dry run sees the full delta", async () => {
    const episodeIds = seedEpisodes(5);

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "dry run only",
        },
      ],
    });

    // Run a dry run
    await reconcile(graph, gen, { phases: ["discover"], dryRun: true });

    // No non-dry-run run should exist → cursor is still null
    const lastNonDryRun = graph.db
      .query<{ completed_at: string | null }, []>(
        "SELECT completed_at FROM reconciliation_runs WHERE dry_run = 0 AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
      )
      .get();
    expect(lastNonDryRun).toBeNull();

    // A subsequent real run should still see ALL seeded episodes in the delta
    let capturedDelta: SubstrateDelta | null = null;
    const gen2 = makeStubGenerator({ discoverProposals: [] });
    gen2.discover = async (ctx) => {
      capturedDelta = ctx.delta;
      return [];
    };

    await reconcile(graph, gen2, { phases: ["discover"] });

    expect(capturedDelta).not.toBeNull();
    const delta = capturedDelta as SubstrateDelta;
    // delta.since should be null (no prior non-dry-run cursor)
    expect(delta.since).toBeNull();
    // All seeded episodes should be in the delta
    const deltaIds = delta.episodes.map((e) => e.id);
    for (const id of episodeIds) {
      expect(deltaIds).toContain(id);
    }
  });
});

// ─── Malformed proposal: one valid + one missing kind ────────────────────────

describe("reconcile discover — malformed proposal rejection", () => {
  test("one valid proposal and one missing kind → only the valid one is authored, error is logged", async () => {
    const episodeIds = seedEpisodes(2);

    const warnMessages: string[] = [];
    const origWarn = console.warn.bind(console);
    console.warn = (...args: unknown[]) => {
      warnMessages.push(args.map(String).join(" "));
      origWarn(...args);
    };

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          // Valid proposal
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "valid proposal",
        },
        {
          // Malformed: missing kind (empty string)
          kind: "" as "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[1] }],
          rationale: "malformed — kind is empty",
        },
      ],
    });

    let result: Awaited<ReturnType<typeof reconcile>> | undefined;
    try {
      result = await reconcile(graph, gen, { phases: ["discover"] });
    } finally {
      console.warn = origWarn;
    }

    // Only the valid proposal should have been authored
    expect(result?.discovered).toBe(1);

    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(1);

    // A warning should have been emitted for the malformed proposal
    const skippedWarnings = warnMessages.filter((m) =>
      m.includes("skipping proposal"),
    );
    expect(skippedWarnings.length).toBeGreaterThan(0);
  });

  test("one valid proposal and one with nonexistent kind → only valid authored", async () => {
    const episodeIds = seedEpisodes(2);

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "valid",
        },
        {
          kind: "nonexistent_kind_xyz" as "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[1] }],
          rationale: "bad kind",
        },
      ],
    });

    const result = await reconcile(graph, gen, { phases: ["discover"] });

    expect(result.discovered).toBe(1);
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(1);
  });
});

// ─── Budget exhaustion ────────────────────────────────────────────────────────

describe("reconcile discover — budget exhaustion", () => {
  test("status=partial when maxCost is exceeded during discover phase", async () => {
    const episodeIds = seedEpisodes(3);

    // Two proposals, budget of 2 → discover() consumes 1, first project() consumes 1 → exhausted
    const gen = makeStubGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "first",
        },
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[1] }],
          rationale: "second (budget will be gone)",
        },
      ],
    });

    const result = await reconcile(graph, gen, {
      phases: ["discover"],
      maxCost: 2,
    });

    expect(result.status).toBe("partial");
    expect(result.error).toBeDefined();
    // At least 1 was authored before budget ran out
    expect(result.discovered).toBeGreaterThan(0);

    // Verify the reconciliation_runs row reflects partial status
    const runRow = graph.db
      .query<{ status: string; error: string | null }, [string]>(
        "SELECT status, error FROM reconciliation_runs WHERE id = ?",
      )
      .get(result.run_id);
    expect(runRow?.status).toBe("partial");
    expect(runRow?.error).not.toBeNull();
  });

  test("status=partial with discovered=0 when budget exhausted after discover() call but before any project() call", async () => {
    const episodeIds = seedEpisodes(2);

    const gen = makeStubGenerator({
      discoverProposals: [
        {
          kind: "entity_summary",
          anchor: null,
          inputs: [{ type: "episode", id: episodeIds[0] }],
          rationale: "cannot be authored — budget gone",
        },
      ],
    });

    // Budget of 1: discover() call exhausts it, leaving nothing for project()
    const result = await reconcile(graph, gen, {
      phases: ["discover"],
      maxCost: 1,
    });

    expect(result.status).toBe("partial");
    expect(result.discovered).toBe(0);

    // No projection should have been authored
    const projections = listActiveProjections(graph, {});
    expect(projections.length).toBe(0);
  });

  test("NullGenerator returns [] from discover without throwing", async () => {
    seedEpisodes(5);
    const nullGen = new NullGenerator();

    // NullGenerator.isConfigured() returns false → stub mode: cursor not advanced
    const result = await reconcile(graph, nullGen, { phases: ["discover"] });

    // No projections should have been authored
    expect(result.discovered).toBe(0);
    expect(result.stub_mode).toBe(true);
    // Status should be completed (stub mode is not a failure)
    expect(result.status).toBe("completed");
  });
});
