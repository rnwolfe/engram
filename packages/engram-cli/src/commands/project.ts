/**
 * project.ts — `engram project` command.
 *
 * Explicitly authors a projection on a specific anchor with a specific input set.
 *
 * Usage:
 *   engram project --kind <kind> --anchor <type:id> [--input <type:id>]... [--dry-run]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type {
  AnchorType,
  EngramGraph,
  ProjectionInput,
  ProjectionInputType,
} from "engram-core";
import {
  closeGraph,
  createGenerator,
  findEdges,
  getEntity,
  listActiveProjections,
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
 *
 * Throws UsageError if the entity does not exist.
 */
function resolveDefaultInputs(
  graph: EngramGraph,
  anchor: { type: AnchorType; id?: string },
): ProjectionInput[] {
  if (anchor.type !== "entity" || !anchor.id) {
    return [];
  }

  const anchorId = anchor.id;

  // Guard: verify the entity exists before building inputs
  const entity = getEntity(graph, anchorId);
  if (!entity) {
    throw new UsageError(`Entity ${anchorId} not found`);
  }

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

// createGenerator is imported from engram-core. It resolves the provider from
// ENGRAM_AI_PROVIDER (anthropic | gemini | openai) or auto-detects from present
// API keys. Falls back to NullGenerator when nothing is configured.

// ─── Command registration ────────────────────────────────────────────────────

export function registerProject(program: Command): void {
  program
    .command("project")
    .description("Author a projection on an anchor with explicit inputs")
    .requiredOption(
      "--kind <kind>",
      "projection kind — lowercase letters, digits, underscores only (e.g. entity_summary)",
    )
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
    .addHelpText(
      "after",
      `
Examples:
  # Author an entity_summary projection anchored to an entity
  engram project --kind entity_summary --anchor entity:01HX...

  # Author with explicit input episodes
  engram project --kind entity_summary --anchor entity:01HX... --input episode:01HY... --input episode:01HZ...

  # Preview what would be authored without writing
  engram project --kind entity_summary --anchor entity:01HX... --dry-run

When to use:
  When you want to explicitly generate or refresh a projection for a specific
  entity rather than waiting for reconcile to discover it.

See also:
  engram reconcile   run the full projection maintenance loop
  engram export      export projections to a wiki folder`,
    )
    .action(async (opts: ProjectOpts) => {
      intro("engram project");

      // ── Parse & validate opts ───────────────────────────────────────────────

      if (!/^[a-z][a-z0-9_]*$/.test(opts.kind)) {
        log.error(
          `--kind "${opts.kind}" is invalid. Must match /^[a-z][a-z0-9_]*$/.`,
        );
        process.exit(2);
        return;
      }

      let anchor: { type: AnchorType; id?: string };
      let inputs: ProjectionInput[];

      try {
        anchor = parseAnchor(opts.anchor);
        const rawInputs = Array.isArray(opts.input) ? opts.input : [];
        inputs = rawInputs.map(parseInput);
      } catch (err) {
        if (err instanceof UsageError) {
          log.error(err.message);
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
        log.error(
          `Cannot open graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
        return;
      }

      // ── Resolve default inputs if none specified ────────────────────────────
      if (inputs.length === 0) {
        try {
          inputs = resolveDefaultInputs(graph, anchor);
        } catch (err) {
          if (err instanceof UsageError) {
            log.error(err.message);
            closeGraph(graph);
            process.exit(1);
            return;
          }
          throw err;
        }

        if (inputs.length === 0 && anchor.type !== "none") {
          log.error(
            `No inputs found for anchor ${opts.anchor}. Specify --input explicitly or ensure the anchor has evidence.`,
          );
          closeGraph(graph);
          process.exit(1);
          return;
        }
      }

      // ── Dry-run: print what would be authored ──────────────────────────────
      if (opts.dryRun) {
        const inputList = inputs.map((i) => `  - ${i.type}:${i.id}`).join("\n");
        log.info(
          [
            "Dry run — no changes will be written.",
            `Kind:    ${opts.kind}`,
            `Anchor:  ${anchor.type}${anchor.id ? `:${anchor.id}` : ""}`,
            `Inputs:  ${inputs.length}`,
            inputList,
          ].join("\n"),
        );
        closeGraph(graph);
        outro("Done (dry-run)");
        process.exit(0);
        return;
      }

      // ── Build generator ────────────────────────────────────────────────────
      let generator: import("engram-core").ProjectionGenerator;
      try {
        generator = createGenerator();
      } catch (err) {
        if (err instanceof UsageError) {
          log.error(err.message);
          closeGraph(graph);
          process.exit(2);
          return;
        }
        throw err;
      }

      if (generator instanceof NullGenerator) {
        log.error(
          "No AI provider configured for projection authoring.\n" +
            "Set ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY (or set ENGRAM_AI_PROVIDER explicitly).",
        );
        closeGraph(graph);
        process.exit(1);
        return;
      }

      // ── Query for existing projection before calling project() ─────────────
      const anchorIdForQuery = anchor.id ?? null;
      const existingBeforeCall = listActiveProjections(graph, {
        kind: opts.kind,
        anchor_type: anchor.type,
        ...(anchorIdForQuery !== null ? { anchor_id: anchorIdForQuery } : {}),
      });
      const preExistingId =
        existingBeforeCall.length > 0
          ? existingBeforeCall[0].projection.id
          : null;

      // ── Author the projection ──────────────────────────────────────────────
      const s = spinner();
      s.start(`Authoring ${opts.kind} projection`);

      let projection: import("engram-core").Projection;
      try {
        projection = await project(graph, {
          kind: opts.kind,
          anchor,
          inputs,
          generator,
        });
        s.stop("Projection authored");
      } catch (err) {
        s.stop("Projection authoring failed");
        const msg =
          err instanceof ProjectionCycleError ||
          err instanceof ProjectionInputMissingError ||
          err instanceof ProjectionFrontmatterError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        log.error(msg);
        closeGraph(graph);
        process.exit(1);
        return;
      }

      const wasIdempotent =
        preExistingId !== null && projection.id === preExistingId;

      log.info(
        [
          `ID:      ${projection.id}`,
          `Kind:    ${projection.kind}`,
          `Anchor:  ${projection.anchor_type}${projection.anchor_id ? `:${projection.anchor_id}` : ""}`,
          `Inputs:  ${inputs.length}`,
          `Model:   ${projection.model}`,
          `Status:  ${wasIdempotent ? "idempotent (already up to date)" : "authored"}`,
        ].join("\n"),
      );

      closeGraph(graph);
      outro("Done");
    });
}
