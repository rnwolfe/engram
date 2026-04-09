# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-04-08

### Added

- **`.engram` format** — Single-file SQLite database schema with versioned
  migrations, metadata table, and all core tables (episodes, entities, edges,
  evidence chains).
- **Entity and edge CRUD** — Full graph write API with evidence-first invariants:
  every entity and edge requires provenance at creation time.
- **Temporal engine** — Validity windows (`valid_from`/`valid_until`), atomic
  supersession, and point-in-time snapshots across all edges.
- **Entity resolution and aliases** — Canonical name lookup with alias support;
  conservative exact-match resolution in v0.1.
- **Git VCS ingestion** (`engram init --from-git`) — Walks git history to extract
  authors, files, co-change patterns, ownership signals, and bus-factor edges.
  No API tokens required.
- **GitHub enrichment adapter** (`engram ingest enrich github`) — Pulls PR
  discussions, linked issues, and review comments into the graph.
- **Markdown and text ingestion** — Ingest `.md` and plain-text documents as
  episode sources.
- **Full-text search and hybrid retrieval** — FTS5-backed keyword search blended
  with vector similarity when an AI provider is configured.
- **Graph traversal and temporal queries** — Depth-limited neighbor traversal,
  edge filtering by kind/validity, and path-finding across the knowledge graph.
- **Knowledge decay detection** (`engram decay`) — Surfaces edges whose evidence
  is stale relative to recent activity.
- **CLI — core commands** — `init`, `add`, `search`, `show`, `history`, `decay`,
  `stats`, `verify`, `ingest`, `export`, `serve`.
- **MCP server** — stdio transport with a read-heavy tool surface for AI agents
  (Claude Code, Cursor).
- **Integrity verification** (`engram verify`) — Checks graph invariants: evidence
  coverage, temporal consistency, orphan detection.
- **Pluggable AI provider layer** — `null` (FTS-only, default), `ollama`
  (`nomic-embed-text`), and `gemini` (`gemini-embedding-001`) providers.
- **EngRAMark benchmark suite** — Stratified ground-truth Q&A evaluated against
  the Fastify repo, with per-type (relational/graph) breakdown and strategy
  comparison across retrieval modes.
- **Entity-anchored search** — Search results anchored to specific entities,
  improving precision for ownership and authorship queries.
- **Graph-aware retrieval with edge traversal** — Retrieval pipeline walks graph
  edges to gather context beyond direct keyword/vector matches.
- **MCP graph traversal tools** — `get_neighbors`, `find_edges`, `get_path` MCP
  tools for programmatic graph exploration.
- **Ownership risk report** (`engram ownership-report` / MCP `get_ownership_report`)
  — Bus-factor analysis: surfaces files and modules with single-owner concentration.
- **Graph visualization** (`engram visualize`) — Launches a local web UI backed
  by Cytoscape.js with pan/zoom, typed node/edge styling, entity and evidence
  detail panels, filter sidebar, search-to-focus, temporal time slider, and decay
  and ownership overlays.

### Fixed

- Hybrid search vector scores misaligned with FTS scores due to evidence chain
  mismatch — now normalized via a shared evidence chain so recall is consistent
  across retrieval modes.
- EngRAMark ground-truth dataset and clone depth were misconfigured, producing
  meaningless benchmark results — corrected dataset and full-depth clone.
- CI `commitlint` job was missing `pull-requests: read` permission, causing false
  failures on PRs.

[Unreleased]: https://github.com/rnwolfe/engram/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rnwolfe/engram/releases/tag/v0.1.0
