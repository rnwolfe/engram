/**
 * projections.test.ts — tests for project(), supersedeProjection(), and getProjection().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ResolvedInput,
} from "../../src/index.js";
import {
  addEpisode,
  closeGraph,
  createGraph,
  getProjection,
  NullGenerator,
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
  project,
  supersedeProjection,
} from "../../src/index.js";

// ─── Mock generator ───────────────────────────────────────────────────────────

function makeMockGenerator(opts?: {
  body?: string;
  confidence?: number;
  assessVerdict?: AssessVerdict;
  fail?: boolean;
}): ProjectionGenerator {
  return {
    async generate(
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      if (opts?.fail) throw new Error("generator failure");

      const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
      const now = new Date().toISOString();

      const body =
        opts?.body ??
        `---\n` +
          `id: test-id\n` +
          `kind: entity_summary\n` +
          `anchor: entity:test\n` +
          `title: "Test Projection"\n` +
          `model: mock\n` +
          `prompt_template_id: test.v1\n` +
          `prompt_hash: testhash\n` +
          `input_fingerprint: testfingerprint\n` +
          `valid_from: ${now}\n` +
          `valid_until: null\n` +
          `inputs:\n${inputList || "  []"}\n` +
          `---\n\n` +
          `# Test Projection\n\nContent here.\n`;

      return { body, confidence: opts?.confidence ?? 1.0 };
    },

    async assess(
      _projection: Projection,
      _currentInputs: ResolvedInput[],
    ): Promise<AssessVerdict> {
      return opts?.assessVerdict ?? { verdict: "still_accurate" };
    },

    async regenerate(
      _projection: Projection,
      inputs: ResolvedInput[],
    ): Promise<{ body: string; confidence: number }> {
      return this.generate(inputs);
    },
  };
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

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

// ─── NullGenerator ────────────────────────────────────────────────────────────

describe("NullGenerator", () => {
  test("generate() throws with a helpful error message", async () => {
    const gen = new NullGenerator();
    await expect(gen.generate([])).rejects.toThrow("no AI provider configured");
  });

  test("assess() throws", async () => {
    const gen = new NullGenerator();
    const fakeProjection = {} as Projection;
    await expect(gen.assess(fakeProjection, [])).rejects.toThrow(
      "no AI provider configured",
    );
  });

  test("regenerate() throws", async () => {
    const gen = new NullGenerator();
    const fakeProjection = {} as Projection;
    await expect(gen.regenerate(fakeProjection, [])).rejects.toThrow(
      "no AI provider configured",
    );
  });

  test("project() with NullGenerator throws on generate()", async () => {
    const ep = makeEpisode();
    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "episode", id: ep.id }],
        generator: new NullGenerator(),
      }),
    ).rejects.toThrow("no AI provider configured");
  });
});

// ─── project() — basic creation ───────────────────────────────────────────────

describe("project() — basic creation", () => {
  test("creates a projection and evidence rows", async () => {
    const ep = makeEpisode("The auth module handles login.");
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    expect(proj.id).toBeDefined();
    expect(proj.kind).toBe("entity_summary");
    expect(proj.anchor_type).toBe("none");
    expect(proj.anchor_id).toBeNull();
    expect(proj.body).toContain("# Test Projection");
    expect(proj.invalidated_at).toBeNull();
    expect(proj.valid_from).toBeDefined();
    expect(proj.input_fingerprint).toBeDefined();
    expect(proj.confidence).toBe(1.0);

    // Verify evidence rows were created
    const evidenceRows = graph.db
      .query<{ target_type: string; target_id: string }, [string]>(
        "SELECT target_type, target_id FROM projection_evidence WHERE projection_id = ?",
      )
      .all(proj.id);

    expect(evidenceRows.length).toBe(1);
    expect(evidenceRows[0].target_type).toBe("episode");
    expect(evidenceRows[0].target_id).toBe(ep.id);
  });

  test("creates projection with entity anchor", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "entity-abc" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    expect(proj.anchor_type).toBe("entity");
    expect(proj.anchor_id).toBe("entity-abc");
  });

  test("creates projection with multiple inputs", async () => {
    const ep1 = makeEpisode("First episode");
    const ep2 = makeEpisode("Second episode");
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [
        { type: "episode", id: ep1.id },
        { type: "episode", id: ep2.id },
      ],
      generator: gen,
    });

    const evidenceRows = graph.db
      .query<{ target_id: string }, [string]>(
        "SELECT target_id FROM projection_evidence WHERE projection_id = ? ORDER BY target_id",
      )
      .all(proj.id);

    expect(evidenceRows.length).toBe(2);
  });
});

// ─── project() — idempotency ──────────────────────────────────────────────────

describe("project() — idempotency", () => {
  test("returns existing projection when fingerprint matches", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator();

    const proj1 = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    const proj2 = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    expect(proj2.id).toBe(proj1.id);

    // Should still be exactly one active projection
    const rows = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM projections WHERE invalidated_at IS NULL",
      )
      .all();
    expect(rows.length).toBe(1);
  });

  test("returns same projection for same anchor+kind+inputs", async () => {
    const ep = makeEpisode("stable content");
    const gen = makeMockGenerator();

    const proj1 = await project(graph, {
      kind: "decision_page",
      anchor: { type: "entity", id: "ent-1" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    // Call again with identical opts
    const proj2 = await project(graph, {
      kind: "decision_page",
      anchor: { type: "entity", id: "ent-1" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    expect(proj2.id).toBe(proj1.id);
    expect(proj2.valid_from).toBe(proj1.valid_from);
  });
});

// ─── project() — supersession ─────────────────────────────────────────────────

describe("project() — supersession when fingerprint changes", () => {
  test("supersedes when a new input is added", async () => {
    const ep1 = makeEpisode("First content");
    const gen = makeMockGenerator();

    const proj1 = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-x" },
      inputs: [{ type: "episode", id: ep1.id }],
      generator: gen,
    });

    // Add a second episode — different fingerprint
    const ep2 = makeEpisode("Second content");

    const proj2 = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-x" },
      inputs: [
        { type: "episode", id: ep1.id },
        { type: "episode", id: ep2.id },
      ],
      generator: gen,
    });

    expect(proj2.id).not.toBe(proj1.id);

    // Old projection must be invalidated
    const oldRow = graph.db
      .query<
        { invalidated_at: string | null; superseded_by: string | null },
        [string]
      >("SELECT invalidated_at, superseded_by FROM projections WHERE id = ?")
      .get(proj1.id);

    expect(oldRow?.invalidated_at).not.toBeNull();
    expect(oldRow?.superseded_by).toBe(proj2.id);

    // Only one active projection
    const activeRows = graph.db
      .query<{ id: string }, []>(
        "SELECT id FROM projections WHERE invalidated_at IS NULL",
      )
      .all();
    expect(activeRows.length).toBe(1);
    expect(activeRows[0].id).toBe(proj2.id);
  });
});

// ─── project() — missing inputs ───────────────────────────────────────────────

describe("project() — missing inputs", () => {
  test("throws ProjectionInputMissingError for unknown episode", async () => {
    const gen = makeMockGenerator();

    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "episode", id: "nonexistent-id" }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionInputMissingError);
  });

  test("throws ProjectionInputMissingError for redacted episode", async () => {
    const ep = makeEpisode("sensitive content");
    // Redact the episode
    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    const gen = makeMockGenerator();

    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "episode", id: ep.id }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionInputMissingError);
  });

  test("throws ProjectionInputMissingError for unknown projection input", async () => {
    const gen = makeMockGenerator();

    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "projection", id: "nonexistent-projection" }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionInputMissingError);
  });
});

// ─── project() — frontmatter validation ──────────────────────────────────────

describe("project() — frontmatter validation", () => {
  test("throws ProjectionFrontmatterError if body lacks frontmatter", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator({ body: "# No frontmatter here\n" });

    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "episode", id: ep.id }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionFrontmatterError);
  });

  test("throws ProjectionFrontmatterError if required key is missing", async () => {
    const ep = makeEpisode();
    // Missing 'inputs' key
    const badBody =
      `---\n` +
      `id: test-id\n` +
      `kind: entity_summary\n` +
      `anchor: none\n` +
      `title: "Test"\n` +
      `model: mock\n` +
      `input_fingerprint: fp\n` +
      `valid_from: 2026-01-01T00:00:00Z\n` +
      `---\n\n# Content\n`;
    const gen = makeMockGenerator({ body: badBody });

    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "none" },
        inputs: [{ type: "episode", id: ep.id }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionFrontmatterError);
  });
});

// ─── project() — cycle detection ─────────────────────────────────────────────

describe("project() — cycle detection", () => {
  test("detects cycle: projection A → projection B → projection A", async () => {
    const ep = makeEpisode("base content");
    const gen = makeMockGenerator();

    // Create projection A (anchored to "ent-a")
    const projA = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-a" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    // Create projection B which depends on projection A
    const projB = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-b" },
      inputs: [{ type: "projection", id: projA.id }],
      generator: gen,
    });

    // Now try to create projection A with projection B as input — this would create a cycle
    await expect(
      project(graph, {
        kind: "entity_summary",
        anchor: { type: "entity", id: "ent-a" },
        inputs: [{ type: "projection", id: projB.id }],
        generator: gen,
      }),
    ).rejects.toThrow(ProjectionCycleError);
  });
});

// ─── supersedeProjection() ────────────────────────────────────────────────────

describe("supersedeProjection()", () => {
  test("sets invalidated_at, valid_until, superseded_by on old projection", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "entity", id: "ent-1" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    const ep2 = makeEpisode("new content");
    const newResolved: ResolvedInput[] = [
      {
        type: "episode",
        id: ep2.id,
        content: "new content",
        content_hash: "abc",
      },
    ];
    const newData = {
      kind: "entity_summary",
      anchor_type: "entity" as const,
      anchor_id: "ent-1",
      title: "Updated Projection",
      body:
        `---\n` +
        `id: new-id\n` +
        `kind: entity_summary\n` +
        `anchor: entity:ent-1\n` +
        `title: "Updated Projection"\n` +
        `model: mock\n` +
        `prompt_template_id: test.v1\n` +
        `prompt_hash: hash2\n` +
        `input_fingerprint: fp2\n` +
        `valid_from: 2026-01-02T00:00:00Z\n` +
        `valid_until: null\n` +
        `inputs:\n  - episode:${ep2.id}\n` +
        `---\n\n# Updated\n`,
      model: "mock",
      prompt_template_id: "test.v1",
      prompt_hash: "hash2",
      input_fingerprint: "fp2",
      confidence: 0.9,
      owner_id: null,
    };

    const newProj = supersedeProjection(graph, proj.id, newData, newResolved);

    expect(newProj.id).not.toBe(proj.id);

    // Verify old projection is invalidated
    const oldRow = graph.db
      .query<
        {
          invalidated_at: string | null;
          valid_until: string | null;
          superseded_by: string | null;
        },
        [string]
      >(
        "SELECT invalidated_at, valid_until, superseded_by FROM projections WHERE id = ?",
      )
      .get(proj.id);

    expect(oldRow?.invalidated_at).not.toBeNull();
    expect(oldRow?.valid_until).not.toBeNull();
    expect(oldRow?.superseded_by).toBe(newProj.id);

    // New projection is active
    expect(newProj.invalidated_at).toBeNull();
    expect(newProj.superseded_by).toBeNull();
  });

  test("throws if old projection does not exist", () => {
    const ep: ResolvedInput = {
      type: "episode",
      id: "fake",
      content: "x",
      content_hash: "hash",
    };
    expect(() =>
      supersedeProjection(
        graph,
        "nonexistent-projection",
        {
          kind: "k",
          anchor_type: "none",
          anchor_id: null,
          title: "T",
          body: "---\nid: x\nkind: k\nanchor: none\ntitle: T\nmodel: m\ninput_fingerprint: f\nvalid_from: 2026-01-01T00:00:00Z\ninputs:\n  []\n---\n",
          model: "m",
          prompt_template_id: null,
          prompt_hash: null,
          input_fingerprint: "f",
          confidence: 1.0,
          owner_id: null,
        },
        [ep],
      ),
    ).toThrow("not found");
  });

  test("throws if old projection is already invalidated", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    // Manually invalidate
    graph.db.run("UPDATE projections SET invalidated_at = ? WHERE id = ?", [
      new Date().toISOString(),
      proj.id,
    ]);

    const resolved: ResolvedInput[] = [
      { type: "episode", id: ep.id, content: "content", content_hash: "hash" },
    ];

    expect(() =>
      supersedeProjection(
        graph,
        proj.id,
        {
          kind: "entity_summary",
          anchor_type: "none",
          anchor_id: null,
          title: "New",
          body:
            `---\nid: new\nkind: entity_summary\nanchor: none\ntitle: "New"\n` +
            `model: mock\nprompt_template_id: null\nprompt_hash: null\n` +
            `input_fingerprint: fp2\nvalid_from: 2026-01-01T00:00:00Z\nvalid_until: null\n` +
            `inputs:\n  - episode:${ep.id}\n---\n\n# New\n`,
          model: "mock",
          prompt_template_id: null,
          prompt_hash: null,
          input_fingerprint: "fp2",
          confidence: 1.0,
          owner_id: null,
        },
        resolved,
      ),
    ).toThrow("already invalidated");
  });
});

// ─── getProjection() — stale detection ───────────────────────────────────────

describe("getProjection() — stale detection", () => {
  test("returns stale=false when inputs have not changed", async () => {
    const ep = makeEpisode("stable content");
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    const result = getProjection(graph, proj.id);
    expect(result).not.toBeNull();
    expect(result?.stale).toBe(false);
    expect(result?.stale_reason).toBeUndefined();
  });

  test("returns stale=true with input_content_changed when episode content changes", async () => {
    const ep = makeEpisode("original content");
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    // Update episode content hash directly (simulating a content change)
    const { createHash } = await import("node:crypto");
    const newHash = createHash("sha256")
      .update("updated content")
      .digest("hex");
    graph.db.run(
      "UPDATE episodes SET content = 'updated content', content_hash = ? WHERE id = ?",
      [newHash, ep.id],
    );

    const result = getProjection(graph, proj.id);
    expect(result?.stale).toBe(true);
    expect(result?.stale_reason).toBe("input_content_changed");
  });

  test("returns stale=true with input_deleted when episode is redacted", async () => {
    const ep = makeEpisode("sensitive content");
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    // Redact the episode
    graph.db.run("UPDATE episodes SET status = 'redacted' WHERE id = ?", [
      ep.id,
    ]);

    const result = getProjection(graph, proj.id);
    expect(result?.stale).toBe(true);
    expect(result?.stale_reason).toBe("input_deleted");
  });

  test("returns null for nonexistent projection", () => {
    const result = getProjection(graph, "nonexistent");
    expect(result).toBeNull();
  });

  test("returns projection with last_assessed_at", async () => {
    const ep = makeEpisode();
    const gen = makeMockGenerator();

    const proj = await project(graph, {
      kind: "entity_summary",
      anchor: { type: "none" },
      inputs: [{ type: "episode", id: ep.id }],
      generator: gen,
    });

    const result = getProjection(graph, proj.id);
    expect(result?.last_assessed_at).toBeNull(); // Not yet assessed
  });
});
