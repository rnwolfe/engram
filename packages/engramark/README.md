# EngRAMark

Programmatic benchmark suite for engram knowledge retrieval. Measures retrieval quality (Recall@5, MRR, latency) against ground-truth Q&A datasets.

EngRAMark is a **library / API** — it is imported and driven by scripts, not invoked as a standalone CLI. The entry point for running the full suite is `bun run bench` which executes `src/report.ts`.

## Running the benchmark suite

```bash
# Run the default benchmark script (vcs-only strategy against the Fastify dataset)
bun run -F engramark bench
```

The `bench` script runs `src/report.ts` directly via Bun. Edit that file to change which strategies are executed, which dataset is used, or whether baselines are compared.

## Programmatic usage

```ts
import { createGraph, closeGraph } from "engram-core";
import { runStrategy, ALL_STRATEGIES } from "engramark/runners";
import { compareStrategies } from "engramark";
import { saveBaseline, compareToBaseline } from "engramark/baseline";
import { FASTIFY_QUESTIONS } from "engramark/datasets/fastify";

const graph = createGraph(":memory:");
// ... ingest git data into graph ...

// Run a single strategy
const report = await runStrategy("vcs-only", graph, FASTIFY_QUESTIONS);

// Run ai-enhanced (requires an AIProvider instance)
import { OllamaProvider } from "engram-core";
const provider = new OllamaProvider({ model: "nomic-embed-text" });
const aiReport = await runStrategy("ai-enhanced", graph, FASTIFY_QUESTIONS, provider);

// Compare all strategies
const reports = await Promise.all(
  ALL_STRATEGIES.map((s) =>
    runStrategy(s, graph, FASTIFY_QUESTIONS, s === "ai-enhanced" ? provider : undefined)
  )
);
compareStrategies(reports); // prints comparison table to stdout

// Save results as a baseline
saveBaseline(reports, ".engramark-baseline.json");

// Compare against a saved baseline (e.g. in CI)
import { loadBaseline } from "engramark/baseline";
const baseline = loadBaseline(".engramark-baseline.json");
const comparison = compareToBaseline(reports, baseline, 0.05);
if (comparison.has_regressions) process.exit(1);

closeGraph(graph);
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `SKIP_AI_BENCHMARK=1` | Skip ai-enhanced tests (for CI environments without Ollama) |
| `ENGRAM_OLLAMA_BASE_URL` | Ollama base URL (default: `http://localhost:11434`) |

## Strategies

| Strategy | Description |
|----------|-------------|
| `grep-baseline` | Raw FTS5 episode search — simulates `git log \| grep`. The floor. |
| `vcs-only` | Graph-structured FTS with scoring. Default strategy. |
| `ai-enhanced` | Hybrid FTS+vector search via OllamaProvider. Requires Ollama running locally. Degrades to vcs-only behavior when Ollama is unavailable. |

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

## Architecture

- `src/runners/grep-baseline.ts` — Raw FTS5 runner
- `src/runners/vcs-only.ts` — Graph-structured FTS runner
- `src/runners/ai-enhanced.ts` — Hybrid FTS+vector runner (uses `OllamaProvider`)
- `src/runners/index.ts` — Runner registry and `runStrategy()` factory
- `src/report.ts` — Report generation, `printReport()`, `compareStrategies()`
- `src/baseline.ts` — `saveBaseline()`, `loadBaseline()`, `compareToBaseline()`
- `src/metrics.ts` — `recallAtK()`, `mrr()`, `computeMetrics()`
- `src/datasets/fastify/` — Ground-truth Q&A dataset (20 questions)
