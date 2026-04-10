/**
 * datasets/stale-knowledge/loader.ts — Loader and preparer for the stale-knowledge dataset.
 *
 * Loads StaleKnowledgeDataset from the JSON fixture file, validates it,
 * and prepares scenarios by authoring projections at commit X using project().
 */

import type { EngramGraph, Projection, ProjectionGenerator } from "engram-core";
import { findEntities, project, resolveEntity } from "engram-core";

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single stale-knowledge benchmark scenario from the dataset file. */
export interface StaleKnowledgeScenario {
  /** Unique scenario identifier (e.g. 'sk-001'). */
  id: string;
  /** Human-readable description of what is being tested. */
  description: string;
  /** Entity canonical name or fragment used to resolve the anchor. */
  anchor_description: string;
  /** Kind label for the projection (e.g. 'entity_summary', 'bus_factor_report'). */
  projection_kind: string;
  /** Whether the projection should be stale after advancing from X to Y. */
  expected_stale: boolean;
  /** Expected outcome from reconcile().assess() phase. */
  expected_reconcile_outcome:
    | "still_accurate"
    | "needs_update"
    | "contradicted";
}

/** The top-level dataset file structure. */
export interface StaleKnowledgeDataset {
  version: string;
  description: string;
  /** Git tag / commit ref representing the "before" snapshot (projection authored here). */
  commit_x: string;
  /** Git tag / commit ref representing the "after" snapshot (check staleness here). */
  commit_y: string;
  scenarios: StaleKnowledgeScenario[];
}

/** A scenario that has been prepared: anchor resolved, projection authored at commit X. */
export interface PreparedScenario {
  scenario: StaleKnowledgeScenario;
  /** Resolved entity ID for the anchor (null if resolution failed). */
  anchor_id: string | null;
  /** Authored projection at commit X (null if authoring failed). */
  projection: Projection | null;
  /** Error message if preparation failed. */
  error?: string;
}

// ─── Dataset loading ──────────────────────────────────────────────────────────

/**
 * Load and validate a StaleKnowledgeDataset from a plain JS object (parsed JSON).
 *
 * @param raw - Parsed JSON object.
 * @returns Validated StaleKnowledgeDataset.
 * @throws Error if the structure is invalid.
 */
export function loadDataset(raw: unknown): StaleKnowledgeDataset {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("StaleKnowledgeDataset: root must be an object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== "string") {
    throw new Error(
      "StaleKnowledgeDataset: missing or invalid 'version' field",
    );
  }
  if (typeof obj.description !== "string") {
    throw new Error(
      "StaleKnowledgeDataset: missing or invalid 'description' field",
    );
  }
  if (typeof obj.commit_x !== "string") {
    throw new Error(
      "StaleKnowledgeDataset: missing or invalid 'commit_x' field",
    );
  }
  if (typeof obj.commit_y !== "string") {
    throw new Error(
      "StaleKnowledgeDataset: missing or invalid 'commit_y' field",
    );
  }
  if (!Array.isArray(obj.scenarios)) {
    throw new Error("StaleKnowledgeDataset: 'scenarios' must be an array");
  }

  const scenarios: StaleKnowledgeScenario[] = obj.scenarios.map(
    (s: unknown, idx: number) => validateScenario(s, idx),
  );

  return {
    version: obj.version,
    description: obj.description,
    commit_x: obj.commit_x,
    commit_y: obj.commit_y,
    scenarios,
  };
}

function validateScenario(raw: unknown, idx: number): StaleKnowledgeScenario {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}] must be an object`,
    );
  }

  const s = raw as Record<string, unknown>;

  if (typeof s.id !== "string" || !s.id) {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].id must be a non-empty string`,
    );
  }
  if (typeof s.description !== "string") {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].description must be a string`,
    );
  }
  if (typeof s.anchor_description !== "string" || !s.anchor_description) {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].anchor_description must be a non-empty string`,
    );
  }
  if (typeof s.projection_kind !== "string" || !s.projection_kind) {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].projection_kind must be a non-empty string`,
    );
  }
  if (typeof s.expected_stale !== "boolean") {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].expected_stale must be a boolean`,
    );
  }
  const validOutcomes = ["still_accurate", "needs_update", "contradicted"];
  if (
    typeof s.expected_reconcile_outcome !== "string" ||
    !validOutcomes.includes(s.expected_reconcile_outcome)
  ) {
    throw new Error(
      `StaleKnowledgeDataset: scenario[${idx}].expected_reconcile_outcome must be one of ${validOutcomes.join(", ")}`,
    );
  }

  return {
    id: s.id,
    description: s.description,
    anchor_description: s.anchor_description,
    projection_kind: s.projection_kind,
    expected_stale: s.expected_stale,
    expected_reconcile_outcome: s.expected_reconcile_outcome as
      | "still_accurate"
      | "needs_update"
      | "contradicted",
  };
}

// ─── Scenario preparation ─────────────────────────────────────────────────────

/**
 * Resolves the anchor entity for a scenario from the graph.
 *
 * First tries an exact match via resolveEntity(). If that fails, falls back to
 * findEntities() with a canonical_name filter and returns the first match.
 */
