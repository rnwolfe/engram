/**
 * Gate G1 Maestro v3 experiment runner.
 *
 * Identical methodology to Maestro v2 (both conditions run from cwd=Maestro)
 * but tests the updated context pack that adds a direct episode search track:
 * PR descriptions and issue discussions are now surfaced as first-class content
 * in a "### Discussions" section, not only as secondary entity provenance.
 *
 * Same 9 questions as v2 to enable direct comparison.
 *
 * Usage:
 *   bun docs/internal/experiments/g1-maestro-v3/run.ts
 *
 * Prerequisites:
 *   - gemini CLI installed and authenticated
 *   - engram-cli built: bun run build
 *   - Maestro .engram already initialized at ~/dev/Maestro/.engram
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const MAESTRO_DIR = path.join(process.env.HOME!, "dev/Maestro");
const DB = path.join(MAESTRO_DIR, ".engram");
const TOKEN_BUDGET = 6000;
const OUT_DIR = path.join(import.meta.dir);
const ENGRAM_CLI = path.join(
  import.meta.dir,
  "../../../../packages/engram-cli/dist/cli.js",
);

// ---------------------------------------------------------------------------
// Same 9 questions as v2 to enable direct comparison
// ---------------------------------------------------------------------------

const QUESTIONS: Array<{
  id: string;
  size: "small" | "medium" | "large";
  question: string;
}> = [
  {
    id: "Q1",
    size: "small",
    question:
      "Why does the output buffer store streaming chunks in an array rather than concatenating them into a string?",
  },
  {
    id: "Q2",
    size: "small",
    question:
      "Why does session recovery clear the agentSessionId rather than retrying with the same ID?",
  },
  {
    id: "Q3",
    size: "small",
    question:
      "Why does Maestro use JSONL files for conversation logs instead of a database?",
  },
  {
    id: "Q4",
    size: "medium",
    question:
      "Why does the Layer Stack use a capture-phase event listener for the global Escape handler?",
  },
  {
    id: "Q5",
    size: "medium",
    question:
      "Why does the Layer Stack use explicit priority numbers rather than LIFO (last-in, first-out) ordering?",
  },
  {
    id: "Q6",
    size: "medium",
    question:
      "Why does the process manager use PTY instead of child_process.spawn for AI agents?",
  },
  {
    id: "Q7",
    size: "large",
    question:
      "Why does the group chat router use absence of @mention rather than stop tokens to determine when a participant is done?",
  },
  {
    id: "Q8",
    size: "large",
    question:
      "Why is pendingParticipantResponses a module-level Map rather than persistent storage?",
  },
  {
    id: "Q9",
    size: "large",
    question:
      "Why does Maestro define theme colors in TypeScript rather than CSS custom properties?",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContextPack(question: string): string {
  try {
    return execSync(
      `${ENGRAM_CLI} context ${JSON.stringify(question)} --token-budget ${TOKEN_BUDGET} --db ${DB}`,
      { encoding: "utf8", cwd: MAESTRO_DIR },
    );
  } catch (err) {
    return `[engram context failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function askGemini(prompt: string, cwd: string): string {
  const tmpFile = `/tmp/engram-maestro-v3-${Date.now()}.txt`;
  try {
    fs.writeFileSync(tmpFile, prompt, "utf8");
    const result = execSync(`gemini -p "$(cat ${tmpFile})"`, {
      encoding: "utf8",
      cwd,
      shell: "/bin/bash",
      timeout: 180_000,
    });
    fs.unlinkSync(tmpFile);
    return result.trim();
  } catch (err) {
    try { fs.unlinkSync(tmpFile); } catch {}
    return `[gemini failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface QuestionResult {
  id: string;
  size: string;
  question: string;
  context_pack: string;
  answer_bare: string;
  answer_with_context: string;
}

async function main() {
  // Verify prerequisites
  try {
    execSync("gemini --version", { encoding: "utf8" });
  } catch {
    console.error("Error: gemini CLI not found. Install and authenticate first.");
    process.exit(1);
  }

  if (!fs.existsSync(DB)) {
    console.error(`Error: DB not found at ${DB}`);
    console.error(`Expected Maestro .engram at: ${DB}`);
    process.exit(1);
  }

  if (!fs.existsSync(ENGRAM_CLI)) {
    console.error(`Error: engram-cli not built. Run: bun run build`);
    process.exit(1);
  }

  console.log("Gate G1 Maestro v3 — same questions as v2, updated pack with direct episode track");
  console.log(`Maestro dir: ${MAESTRO_DIR}`);
  console.log(`DB: ${DB}`);
  console.log(`Token budget: ${TOKEN_BUDGET}`);
  console.log(`Both conditions run from cwd=${MAESTRO_DIR} (same as v2)\n`);

  const results: QuestionResult[] = [];

  for (const q of QUESTIONS) {
    console.log(`${q.id} [${q.size}] ${q.question.slice(0, 70)}…`);

    // Get context pack from Maestro .engram
    process.stdout.write("  → context pack… ");
    const contextPack = getContextPack(q.question);
    const packLines = contextPack.split("\n").length;
    const discussionCount = (contextPack.match(/### Discussions/g) || []).length;
    console.log(`${packLines} lines${discussionCount > 0 ? " (includes Discussions section)" : ""}`);

    // Build prompts
    const promptBare = q.question;
    const promptWithContext =
      `You are answering a question about the Maestro codebase — a local Electron/React application ` +
      `for managing multiple AI coding agents (Claude Code, Gemini CLI, Codex, etc.) in parallel. ` +
      `The following context pack was assembled from the codebase's knowledge graph:\n\n` +
      `${contextPack}\n\n` +
      `---\n\n` +
      `Question: ${q.question}\n\n` +
      `Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.`;

    // Condition A — bare, from Maestro dir (same as v2)
    process.stdout.write("  → A (bare, Maestro cwd)… ");
    const answerBare = askGemini(promptBare, MAESTRO_DIR);
    console.log(`${answerBare.split(" ").length} words`);

    // Condition B — with context pack, from Maestro dir
    process.stdout.write("  → B (with pack, Maestro cwd)… ");
    const answerWithContext = askGemini(promptWithContext, MAESTRO_DIR);
    console.log(`${answerWithContext.split(" ").length} words`);

    results.push({
      id: q.id,
      size: q.size,
      question: q.question,
      context_pack: contextPack,
      answer_bare: answerBare,
      answer_with_context: answerWithContext,
    });

    console.log();
  }

  // Write JSON
  const jsonPath = path.join(OUT_DIR, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${jsonPath}`);

  // Write Markdown
  const lines: string[] = [];
  lines.push("# G1 Maestro v3 — Raw Results");
  lines.push("");
  lines.push("> Updated pack with direct episode search track — PR/issue discussions");
  lines.push("> surfaced as first-class content alongside code entities.");
  lines.push("> Same 9 questions as v2 for direct comparison.");
  lines.push(`> Both conditions run from cwd=${MAESTRO_DIR}.`);
  lines.push("");

  for (const r of results) {
    lines.push(`---`);
    lines.push("");
    lines.push(`## ${r.id} [${r.size}] — ${r.question}`);
    lines.push("");

    // Show whether discussions section appeared in pack
    const hasDiscussions = r.context_pack.includes("### Discussions");
    lines.push(`**Context pack:** ${r.context_pack.split("\n").length} lines${hasDiscussions ? " — includes Discussions section" : ""}`);
    lines.push("");
    lines.push("<details><summary>Full context pack</summary>");
    lines.push("");
    lines.push("```");
    lines.push(r.context_pack.trim());
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");

    lines.push("**Condition A (bare):**");
    lines.push("");
    lines.push(r.answer_bare);
    lines.push("");

    lines.push("**Condition B (with context pack):**");
    lines.push("");
    lines.push(r.answer_with_context);
    lines.push("");
  }

  const mdPath = path.join(OUT_DIR, "results.md");
  fs.writeFileSync(mdPath, lines.join("\n"));
  console.log(`Wrote ${mdPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
