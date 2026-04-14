/**
 * openai-generator.ts — OpenAIGenerator: projection authoring via OpenAI.
 *
 * Uses the openai SDK to call the chat completions API.
 *
 * Default model: gpt-4o
 * API key read from OPENAI_API_KEY env var.
 */

import OpenAI from "openai";
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
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "./projection-generator.js";

const DEFAULT_MODEL = "gpt-5.4";

export class OpenAIGenerator implements ProjectionGenerator {
  private readonly model: string;
  private readonly promptTemplateId: string;
  private readonly apiKey: string | undefined;

  constructor(opts?: {
    model?: string;
    promptTemplateId?: string;
    apiKey?: string;
  }) {
    this.model = opts?.model ?? DEFAULT_MODEL;
    this.promptTemplateId = opts?.promptTemplateId ?? "default.v1";
    this.apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async call(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
  ): Promise<string> {
    const client = new OpenAI({ apiKey: this.apiKey });
    const completion = await client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
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
    const body = await this.call(system, user, 2048);
    return { body, confidence: 0.85 };
  }

  async assess(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict> {
    if (!this.apiKey) {
      return {
        verdict: "needs_update",
        reason: "OpenAIGenerator running in stub mode (no OPENAI_API_KEY)",
      };
    }
    const { system, user } = buildAssessPrompt(projection, currentInputs);
    const text = await this.call(system, user, 256);
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
    const body = await this.call(system, user, 2048);
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
    const text = await this.call(system, user, 1024);
    return parseDiscoverProposals(text);
  }
}
