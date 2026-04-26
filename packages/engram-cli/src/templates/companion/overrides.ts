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
### How to invoke engram context with Gemini CLI (shell-wrapper)

Add the shell-wrapper snippet to your shell profile so every \`gemini\` invocation
automatically prepends the engram context pack when a \`.engram\` database is present:

\`\`\`sh
engram companion --harness gemini-cli >> ~/.bashrc
# or for zsh:
engram companion --harness gemini-cli >> ~/.zshrc
\`\`\`

Reload your shell (\`source ~/.bashrc\`) or start a new session after appending.

The wrapper calls \`engram context\` before each prompt and prepends the pack if a
\`.engram\` database exists in the current directory. If no \`.engram\` is found, the
wrapper passes through to \`gemini\` unchanged.

> **Note:** The native \`@engram/harness-gemini-cli\` extension package is currently
> workspace-only (not published). External users should use the shell-wrapper above.
> Native extension support will be documented once the Gemini CLI plugin API stabilises.
`,
};