function resolveAnchor(
  graph: EngramGraph,
  anchorDescription: string,
): string | null {
  // Try exact canonical name / alias match first
  const exact = resolveEntity(graph, anchorDescription);
  if (exact) return exact.id;

  // Fall back to exact canonical_name query via findEntities
  const matches = findEntities(graph, { canonical_name: anchorDescription });
  if (matches.length > 0) return matches[0].id;

  return null;
}

/**
 * Authors a minimal synthetic projection body for a given scenario.
 *
 * This is used in tests and benchmarks where no real AI generator is available.
 * The body includes required frontmatter and a placeholder content section.
 */
function buildSyntheticBody(
  kind: string,
  anchorId: string | null,
  anchorDescription: string,
  inputIds: string[],
): string {
  const now = new Date().toISOString();
  const inputLines = inputIds.map((id) => `  - episode:${id}`).join("\n");

  return (
    `---\n` +
    `id: synthetic\n` +
    `kind: ${kind}\n` +
    `anchor: entity:${anchorId ?? "unknown"}\n` +
    `title: "Synthetic ${kind} for ${anchorDescription}"\n` +
    `model: synthetic\n` +
    `prompt_template_id: null\n` +
    `prompt_hash: null\n` +
    `input_fingerprint: synthetic\n` +
    `valid_from: ${now}\n` +
    `valid_until: null\n` +
    `inputs:\n${inputLines || "  []"}\n` +
    `---\n\n` +
    `# ${kind}: ${anchorDescription}\n\n` +
    `Synthetic projection authored at benchmark preparation time.\n`
  );
}

/**
 * Prepares all scenarios from a dataset by:
 *  1. Resolving anchor_description → anchor_id via entity lookup.
 *  2. Collecting episode inputs linked to the anchor entity.
 *  3. Calling project() to author a projection at commit X state.
 *
 * Scenarios that fail to resolve an anchor or author a projection are returned
 * with projection=null and an error message — the runner skips them gracefully.
 *
 * @param graph - Graph populated at commit X.
 * @param dataset - Validated dataset.
 * @param generator - ProjectionGenerator to use (defaults to NullGenerator with synthetic body).
 * @returns PreparedScenario[] with one entry per scenario.
 */
export async function prepareScenarios(
  graph: EngramGraph,
  dataset: StaleKnowledgeDataset,
  generator?: ProjectionGenerator,
): Promise<PreparedScenario[]> {
  const results: PreparedScenario[] = [];

  for (const scenario of dataset.scenarios) {
    const anchor_id = resolveAnchor(graph, scenario.anchor_description);

    if (!anchor_id) {
      results.push({
        scenario,
        anchor_id: null,
        projection: null,
        error: `anchor not found: '${scenario.anchor_description}'`,
      });
      continue;
    }

    // Collect evidence episodes linked to this entity
    const episodeRows = graph.db
      .query<{ episode_id: string }, [string]>(
        `SELECT DISTINCT ee.episode_id
           FROM entity_evidence ee
          WHERE ee.entity_id = ?
          LIMIT 20`,
      )
      .all(anchor_id);

    const inputs = episodeRows.map((r) => ({
      type: "episode" as const,
      id: r.episode_id,
    }));

    if (inputs.length === 0) {
      results.push({
        scenario,
        anchor_id,
        projection: null,
        error: `no evidence episodes for anchor '${scenario.anchor_description}'`,
      });
      continue;
    }

    try {
      const gen =
        generator ??
        new SyntheticGenerator(scenario.projection_kind, anchor_id);
      const projection = await project(graph, {
        kind: scenario.projection_kind,
        anchor: { type: "entity", id: anchor_id },
        inputs,
        generator: gen,
        owner_id: undefined,
      });

      results.push({ scenario, anchor_id, projection });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        scenario,
        anchor_id,
        projection: null,
        error: `project() failed: ${msg}`,
      });
    }
  }

  return results;
}

// ─── SyntheticGenerator ───────────────────────────────────────────────────────

/**
 * A ProjectionGenerator that produces synthetic bodies without any AI call.
 *
 * Used in tests and benchmarks where NullGenerator would throw. The body
 * includes the minimal required frontmatter so project() can parse and store it.
 * Accepts the scenario's kind and anchorId at construction so the generated body
 * accurately reflects the projection's actual kind and anchor.
 */
class SyntheticGenerator {
  private readonly kind: string;
  private readonly anchorId: string | null;

  constructor(kind = "entity_summary", anchorId: string | null = null) {
    this.kind = kind;
    this.anchorId = anchorId;
  }

  async generate(
    inputs: import("engram-core").ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    const anchorDescription = this.anchorId ?? "unknown";
    const inputIds = inputs.map((i) => i.id);
    const body = buildSyntheticBody(
      this.kind,
      this.anchorId,
      anchorDescription,
      inputIds,
    );
    return { body, confidence: 0.5 };
  }

  async assess(
    _projection: Projection,
    _currentInputs: import("engram-core").ResolvedInput[],
  ): Promise<import("engram-core").AssessVerdict> {
    return { verdict: "still_accurate" };
  }

  async regenerate(
    _projection: Projection,
    inputs: import("engram-core").ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    return this.generate(inputs);
  }
}
