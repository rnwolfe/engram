/**
 * companion.ts — `engram companion` command.
 *
 * Writes a reusable system-prompt fragment to stdout that teaches an agent
 * when and how to reach for engram context-pack signals. Users append the
 * output to their agent instruction file:
 *
 *   engram companion >> CLAUDE.md
 *   engram companion --harness cursor >> .cursor/rules/engram.md
 *   engram companion --harness gemini >> GEMINI.md
 *
 * The base content is harness-agnostic; --harness adjusts tool-invocation
 * syntax and file-destination guidance.
 */

import type { Command } from "commander";
import { BASE_COMPANION } from "../templates/companion/base.js";
import {
  HARNESS_OVERRIDES,
  type HarnessName,
} from "../templates/companion/overrides.js";

const VALID_HARNESSES: HarnessName[] = [
  "generic",
  "claude-code",
  "cursor",
  "gemini",
];

interface CompanionCommandOpts {
  harness: string;
}

export function registerCompanion(program: Command): void {
  program
    .command("companion")
    .description(
      "Write a reusable agent companion prompt to stdout. Append to CLAUDE.md, AGENTS.md, or similar.",
    )
    .addHelpText(
      "after",
      `
Examples:
  # Append generic instructions to CLAUDE.md
  engram companion >> CLAUDE.md

  # Claude Code-specific instructions
  engram companion --harness claude-code >> CLAUDE.md

  # Cursor-specific instructions
  engram companion --harness cursor >> .cursor/rules/engram.md

When to use:
  Run once during project setup to teach your agent harness how to use
  engram context packs. Re-run when you add a new harness.

See also:
  engram context    Retrieve a context pack for a query
  engram init       Create the knowledge graph database`,
    )
    .option(
      "--harness <name>",
      `agent harness to target: ${VALID_HARNESSES.join(", ")}`,
      "generic",
    )
    .action((opts: CompanionCommandOpts) => {
      const harness = opts.harness as HarnessName;
      if (!VALID_HARNESSES.includes(harness)) {
        console.error(
          `Error: --harness must be one of: ${VALID_HARNESSES.join(", ")}`,
        );
        process.exit(1);
      }

      const override = HARNESS_OVERRIDES[harness];
      const output = [BASE_COMPANION, override].filter(Boolean).join("\n");
      process.stdout.write(output);
    });
}
