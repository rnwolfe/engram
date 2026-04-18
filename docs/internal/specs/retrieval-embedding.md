# Retrieval Precision & Embedding Architecture

> **Status:** Accepted — extends the retrieval sections of `pack-companion-spec.md` Phase 1 with embedding-model independence and semantic entity indexing.
> **Date:** 2026-04-17
> **Informed by:** experiment G1 (9 "why" questions on engram repo — pack clearly helps 4/9), experiment G2 (9 "why" questions on Maestro repo, pack + companion conditions — pack helps 1/9, companion 0 wins / 1 regression), session discussion on embedding model portability.
>
> **Terminology note:** "experiment G1" and "experiment G2" above are session codenames for the two labeled Q&A runs. Separately, **Gate G1** in `VISION.md` and `pack-companion-spec.md` refers to the workflow benchmark (multi-file tasks, Phase 3) that gates narrative projections. The gate and the experiments are distinct artifacts — the experiments informed the gate, they are not the gate itself.

---

## Background — what the experiments showed

Two experiments established the evidence base this spec builds on.

**G1 (engram repo, 9 "why" questions):** Pack clearly helped on 4/9. The wins came from three narrow modes: (a) spec documents with authoritative design framing surfaced in the entity list, (b) commit messages containing incident rationale that agents cited directly, (c) named constants that proved architectural decisions. Two questions failed entirely due to retrieval bugs (near-empty packs). The pack never hallucinated design rationale it didn't have.

**G2 (Maestro repo, 9 "why" questions, B + C conditions):** Pack clearly helped on 1/9 — the one question where a PR summary contained the precise design rationale. Eight questions showed no meaningful difference. The companion prompt added 10% overhead with 0 quality wins and 1 regression.

**The central finding:** The pack's ceiling is bounded by corpus quality, not retrieval quality. For repos with spec documents and design-intent commit messages, the pack is useful. For repos where design rationale was never committed, no retrieval improvement creates information that doesn't exist.

**What this means for priorities:**
- Fix retrieval bugs before investing in narrative projections.
- Semantic embeddings improve entity discovery and reduce false positives — both are retrieval quality improvements that compound corpus quality.
- Narrative projections (D5) are gated on the workflow benchmark (Phase 3 of `pack-companion-spec.md`) showing clear B > A on multi-file tasks. Direct Q&A systematically undervalues co-change edges and supersession chains.

---

## Decision — Embedding model independence (ADR-003 reference)

Embeddings and generation are independent concerns. Engram uses embeddings for retrieval (similarity search over entities and episodes); the generation model that answers questions or authors projections is separately configured. A user can embed with `nomic-embed-text` and generate with `claude-sonnet-4-6`. Changing generation models never invalidates the embedding index.

**The constraint:** all embeddings within a single `.engram` must use the same model. Query-time embeddings must match the stored embedding model. If the embedding model changes, the index must be re-built.

**Resolution (Option 1):** Store embedding model identity in the `.engram` metadata store. Detect mismatch at query time and fail fast with a clear, actionable error. Provide `engram embed --reindex` as the explicit migration command.

---

## Schema additions

The `.engram` `metadata` table is a key/value store (`key TEXT PRIMARY KEY, value TEXT`), already populated with `format_version`, `created_at`, and `owner_id`. Two new keys are added alongside those:

```sql
INSERT INTO metadata (key, value) VALUES ('embedding_model', '<model-id>');        -- e.g. 'nomic-embed-text', 'text-embedding-3-small', 'text-embedding-004'
INSERT INTO metadata (key, value) VALUES ('embedding_dimensions', '<int-as-str>'); -- e.g. '384', '1536', '768'
```

Enforcement rules:
- Any operation that reads embeddings checks `metadata['embedding_model']` against the configured provider's active model. Mismatch → error with migration hint.
- Any operation that writes embeddings asserts the active model matches `metadata['embedding_model']`. If the key is absent (pre-migration or embedding-disabled), the write populates it on first use.
- `engram embed --reindex` clears all rows from the `embeddings` table and re-indexes from scratch using the current configured model, then updates the two metadata keys.

The `embeddings` polymorphic table already exists; no structural change needed beyond these metadata keys.

---

## Semantic entity embeddings

**Current state:** Entity search is BM25 FTS5 + LIKE stem fallback. Vector similarity exists in the confidence formula for episode retrieval but entities are not vector-indexed.

**Gap:** BM25 on entity names fails when the query uses different vocabulary than the entity name. Example: "why does the layer stack use priority ordering" does not term-match `modalPriorities.ts` until the LIKE stem hack fires. Semantic embeddings remove this dependency on exact term overlap.

**Proposed change:** Embed entity `(name + description)` concatenation using the configured embedding model. At retrieval time, compute query embedding and rank entities by `α × bm25 + β × cosine_sim`, then apply LIKE augmentation only for entities that score above 0 on either axis.

Suggested weights (to be tuned against G1/G2 labeled sets): `α = 0.7, β = 0.3`. Entity names are short and precise; BM25 should retain higher weight than in episode retrieval.

**When to index:** Incrementally during ingest (when entity is created or description updated). Full reindex via `engram embed --reindex`. Entities without embeddings fall back to BM25-only rank — no hard failure.

