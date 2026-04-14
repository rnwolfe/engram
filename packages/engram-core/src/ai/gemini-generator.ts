/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

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

const DEFAULT_MODEL = "gemini-3-flash-preview";

export class GeminiGenerator implements ProjectionGenerator {
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
    this.apiKey = opts?.apiKey ?? process.env.GEMINI_API_KEY;
  }

  isConfigured(): boolean {
    return !!this.apiKey;
  }

  private async call(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    responseFormat: "text" | "json" = "text",
    responseSchema?: object,
  ): Promise<string> {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey: this.apiKey as string });
    const response = await genai.models.generateContent({
      model: this.model,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: maxTokens,
        ...(responseFormat === "json"
          ? {
              responseMimeType: "application/json",
              ...(responseSchema ? { responseSchema } : {}),
            }
          : {}),
      },
      contents: userPrompt,
    });
    const text = response.text ?? "";
    if (process.env.ENGRAM_DEBUG) {
      console.error("[engram][gemini] raw response:", text.slice(0, 1000));
    }
    return text;
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
        reason: "GeminiGenerator running in stub mode (no GEMINI_API_KEY)",
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
    const schema = {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: kinds.map((k) => k.name) },
          anchor: {
            type: "object",
            nullable: true,
            properties: {
              type: { type: "string" },
              id: { type: "string" },
            },
          },
          inputs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                id: { type: "string" },
              },
            },
          },
          rationale: { type: "string" },
        },
        required: ["kind", "inputs", "rationale"],
      },
    };
    const text = await this.call(system, user, 4096, "json", schema);
    return parseDiscoverProposals(text);
  }
}
