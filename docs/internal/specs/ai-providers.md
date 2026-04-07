# AI Provider Integration — Spec

**Phase**: 1 (completion)
**Status**: Draft
**Proposed**: 2026-04-07
**Vision fit**: Completes principle 5 — "structurally sound without AI, queryable with AI" — by adding the pluggable provider layer that enables semantic entity extraction and vector embeddings without requiring AI.

## Strategic Rationale

Every claim in the graph already has provenance. The structural layer is complete. But the interaction model promised in the vision — compositional queries across entities, edges, temporal validity, and evidence strength — is only partially realized with FTS5 alone. Keyword search finds what you name; semantic search finds what you mean.

The `embeddings` table was specified from day one and is empty. The `ai/` directory was planned in CLAUDE.md but never implemented. This spec closes the Phase 1 gap: a pluggable provider interface with a deterministic null fallback (so the system is always correct without AI) and an Ollama provider (so local-first users get semantic enhancement with zero cloud dependency).

Without this, EngRAMark can't benchmark AI-enhanced retrieval, the MCP context tools can't do semantic search, and entity extraction during ingest is limited to regex-parsed references.

## What It Does

After this ships, `engram` behaves identically without a provider configured (null fallback — same as today). With Ollama running locally, ingestion automatically generates embeddings for entities and episodes, and search results blend BM25 keyword ranking with cosine similarity on embeddings.

```bash
# No AI configured — works exactly as today
engram search "who owns the auth module"

# With Ollama configured
ENGRAM_AI_PROVIDER=ollama engram search "who owns the auth module"
# → Hybrid results: FTS + semantic similarity, ranked by composite score

# During ingest, embeddings are generated automatically
engram ingest git --path .
# → "Generated 142 embeddings via ollama:nomic-embed-text"

# Null provider (explicit, deterministic, no embeddings)
ENGRAM_AI_PROVIDER=null engram search "who owns the auth module"
# → FTS-only, same as today
```

The provider is never required. Engram degrades gracefully at every level:
- No provider configured → null behavior (FTS-only, no embeddings)
- Provider configured but offline → logged warning, falls back to null for that operation
- Provider returns malformed output → falls back to null, logs error, never corrupts the graph

## Command Surface / API Surface

### Core library (`engram-core`)

| Export | Description |
|--------|-------------|
| `AIProvider` interface | `embed(texts: string[]): Promise<number[][]>` + `extractEntities(text: string): Promise<EntityHint[]>` |
| `NullProvider` class | Deterministic no-op. `embed()` returns empty arrays. `extractEntities()` returns []. |
| `OllamaProvider` class | HTTP client for local Ollama. Configurable model (default: `nomic-embed-text`). |
| `createProvider(config)` | Factory: reads `ENGRAM_AI_PROVIDER` env + opts, returns the right provider. |

### Config

```typescript
interface AIConfig {
  provider: "null" | "ollama";     // Required
  ollama?: {
    baseUrl: string;               // Default: "http://localhost:11434"
    embedModel: string;            // Default: "nomic-embed-text"
    extractModel?: string;         // Default: none (skip LLM extraction if unset)
  };
}
```

### Search integration

`search(graph, query, opts)` gains an optional `provider` parameter. When provided, it runs both FTS and vector search, then merges results using `computeCompositeScore()` (which already exists in `retrieval/scoring.ts`).

| Function signature change | Description |
|--------------------------|-------------|
| `search(graph, query, opts?: { provider?: AIProvider })` | Provider optional; null = FTS-only |
| `storeEmbedding(graph, targetId, targetType, embedding)` | New: writes to `embeddings` table |
| `findSimilar(graph, embedding, opts)` | New: brute-force cosine similarity over stored embeddings |

## Architecture / Design

- **Module location**: `packages/engram-core/src/ai/` — four files
  - `provider.ts` — `AIProvider` interface + `EntityHint` type
  - `null.ts` — `NullProvider` (always available, deterministic)
  - `ollama.ts` — `OllamaProvider` (HTTP, no native deps)
  - `index.ts` — `createProvider(config)` factory + re-exports

