/**
 * projection-generator.ts — ProjectionGenerator interface and implementations.
 *
 * A ProjectionGenerator wraps an AI provider and prompt template to produce
 * projection bodies. It is the AI boundary for the projection authoring layer.
 *
 * Implementations:
 * - NullGenerator: throws on generate() — used when no AI is configured.
 * - AnthropicGenerator: stub that calls the Anthropic API with a placeholder prompt.
 */

import type { Projection } from "../graph/projections.js";
import type { KindCatalog } from "./kinds.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * A substrate element resolved from the database, ready to pass to an AI generator.
 */
export interface ResolvedInput {
  type: "episode" | "entity" | "edge" | "projection";
  id: string;
  /** The content of the substrate element at resolution time. */
  content: string | null;
  /** SHA-256 hash of the content at resolution time. */
  content_hash: string | null;
}

/**
 * A summary of one active projection used as input to the discover phase.
 * Contains identity and recency metadata — not the projection body.
 */
export interface ActiveProjectionSummary {
  id: string;
  kind: string;
  title: string;
  anchor_type: string;
  anchor_id: string | null;
  last_assessed_at: string | null;
}

/**
 * A single substrate element (episode, entity, or edge) included in the
 * substrate delta passed to ProjectionGenerator.discover().
 */
export interface SubstrateDeltaItem {
  type: "episode" | "entity" | "edge";
  id: string;
  /** Short summary of the item's content (not the full content). */
  summary: string;
  /** ISO8601 UTC timestamp when this item was added or last modified. */
  changed_at: string;
}

/**
 * The substrate delta since the last non-dry-run reconcile for the same scope.
 * Passed to ProjectionGenerator.discover() as context for new proposals.
 */
export interface SubstrateDelta {
  since: string | null;
  episodes: SubstrateDeltaItem[];
  entities: SubstrateDeltaItem[];
  edges: SubstrateDeltaItem[];
}

/**
 * A proposal from ProjectionGenerator.discover() for a new projection to author.
 *
 * Each proposal contains the kind, optional anchor, list of input IDs, and a
 * rationale explaining why the generator believes this projection is worth
 * authoring. The authoring loop calls project() for each accepted proposal.
 */
export interface ProjectionProposal {
  /** Projection kind identifier (must match a KindEntry.name from the catalog). */
  kind: string;
  /**
   * Optional anchor entity/edge/episode for the projection.
   *
   * `null` means graph-wide (no specific anchor). When null, the projection will
   * be stored with anchor_type='none' and anchor_id=null.
   *
   * NOTE: Do NOT use `{ type: 'none', id: '...' }` in proposals — `type: 'none'`
   * is an internal database storage value only and is not valid as proposal input.
   * Use `anchor: null` for graph-wide projections.
   */
  anchor: { type: string; id: string } | null;
  /**
   * List of substrate inputs the projection should summarise.
   * Each entry must be a resolvable {type, id} pair from the substrate.
   */
  inputs: Array<{ type: string; id: string }>;
  /** Short explanation of why this projection is worth authoring now. */
  rationale: string;
}

/**
 * The verdict returned by generator.assess() during a reconcile() run.
 */
export type AssessVerdict =
  | { verdict: "still_accurate" }
  | { verdict: "needs_update"; reason: string }
  | { verdict: "contradicted"; reason: string };

/**
 * Core interface for projection generation.
 *
 * Implementations wrap an AI provider plus a prompt template and handle:
 * - generate(): produce the initial markdown body from resolved inputs.
 * - assess(): determine whether an existing projection is still accurate
 *   given the current (possibly changed) input state.
 * - regenerate(): produce a revised body for an existing projection given
 *   updated inputs.
 */
export interface ProjectionGenerator {
  /**
   * Generate a markdown body (with YAML frontmatter) from resolved inputs.
   *
   * The returned body MUST include all required frontmatter keys:
   * id, kind, anchor, title, model, input_fingerprint, valid_from, inputs.
   *
   * @throws Error if generation fails or is not supported.
   */
  generate(
    inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }>;

