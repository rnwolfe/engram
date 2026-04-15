/**
 * generator-prompts.ts — Shared prompt builders and response parsers for
 * projection generators (Anthropic, Gemini, OpenAI).
 *
 * All generators use the same prompts — only the SDK call differs.
 * Centralising here prevents prompt drift across implementations.
 */

import type { Projection } from "../graph/projections.js";
import type { KindCatalog } from "./kinds.js";
import { loadKindCatalog } from "./kinds.js";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "./projection-generator.js";

// ─── Prompt builders ──────────────────────────────────────────────────────────

export interface PromptPair {
  system: string;
  user: string;
}

/**
 * Formats resolved inputs into a readable block for inclusion in prompts.
 */
function formatInputContent(inputs: ResolvedInput[]): string {
  return inputs
    .map((i) => `[${i.type}:${i.id}]\n${i.content ?? "(content unavailable)"}`)
    .join("\n\n---\n\n");
}

/**
 * Builds the system + user prompt pair for generate().
 */
export function buildGeneratePrompt(
  inputs: ResolvedInput[],
  kind: string,
  model: string,
  promptTemplateId: string,
): PromptPair {
  const catalog = loadKindCatalog();
  const kindEntry = catalog.find((k) => k.name === kind);
  const kindDesc = kindEntry
    ? `${kindEntry.description}\n\nExpected inputs: ${kindEntry.expected_inputs.join("; ")}`
    : kind;

  const now = new Date().toISOString();
  const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");

  const system =
    `You are an expert technical knowledge synthesizer. You generate structured knowledge documents from software project evidence.\n\n` +
    `Your output MUST be a single markdown document beginning with a YAML frontmatter block.\n\n` +
    `Required frontmatter keys — ALL must be present, in this order:\n` +
    `  id: placeholder\n` +
    `  kind: ${kind}\n` +
    `  anchor: none\n` +
    `  title: <concise descriptive title>\n` +
    `  model: ${model}\n` +
    `  prompt_template_id: ${promptTemplateId}\n` +
    `  prompt_hash: 1\n` +
    `  input_fingerprint: computed\n` +
    `  valid_from: ${now}\n` +
    `  valid_until: null\n` +
    `  inputs:\n` +
    `${inputList}\n\n` +
    `Start with --- on its own line, then the frontmatter keys above exactly, then --- on its own line, then the markdown body. Output nothing before the opening ---.`;

  const user =
    `Generate a "${kind}" projection.\n\n` +
    `Kind: ${kindDesc}\n\n` +
    `Substrate evidence (${inputs.length} items):\n\n` +
    formatInputContent(inputs);

  return { system, user };
}

/**
 * Builds the system + user prompt pair for assess().
 */
export function buildAssessPrompt(
  projection: Projection,
  currentInputs: ResolvedInput[],
): PromptPair {
  const system =
    `You assess whether a knowledge projection document is still accurate given updated substrate evidence.\n\n` +
    `Respond with exactly one of these formats on a single line:\n` +
    `  still_accurate\n` +
    `  needs_update: <brief reason>\n` +
    `  contradicted: <brief reason>\n\n` +
    `Output only the verdict line. Nothing else.`;

  const user =
    `Existing projection:\n${projection.body}\n\n` +
    `Current substrate state (${currentInputs.length} inputs):\n\n` +
    formatInputContent(currentInputs) +
    `\n\nIs this projection still accurate?`;

  return { system, user };
}

/**
 * Builds the system + user prompt pair for regenerate().
 */
export function buildRegeneratePrompt(
  projection: Projection,
  inputs: ResolvedInput[],
  model: string,
  promptTemplateId: string,
): PromptPair {
  const catalog = loadKindCatalog();
  const kindEntry = catalog.find((k) => k.name === projection.kind);
  const kindDesc = kindEntry ? kindEntry.description : projection.kind;

  const now = new Date().toISOString();
  const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");

  const system =
    `You are an expert technical knowledge synthesizer. You update an existing knowledge document based on new evidence.\n\n` +
    `Your output MUST be a single markdown document beginning with a YAML frontmatter block.\n\n` +
    `Required frontmatter keys — ALL must be present:\n` +
    `  id: placeholder\n` +
    `  kind: ${projection.kind}\n` +
    `  anchor: none\n` +
    `  title: <concise descriptive title — may carry over or refine the existing title>\n` +
    `  model: ${model}\n` +
    `  prompt_template_id: ${promptTemplateId}\n` +
    `  prompt_hash: 1\n` +
    `  input_fingerprint: computed\n` +
    `  valid_from: ${now}\n` +
    `  valid_until: null\n` +
    `  inputs:\n` +
    `${inputList}\n\n` +
    `Start with --- on its own line, then the frontmatter keys above exactly, then --- on its own line, then the markdown body.`;

  const user =
    `Update this "${projection.kind}" projection based on the current substrate state.\n\n` +
    `Kind description: ${kindDesc}\n\n` +
    `Existing projection (for context — update as needed):\n${projection.body}\n\n` +
    `Current substrate state (${inputs.length} inputs):\n\n` +
    formatInputContent(inputs);

  return { system, user };
}

/**
 * Builds the system + user prompt pair for discover().
 */
