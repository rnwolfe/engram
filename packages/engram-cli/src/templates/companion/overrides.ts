/**
 * overrides.ts — Harness-specific companion prompt additions.
 *
 * Each entry adds a short section after the base template that adjusts
 * phrasing for the target agent harness: tool invocation syntax, where to
 * append the prompt, and any harness-specific caveats.
 */

export type HarnessName =
  | "generic"
  | "claude-code"
  | "cursor"
  | "gemini"
  | "gemini-cli";

export const HARNESS_OVERRIDES: Record<HarnessName, string> = {
  generic: `\
### How to invoke engram context

Run the following shell command and inject the output into your context window:

\`\`\`sh
engram context "<your query>" --db <path-to>.engram
\`\`\`

Append this guide to your agent instruction file (e.g. \`AGENTS.md\`):

\`\`\`sh
engram companion >> AGENTS.md
\`\`\`
`,

  "claude-code": `\
### How to invoke engram context in Claude Code

Use the Bash tool to run \`engram context\` and read the output:

\`\`\`
Bash: engram context "<your query>" --db <path-to>.engram
\`\`\`

The pack is written to stdout in Markdown. Read it before answering any question
that requires historical rationale or multi-file co-change awareness.

To make this guide available in every session, append it to \`CLAUDE.md\`:

\`\`\`sh
engram companion --harness claude-code >> CLAUDE.md
\`\`\`
`,

  cursor: `\
### How to invoke engram context in Cursor

Use Cursor's terminal tool to run \`engram context\` and read the output:

\`\`\`
Terminal: engram context "<your query>" --db <path-to>.engram
\`\`\`

The pack is written to stdout in Markdown. Read it before answering any question
that requires historical rationale or multi-file co-change awareness.

To make this guide available in every Cursor session, append it to your rules file:

\`\`\`sh
engram companion --harness cursor >> .cursor/rules/engram.md
\`\`\`
`,

  gemini: `\
### How to invoke engram context in Gemini CLI

Use the shell tool to run \`engram context\` and read the output:

\`\`\`
shell: engram context "<your query>" --db <path-to>.engram
\`\`\`

The pack is written to stdout in Markdown. Read it before answering any question
that requires historical rationale or multi-file co-change awareness.

To make this guide available in every Gemini CLI session, append it to \`GEMINI.md\`:

\`\`\`sh
engram companion --harness gemini >> GEMINI.md
\`\`\`
`,

  "gemini-cli": `\
### How to invoke engram context with Gemini CLI (native harness)

The \`@engram/harness-gemini-cli\` package automatically prepends an engram context pack
to every prompt. Install it and the pack injection happens without any manual invocation.

If the native extension API is unavailable, use the shell-wrapper fallback:

\`\`\`sh
# Add to ~/.bashrc or ~/.zshrc
$(engram companion --harness gemini-cli)
\`\`\`

This wraps the \`gemini\` command so every invocation automatically prepends the engram
context pack when a \`.engram\` database is present in the current directory.

To emit the wrapper snippet:

\`\`\`sh
engram companion --harness gemini-cli >> ~/.bashrc
\`\`\`
`,
};