---

## `engram init` UX — embedding model selection

**Current state:** `engram init` creates the `.engram` file and runs git ingestion with no prompting around AI providers or embedding model.

**Required changes:**

```
engram init [--from-git <path>] [--embedding-model <model>] [--embedding-provider <provider>]
```

Interactive path (when not passed as flags):

```
◆  Embedding model (used for semantic entity and episode search)
│  Select or enter a model name:
│  ❯ nomic-embed-text (Ollama, local — recommended default)
│    text-embedding-3-small (OpenAI)
│    text-embedding-004 (Google)
│    none (BM25-only, no semantic search)
│  
◆  Ollama endpoint  [http://localhost:11434]
│  
◆  Generation model (for reconcile, narrative projections — optional)
│  ❯ none for now
│    gemini-2.0-flash (Google)
│    claude-haiku-4-5 (Anthropic)
│    ...
```

Key design rules:
- Embedding model and generation model are separate prompts — the distinction must be visible.
- `none` is a valid embedding choice; the tool remains useful with BM25-only retrieval.
- Embedding model is committed to `metadata` on init and shown in `engram status`.
- Generation model is not committed to `metadata`; it is passed at runtime or set in user config (`~/.config/engram/config.toml`).

`engram status` output should include:

```
Embedding model:  nomic-embed-text (ollama @ http://localhost:11434)
Entities indexed: 1842 / 1842 (100%)
Episodes indexed: 402 PRs, 355 issues, 1204 commits
Generation model: (not configured)
```

---

## Confidence scoring update

Current formula (episode retrieval):
```
confidence = 0.60 × bm25_norm + 0.20 × vector_sim + 0.20 × source_prior
           = 0.75 × bm25_norm + 0.25 × source_prior   (when vector unavailable)
```

Proposed entity retrieval formula (after semantic entity indexing):
```
entity_score = 0.70 × bm25_norm + 0.30 × vector_sim
             = bm25_norm                               (when vector unavailable)
```

Episode confidence formula unchanged. Source-type prior remains: `commit: 0.5, pr: 0.7, issue: 0.6, conversation: 0.8, manual: 0.9`.

---

## Workflow benchmark (Phase 3 gate)

Before investing in narrative projections, the workflow benchmark from `pack-companion-spec.md` Phase 3 must run and show a clear signal.

**Gate condition:** B (pack) > A (bare agent) on ≥4/8 workflow tasks, where tasks are multi-file in nature (refactoring, debugging regressions, tracing cross-module dependencies). This tests co-change edges and supersession chains — the signals that direct Q&A cannot exercise.

If ≥4/8: proceed with D5 (narrative projections), embedding model serves both entity retrieval and projection matching.
If <4/8: narrative projections are deferred. Ship temporal + evidence + staleness as the complete story. Plugin work continues independently.

**See:** `docs/internal/pack-companion-spec.md` Phase 3 for task design and runner spec.

---

## Migration path for existing `.engram` files

Files created before this spec have no `embedding_model` key in `metadata`.

Behavior:
- All existing embeddings in the `embeddings` table are treated as valid regardless of model (we don't know which model produced them).
- On first semantic query, warn: "Embedding model not recorded — results may be inconsistent. Run `engram embed --reindex` to rebuild."
- After `--reindex`, `metadata['embedding_model']` is populated and enforcement activates.

This is a soft migration — existing files degrade gracefully rather than breaking.

---

## CLI & UX surface — project lifecycle touchpoints

The library-level decisions above land through four user-facing commands. Full specs live on the linked issues; this table is the at-a-glance map.

| Stage | Command | Concern | Issue |
|-------|---------|---------|-------|
| Bootstrap | `engram init` | Interactive embedding/generation selection, provider reachability, `--yes` for CI, next-step outro | #115 |
| Inspect | `engram status` | Health + config dashboard distinct from `engram stats` (counts-only). `--json` for CI, `--quiet` for wrapping scripts, `--no-verify` offline. | #120 |
| Maintain | `engram embed --reindex / --check / --enable` | Reindex confirmation flow, mismatch detection, opt-in for `none`-init databases | #121, #114 |
| Every command | `--help` consistency pass | Examples + "When to use" block on every command, root `engram --help` shows typical lifecycle | #122 |

**Sane defaults, overridable config.**
- Default embedding provider: Ollama @ `http://localhost:11434`, model `nomic-embed-text`.
- Default generation model: none (engram is fully usable without it — reconcile and projections are gated on a configured generation model).
- User config path: `~/.config/engram/config.toml` (respects `$XDG_CONFIG_HOME`).
- Environment overrides: `ENGRAM_OLLAMA_ENDPOINT`, `ENGRAM_GEN_MODEL`, provider credentials via `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`.

**Error message discipline (enforced in implementation):** every CLI error ends with a concrete next command. Never leak a stack trace. `EmbeddingModelMismatchError` surfaces both model ids *and* dimensions so the user can diagnose at a glance.

**Destructive operations confirm.** `engram embed --reindex` shows a pre-flight summary (row count, new model, estimated provider calls) and requires `y` to proceed. `--yes` skips the prompt for scripts.
