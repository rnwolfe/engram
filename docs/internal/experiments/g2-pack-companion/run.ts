/**
 * G2 Pack + Companion experiment runner.
 *
 * Tests two conditions against the v3 Condition A baseline:
 *
 *   B — new pack (Phase 1: vector episode track, confidence scoring, structural
 *       edges, hypothesis framing) without companion guidance.
 *   C — new pack (same as B) + companion prompt prepended as system context,
 *       teaching the agent how to interpret and trust pack sections.
 *
 * The key question: does the Phase 2 companion prompt improve pack usage on
 * the questions where v3 regressed (Q3, Q5 — agent hallucinated from noisy
 * Discussions) and preserve the win (Q2 — agent cited PR #543)?
 *
 * v3 A baseline (bare Gemini, cwd=Maestro) is used as reference — not re-run.
 *
 * Usage:
 *   bun docs/internal/experiments/g2-pack-companion/run.ts
 *
 * Prerequisites:
 *   - gemini CLI installed and authenticated
 *   - engram-cli built: bun run build
 *   - Maestro .engram at ~/dev/Maestro/.engram
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const MAESTRO_DIR = path.join(process.env.HOME ?? "", "dev/Maestro");
const DB = path.join(MAESTRO_DIR, ".engram");
const TOKEN_BUDGET = 6000;
const OUT_DIR = path.join(import.meta.dir);
const ENGRAM_CLI = path.join(
  import.meta.dir,
  "../../../../packages/engram-cli/dist/cli.js",
);

// ---------------------------------------------------------------------------
// Same 9 questions as v2/v3
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

function getCompanionPrompt(): string {
  try {
    return execSync(`${ENGRAM_CLI} companion --harness gemini`, {
      encoding: "utf8",
    });
  } catch (err) {
    return `[engram companion failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function askGemini(prompt: string, cwd: string): string {
  const tmpFile = `/tmp/engram-g2-${Date.now()}.txt`;
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      fs.writeFileSync(tmpFile, prompt, "utf8");
      const result = execSync(`gemini -p "$(cat ${tmpFile})"`, {
        encoding: "utf8",
        cwd,
        shell: "/bin/bash",
        timeout: 180_000,
      });
      try { fs.unlinkSync(tmpFile); } catch {}
      return result.trim();
    } catch (err) {
      try { fs.unlinkSync(tmpFile); } catch {}
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota = msg.includes("QUOTA_EXHAUSTED") || msg.includes("exhausted your capacity");
      // Extract reset delay from error if available
      const retryMsMatch = msg.match(/"retryDelayMs":(\d+)/);
      const waitMs = retryMsMatch
        ? parseInt(retryMsMatch[1], 10) + 5_000
        : 35 * 60 * 1000;
      if (isQuota && attempt < MAX_RETRIES - 1) {
        const waitMin = Math.ceil(waitMs / 60_000);
        console.log(`\n  ⏳ Quota exhausted — waiting ${waitMin}m then retrying…`);
        execSync(`sleep ${Math.ceil(waitMs / 1000)}`, { shell: "/bin/bash" });
        continue;
      }
      return `[gemini failed: ${msg}]`;
    }
  }
  return "[gemini failed: max retries exceeded]";
}

/** Extract discussion confidence scores from a context pack for logging. */
function parseDiscussionMetrics(pack: string): {
  count: number;
  hasDiscussions: boolean;
  hasStructuralSignals: boolean;
  confidenceScores: number[];
} {
  const hasDiscussions = pack.includes("### Possibly relevant discussions");
  const hasStructuralSignals = pack.includes("### Structural signals");

  // Extract confidence scores from "confidence X.XXX:" lines in the pack
  const confidenceMatches = [...pack.matchAll(/confidence (\d+\.\d+):/g)];
  const confidenceScores = confidenceMatches.map((m) => parseFloat(m[1]));

  return {
    count: confidenceScores.length,
    hasDiscussions,
    hasStructuralSignals,
    confidenceScores,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

const SYSTEM_FRAMING =
  `You are answering a question about the Maestro codebase — a local Electron/React ` +
  `application for managing multiple AI coding agents (Claude Code, Gemini CLI, Codex, etc.) ` +
  `in parallel. Answer concisely in 150-250 words, grounding your answer in specific evidence ` +
  `where possible.`;

function buildPromptB(pack: string, question: string): string {
  return (
    `${SYSTEM_FRAMING}\n\n` +
    `The following context pack was assembled from the codebase's knowledge graph:\n\n` +
    `${pack}\n\n` +
    `---\n\n` +
    `Question: ${question}`
  );
}

function buildPromptC(companion: string, pack: string, question: string): string {
  return (
    `${companion}\n\n` +
    `---\n\n` +
    `${SYSTEM_FRAMING}\n\n` +
    `The following context pack was assembled from the codebase's knowledge graph:\n\n` +
    `${pack}\n\n` +
    `---\n\n` +
    `Question: ${question}`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

interface PackMetrics {
  lines: number;
  hasDiscussions: boolean;
  hasStructuralSignals: boolean;
  discussionCount: number;
  confidenceScores: number[];
}

interface TokenCost {
  prompt_tokens: number;   // estimated input tokens sent to Gemini
  answer_tokens: number;   // estimated output tokens
  total_tokens: number;
}

interface QuestionResult {
  id: string;
  size: string;
  question: string;
  context_pack: string;
  pack_metrics: PackMetrics;
  answer_b: string;
  answer_c: string;
  cost_b: TokenCost;
  cost_c: TokenCost;
}

async function main() {
  // Parse --questions Q1,Q2,Q5 or --questions 1,2,5 (default: all)
  const questionsFlag = process.argv.indexOf("--questions");
  let questionFilter: Set<string> | null = null;
  if (questionsFlag !== -1 && process.argv[questionsFlag + 1]) {
    questionFilter = new Set(
      process.argv[questionsFlag + 1]
        .split(",")
        .map((s) => s.trim().toUpperCase().replace(/^(\d+)$/, "Q$1")),
    );
  }
  const activeQuestions = questionFilter
    ? QUESTIONS.filter((q) => questionFilter?.has(q.id))
    : QUESTIONS;

  if (activeQuestions.length === 0) {
    console.error(`No questions matched filter: ${process.argv[questionsFlag + 1]}`);
    process.exit(1);
  }

  // Verify prerequisites
  try {
    execSync("gemini --version", { encoding: "utf8" });
  } catch {
    console.error("Error: gemini CLI not found. Install and authenticate first.");
    process.exit(1);
  }

  if (!fs.existsSync(DB)) {
    console.error(`Error: DB not found at ${DB}`);
    process.exit(1);
  }

  if (!fs.existsSync(ENGRAM_CLI)) {
    console.error(`Error: engram-cli not built. Run: bun run build`);
    process.exit(1);
  }

  // Generate companion prompt once — reused for all C conditions
  process.stdout.write("Generating companion prompt… ");
  const companionPrompt = getCompanionPrompt();
  const companionLines = companionPrompt.split("\n").length;
  console.log(`${companionLines} lines`);

  const qLabel = activeQuestions.map((q) => q.id).join(", ");
  console.log("\nG2 Pack + Companion — conditions B and C against v3 A baseline");
  console.log(`Questions: ${qLabel}`);
  console.log(`Maestro dir: ${MAESTRO_DIR}`);
  console.log(`DB: ${DB} (${(fs.statSync(DB).size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Token budget: ${TOKEN_BUDGET}`);
  console.log(`Pack version: Phase 1 (vector track, confidence scoring, structural edges, hypothesis framing)`);
  console.log(`Companion: ${companionLines} lines (--harness gemini)`);
  console.log();

  const results: QuestionResult[] = [];

  for (const q of activeQuestions) {
    console.log(`${q.id} [${q.size}] ${q.question.slice(0, 70)}…`);

    // Context pack
    process.stdout.write("  → context pack… ");
    const pack = getContextPack(q.question);
    const metrics = parseDiscussionMetrics(pack);
    const packMetrics: PackMetrics = {
      lines: pack.split("\n").length,
      hasDiscussions: metrics.hasDiscussions,
      hasStructuralSignals: metrics.hasStructuralSignals,
      discussionCount: metrics.count,
      confidenceScores: metrics.confidenceScores,
    };
    const confidenceSummary = metrics.confidenceScores.length > 0
      ? ` | confidences: [${metrics.confidenceScores.map((s) => s.toFixed(2)).join(", ")}]`
      : "";
    const sectionFlags = [
      metrics.hasDiscussions ? "discussions" : "",
      metrics.hasStructuralSignals ? "structural" : "",
    ].filter(Boolean).join("+");
    console.log(
      `${packMetrics.lines} lines${sectionFlags ? ` [${sectionFlags}]` : ""}${confidenceSummary}`,
    );

    // Condition B — new pack, no companion
    process.stdout.write("  → B (pack, no companion)… ");
    const promptB = buildPromptB(pack, q.question);
    const answerB = askGemini(promptB, MAESTRO_DIR);
    const costB: TokenCost = {
      prompt_tokens: estimateTokens(promptB),
      answer_tokens: estimateTokens(answerB),
      total_tokens: estimateTokens(promptB) + estimateTokens(answerB),
    };
    console.log(`${answerB.split(" ").length} words | ~${costB.total_tokens} tok`);

    // Condition C — new pack + companion
    process.stdout.write("  → C (pack + companion)… ");
    const promptC = buildPromptC(companionPrompt, pack, q.question);
    const answerC = askGemini(promptC, MAESTRO_DIR);
    const costC: TokenCost = {
      prompt_tokens: estimateTokens(promptC),
      answer_tokens: estimateTokens(answerC),
      total_tokens: estimateTokens(promptC) + estimateTokens(answerC),
    };
    console.log(`${answerC.split(" ").length} words | ~${costC.total_tokens} tok`);

    results.push({
      id: q.id,
      size: q.size,
      question: q.question,
      context_pack: pack,
      pack_metrics: packMetrics,
      answer_b: answerB,
      answer_c: answerC,
      cost_b: costB,
      cost_c: costC,
    });

    console.log();
  }

  // Write JSON
  const jsonPath = path.join(OUT_DIR, "results.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ companion_prompt: companionPrompt, results }, null, 2),
  );
  console.log(`Wrote ${jsonPath}`);

  // Write Markdown
  const lines: string[] = [];
  lines.push("# G2 Pack + Companion — Raw Results");
  lines.push("");
  lines.push("> **Conditions:** B = new pack (Phase 1 improvements), C = new pack + companion prompt.");
  lines.push("> **Baseline:** v3 Condition A (bare Gemini, cwd=Maestro) — see g1-maestro-v3/grades.md.");
  lines.push("> **Pack version:** Phase 1 — vector episode track, confidence scoring, structural edge");
  lines.push(">   augmentation, hypothesis framing (\"Possibly relevant discussions\", \"Structural signals\").");
  lines.push("> **Key questions to watch:** Q2 (should still surface PR #543), Q3 and Q5 (regressed");
  lines.push(">   in v3 — check if new framing reduces hallucination-from-retrieval).");
  lines.push("");

  // Pack metrics summary table
  lines.push("## Pack metrics");
  lines.push("");
  lines.push("| Q | Lines | Sections | Discussions | Confidence scores |");
  lines.push("|---|-------|----------|-------------|-------------------|");
  for (const r of results) {
    const m = r.pack_metrics;
    const sections = [
      m.hasDiscussions ? "discussions" : "",
      m.hasStructuralSignals ? "structural" : "",
    ].filter(Boolean).join(", ") || "entities/edges only";
    const scores = m.confidenceScores.length > 0
      ? m.confidenceScores.map((s) => s.toFixed(2)).join(", ")
      : "—";
    lines.push(`| ${r.id} | ${m.lines} | ${sections} | ${m.discussionCount} | ${scores} |`);
  }
  lines.push("");

  // Token cost summary table
  lines.push("## Token cost (estimated, chars÷4)");
  lines.push("");
  lines.push("| Q | B prompt | B answer | B total | C prompt | C answer | C total | C overhead vs B |");
  lines.push("|---|----------|----------|---------|----------|----------|---------|-----------------|");
  let totalB = 0, totalC = 0;
  for (const r of results) {
    const overhead = r.cost_c.total_tokens - r.cost_b.total_tokens;
    const overheadPct = ((overhead / r.cost_b.total_tokens) * 100).toFixed(0);
    lines.push(
      `| ${r.id} | ${r.cost_b.prompt_tokens} | ${r.cost_b.answer_tokens} | ${r.cost_b.total_tokens} | ${r.cost_c.prompt_tokens} | ${r.cost_c.answer_tokens} | ${r.cost_c.total_tokens} | +${overhead} (+${overheadPct}%) |`,
    );
    totalB += r.cost_b.total_tokens;
    totalC += r.cost_c.total_tokens;
  }
  const totalOverhead = totalC - totalB;
  const totalOverheadPct = ((totalOverhead / totalB) * 100).toFixed(0);
  lines.push(`| **Total** | | | **${totalB}** | | | **${totalC}** | **+${totalOverhead} (+${totalOverheadPct}%)** |`);
  lines.push("");

  for (const r of results) {
    lines.push("---");
    lines.push("");
    lines.push(`## ${r.id} [${r.size}] — ${r.question}`);
    lines.push("");

    const m = r.pack_metrics;
    const sectionNote = [
      m.hasDiscussions ? `Possibly relevant discussions (${m.discussionCount} hit(s)` +
        (m.confidenceScores.length > 0 ? `, confidence: [${m.confidenceScores.map((s) => s.toFixed(2)).join(", ")}]` : "") + ")" : "",
      m.hasStructuralSignals ? "Structural signals" : "",
    ].filter(Boolean).join("; ") || "entities/edges only (no discussion hits above threshold)";
    lines.push(`**Pack:** ${m.lines} lines — ${sectionNote}`);
    lines.push("");
    lines.push("<details><summary>Full context pack</summary>");
    lines.push("");
    lines.push("```");
    lines.push(r.context_pack.trim());
    lines.push("```");
    lines.push("");
    lines.push("</details>");
    lines.push("");

    lines.push(`**Condition B (pack, no companion):** ~${r.cost_b.total_tokens} tok (${r.cost_b.prompt_tokens} prompt + ${r.cost_b.answer_tokens} answer)`);
    lines.push("");
    lines.push(r.answer_b);
    lines.push("");

    lines.push(`**Condition C (pack + companion):** ~${r.cost_c.total_tokens} tok (${r.cost_c.prompt_tokens} prompt + ${r.cost_c.answer_tokens} answer)`);
    lines.push("");
    lines.push(r.answer_c);
    lines.push("");
  }

  const mdPath = path.join(OUT_DIR, "results.md");
  fs.writeFileSync(mdPath, lines.join("\n"));
  console.log(`Wrote ${mdPath}`);

  console.log("\nNext: grade results.md against v3 grades.md");
  console.log("  bun run engram-grade docs/internal/experiments/g2-pack-companion/results.md");
  console.log("  (or open results.md and grade manually / via subagent)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
