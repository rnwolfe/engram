# ADR-010 execution — remove tree-sitter AST ingestion

Branch: `refactor/remove-tree-sitter-ast`. Verify `bun run build` + `bun test` + `bun run lint` green after each stage.

## Decisions (operator, 2026-06-29)
- Drop `module_overview` projection entirely.
- **Preserve K8s RBAC/watch extraction as a standalone, tree-sitter-free extractor.**
- Keep: git (commits/blame/co-change/ownership/supersession), enrichment (GitHub/Gerrit), markdown/docs, episode embeddings.

## Stages
- [ ] S1. Standalone K8s extractor `src/ingest/k8s/` — regex-based Go scanner producing `rbac_permission` entities + `rbac_grants`/`controller_watches`/`controller_owns` edges. New `engram ingest k8s [path]` command. Port tests from the Go extractor's K8s cases.
- [ ] S2. Remove source-ingestion entry points: `engram ingest source`, source-walk in `init` (init-runners), `sync/run.ts` source handling, public API exports.
- [ ] S3. Delete `src/ingest/source/` subtree (walker, parser, extractors, grammars WASM, queries) + copy-assets grammar copying.
- [ ] S4. Drop `module_overview`: kind YAML, projection-lookup in `context.ts`, tests.
- [ ] S5. Vocab cleanup: remove `symbol`/`file` entity types + `defines`/`imports`/`calls` relation types. KEEP `module` (git file entities), `rbac_permission`, `controller_watches/owns`, `rbac_grants`, Bazel `depends_on` if Bazel kept (Bazel/Starlark: drop with source unless trivially salvageable).
- [ ] S6. Build green — fix dangling imports/exports/types.
- [ ] S7. Tests — delete source tests, keep/port K8s tests, fix counts.
- [ ] S8. Docs — VISION phase 2, CLAUDE.md (ingestion arch, file tree, key files), README, mark source-ingestion specs removed, vocabulary spec, STATUS.
- [ ] S9. Lint green; commit; PR.

## Notes
- Bazel/Starlark extractor (`depends_on` from BUILD files): rode source ingestion too. Not part of the K8s RBAC/watch preserve decision → drop with source (recoverable from git). Confirm no other consumer.
- `module` entity type stays (git creates file-path module entities for co-change/ownership).

## Done (2026-06-29)
All stages complete except vocab cleanup (S5 deferred — FILE/SYMBOL types kept as
harmless registry entries; CLI commands reference them defensively and fall back
to git `module` entities). K8s RBAC/watch preserved standalone (regex, no
tree-sitter). 1272 tests pass.
