# EngRAMark

End-to-end benchmark suite for engram knowledge retrieval. Measures retrieval quality (Recall@5, MRR, latency) against ground-truth Q&A datasets.

## One-command usage

```bash
# Clone fastify v4.28.1, ingest it, run all 3 strategies, print comparison table
bun run -F engramark bench

# Run with Ollama embeddings (requires Ollama running locally)
ENGRAM_AI_PROVIDER=ollama bun run -F engramark bench

# Run with Gemini embeddings
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<key> bun run -F engramark bench

# Run only one strategy
bun run -F engramark bench --strategy vcs-only

# Save results as baseline for future regression detection
bun run -F engramark bench --save-baseline

# Fail with exit 1 if results regress vs saved baseline
bun run -F engramark bench --ci

# Skip cloning/ingestion and reuse an existing .engram file
bun run -F engramark bench --cached /path/to/fastify.engram
```

## Provider configuration

| Variable | Description |
|----------|-------------|
| `ENGRAM_AI_PROVIDER` | Provider: `ollama`, `gemini`, or unset (NullProvider — FTS only) |
| `ENGRAM_OLLAMA_BASE_URL` | Ollama base URL (default: `http://localhost:11434`) |
| `GEMINI_API_KEY` | Gemini API key (required when `ENGRAM_AI_PROVIDER=gemini`) |

When `ENGRAM_AI_PROVIDER` is unset, the `ai-enhanced` strategy runs with NullProvider and is labeled `ai-enhanced (no provider — FTS only)` in output.

## CLI options

| Flag | Description |
|------|-------------|
| `--strategy <name>` | Run only one strategy: `grep-baseline`, `vcs-only`, `ai-enhanced` |
| `--save-baseline` | Write results to `.engramark-baseline.json` |
| `--ci` | Exit 1 on regression vs `.engramark-baseline.json` |
| `--cached <path>` | Skip clone/ingest, open existing `.engram` file |

## Strategies

| Strategy | Description |
|----------|-------------|
| `grep-baseline` | Raw FTS5 episode search — simulates `git log \| grep`. The floor. |
| `vcs-only` | Graph-structured FTS with scoring. Default strategy. |
| `ai-enhanced` | Hybrid FTS+vector search. Always included; uses NullProvider (FTS only) when `ENGRAM_AI_PROVIDER` is unset. |

## Metrics

| Metric | Description |
|--------|-------------|
| Recall@5 | Fraction of expected entities found in the top-5 results |
| MRR | Mean Reciprocal Rank — 1/rank of the first correct result |
| Avg Latency(ms) | Average query execution time |

## CI baseline file

The baseline file format (`.engramark-baseline.json`):

```json
{
  "recorded_at": "2026-04-07T00:00:00Z",
  "strategies": {
    "vcs-only": { "recall_at_5": 0.60, "mrr": 0.71 },
    "ai-enhanced": { "recall_at_5": 0.78, "mrr": 0.85 }
  }
}
```

This file is gitignored by default. Opt in to committing it for persistent CI regression detection.

## Programmatic usage

```ts
import { openGraph, closeGraph } from "engram-core";
import { runStrategy, ALL_STRATEGIES } from "engramark/runners";
import { compareStrategies } from "engramark";
import { saveBaseline, compareToBaseline, loadBaseline } from "engramark/baseline";
import { FASTIFY_QUESTIONS } from "engramark/datasets/fastify";

const graph = openGraph(":memory:");
// ... ingest git data into graph ...

// Run a single strategy
const report = await runStrategy("vcs-only", graph, FASTIFY_QUESTIONS);

// Compare all strategies
const reports = await Promise.all(
  ALL_STRATEGIES.map((s) => runStrategy(s, graph, FASTIFY_QUESTIONS))
);
compareStrategies(reports); // prints comparison table to stdout

// Save results as a baseline
saveBaseline(reports, ".engramark-baseline.json");

// Compare against a saved baseline (e.g. in CI)
const baseline = loadBaseline(".engramark-baseline.json");
const comparison = compareToBaseline(reports, baseline, 0.05);
if (comparison.has_regressions) process.exit(1);

closeGraph(graph);
```

## Architecture

- `src/bench.ts` — Runnable entrypoint: clones Fastify, ingests, runs all strategies
- `src/fixtures/fastify.ts` — Pinned Fastify repo URL + release tag
- `src/runners/grep-baseline.ts` — Raw FTS5 runner
- `src/runners/vcs-only.ts` — Graph-structured FTS runner
- `src/runners/ai-enhanced.ts` — Hybrid FTS+vector runner
- `src/runners/index.ts` — Runner registry and `runStrategy()` factory
- `src/report.ts` — Report generation, `printReport()`, `compareStrategies()`
- `src/baseline.ts` — `saveBaseline()`, `loadBaseline()`, `compareToBaseline()`
- `src/metrics.ts` — `recallAtK()`, `mrr()`, `computeMetrics()`
- `src/datasets/fastify/` — Ground-truth Q&A dataset (20 questions)
