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
}

// ─── NullGenerator ───────────────────────────────────────────────────────────

/**
 * NullGenerator: used when no AI provider is configured.
 *
 * generate() always throws — projections require an AI generator.
 * assess() and regenerate() also throw for consistency.
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
}
