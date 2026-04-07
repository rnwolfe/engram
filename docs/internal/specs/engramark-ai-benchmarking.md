# EngRAMark — AI Provider Benchmarking Extension — Spec

**Phase**: 1 (completion)
**Status**: Implemented
**Proposed**: 2026-04-07
**Vision fit**: Turns EngRAMark from a snapshot into a living quality gate — provider-comparative benchmarking directly validates "queryable with AI" against ground truth, rather than trusting it by assumption.

## Strategic Rationale

EngRAMark v0.1 measures VCS-only retrieval quality against 20 ground-truth Q&A pairs for the Fastify repo. It currently has one mode: no-AI. This was intentional — benchmark the floor. But without a way to measure the AI-enhanced ceiling, there's no objective answer to "did adding the ollama provider improve retrieval?" or "does `nomic-embed-text` outperform `mxbai-embed-large` on codebase Q&A?"

The runners directory is already structured for this: `runners/vcs-only.ts` and `runners/grep-baseline.ts` are both pluggable strategies. Adding an `ai-enhanced.ts` runner costs ~80 lines. The metrics, report, and dataset machinery all carry over unchanged. The payoff: before shipping any AI provider change, you run EngRAMark and see whether Recall@5 and MRR went up or down.

This is a forcing function that prevents AI integration from being "we added it and assumed it helped." It should ship immediately after the AI provider layer, while the integration is fresh and the benchmark dataset is warm.

## What It Does

After this ships, EngRAMark runs three retrieval strategies and compares them side-by-side:

```bash
# Current behavior (unchanged)
bun run -F engramark benchmark

# New: compare all strategies
bun run -F engramark benchmark --all

# Output:
#  Strategy          Recall@5   MRR     Avg Latency(ms)
#  grep-baseline       0.35     0.42        1.2
#  vcs-only            0.60     0.71        3.1
#  ollama:nomic-embed  0.78     0.85       24.6
#
#  Delta (ollama vs vcs-only): +18pp Recall@5, +14pp MRR

# Run specific provider only
bun run -F engramark benchmark --strategy ai-enhanced --model nomic-embed-text

# Run against a different repo (requires ground truth dataset)
bun run -F engramark benchmark --dataset kubernetes
```

The report also flags regressions when run in CI:

```bash
# Exit 1 if any strategy regresses vs. last recorded baseline
bun run -F engramark benchmark --ci --baseline .engramark-baseline.json
```

## Command Surface / API Surface

| Runner / Export | Description |
|----------------|-------------|
| `runners/ai-enhanced.ts` | New runner. Ingests with AI provider, searches with hybrid FTS+vector. |
| `benchmark --all` flag | Runs all available strategies, produces comparison table |
| `benchmark --strategy <name>` flag | Runs one strategy only (existing: `vcs-only`, `grep`; new: `ai-enhanced`) |
| `benchmark --model <name>` flag | Overrides AI model for the ai-enhanced runner |
| `benchmark --ci --baseline <file>` flag | CI mode: compare against saved baseline, exit 1 on regression |
| `saveBaseline(results, path)` | New: writes `{ strategy, scores, timestamp }` to a JSON file |
| `compareToBaseline(current, baseline)` | New: returns regression report |

The `report.ts` gains a `compareStrategies(results[])` function that renders the side-by-side table.

## Architecture / Design

- **Module location**: All changes within `packages/engramark/src/`
  - `runners/ai-enhanced.ts` — new runner (mirrors `vcs-only.ts` structure)
  - `runners/index.ts` — new: runner registry, `getRunner(strategy)` factory
  - `report.ts` — extend `generateReport()` to accept multiple strategy results
  - `baseline.ts` — new: `saveBaseline()`, `loadBaseline()`, `compareToBaseline()`

- **ai-enhanced runner design**:
  1. Ingest the target repo using `ingestGitRepo()` with `OllamaProvider`
  2. Generate embeddings for all episodes and entities (same as production ingest)
  3. For each Q&A question: run `search(graph, question, { provider: ollamaProvider })`
  4. Score results using existing `computeRecallAtK()` and `computeMRR()` from `metrics.ts`
  5. Return `RunnerResult` (same shape as other runners)

