/**
 * onboard.ts — `engram onboard` command.
 *
 * Produces a curated briefing for a new contributor entering an area or learning
 * about a person. Two subcommands:
 *
 *   engram onboard area <path|topic>   — curated briefing for a directory/module or topic
 *   engram onboard person <name>       — briefing centered on a person
 *
 * Common flags:
 *   --depth shallow|standard|deep   (default: standard)
 *   --format text|markdown|json     (default: text)
 *   --reading-list                  output only the ordered reading list
 *   --no-ai                         skip AI prose (default)
 *   --db <path>                     path to .engram file
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph, resolveDbPath } from "engram-core";
import {
  assembleAreaDigest,
  assemblePersonDigest,
} from "./_onboard_assembly.js";
import type { OnboardDigest } from "./_onboard_render.js";
import {
  renderOnboardJson,
  renderOnboardMarkdown,
  renderOnboardText,
  renderReadingList,
} from "./_onboard_render.js";

// ---------------------------------------------------------------------------
// Depth limits
// ---------------------------------------------------------------------------

export const DEPTH_LIMITS = { shallow: 10, standard: 25, deep: 50 } as const;

export type DepthLevel = keyof typeof DEPTH_LIMITS;

export type OnboardFormat = "text" | "markdown" | "json";

// ---------------------------------------------------------------------------
// Exports for tests
// ---------------------------------------------------------------------------

export type { OnboardDigest } from "./_onboard_render.js";
export {
  renderOnboardJson,
  renderOnboardMarkdown,
  renderOnboardText,
  renderReadingList,
} from "./_onboard_render.js";

// ---------------------------------------------------------------------------
// Subcommand helpers
// ---------------------------------------------------------------------------

function getDepthLimit(depth: string): number {
  const limits: Record<string, number> = {
    shallow: DEPTH_LIMITS.shallow,
    standard: DEPTH_LIMITS.standard,
    deep: DEPTH_LIMITS.deep,
  };
  return limits[depth] ?? DEPTH_LIMITS.standard;
}

function renderDigest(
  digest: OnboardDigest,
  format: OnboardFormat,
  readingList: boolean,
): string {
  if (readingList) return renderReadingList(digest);

  switch (format) {
    case "json":
      return JSON.stringify(renderOnboardJson(digest), null, 2);
    case "markdown":
      return renderOnboardMarkdown(digest);
    default:
      return renderOnboardText(digest);
  }
}

function openDb(dbPath: string): EngramGraph {
  const resolved = resolveDbPath(path.resolve(dbPath));
  return openGraph(resolved);
}

interface OnboardOpts {
  db: string;
  format: string;
  depth: string;
  readingList: boolean;
  noAi: boolean;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerOnboard(program: Command): void {
  const onboard = program
    .command("onboard")
    .description(
      "Guided briefing for a new contributor entering an area or learning about a person",
    )
    .addHelpText(
      "after",
      `
Subcommands:
  area <path|topic>   Curated briefing for a directory/module or topic
  person <name>       Briefing centered on a person

Depth levels:
  shallow    ≤10 items per section
  standard   ≤25 items per section  (default)
  deep       ≤50 items per section

Examples:
  engram onboard area src/ingest
  engram onboard area "authentication" --depth deep
  engram onboard person "alice@example.com" --format markdown
  engram onboard person alice --reading-list

See also:
  engram brief   Structured briefing for a PR, issue, or entity
  engram why     Narrate the history of a file or symbol`,
    )
    .action(() => {
      onboard.outputHelp();
      process.exit(2);
    });

  // --- area subcommand ---
  onboard
    .command("area <target>")
    .description("Curated briefing for a directory/module or topic")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--format <fmt>", "output format: text, markdown, or json", "text")
    .option("--depth <level>", "depth: shallow, standard, or deep", "standard")
    .option("--reading-list", "output only the ordered reading list", false)
    .option("--no-ai", "structured output only (no AI prose)")
    .action(async (target: string, opts: OnboardOpts) => {
      const validFormats: OnboardFormat[] = ["text", "markdown", "json"];
      if (!validFormats.includes(opts.format as OnboardFormat)) {
        console.error(
          `Error: --format must be one of: ${validFormats.join(", ")}`,
        );
        process.exit(1);
      }
      const validDepths: DepthLevel[] = ["shallow", "standard", "deep"];
      if (!validDepths.includes(opts.depth as DepthLevel)) {
        console.error(
          `Error: --depth must be one of: ${validDepths.join(", ")}`,
        );
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openDb(opts.db);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        const limit = getDepthLimit(opts.depth);
        const result = await assembleAreaDigest(graph, target, limit);

        if ("ambiguous" in result) {
          console.error(
            `Ambiguous target '${target}' — ${result.candidates.length} candidates:`,
          );
          for (const c of result.candidates) {
            console.error(`  ${c}`);
          }
          console.error("Hint: use a more specific path or topic.");
          closeGraph(graph);
          process.exit(2);
        }

        const output = renderDigest(
          result,
          opts.format as OnboardFormat,
          opts.readingList,
        );
        console.log(output);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph!);
        process.exit(1);
      }

      closeGraph(graph!);
    });

  // --- person subcommand ---
  onboard
    .command("person <name>")
    .description("Briefing centered on a person")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--format <fmt>", "output format: text, markdown, or json", "text")
    .option("--depth <level>", "depth: shallow, standard, or deep", "standard")
    .option("--reading-list", "output only the ordered reading list", false)
    .option("--no-ai", "structured output only (no AI prose)")
    .action(async (name: string, opts: OnboardOpts) => {
      const validFormats: OnboardFormat[] = ["text", "markdown", "json"];
      if (!validFormats.includes(opts.format as OnboardFormat)) {
        console.error(
          `Error: --format must be one of: ${validFormats.join(", ")}`,
        );
        process.exit(1);
      }
      const validDepths: DepthLevel[] = ["shallow", "standard", "deep"];
      if (!validDepths.includes(opts.depth as DepthLevel)) {
        console.error(
          `Error: --depth must be one of: ${validDepths.join(", ")}`,
        );
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openDb(opts.db);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        const limit = getDepthLimit(opts.depth);
        const result = await assemblePersonDigest(graph, name, limit);

        if ("notFound" in result) {
          console.error(`Person '${name}' not found.`);
          if (result.suggestions.length > 0) {
            console.error("Did you mean:");
            for (const s of result.suggestions) {
              console.error(`  ${s}`);
            }
          }
          closeGraph(graph);
          process.exit(2);
        }

        const output = renderDigest(
          result,
          opts.format as OnboardFormat,
          opts.readingList,
        );
        console.log(output);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph!);
        process.exit(1);
      }

      closeGraph(graph!);
    });
}
