# EngRAMark

Benchmark suite for engram knowledge retrieval. Measures retrieval quality and answer accuracy against ground-truth Q&A datasets.

## Usage

```bash
# Run default benchmark (vcs-only strategy)
bun run -F engramark bench

# Run all strategies and print comparison table
bun run -F engramark bench -- --all

# Run a specific strategy
bun run -F engramark bench -- --strategy ai-enhanced
bun run -F engramark bench -- --strategy vcs-only
bun run -F engramark bench -- --strategy grep-baseline

# Override the Ollama embedding model for the ai-enhanced runner
bun run -F engramark bench -- --strategy ai-enhanced --model mxbai-embed-large

# Save current results as a baseline file
bun run -F engramark bench -- --all --save-baseline .engramark-baseline.json

# CI mode: compare against saved baseline and exit 1 on regression
bun run -F engramark bench -- --all --ci --baseline .engramark-baseline.json

# Adjust the regression threshold (default: 0.05 = 5pp absolute)
bun run -F engramark bench -- --all --ci --baseline .engramark-baseline.json --regression-threshold 0.03
```

## Flags

| Flag | Description |
|------|-------------|
| `--all` | Run all three strategies (grep-baseline, vcs-only, ai-enhanced) and print comparison table |
| `--strategy <name>` | Run only the specified strategy: `grep-baseline`, `vcs-only`, or `ai-enhanced` |
| `--model <name>` | Override the Ollama embedding model for the ai-enhanced runner (default: `nomic-embed-text`) |
| `--ci` | CI mode — exit 1 if any strategy regresses beyond threshold vs baseline file |
| `--baseline <file>` | Path to the baseline JSON file for `--ci` mode or `--save-baseline` |
| `--save-baseline` | Write current results to the baseline file specified by `--baseline` |
| `--regression-threshold <n>` | Absolute drop threshold (0-1) that triggers a CI regression (default: 0.05) |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SKIP_AI_BENCHMARK=1` | Skip ai-enhanced tests (for CI environments without Ollama) |
| `ENGRAM_AI_PROVIDER` | Set to `ollama` to enable AI-enhanced mode |
| `ENGRAM_OLLAMA_BASE_URL` | Ollama base URL (default: `http://localhost:11434`) |

## Strategies

| Strategy | Description |
|----------|-------------|
| `grep-baseline` | Raw FTS5 episode search — simulates `git log \| grep`. The floor. |
| `vcs-only` | Graph-structured FTS with scoring. Default strategy. |
| `ai-enhanced` | Hybrid FTS+vector search via OllamaProvider. Requires Ollama running locally. |

## Metrics

| Metric | Description |
|--------|-------------|
| Recall@5 | Fraction of expected entities found in the top-5 results |
| MRR | Mean Reciprocal Rank — 1/rank of the first correct result |
| Avg Latency(ms) | Average query execution time |

## CI Baseline File

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