- **Storage**: The `embeddings` table already exists in schema:
  ```sql
  CREATE TABLE embeddings (
    id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL,
    target_type TEXT NOT NULL CHECK(target_type IN ('entity','episode')),
    model TEXT NOT NULL,
    dims INTEGER NOT NULL,
    vec BLOB NOT NULL,
    created_at TEXT NOT NULL
  );
  ```
  New helper: `storeEmbedding()` in `graph/evidence.ts` or a new `graph/embeddings.ts`.

- **Vector search**: Brute-force cosine similarity. At <50k embeddings (the target scale), this is fast enough without `sqlite-vec`. Use Float32Array for the BLOB encoding. If performance becomes an issue at scale, `sqlite-vec` can be dropped in later — the API surface doesn't change.

- **Ingest integration**: `ingestGitRepo()` and `ingestMarkdown()` accept an optional `provider` parameter. If provided and the provider can embed, embeddings are generated for each episode and entity in a post-processing pass (separate from the main ingest transaction — embeddings are best-effort, never block the graph write).

- **Entity extraction**: `OllamaProvider.extractEntities()` is optional (only when `extractModel` is configured). It takes raw text (commit message, PR body) and returns `EntityHint[]` — suggestions for the caller to resolve and potentially add to the graph. The caller (ingest pipeline) always decides; the LLM never writes to the graph directly.

- **Security**: Never send `.engram` file paths or private keys to the provider. Only send text content (commit messages, PR titles). The provider interface only accepts `string[]` — no filesystem access.

- **No new npm dependencies** for null or ollama providers. Ollama uses the native `fetch` API (Bun built-in). Only add `@anthropic-ai/sdk` if/when an Anthropic provider is added (separate issue).

## Dependencies

- **Internal**: All of Phase 1 (graph CRUD, retrieval, ingest) — all shipped ✅
- **External**: None for null + ollama. Ollama must be installed separately by the user (not a hard dep — graceful fallback).
- **Blocked by**: Nothing. This is unblocked.

## Acceptance Criteria

- [ ] `AIProvider` interface defined with `embed()` and `extractEntities()` methods
- [ ] `NullProvider` implements interface: `embed()` returns `[]`, `extractEntities()` returns `[]`
- [ ] `OllamaProvider` implements interface: calls `POST /api/embed` for embeddings
- [ ] `OllamaProvider` handles connection refused → logs warning, returns null behavior (does not throw)
- [ ] `createProvider({ provider: "null" })` returns `NullProvider`
- [ ] `createProvider({ provider: "ollama" })` returns `OllamaProvider` with defaults
- [ ] `storeEmbedding(graph, targetId, targetType, model, embedding)` writes to `embeddings` table
- [ ] `findSimilar(graph, queryEmbedding, opts)` returns entities/episodes ranked by cosine similarity
- [ ] `search(graph, query, { provider })` merges FTS and vector results when provider is set
- [ ] `search(graph, query)` (no provider) behaves identically to current FTS-only behavior
- [ ] Ingest: `ingestGitRepo(graph, path, { provider })` generates embeddings for episodes + entities post-ingest
- [ ] Ingest: embedding generation failure does not fail the ingest (best-effort, logged)
- [ ] `ENGRAM_AI_PROVIDER=ollama` environment variable configures the provider in CLI context
- [ ] `ENGRAM_AI_PROVIDER` unset → null provider (no behavior change from today)
- [ ] Tests: `NullProvider` unit tests (synchronous, no mocking needed)
- [ ] Tests: `OllamaProvider` unit tests with mocked fetch
- [ ] Tests: `findSimilar()` returns results sorted by cosine similarity
- [ ] Tests: hybrid search with null provider produces identical results to current FTS-only search
- [ ] `bun test` passes, `bun run lint` passes

## Out of Scope

- Anthropic provider (separate issue — adds `@anthropic-ai/sdk` dependency)
- `sqlite-vec` integration (brute-force is sufficient at v0.1 scale)
- LLM-composed natural language answers (separate MCP enhancement)
- Automatic entity merging based on embedding similarity (separate entity resolution enhancement)
- Provider configuration in `.engram` file (config via env + CLI flag only in v0.1)
- Streaming embeddings / batch size tuning (simple sequential batch in v0.1)

## Documentation Required

- [ ] README: "AI-enhanced mode" section explaining null vs. ollama, how to configure
- [ ] CLAUDE.md: add `packages/engram-core/src/ai/` to Key Files table
- [ ] `docs/internal/specs/ai-providers.md` — mark as Implemented after shipping
