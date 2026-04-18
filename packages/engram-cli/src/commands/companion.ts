import { existsSync, readFileSync } from "node:fs";
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

export function companionSentinel(harness: HarnessName): string {
  return `<!-- engram-companion:${harness} -->`;
}

interface CompanionCommandOpts {
  harness: string;
  check: boolean;
  file?: string;
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

  # Idempotent CI setup (only append if not already present)
  engram companion --harness claude-code --check --file CLAUDE.md \\
    || engram companion --harness claude-code >> CLAUDE.md

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
    .option("--file <path>", "target file to check (used with --check)")
    .option(
      "--check",
      "exit 0 if companion content is already present in --file, exit 1 if not",
    )
    .action((opts: CompanionCommandOpts) => {
      const harness = opts.harness as HarnessName;
      if (!VALID_HARNESSES.includes(harness)) {
        console.error(
          `Error: --harness must be one of: ${VALID_HARNESSES.join(", ")}`,
        );
        process.exit(1);
      }

      if (opts.check) {
        if (!opts.file) {
          console.error("Error: --check requires --file <path>");
          process.exit(1);
        }
        const sentinel = companionSentinel(harness);
        if (!existsSync(opts.file)) {
          process.exit(1);
        }
        const content = readFileSync(opts.file, "utf8");
        process.exit(content.includes(sentinel) ? 0 : 1);
      }

      const sentinel = companionSentinel(harness);
      const override = HARNESS_OVERRIDES[harness];
      const output = [sentinel, BASE_COMPANION, override]
        .filter(Boolean)
        .join("\n");
      process.stdout.write(output);
    });
}