- **Provider configuration**: The ai-enhanced runner reads `ENGRAM_AI_PROVIDER` and `ENGRAM_OLLAMA_BASE_URL` env vars, same as the core library. No benchmark-specific config.

- **Isolation**: Each runner creates its own in-memory `:memory:` database. Runners do not share state. Comparison is by running all strategies on the same question set, not by running them on shared graph state.

- **CI baseline file**: `.engramark-baseline.json` (gitignored by default, opt-in to commit). Format:
  ```json
  {
    "recorded_at": "2026-04-07T00:00:00Z",
    "strategies": {
      "vcs-only": { "recall_at_5": 0.60, "mrr": 0.71 },
      "ai-enhanced": { "recall_at_5": 0.78, "mrr": 0.85 }
    }
  }
  ```

- **Regression threshold**: Default 5pp absolute drop triggers exit 1 in CI mode. Configurable via `--regression-threshold 0.05`.

- **Performance**: The ai-enhanced runner is slower (Ollama round-trips for embedding generation). It's not run in the default `bun test` suite — it's a separate script. The existing `benchmark.test.ts` only exercises vcs-only and grep-baseline. ai-enhanced has its own test that can be skipped via `SKIP_AI_BENCHMARK=1`.

- **No new dependencies**: Uses the `AIProvider` interface from the `ai-providers` spec. Requires that spec to be implemented first.

## Dependencies

- **Internal**: `ai-providers` spec must be shipped first — `OllamaProvider` is the engine
- **External**: Ollama running locally (same requirement as `ai-providers` spec)
- **Blocked by**: rnwolfe/engram#(ai-providers issue)

## Acceptance Criteria

- [ ] `runners/ai-enhanced.ts` exists and implements the `BenchmarkRunner` interface
- [ ] `ai-enhanced` runner ingests repo with `OllamaProvider`, generates embeddings, runs hybrid search
- [ ] `benchmark --all` runs all three strategies (grep, vcs-only, ai-enhanced) and prints comparison table
- [ ] `benchmark --strategy ai-enhanced` runs only the AI-enhanced runner
- [ ] `benchmark --model <name>` overrides the Ollama embedding model
- [ ] `report.ts`: `compareStrategies()` renders side-by-side table with delta column (vs. vcs-only)
- [ ] `baseline.ts`: `saveBaseline()` writes results to JSON file
- [ ] `baseline.ts`: `compareToBaseline()` detects regressions above threshold
- [ ] `benchmark --ci --baseline <file>` exits 1 when any strategy regresses beyond threshold
- [ ] `SKIP_AI_BENCHMARK=1` env var skips ai-enhanced tests (for CI environments without Ollama)
- [ ] ai-enhanced runner gracefully degrades to vcs-only behavior when Ollama is unavailable
- [ ] Existing `benchmark.test.ts` continues to pass unchanged (vcs-only + grep-baseline)
- [ ] New `benchmark.ai.test.ts` covers ai-enhanced runner with mocked `OllamaProvider`
- [ ] `bun test` passes (skips ai-enhanced if `SKIP_AI_BENCHMARK=1`), `bun run lint` passes

## Out of Scope

- Kubernetes dataset (Phase 2 — requires ground-truth Q&A creation, separate issue)
- Automatic baseline updates / drift detection over time (future tooling)
- Benchmarking entity extraction quality (separate concern — would need different metrics)
- Provider comparison beyond null/ollama (Anthropic embeddings, etc. — add as runners when those providers ship)
- Web-based benchmark dashboard (Phase 3)

## Documentation Required

- [ ] `packages/engramark/README.md`: document `--all`, `--strategy`, `--ci`, `--baseline` flags
- [ ] `docs/internal/specs/engramark-ai-benchmarking.md` — mark as Implemented after shipping
