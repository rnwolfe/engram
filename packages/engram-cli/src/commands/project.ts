/**
 * project.ts — `engram project` command.
 *
 * Explicitly authors a projection on a specific anchor with a specific input set.
 *
 * Usage:
 *   engram project --kind <kind> --anchor <type:id> [--input <type:id>]... [--dry-run]
 */

import * as path from "node:path";
import type { Command } from "commander";
import type {
  AnchorType,
  EngramGraph,
  ProjectionInput,
  ProjectionInputType,
} from "engram-core";
import {
  AnthropicGenerator,
  closeGraph,
  findEdges,
  NullGenerator,
  openGraph,
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
  project,
} from "engram-core";

interface ProjectOpts {
  kind: string;
  anchor: string;
  input?: string[];
  dryRun?: boolean;
  db: string;
}

// ─── Input parsing helpers ────────────────────────────────────────────────────

const VALID_ANCHOR_TYPES: AnchorType[] = [
  "entity",
  "edge",
  "episode",
  "projection",
  "none",
];
const VALID_INPUT_TYPES: ProjectionInputType[] = [
  "episode",
  "entity",
  "edge",
  "projection",
];

/**
 * Parses an anchor string of the form "type:id" or "none".
 * Returns { type, id } or throws with a usage error message.
 */
function parseAnchor(raw: string): { type: AnchorType; id?: string } {
  if (raw === "none") {
    return { type: "none" };
  }

  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    throw new UsageError(
      `Invalid --anchor "${raw}": expected "type:id" format (e.g. "entity:01HX...") or "none"`,
    );
  }

  const type = raw.slice(0, colonIdx) as AnchorType;
  const id = raw.slice(colonIdx + 1);

  if (!VALID_ANCHOR_TYPES.includes(type)) {
    throw new UsageError(
      `Invalid --anchor type "${type}": must be one of ${VALID_ANCHOR_TYPES.join(", ")}`,
    );
  }

  if (!id) {
    throw new UsageError(
      `Invalid --anchor "${raw}": id part is empty after the colon`,
    );
  }

  return { type, id };
}

/**
 * Parses an input string of the form "type:id".
 * Returns a ProjectionInput or throws with a usage error message.
 */
function parseInput(raw: string): ProjectionInput {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) {
    throw new UsageError(
      `Invalid --input "${raw}": expected "type:id" format (e.g. "episode:01HX...")`,
    );
  }

  const type = raw.slice(0, colonIdx) as ProjectionInputType;
  const id = raw.slice(colonIdx + 1);

  if (!VALID_INPUT_TYPES.includes(type)) {
    throw new UsageError(
      `Invalid --input type "${type}": must be one of ${VALID_INPUT_TYPES.join(", ")}`,
    );
  }

  if (!id) {
    throw new UsageError(
      `Invalid --input "${raw}": id part is empty after the colon`,
    );
  }

  return { type, id };
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

// ─── Default input resolution ─────────────────────────────────────────────────

/**
 * Builds the default input set for an anchor when --input is not specified.
 *
 * For entity:<id>: include the entity itself, all evidence episodes, and all
 * edges touching it (as inputs).
 */
function resolveDefaultInputs(
  graph: EngramGraph,
  anchor: { type: AnchorType; id?: string },
): ProjectionInput[] {
  if (anchor.type !== "entity" || !anchor.id) {
    return [];
  }

  const anchorId = anchor.id;
  const inputs: ProjectionInput[] = [];

  // Include the entity itself
  inputs.push({ type: "entity", id: anchorId });

  // Include all evidence episodes for the entity
  const evidenceRows = graph.db
    .query<{ episode_id: string }, [string]>(
      `SELECT DISTINCT e.episode_id
         FROM entity_evidence e
        WHERE e.entity_id = ?`,
    )
    .all(anchorId);

  for (const row of evidenceRows) {
    inputs.push({ type: "episode", id: row.episode_id });
  }

  // Include all active edges touching this entity
  const edges = findEdges(graph, {
    source_id: anchorId,
    include_invalidated: false,
  });
  const targetEdges = findEdges(graph, {
    target_id: anchorId,
    include_invalidated: false,
  });

  const seen = new Set<string>();
  for (const edge of [...edges, ...targetEdges]) {
    if (!seen.has(edge.id)) {
      seen.add(edge.id);
      inputs.push({ type: "edge", id: edge.id });
    }
  }

  return inputs;
}

// ─── Generator resolution ────────────────────────────────────────────────────

