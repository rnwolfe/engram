/**
 * Gate G1 experiment runner.
 *
 * For each of 9 questions across 3 modules, calls gemini -p in headless mode:
 *   A) bare question (no context) — fresh subprocess, no shared state
 *   B) question + engram context pack prepended — fresh subprocess
 *
 * Each of the 18 invocations is a completely independent process, ensuring
 * no cross-contamination between conditions or questions.
 *
 * Writes all verbatim inputs and outputs to results.json and results.md.
 *
 * Usage:
 *   bun docs/internal/experiments/g1-narrative-projection/run.ts
 *
 * Prerequisites:
 *   - gemini CLI installed and authenticated (gemini --version)
 *   - engram-cli built (./packages/engram-cli/dist/cli.js exists)
 *   - DB initialized: engram init --from-git . --from-source . --db /tmp/engram-g1.engram
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const DB = "/tmp/engram-g1.engram";
const TOKEN_BUDGET = 6000;
const OUT_DIR = path.join(import.meta.dir);
const REPO_ROOT = path.join(import.meta.dir, "../../../..");

// ---------------------------------------------------------------------------
// Questions: 3 modules × 3 "why/how" questions each
// ---------------------------------------------------------------------------

const QUESTIONS: Array<{
  module: string;
  size: "small" | "medium" | "large";
  question: string;
}> = [
  // Small: temporal/
  {
    module: "packages/engram-core/src/temporal",
    size: "small",
    question:
      "Why does supersedeEdge create a new edge rather than updating the existing one in place?",
  },
  {
    module: "packages/engram-core/src/temporal",
    size: "small",
    question:
      "Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?",
  },
  {
    module: "packages/engram-core/src/temporal",
    size: "small",
    question: "Why is invalidated_at tracked separately from valid_until?",
  },

  // Medium: graph/reconcile.ts neighborhood
  {
    module: "packages/engram-core/src/graph/reconcile.ts",
    size: "medium",
    question:
      "Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?",
  },
  {
    module: "packages/engram-core/src/graph/reconcile.ts",
    size: "medium",
    question:
      "Why does the discover phase use a substrate delta rather than scanning all episodes on every run?",
  },
  {
    module: "packages/engram-core/src/graph/reconcile.ts",
    size: "medium",
    question:
      "Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?",
  },

  // Large: ingest/source/
  {
    module: "packages/engram-core/src/ingest/source",
    size: "large",
    question:
      "Why does source ingestion use a content hash in the source_ref rather than just the file path?",
  },
  {
    module: "packages/engram-core/src/ingest/source",
    size: "large",
    question:
      "Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?",
  },
  {
    module: "packages/engram-core/src/ingest/source",
    size: "large",
    question:
      "Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getContextPack(question: string): string {
  try {
    return execSync(
      `./packages/engram-cli/dist/cli.js context ${JSON.stringify(question)} --token-budget ${TOKEN_BUDGET} --db ${DB}`,
      { encoding: "utf8", cwd: REPO_ROOT },
    );
  } catch (err) {
    return `[engram context failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function askGemini(prompt: string): string {
  try {
    // Each call is a fresh subprocess — no shared context window between questions.
    // Escape the prompt for shell: write to a temp file and use process substitution
    // to avoid shell quoting issues with long prompts containing backticks, quotes, etc.
    const tmpFile = `/tmp/engram-g1-prompt-${Date.now()}.txt`;
    fs.writeFileSync(tmpFile, prompt, "utf8");
    const result = execSync(`gemini -p "$(cat ${tmpFile})"`, {
      encoding: "utf8",
      cwd: REPO_ROOT,
      shell: "/bin/bash",
      timeout: 120_000,
    });
    fs.unlinkSync(tmpFile);
    return result.trim();
  } catch (err) {
    return `[gemini failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface QuestionResult {
  id: string;
  module: string;
  size: string;
  question: string;
  context_pack: string;
  prompt_bare: string;
  prompt_with_context: string;
  answer_bare: string;
  answer_with_context: string;
}

async function main() {
  // Verify prerequisites
  try {
    execSync("gemini --version", { encoding: "utf8" });
  } catch {
    console.error(
      "Error: gemini CLI not found. Install and authenticate first.",
    );
    process.exit(1);
  }

  if (!fs.existsSync(DB)) {
    console.error(`Error: DB not found at ${DB}`);
    console.error(
      `Run: ./packages/engram-cli/dist/cli.js init --from-git . --from-source . --db ${DB}`,
    );
    process.exit(1);
  }

  const results: QuestionResult[] = [];

  console.log(
    `Running Gate G1 experiment — ${QUESTIONS.length} questions × 2 conditions\n`,
  );
  console.log(`Model: gemini (via gemini -p)`);
  console.log(`DB: ${DB}`);
  console.log(
    `Each of 18 invocations is a fresh subprocess (no shared context)\n`,
  );

  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const id = `Q${String(i + 1).padStart(2, "0")}`;
    console.log(`${id} [${q.size}] ${q.question.slice(0, 70)}…`);

    // Get context pack
    process.stdout.write("  → fetching context pack… ");
    const contextPack = getContextPack(q.question);
    console.log(`${contextPack.split("\n").length} lines`);

    // Build prompts
    const promptBare = q.question;
    const promptWithContext =
      `You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. ` +
      `The following context pack was assembled from the codebase's knowledge graph:\n\n` +
      `${contextPack}\n\n` +
      `---\n\n` +
      `Question: ${q.question}\n\n` +
      `Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.`;

    // Condition A: bare — fresh gemini subprocess, no context
    process.stdout.write("  → bare (fresh process)… ");
    const answerBare = askGemini(promptBare);
    console.log(`${answerBare.split(" ").length} words`);

    // Condition B: with context — fresh gemini subprocess, no shared state with A
    process.stdout.write("  → with context (fresh process)… ");
    const answerWithContext = askGemini(promptWithContext);
    console.log(`${answerWithContext.split(" ").length} words`);

    results.push({
      id,
      module: q.module,
      size: q.size,
      question: q.question,
      context_pack: contextPack,
      prompt_bare: promptBare,
      prompt_with_context: promptWithContext,
      answer_bare: answerBare,
      answer_with_context: answerWithContext,
    });

    console.log();
  }

  // Write JSON
  const jsonPath = path.join(OUT_DIR, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${jsonPath}`);

  // Write Markdown — verbatim inputs and outputs for human review
  const lines: string[] = [];
  lines.push("# Gate G1 Experiment Results");
  lines.push("");
  lines.push(`**Model:** gemini (via \`gemini -p\`)  `);
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}  `);
  lines.push(`**DB:** git + source ingest of this repo  `);
  lines.push(`**Context budget:** ${TOKEN_BUDGET} tokens  `);
  lines.push(
    `**Isolation:** Each of 18 model calls is a fresh \`gemini -p\` subprocess — no shared context window.  `,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const r of results) {
    lines.push(`## ${r.id} — ${r.size} module`);
    lines.push("");
    lines.push(`**Module:** \`${r.module}\`  `);
    lines.push(`**Question:** ${r.question}`);
    lines.push("");

    lines.push("### Context pack (engram output)");
    lines.push("");
    lines.push("```");
    lines.push(r.context_pack.trim());
    lines.push("```");
    lines.push("");

    lines.push("### Condition A — bare (no context)");
    lines.push("");
    lines.push("**Prompt:**");
    lines.push("```");
    lines.push(r.prompt_bare);
    lines.push("```");
    lines.push("");
    lines.push("**Answer:**");
    lines.push("");
    lines.push(r.answer_bare);
    lines.push("");

    lines.push("### Condition B — with engram context");
    lines.push("");
    lines.push("**Prompt:**");
    lines.push("```");
    lines.push(r.prompt_with_context);
    lines.push("```");
    lines.push("");
    lines.push("**Answer:**");
    lines.push("");
    lines.push(r.answer_with_context);
    lines.push("");

    lines.push("### Grade");
    lines.push("");
    lines.push(
      "*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*",
    );
    lines.push("");
    lines.push("Notes:");
    lines.push("");
    lines.push("---");
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
