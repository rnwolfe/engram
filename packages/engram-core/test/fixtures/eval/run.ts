/**
 * Eval fixture runner.
 *
 * Loads a YAML fixture from packages/engram-core/test/fixtures/eval/<name>.yaml
 * and runs each evaluation.conditions × evaluation.prompts pair against the
 * configured model CLI.
 *
 * Conditions:
 *   bare       — prompt text only; agent uses raw file search.
 *   with_pack  — `engram context` pack prepended to the prompt.
 *
 * Usage:
 *   bun run eval --fixture k8s-sidecar-containers-753
 *   bun packages/engram-core/test/fixtures/eval/run.ts --fixture <name>
 *
 * Prerequisites:
 *   - Model CLI (e.g. gemini) installed and authenticated.
 *   - engram-cli built: bun run build
 *
 * TODO(materialization): clone-or-resolve cache and run engram sync — not yet
 * implemented; run `engram sync` manually against the fixture cwd (i.e. the
 * cloned repo referenced in fixture.source.repo) before running eval.
 */

import { execFile, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// Types matching the fixture YAML schema
// ---------------------------------------------------------------------------

interface FixtureSource {
  type: string;
  repo: string;
  pin?: string;
  clone_strategy?: string;
}

interface FixtureIngestEntry {
  name: string;
  type: string;
  path?: string;
  root?: string;
  scope?: string;
  auth?: { kind: string; tokenEnv?: string };
}

interface ModelSpec {
  provider: string;
  model_id: string;
  cli_command: string;
  cli_flags: string[];
}

interface Condition {
  id: string;
  description: string;
}

interface Prompt {
  id: string;
  text: string;
  ground_truth?: {
    files?: string[];
    rationale_sources?: string[];
    expected_answer_summary?: string;
  };
}

interface Evaluation {
  model: ModelSpec;
  conditions: Condition[];
  prompts: Prompt[];
}

interface Fixture {
  fixture: {
    name: string;
    description: string;
    source: FixtureSource;
  };
  slice?: { paths: string[] };
  ingest?: FixtureIngestEntry[];
  evaluation: Evaluation;
}

// ---------------------------------------------------------------------------
// Result schema
// ---------------------------------------------------------------------------

interface PackMetrics {
  lines: number;
  hasDiscussions: boolean;
  hasStructuralSignals: boolean;
  discussionCount: number;
  confidenceScores: number[];
}

interface TokenCost {
  prompt_tokens: number;
  answer_tokens: number;
  total_tokens: number;
}

interface ConditionResult {
  condition: string;
  prompt_id: string;
  prompt: string;
  pack?: string;
  pack_metrics?: PackMetrics;
  answer: string;
  cost: TokenCost;
}

interface RunResults {
  fixture: string;
  runAt: string;
  model: ModelSpec;
  conditions: ConditionResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4;
const FIXTURE_DIR = path.join(import.meta.dir);

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function getContextPack(
  prompt: string,
  db: string,
  tokenBudget = 8000,
): string {
  try {
    // Use spawnSync with array args — no shell, so backticks/brackets in prompt are safe.
    // Prefer the installed `engram` binary over `bun dist/cli.js` to avoid JIT overhead
    // and Bun-native dep issues when running as a child of another bun process.
    const engramBin = Bun.which("engram") ?? "engram";
    const result = spawnSync(
      engramBin,
      ["context", prompt, "--token-budget", String(tokenBudget), "--db", db],
      { encoding: "utf8", timeout: 300_000 },
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(result.stderr || `exit ${result.status}`);
    return result.stdout;
  } catch (err) {
    return `[engram context failed: ${err instanceof Error ? err.message : String(err)}]`;
  }
}

function parsePackMetrics(pack: string): PackMetrics {
  const hasDiscussions = pack.includes("### Possibly relevant discussions");
  const hasStructuralSignals = pack.includes("### Structural signals");
  const confidenceMatches = [...pack.matchAll(/confidence (\d+\.\d+):/g)];
  const confidenceScores = confidenceMatches.map((m) => parseFloat(m[1]));
  return {
    lines: pack.split("\n").length,
    hasDiscussions,
    hasStructuralSignals,
    discussionCount: confidenceScores.length,
    confidenceScores,
  };
}

async function askModel(
  model: ModelSpec,
  promptText: string,
  cwd: string,
): Promise<string> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const tmpFile = path.join(
          tmpdir(),
          `engram-eval-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
        );
        fs.writeFileSync(tmpFile, promptText, "utf8");
        execFile(
          model.cli_command,
          ["-p", promptText],
          { encoding: "utf8", cwd, timeout: 300_000 },
          (err, stdout) => {
            try {
              fs.unlinkSync(tmpFile);
            } catch {}
            if (err) reject(err);
            else resolve(stdout);
          },
        );
      });
      return result.trim();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isQuota =
        msg.includes("QUOTA_EXHAUSTED") ||
        msg.includes("exhausted your capacity");
      const retryMsMatch = msg.match(/"retryDelayMs":(\d+)/);
      const waitMs = retryMsMatch
        ? parseInt(retryMsMatch[1], 10) + 5_000
        : 35 * 60 * 1000;
      if (isQuota && attempt < MAX_RETRIES - 1) {
        const waitMin = Math.ceil(waitMs / 60_000);
        console.log(`\n  Quota exhausted — waiting ${waitMin}m then retrying…`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return `[model failed: ${msg}]`;
    }
  }
  return "[model failed: max retries exceeded]";
}

function buildBarePrompt(promptText: string): string {
  return promptText.trim();
}

function buildWithPackPrompt(pack: string, promptText: string): string {
  return (
    `The following context pack was assembled from the codebase's knowledge graph:\n\n` +
    `${pack}\n\n` +
    `---\n\n` +
    `${promptText.trim()}`
  );
}

// ---------------------------------------------------------------------------
// Markdown report generator
// ---------------------------------------------------------------------------

function buildMarkdown(fixture: Fixture, results: RunResults): string {
  const lines: string[] = [];
  lines.push(`# Eval Results — ${fixture.fixture.name}`);
  lines.push("");
  lines.push(`> **Run at:** ${results.runAt}`);
  lines.push(
    `> **Model:** ${results.model.provider} / ${results.model.model_id}`,
  );
  lines.push(`> **Fixture:** ${fixture.fixture.description.trim()}`);
  lines.push("");

  // Build a matrix: for each prompt, show each condition side by side
  const conditionIds = fixture.evaluation.conditions.map((c) => c.id);
  const promptIds = fixture.evaluation.prompts.map((p) => p.id);

  for (const promptId of promptIds) {
    const promptDef = fixture.evaluation.prompts.find((p) => p.id === promptId);
    if (!promptDef) continue;
    lines.push("---");
    lines.push("");
    lines.push(`## ${promptId}`);
    lines.push("");
    lines.push(`**Prompt:**`);
    lines.push("");
    lines.push(promptDef.text.trim());
    lines.push("");

    if (promptDef.ground_truth?.expected_answer_summary) {
      lines.push(
        `**Expected answer summary:** ${promptDef.ground_truth.expected_answer_summary.trim()}`,
      );
      lines.push("");
    }

    // Conditions table header
    lines.push(`| Condition | Answer | Tokens (prompt / answer / total) |`);
    lines.push(`|-----------|--------|----------------------------------|`);

    for (const condId of conditionIds) {
      const r = results.conditions.find(
        (c) => c.condition === condId && c.prompt_id === promptId,
      );
      if (!r) continue;
      const answerOneLine = r.answer.replace(/\n/g, " ").slice(0, 300);
      const tokenSummary = `${r.cost.prompt_tokens} / ${r.cost.answer_tokens} / ${r.cost.total_tokens}`;
      lines.push(`| \`${condId}\` | ${answerOneLine}… | ${tokenSummary} |`);
    }
    lines.push("");

    // Full answers per condition
    for (const condId of conditionIds) {
      const r = results.conditions.find(
        (c) => c.condition === condId && c.prompt_id === promptId,
      );
      if (!r) continue;
      lines.push(`### ${condId}`);
      lines.push("");

      if (r.pack_metrics) {
        const m = r.pack_metrics;
        const sectionFlags = [
          m.hasDiscussions ? "discussions" : "",
          m.hasStructuralSignals ? "structural" : "",
        ]
          .filter(Boolean)
          .join("+");
        const confidenceSummary =
          m.confidenceScores.length > 0
            ? `, confidence: [${m.confidenceScores.map((s) => s.toFixed(2)).join(", ")}]`
            : "";
        lines.push(
          `**Pack:** ${m.lines} lines${sectionFlags ? ` [${sectionFlags}]` : ""}${confidenceSummary}`,
        );
        lines.push("");
        if (r.pack) {
          lines.push("<details><summary>Full context pack</summary>");
          lines.push("");
          lines.push("```");
          lines.push(r.pack.trim());
          lines.push("```");
          lines.push("");
          lines.push("</details>");
          lines.push("");
        }
      }

      lines.push(`**Answer** (~${r.cost.total_tokens} tokens):`);
      lines.push("");
      lines.push(r.answer);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Parse --fixture <name>
  const fixtureFlag = process.argv.indexOf("--fixture");
  if (fixtureFlag === -1 || !process.argv[fixtureFlag + 1]) {
    console.error(
      "Usage: bun run eval --fixture <name>\n" +
        "  Example: bun run eval --fixture k8s-sidecar-containers-753",
    );
    process.exit(1);
  }
  const fixtureName = process.argv[fixtureFlag + 1];
  const fixturePath = path.join(FIXTURE_DIR, `${fixtureName}.yaml`);

  if (!fs.existsSync(fixturePath)) {
    console.error(`Fixture not found: ${fixturePath}`);
    process.exit(1);
  }

  const fixtureRaw = fs.readFileSync(fixturePath, "utf8");
  const fixture = parseYaml(fixtureRaw) as Fixture;

  // Resolve the fixture's .engram database path.
  // Convention: <fixture-dir>/<fixture-name>.engram
  const fixtureDb = path.join(FIXTURE_DIR, `${fixtureName}.engram`);
  if (!fs.existsSync(fixtureDb)) {
    console.warn(
      `Warning: fixture .engram not found at ${fixtureDb}.\n` +
        "Run engram sync against the fixture repo before running eval.\n" +
        "Continuing — with_pack condition will report context retrieval failure.",
    );
  }

  // Verify model CLI is available
  {
    const check = spawnSync(
      fixture.evaluation.model.cli_command,
      ["--version"],
      {
        encoding: "utf8",
      },
    );
    if (check.error || check.status !== 0) {
      console.error(
        `Error: model CLI '${fixture.evaluation.model.cli_command}' not found or not authenticated.`,
      );
      process.exit(1);
    }
  }

  const runAt = new Date().toISOString();
  const timestamp = runAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const outDir = path.join(FIXTURE_DIR, `${fixtureName}-runs`, timestamp);
  fs.mkdirSync(outDir, { recursive: true });

  const { conditions, prompts, model } = fixture.evaluation;

  console.log(`\nEval fixture runner — ${fixtureName}`);
  console.log(`Model: ${model.provider} / ${model.model_id}`);
  console.log(`Conditions: ${conditions.map((c) => c.id).join(", ")}`);
  console.log(`Prompts: ${prompts.length}`);
  console.log(`Output: ${outDir}`);
  console.log();

  const allResults: ConditionResult[] = [];

  for (const prompt of prompts) {
    console.log(`${prompt.id}: ${prompt.text.trim().slice(0, 80)}…`);

    for (const condition of conditions) {
      process.stdout.write(`  [${condition.id}] `);

      let pack: string | undefined;
      let packMetrics: PackMetrics | undefined;
      let fullPrompt: string;

      if (condition.id === "with_pack") {
        process.stdout.write("fetching pack… ");
        pack = getContextPack(prompt.text, fixtureDb);
        packMetrics = parsePackMetrics(pack);
        const sectionFlags = [
          packMetrics.hasDiscussions ? "discussions" : "",
          packMetrics.hasStructuralSignals ? "structural" : "",
        ]
          .filter(Boolean)
          .join("+");
        process.stdout.write(
          `${packMetrics.lines} lines${sectionFlags ? ` [${sectionFlags}]` : ""} — `,
        );
        fullPrompt = buildWithPackPrompt(pack, prompt.text);
      } else {
        // bare
        fullPrompt = buildBarePrompt(prompt.text);
      }

      process.stdout.write("asking model… ");
      const answer = await askModel(model, fullPrompt, process.cwd());
      const cost: TokenCost = {
        prompt_tokens: estimateTokens(fullPrompt),
        answer_tokens: estimateTokens(answer),
        total_tokens: estimateTokens(fullPrompt) + estimateTokens(answer),
      };
      console.log(
        `${answer.split(/\s+/).length} words | ~${cost.total_tokens} tok`,
      );

      allResults.push({
        condition: condition.id,
        prompt_id: prompt.id,
        prompt: prompt.text,
        ...(pack !== undefined ? { pack } : {}),
        ...(packMetrics !== undefined ? { pack_metrics: packMetrics } : {}),
        answer,
        cost,
      });
    }

    console.log();
  }

  const runResults: RunResults = {
    fixture: fixtureName,
    runAt,
    model,
    conditions: allResults,
  };

  // Write results.json
  const jsonPath = path.join(outDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(runResults, null, 2), "utf8");
  console.log(`Wrote ${jsonPath}`);

  // Write results.md
  const mdContent = buildMarkdown(fixture, runResults);
  const mdPath = path.join(outDir, "results.md");
  fs.writeFileSync(mdPath, mdContent, "utf8");
  console.log(`Wrote ${mdPath}`);

  console.log(
    "\nDone. Review results.md for side-by-side condition comparison.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