/**
 * Returns a ProjectionGenerator based on the ENGRAM_AI_PROVIDER env var.
 * Always returns a generator — NullGenerator throws at generate() time.
 */
function createGenerator() {
  const provider = process.env.ENGRAM_AI_PROVIDER ?? "null";

  switch (provider) {
    case "anthropic":
      return new AnthropicGenerator({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    default:
      return new NullGenerator();
  }
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerProject(program: Command): void {
  program
    .command("project")
    .description("Author a projection on an anchor with explicit inputs")
    .requiredOption("--kind <kind>", "projection kind (e.g. entity_summary)")
    .requiredOption(
      "--anchor <type:id>",
      'anchor for the projection (e.g. "entity:01HX..." or "none")',
    )
    .option(
      "--input <type:id>",
      'input substrate element (may be repeated, e.g. "episode:01HX...")',
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[],
    )
    .option(
      "--dry-run",
      "validate and print what would be authored without writing",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .action(async (opts: ProjectOpts) => {
      // ── Parse & validate opts ───────────────────────────────────────────────
      let anchor: { type: AnchorType; id?: string };
      let inputs: ProjectionInput[];

      try {
        anchor = parseAnchor(opts.anchor);
        const rawInputs = Array.isArray(opts.input) ? opts.input : [];
        inputs = rawInputs.map(parseInput);
      } catch (err) {
        if (err instanceof UsageError) {
          console.error(`Error: ${err.message}`);
          process.exit(2);
          return;
        }
        throw err;
      }

      const dbPath = path.resolve(opts.db);

      // ── Open graph ──────────────────────────────────────────────────────────
      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
        return;
      }

      // ── Resolve default inputs if none specified ────────────────────────────
      if (inputs.length === 0) {
        inputs = resolveDefaultInputs(graph, anchor);

        if (inputs.length === 0 && anchor.type !== "none") {
          console.error(
            `Error: no inputs found for anchor ${opts.anchor}. Specify --input explicitly or ensure the anchor has evidence.`,
          );
          closeGraph(graph);
          process.exit(1);
          return;
        }
      }

      // ── Dry-run: print what would be authored ──────────────────────────────
      if (opts.dryRun) {
        console.log("Dry run — no changes will be written.\n");
        console.log(`  kind:    ${opts.kind}`);
        console.log(
          `  anchor:  ${anchor.type}${anchor.id ? `:${anchor.id}` : ""}`,
        );
        console.log(`  inputs:  ${inputs.length}`);
        for (const inp of inputs) {
          console.log(`    - ${inp.type}:${inp.id}`);
        }
        closeGraph(graph);
        process.exit(0);
        return;
      }

      // ── Build generator ────────────────────────────────────────────────────
      const generator = createGenerator();

      // Detect NullGenerator early and provide a friendly error
      if (generator instanceof NullGenerator) {
        console.error(
          "Error: no AI provider configured for projection authoring. " +
            "Set ENGRAM_AI_PROVIDER=anthropic (or another supported provider) to use engram project.",
        );
        closeGraph(graph);
        process.exit(1);
        return;
      }

      // ── Record time before calling project() to detect idempotence ──────────
      const beforeCallMs = Date.now();

      // ── Author the projection ──────────────────────────────────────────────
      let projection: import("engram-core").Projection;
      try {
        projection = await project(graph, {
          kind: opts.kind,
          anchor,
          inputs,
          generator,
        });
      } catch (err) {
        if (
          err instanceof ProjectionCycleError ||
          err instanceof ProjectionInputMissingError ||
          err instanceof ProjectionFrontmatterError
        ) {
          console.error(`Error: ${err.message}`);
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`Error: ${msg}`);
        }
        closeGraph(graph);
        process.exit(1);
        return;
      }

      // Determine result status for summary output.
      // project() returns the existing projection when the input fingerprint
      // matches — valid_from will be earlier than our start time in that case.
      const projectionCreatedAt = new Date(projection.valid_from).getTime();
      const wasIdempotent = projectionCreatedAt < beforeCallMs - 500;

      console.log("Projection authored successfully.\n");
      console.log(`  id:      ${projection.id}`);
      console.log(`  kind:    ${projection.kind}`);
      console.log(
        `  anchor:  ${projection.anchor_type}${projection.anchor_id ? `:${projection.anchor_id}` : ""}`,
      );
      console.log(`  inputs:  ${inputs.length}`);
      console.log(`  model:   ${projection.model}`);
      console.log(
        `  status:  ${wasIdempotent ? "idempotent (no-op, already up to date)" : "authored"}`,
      );

      closeGraph(graph);
    });
}