export function buildDiscoverPrompt(
  delta: SubstrateDelta,
  catalog: ActiveProjectionSummary[],
  kinds: KindCatalog,
): PromptPair {
  const kindsText = kinds
    .map(
      (k) =>
        `### ${k.name}\n${k.description}\n\nWhen to use:\n${k.when_to_use}`,
    )
    .join("\n\n");

  const deltaText = [
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
      ? catalog.map((p) => `  [${p.id}] ${p.kind}: ${p.title}`).join("\n")
      : "  (none)";

  const validKindNames = kinds.map((k) => `"${k.name}"`).join(", ");

  const system =
    `You are a knowledge coverage analyst. Given a substrate delta and an existing projection catalog, propose new projections to fill coverage gaps.\n\n` +
    `Respond with a JSON array of proposal objects. Each object must have:\n` +
    `  kind: string — MUST be one of these exact strings: ${validKindNames}\n` +
    `  anchor: { type: string, id: string } | null\n` +
    `  inputs: Array<{ type: string, id: string }>\n` +
    `  rationale: string\n\n` +
    `ABSOLUTELY CRITICAL — ID handling:\n` +
    `1. Every "id" field MUST be copied VERBATIM from the bracketed IDs shown in the "Substrate delta" section below. IDs look like [01JXYZABC...] (26-char ULIDs).\n` +
    `2. NEVER invent, guess, pattern-match, or synthesize ULIDs. If an ID did not appear in the delta, you cannot use it.\n` +
    `3. If you cannot find enough real IDs to support a proposal, return fewer proposals — do not pad the inputs array with fabricated IDs.\n` +
    `4. Every input entry MUST include both "type" and "id".\n\n` +
    `Example of a valid proposal:\n` +
    `  { "kind": "${kinds[0]?.name ?? "entity_summary"}", "anchor": { "type": "entity", "id": "01JXYZ_REAL_ENTITY_ID_FROM_DELTA" }, "inputs": [{ "type": "episode", "id": "01JXYZ_REAL_EPISODE_ID_FROM_DELTA" }], "rationale": "..." }\n\n` +
    `Anchor type must be one of: entity, edge, episode, projection. Use null anchor for graph-wide projections.\n` +
    `Return [] if no new projections are warranted.\n` +
    `Output only the JSON array — no prose, no markdown fences.`;

  const user =
    `Available projection kinds:\n\n${kindsText}\n\n` +
    `Existing projections (do not duplicate):\n${catalogText}\n\n` +
    `Substrate delta since ${delta.since ?? "beginning"}:\n\n${deltaText}\n\n` +
    `Propose new projections to author. Return a JSON array.`;

  return { system, user };
}

// ─── Response parsers ─────────────────────────────────────────────────────────

/**
 * Parses a raw text response from assess() into an AssessVerdict.
 * Defaults to needs_update when the response is unparseable.
 */
export function parseAssessVerdict(text: string): AssessVerdict {
  const t = text.trim();
  if (t.startsWith("still_accurate")) return { verdict: "still_accurate" };
  if (t.startsWith("needs_update:")) {
    return {
      verdict: "needs_update",
      reason: t.slice("needs_update:".length).trim(),
    };
  }
  if (t.startsWith("contradicted:")) {
    return {
      verdict: "contradicted",
      reason: t.slice("contradicted:".length).trim(),
    };
  }
  return {
    verdict: "needs_update",
    reason: `Unparseable assess response: ${t.slice(0, 100)}`,
  };
}

/**
 * Parses a raw text response from discover() into a ProjectionProposal array.
 * Returns [] on parse failure — never throws.
 */
export function parseDiscoverProposals(text: string): ProjectionProposal[] {
  try {
    const stripped = text
      .trim()
      .replace(/^```(?:json)?\n?/i, "")
      .replace(/\n?```$/, "");
    const proposals = JSON.parse(stripped);
    if (!Array.isArray(proposals)) {
      if (process.env.ENGRAM_DEBUG) {
        console.error(
          `[engram] parseDiscoverProposals: parsed value is not an array (type=${typeof proposals})`,
        );
      }
      return [];
    }
    if (process.env.ENGRAM_DEBUG) {
      console.error(
        `[engram] parseDiscoverProposals: parsed ${proposals.length} proposals`,
      );
    }
    return proposals as ProjectionProposal[];
  } catch (err) {
    if (process.env.ENGRAM_DEBUG) {
      console.error(
        `[engram] parseDiscoverProposals: JSON parse failed — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return [];
  }
}

/**
 * Stub body used when no API key is present (tests, dry-run scenarios).
 */
export function buildStubBody(
  inputs: ResolvedInput[],
  kind: string,
  model: string,
  promptTemplateId: string,
): string {
  const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
  const now = new Date().toISOString();

  return (
    `---\n` +
    `id: placeholder\n` +
    `kind: ${kind}\n` +
    `anchor: none\n` +
    `title: "Generated ${kind.replace(/_/g, " ")} (stub)"\n` +
    `model: ${model}\n` +
    `prompt_template_id: ${promptTemplateId}\n` +
    `prompt_hash: stub\n` +
    `input_fingerprint: stub\n` +
    `valid_from: ${now}\n` +
    `valid_until: null\n` +
    `inputs:\n${inputList}\n` +
    `---\n\n` +
    `# Generated ${kind.replace(/_/g, " ")}\n\n` +
    `This projection was generated from ${inputs.length} input(s).\n\n` +
    `> Note: generator running in stub mode (no API key configured).\n`
  );
}
