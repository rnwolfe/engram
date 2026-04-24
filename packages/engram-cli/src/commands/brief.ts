/**
 * brief.ts — `engram brief` command.
 *
 * Produces a structured briefing about a PR, issue, entity, or topic.
 * Assembles evidence from the knowledge graph and renders it in a structured
 * multi-section format (What / Who / History / Connections / Risk).
 *
 * Usage:
 *   engram brief pr:<n>
 *   engram brief issue:<n>
 *   engram brief entity:<ulid>
 *   engram brief <topic>
 *   engram brief pr:123 --format text|markdown|json
 *   engram brief pr:123 --no-ai
 *   engram brief pr:123 --db <path>
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph, resolveDbPath } from "engram-core";
import {
  assembleEntityDigest,
  assembleIssueDigest,
  assemblePrDigest,
  assembleTopicDigest,
} from "./_brief_assembly.js";
import {
  renderBriefJson,
  renderBriefMarkdown,
  renderBriefText,
} from "./_brief_render.js";
import type { OutputFormat } from "./_render.js";

export type { BriefDigest, BriefJson } from "./_brief_render.js";
export {
  renderBriefJson,
  renderBriefMarkdown,
  renderBriefText,
} from "./_brief_render.js";

// ---------------------------------------------------------------------------
// Target parsing
// ---------------------------------------------------------------------------

export type BriefTargetKind = "pr" | "issue" | "entity" | "topic";

export interface ParsedBriefTarget {
  kind: BriefTargetKind;
  ref: string;
  raw: string;
}

/**
 * Parse a brief target argument:
 *   pr:<n>          → PR mode
 *   issue:<n>       → issue mode
 *   entity:<ulid>   → entity mode
 *   <anything else> → topic mode
 */
export function parseBriefTarget(target: string): ParsedBriefTarget {
  const lower = target.toLowerCase();
  if (lower.startsWith("pr:")) {
    return { kind: "pr", ref: target.slice(3).replace(/^#/, ""), raw: target };
  }
  if (lower.startsWith("issue:")) {
    return {
      kind: "issue",
      ref: target.slice(6).replace(/^#/, ""),
      raw: target,
    };
  }
  if (lower.startsWith("entity:")) {
    return { kind: "entity", ref: target.slice(7), raw: target };
  }
  return { kind: "topic", ref: target, raw: target };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

interface BriefOpts {
  db: string;
  format: string;
  noAi: boolean;
  j?: boolean;
}

export function registerBrief(program: Command): void {
  program
    .command("brief <target>")
    .description(
      "Produce a structured briefing for a PR, issue, entity, or topic",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .option(
      "--format <fmt>",
      "output format: text, markdown, or json",
      "markdown",
    )
    .option("-j", "shorthand for --format json")
    .option("--no-ai", "structured output only (AI prose is a stretch goal)")
    .addHelpText(
      "after",
      `
Target forms:
  pr:<n>          Briefing for GitHub PR #n
  issue:<n>       Briefing for GitHub issue #n
  entity:<ulid>   Briefing anchored on a specific entity
  <topic>         FTS over entities; exit 2 if ambiguous

Sections produced:
  What       — title, status, touched files (PR) or labels (issue)
  Who        — author, assignees, file owners
  History    — co-change neighbors of touched files
  Connections — projections anchored on touched entities
  Risk       — projections whose evidence overlaps touched files

Examples:
  engram brief pr:123
  engram brief issue:42 --format json
  engram brief "authentication middleware" --format text
  engram brief entity:01HXYZ... --format markdown

See also:
  engram why     Narrate the history of a file or symbol
  engram context Assemble a full context pack for a query`,
    )
    .action(async (target: string, opts: BriefOpts) => {
      if (opts.j) opts.format = "json";

      const validFormats: OutputFormat[] = ["text", "markdown", "json"];
      if (!validFormats.includes(opts.format as OutputFormat)) {
        console.error(
          `Error: --format must be one of: ${validFormats.join(", ")}`,
        );
        process.exit(1);
      }

      const dbPath = resolveDbPath(path.resolve(opts.db));

      let graph: EngramGraph;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        const parsed = parseBriefTarget(target);
        let digest: import("./_brief_render.js").BriefDigest;

        switch (parsed.kind) {
          case "pr":
            digest = await assemblePrDigest(graph, parsed.ref);
            break;
          case "issue":
            digest = await assembleIssueDigest(graph, parsed.ref);
            break;
          case "entity":
            digest = await assembleEntityDigest(graph, parsed.ref);
            break;
          default:
            digest = await assembleTopicDigest(graph, parsed.ref, () => {
              closeGraph(graph);
              process.exit(2);
            });
        }

        let output: string;
        switch (opts.format as OutputFormat) {
          case "json":
            output = JSON.stringify(renderBriefJson(digest), null, 2);
            break;
          case "text":
            output = renderBriefText(digest);
            break;
          default:
            output = renderBriefMarkdown(digest);
        }

        console.log(output);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