  /**
   * Assess whether an existing projection is still accurate given the
   * current state of its inputs.
   *
   * Called during reconcile() assess phase for projections whose
   * input_fingerprint has drifted.
   */
  assess(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict>;

  /**
   * Regenerate a projection body based on updated inputs.
   *
   * Called during reconcile() when assess() returns 'needs_update' or
   * 'contradicted'. The old projection is passed for context (e.g. to
   * carry over parts of the body that haven't changed).
   */
  regenerate(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }>;

  /**
   * Discover new projections to author from the substrate delta.
   *
   * Called during the reconcile() discover phase. The generator is given:
   * - `delta`: substrate items added or changed since the last non-dry-run
   *   reconcile for the same scope (episodes, entities, edges).
   * - `catalog`: active projection summaries — what projections already exist,
   *   used to avoid proposing duplicates and to identify coverage gaps.
   * - `kinds`: the full KindCatalog, so the generator knows which kinds are
   *   available, when to use each, and what inputs are expected.
   *
   * Returns an ordered array of ProjectionProposal objects. The authoring loop
   * calls project() for each proposal that passes validation. Returning [] is
   * valid (the generator believes no new projections are warranted).
   *
   * Must never throw. On internal error, return [].
   */
  discover(ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]>;
}

// ─── NullGenerator ───────────────────────────────────────────────────────────

/**
 * NullGenerator: used when no AI provider is configured.
 *
 * generate() always throws — projections require an AI generator.
 * assess() and regenerate() also throw for consistency.
 * discover() returns [] — no proposals without an AI provider.
 */
export class NullGenerator implements ProjectionGenerator {
  async generate(
    _inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    throw new Error(
      "NullGenerator: no AI provider configured — cannot generate projections. " +
        "Configure an AI provider (e.g. ENGRAM_AI_PROVIDER=anthropic) to use project().",
    );
  }

  async assess(
    _projection: Projection,
    _currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict> {
    throw new Error(
      "NullGenerator: no AI provider configured — cannot assess projections.",
    );
  }

  async regenerate(
    _projection: Projection,
    _currentInputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    throw new Error(
      "NullGenerator: no AI provider configured — cannot regenerate projections.",
    );
  }

  /**
   * NullGenerator.discover() always returns [] — no AI provider means no proposals.
   */
  async discover(_ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]> {
    return [];
  }
}

// ─── AnthropicGenerator ──────────────────────────────────────────────────────

/**
 * AnthropicGenerator: stub implementation backed by the Anthropic API.
 *
 * This is a placeholder implementation. In production it would use the
 * @anthropic-ai/sdk to call Claude with a prompt template populated from
 * the resolved inputs.
 *
 * The stub returns a valid markdown body with frontmatter so the generate/
 * validate/insert pipeline can be exercised end-to-end in tests.
 */
export class AnthropicGenerator implements ProjectionGenerator {
  private readonly model: string;
  private readonly promptTemplateId: string;
  private readonly apiKey: string | undefined;

  constructor(opts?: {
    model?: string;
    promptTemplateId?: string;
    apiKey?: string;
  }) {
    this.model = opts?.model ?? "anthropic:claude-opus-4-6";
    this.promptTemplateId = opts?.promptTemplateId ?? "default.v1";
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  async generate(
    inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    // Stub: in production this would call the Anthropic API with a
    // populated prompt template. For now, return a valid body so the
    // pipeline works end-to-end.
    const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
    const now = new Date().toISOString();

    const body =
      `---\n` +
      `id: placeholder\n` +
      `kind: generated\n` +
      `anchor: none\n` +
      `title: "Generated Projection"\n` +
      `model: ${this.model}\n` +
      `prompt_template_id: ${this.promptTemplateId}\n` +
      `prompt_hash: stub\n` +
      `input_fingerprint: stub\n` +
      `valid_from: ${now}\n` +
      `valid_until: null\n` +
      `inputs:\n${inputList}\n` +
      `---\n\n` +
      `# Generated Projection\n\n` +
      `This projection was generated from ${inputs.length} input(s) by ${this.model}.\n\n` +
      `> Note: AnthropicGenerator is a stub. Configure a real implementation for production use.\n`;

    return { body, confidence: 0.9 };
  }

  async assess(
    _projection: Projection,
    _currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict> {
    // Stub: always returns needs_update in production this would call
    // the Anthropic API with the existing body + current inputs.
    return {
      verdict: "needs_update",
      reason:
        "AnthropicGenerator.assess() is a stub — always returns needs_update",
    };
  }

  async regenerate(
    projection: Projection,
    inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    // Stub: delegates to generate() in this placeholder implementation.
    // Production would call Anthropic with the old body as context.
    void projection;
    return this.generate(inputs);
  }

  /**
   * AnthropicGenerator.discover() stub — returns [] in this placeholder.
   *
   * Production implementation would call the Anthropic API with a structured
   * prompt built from the substrate delta, coverage catalog, and kind catalog,
   * then parse the response into ProjectionProposal[].
   */
  async discover(_ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]> {
    // Stub: in production this would issue a structured LLM call to propose
    // new projections. For now return [] so the pipeline works end-to-end.
    return [];
  }
}
