/**
 * projection-generator.ts — ProjectionGenerator interface and implementations.
 *
 * A ProjectionGenerator wraps an AI provider and prompt template to produce
 * projection bodies. It is the AI boundary for the projection authoring layer.
 *
 * Implementations:
 * - NullGenerator: throws on generate() — used when no AI is configured.
 * - AnthropicGenerator: calls the Anthropic API (Claude) to synthesize projections.
 *   Falls back to a stub body when ANTHROPIC_API_KEY is not set, so the pipeline
 *   can be exercised end-to-end in tests without network access.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Projection } from "../graph/projections.js";
import { loadKindCatalog } from "./kinds.js";
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
   * @param inputs - Resolved substrate elements to synthesize from.
   * @param kind - The projection kind (e.g. "entity_summary"). Used to build
   *   a kind-appropriate prompt.
   *
   * @throws Error if generation fails or is not supported.
   */
  generate(
    inputs: ResolvedInput[],
    kind: string,
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
    _kind: string,
  ): Promise<{ body: string; confidence: number }> {
    throw new Error(
      "NullGenerator: no AI provider configured — cannot generate projections. " +
        "Set ENGRAM_AI_PROVIDER=anthropic and ANTHROPIC_API_KEY to use project().",
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
 * When ANTHROPIC_API_KEY is present, makes real API calls to synthesize
 * projections, assess staleness, and discover new coverage gaps.
 *
 * When apiKey is undefined (e.g. in tests), falls back to stub responses so
 * the generate/validate/insert pipeline can be exercised end-to-end without
 * network access.
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

  // ── Stub helpers ─────────────────────────────────────────────────────────

  private _stubGenerate(
    inputs: ResolvedInput[],
    kind: string,
  ): { body: string; confidence: number } {
    const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
    const now = new Date().toISOString();

    const body =
      `---\n` +
      `id: placeholder\n` +
      `kind: ${kind}\n` +
      `anchor: none\n` +
      `title: "Generated ${kind.replace(/_/g, " ")} (stub)"\n` +
      `model: ${this.model}\n` +
      `prompt_template_id: ${this.promptTemplateId}\n` +
      `prompt_hash: stub\n` +
      `input_fingerprint: stub\n` +
      `valid_from: ${now}\n` +
      `valid_until: null\n` +
      `inputs:\n${inputList}\n` +
      `---\n\n` +
      `# Generated ${kind.replace(/_/g, " ")}\n\n` +
      `This projection was generated from ${inputs.length} input(s).\n\n` +
      `> Note: AnthropicGenerator is running in stub mode (no ANTHROPIC_API_KEY).\n`;

    return { body, confidence: 0.9 };
  }

  // ── generate() ───────────────────────────────────────────────────────────

  async generate(
    inputs: ResolvedInput[],
    kind: string,
  ): Promise<{ body: string; confidence: number }> {
    if (!this.apiKey) {
      return this._stubGenerate(inputs, kind);
    }

    const catalog = loadKindCatalog();
    const kindEntry = catalog.find((k) => k.name === kind);
    const kindDesc = kindEntry
      ? `${kindEntry.description}\n\nExpected inputs: ${kindEntry.expected_inputs.join("; ")}`
      : kind;

    const now = new Date().toISOString();
    const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
    const inputContent = inputs
      .map(
        (i) =>
          `[${i.type}:${i.id}]\n${i.content ?? "(content unavailable)"}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt =
      `You are an expert technical knowledge synthesizer. You generate structured knowledge documents from software project evidence.\n\n` +
      `Your output MUST be a single markdown document beginning with a YAML frontmatter block.\n\n` +
      `Required frontmatter keys — ALL must be present, in this order:\n` +
      `  id: placeholder\n` +
      `  kind: ${kind}\n` +
      `  anchor: none\n` +
      `  title: <concise descriptive title>\n` +
      `  model: ${this.model}\n` +
      `  prompt_template_id: ${this.promptTemplateId}\n` +
      `  prompt_hash: 1\n` +
      `  input_fingerprint: computed\n` +
      `  valid_from: ${now}\n` +
      `  valid_until: null\n` +
      `  inputs:\n` +
      `${inputList}\n\n` +
      `Start with --- on its own line, then the frontmatter keys above exactly, then --- on its own line, then the markdown body. Output nothing before the opening ---.`;

    const userPrompt =
      `Generate a "${kind}" projection.\n\n` +
      `Kind: ${kindDesc}\n\n` +
      `Substrate evidence (${inputs.length} items):\n\n` +
      inputContent;

    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return { body: text, confidence: 0.85 };
  }

  // ── assess() ─────────────────────────────────────────────────────────────

  async assess(
    projection: Projection,
    currentInputs: ResolvedInput[],
  ): Promise<AssessVerdict> {
    if (!this.apiKey) {
      return {
        verdict: "needs_update",
        reason: "AnthropicGenerator running in stub mode (no ANTHROPIC_API_KEY)",
      };
    }

    const currentContent = currentInputs
      .map(
        (i) =>
          `[${i.type}:${i.id}]\n${i.content ?? "(content unavailable)"}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt =
      `You assess whether a knowledge projection document is still accurate given updated substrate evidence.\n\n` +
      `Respond with exactly one of these formats on a single line:\n` +
      `  still_accurate\n` +
      `  needs_update: <brief reason>\n` +
      `  contradicted: <brief reason>\n\n` +
      `Output only the verdict line. Nothing else.`;

    const userPrompt =
      `Existing projection:\n${projection.body}\n\n` +
      `Current substrate state (${currentInputs.length} inputs):\n\n` +
      currentContent +
      `\n\nIs this projection still accurate?`;

    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 256,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text"
        ? message.content[0].text.trim()
        : "";

    if (text.startsWith("still_accurate")) {
      return { verdict: "still_accurate" };
    }
    if (text.startsWith("needs_update:")) {
      return {
        verdict: "needs_update",
        reason: text.slice("needs_update:".length).trim(),
      };
    }
    if (text.startsWith("contradicted:")) {
      return {
        verdict: "contradicted",
        reason: text.slice("contradicted:".length).trim(),
      };
    }

    // Default to needs_update when the response doesn't match the expected format
    return {
      verdict: "needs_update",
      reason: `Unparseable assess response: ${text.slice(0, 100)}`,
    };
  }

  // ── regenerate() ─────────────────────────────────────────────────────────

  async regenerate(
    projection: Projection,
    inputs: ResolvedInput[],
  ): Promise<{ body: string; confidence: number }> {
    if (!this.apiKey) {
      return this._stubGenerate(inputs, projection.kind);
    }

    const catalog = loadKindCatalog();
    const kindEntry = catalog.find((k) => k.name === projection.kind);
    const kindDesc = kindEntry ? kindEntry.description : projection.kind;

    const now = new Date().toISOString();
    const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
    const inputContent = inputs
      .map(
        (i) =>
          `[${i.type}:${i.id}]\n${i.content ?? "(content unavailable)"}`,
      )
      .join("\n\n---\n\n");

    const systemPrompt =
      `You are an expert technical knowledge synthesizer. You update an existing knowledge document based on new evidence.\n\n` +
      `Your output MUST be a single markdown document beginning with a YAML frontmatter block.\n\n` +
      `Required frontmatter keys — ALL must be present:\n` +
      `  id: placeholder\n` +
      `  kind: ${projection.kind}\n` +
      `  anchor: none\n` +
      `  title: <concise descriptive title — may carry over or refine the existing title>\n` +
      `  model: ${this.model}\n` +
      `  prompt_template_id: ${this.promptTemplateId}\n` +
      `  prompt_hash: 1\n` +
      `  input_fingerprint: computed\n` +
      `  valid_from: ${now}\n` +
      `  valid_until: null\n` +
      `  inputs:\n` +
      `${inputList}\n\n` +
      `Start with --- on its own line, then the frontmatter keys above exactly, then --- on its own line, then the markdown body.`;

    const userPrompt =
      `Update this "${projection.kind}" projection based on the current substrate state.\n\n` +
      `Kind description: ${kindDesc}\n\n` +
      `Existing projection (for context — update as needed):\n${projection.body}\n\n` +
      `Current substrate state (${inputs.length} inputs):\n\n` +
      inputContent;

    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return { body: text, confidence: 0.85 };
  }

  // ── discover() ───────────────────────────────────────────────────────────

  async discover(ctx: {
    delta: SubstrateDelta;
    catalog: ActiveProjectionSummary[];
    kinds: KindCatalog;
  }): Promise<ProjectionProposal[]> {
    if (!this.apiKey) {
      return [];
    }

    const { delta, catalog, kinds } = ctx;

    if (
      delta.episodes.length === 0 &&
      delta.entities.length === 0 &&
      delta.edges.length === 0
    ) {
      return [];
    }

    const kindsText = kinds
      .map(
        (k) =>
          `### ${k.name}\n${k.description}\n\nWhen to use:\n${k.when_to_use}`,
      )
      .join("\n\n");

    const deltaText =
      [
        delta.episodes.length > 0
          ? `Episodes (${delta.episodes.length}):\n${delta.episodes.map((e) => `  [${e.id}] ${e.summary}`).join("\n")}`
          : null,
        delta.entities.length > 0
          ? `Entities (${delta.entities.length}):\n${delta.entities.map((e) => `  [${e.id}] ${e.summary}`).join("\n")}`
          : null,
        delta.edges.length > 0
          ? `Edges (${delta.edges.length}):\n${delta.edges.map((e) => `  [${e.id}] ${e.summary}`).join("\n")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n\n");

    const catalogText =
      catalog.length > 0
        ? catalog
            .map((p) => `  [${p.id}] ${p.kind}: ${p.title}`)
            .join("\n")
        : "  (none)";

    const systemPrompt =
      `You are a knowledge coverage analyst. Given a substrate delta and an existing projection catalog, propose new projections to fill coverage gaps.\n\n` +
      `Respond with a JSON array of proposal objects. Each object must have:\n` +
      `  kind: string (must match one of the available kinds)\n` +
      `  anchor: { type: string, id: string } | null\n` +
      `  inputs: Array<{ type: string, id: string }>\n` +
      `  rationale: string\n\n` +
      `Use only entity/edge/episode IDs that appear in the substrate delta.\n` +
      `Anchor type must be one of: entity, edge, episode, projection. Use null anchor for graph-wide projections.\n` +
      `Return [] if no new projections are warranted.\n` +
      `Output only the JSON array — no prose, no markdown fences.`;

    const userPrompt =
      `Available projection kinds:\n\n${kindsText}\n\n` +
      `Existing projections (do not duplicate):\n${catalogText}\n\n` +
      `Substrate delta since ${delta.since ?? "beginning"}:\n\n${deltaText}\n\n` +
      `Propose new projections to author. Return a JSON array.`;

    const client = new Anthropic({ apiKey: this.apiKey });
    const message = await client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text =
      message.content[0].type === "text"
        ? message.content[0].text.trim()
        : "[]";

    try {
      // Strip markdown fences if the model wrapped the JSON despite instructions
      const stripped = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
      const proposals = JSON.parse(stripped);
      if (!Array.isArray(proposals)) return [];
      return proposals as ProjectionProposal[];
    } catch {
      return [];
    }
  }
}
