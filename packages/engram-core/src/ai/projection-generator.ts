/**
 * projection-generator.ts — ProjectionGenerator interface, NullGenerator,
 * and AnthropicGenerator.
 *
 * Provider-specific generators:
 * - NullGenerator: throws on generate() — used when no AI is configured.
 * - AnthropicGenerator: calls the Anthropic API (Claude).
 * - GeminiGenerator: see gemini-generator.ts
 * - OpenAIGenerator: see openai-generator.ts
 *
 * All generators share prompt logic from generator-prompts.ts.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProposals,
} from "./generator-prompts.js";
import type { KindCatalog } from "./kinds.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedInput {
  type: "episode" | "entity" | "edge" | "projection";
  id: string;
  content: string | null;
  content_hash: string | null;
}

export interface ActiveProjectionSummary {
  id: string;
  kind: string;
  title: string;
  anchor_type: string;
  anchor_id: string | null;
  last_assessed_at: string | null;
}

export interface SubstrateDeltaItem {
  type: "episode" | "entity" | "edge";
  id: string;
  summary: string;
  changed_at: string;
}

export interface SubstrateDelta {
  since: string | null;
  episodes: SubstrateDeltaItem[];
  entities: SubstrateDeltaItem[];
  edges: SubstrateDeltaItem[];
}

export interface ProjectionProposal {
  kind: string;
  anchor: { type: string; id: string } | null;
  inputs: Array<{ type: string; id: string }>;
  rationale: string;
}

export type AssessVerdict =
  | { verdict: "still_accurate" }
  | { verdict: "needs_update"; reason: string }
  | { verdict: "contradicted"; reason: string };

export interface ProjectionGenerator {
  /**
   * Generate a markdown body (with YAML frontmatter) from resolved inputs.
   *
   * @param inputs - Resolved substrate elements to synthesize from.
   * @param kind - The projection kind (e.g. "entity_summary").
   */
  generate(
    inputs: ResolvedInput[],
    kind: string,
  ): Promise<{ body: string; confidence: number }>;

  assess(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict>;

  regenerate(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }>;

  discover(ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]>;
}

// ─── NullGenerator ───────────────────────────────────────────────────────────

export class NullGenerator implements ProjectionGenerator {
  async generate(
    _inputs: ResolvedInput[],
    _kind: string,
  ): Promise<{ body: string; confidence: number }> {
    throw new Error(
      "NullGenerator: no AI provider configured — cannot generate projections. " +
        "Set ENGRAM_AI_PROVIDER and the corresponding API key to use project().",
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
 * AnthropicGenerator: backed by the Anthropic API (Claude).
 *
 * Falls back to stub responses when apiKey is undefined so the pipeline
 * can be exercised end-to-end in tests without network access.
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
    this.model = opts?.model ?? "claude-sonnet-4-6";
    this.promptTemplateId = opts?.promptTemplateId ?? "default.v1";
    this.apiKey = opts?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  async generate(
    inputs: ResolvedInput[],
    kind: string,
  ): Promise<{ body: string; confidence: number }> {
    if (!this.apiKey) {
      return {
        body: buildStubBody(inputs, kind, this.model, this.promptTemplateId),
        confidence: 0.9,
      };
    }
    const { system, user } = buildGeneratePrompt(
      inputs,
      kind,
      this.model,
      this.promptTemplateId,
    );
    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });
    const body =
      message.content[0].type === "text" ? message.content[0].text : "";
    return { body, confidence: 0.85 };
  }

  async assess(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict> {
    if (!this.apiKey) {
      return {
        verdict: "needs_update",
        reason:
          "AnthropicGenerator running in stub mode (no ANTHROPIC_API_KEY)",
      };
    }
    const { system, user } = buildAssessPrompt(projection, currentInputs);
    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 256,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return parseAssessVerdict(text);
  }

  async regenerate(
    projection: Projection,
    inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    if (!this.apiKey) {
      return {
        body: buildStubBody(
          inputs,
          projection.kind,
          this.model,
          this.promptTemplateId,
        ),
        confidence: 0.9,
      };
    }
    const { system, user } = buildRegeneratePrompt(
      projection,
      inputs,
      this.model,
      this.promptTemplateId,
    );
    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });
    const body =
      message.content[0].type === "text" ? message.content[0].text : "";
    return { body, confidence: 0.85 };
  }

  async discover(ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]> {
    if (!this.apiKey) return [];
    const { delta, catalog, kinds } = ctx;
    if (
      delta.episodes.length === 0 &&
      delta.entities.length === 0 &&
      delta.edges.length === 0
    ) {
      return [];
    }
    const { system, user } = buildDiscoverPrompt(delta, catalog, kinds);
    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text =
      message.content[0].type === "text" ? message.content[0].text : "[]";
    return parseDiscoverProposals(text);
  }
}
