# engram

> A local-first temporal knowledge graph engine for developer memory.

> [!WARNING]
> **Early-stage experiment.** The `.engram` format and APIs are unstable and
> will change without notice. Use at your own risk. Not recommended for
> production data.

Git tracks your code. Engram tracks everything you learned along the way —
who owns what, why a decision was made, what changed and when, and the web of
relationships that never makes it into a commit message.

## Table of contents

- [What engram does](#what-engram-does)
- [Install](#install)
- [Quick start](#quick-start)
- [Use it with an AI coding agent](#use-it-with-an-ai-coding-agent)
- [Commands](#commands)
- [Ingestion](#ingestion)
- [Projections and reconcile](#projections-and-reconcile)
- [Plugins](#plugins)
- [AI providers](#ai-providers)
- [Programmatic API](#programmatic-api)
- [Architecture](#architecture)
- [Status](#status)
- [License](#license)

## What engram does

Engram runs a three-layer pipeline:

1. **Ingest** — pull knowledge from where it already lives: git history
   (free, no tokens), source code (tree-sitter AST parsing), GitHub PRs,
   Gerrit changes, markdown documents, or a custom plugin. Every piece of
   source becomes an immutable **episode** with full provenance.
2. **Graph** — encode that evidence as a temporal knowledge graph:
   entities, relationships, and facts with **validity windows**. Every edge
   traces back to source material. Every claim knows when it was true.
3. **Project** — synthesize AI-authored documents from the graph: entity
   summaries, decision pages, contradiction reports. Projections know when
   they are stale and re-reconcile as new evidence lands.

The result is a self-maintaining body of knowledge grounded in evidence — not
a snapshot, not a RAG index. A versioned synthesis that knows what changed,
when, and why.

### Design principles

- **Library first, CLI second** — logic lives in `engram-core`.
- **Local-first** — a `.engram/` directory (SQLite + FTS5 under the hood).
  No servers, no external databases.
- **Temporal by default** — every fact has a `[valid_from, valid_until)`
  window. Nothing is silently overwritten.
- **Evidence-first** — every entity and edge traces back to at least one
  episode. No floating knowledge.
- **Deterministic substrate, AI-authored projections** — the graph is
  correct without AI. The LLM only authors the projection layer on top.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/rnwolfe/engram/main/install.sh | bash
engram --version
```

Installs to `/usr/local/bin` (or `~/.local/bin` if not writable). Supports
Linux and macOS on x64 and arm64. Windows users can build from source.

### From source

```bash
git clone https://github.com/rnwolfe/engram.git
cd engram
bun install
bun run build
bun link --cwd packages/engram-cli   # exposes `engram` on $PATH
```

## Quick start

The fastest path: run `engram init` inside any git repository. It walks you
through embedding-model selection, git ingest, markdown ingest, optional
GitHub enrichment, and wires an agent companion file in one shot.

```bash
cd your-repo
engram init
```

Prefer to script it? Drop to the non-interactive equivalent:

```bash
# Create the graph, ingest git + source, skip embeddings
engram init --yes --from-git . --embedding-model none

# Enrich with PR/issue context (public repos work without a token)
engram ingest enrich github --scope owner/repo
# or for a private repo:
GITHUB_TOKEN=<token> engram ingest enrich github --scope owner/repo

# Author projections from the graph (requires an LLM provider — see below)
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000   # 50,000 token budget

# Query
engram search "who owns the auth module"
engram show <entity-ulid-or-name>
engram context "why was the auth middleware refactored"   # pack for an agent

# Explore visually
engram visualize   # http://127.0.0.1:7878
```

## Use it with an AI coding agent

This is where engram earns its keep. The `context` command assembles a
token-budgeted pack of the most relevant entities, edges, evidence excerpts,
and discussions for a given query — designed to drop straight into an agent
prompt. Pair it with `companion` to teach your agent *when* to call it.

```bash
# One-time setup: append usage guidance to your agent's instructions file
engram companion --harness claude-code >> CLAUDE.md
# Other harnesses: generic, cursor, gemini

# Idempotent — safe to re-run in CI
engram companion --harness claude-code --check --file CLAUDE.md \
  || engram companion --harness claude-code >> CLAUDE.md

# Ad-hoc: pipe a context pack into a prompt
engram context "auth middleware ownership" --token-budget 8000
engram context "why was X refactored" --format json
```

Packs include co-change edges, supersession chains, and ownership signals
that current code alone does not reveal.

## Commands

| Command | Purpose |
|---|---|
| `engram init` | Create a `.engram/` graph (interactive or `--yes`). |
| `engram add [content]` | Add a manual note or file as evidence. |
| `engram ingest git [path]` | Ingest a git repository's commit history. |
| `engram ingest source [path]` | Ingest source files (tree-sitter). |
| `engram ingest md <glob>` | Ingest markdown documents. |
| `engram ingest enrich github --scope owner/repo` | Enrich with GitHub PRs and issues. |
| `engram ingest enrich gerrit --scope <project>` | Enrich with Gerrit changes. |
| `engram ingest enrich <plugin-name>` | Enrich via a discovered plugin. |
| `engram reconcile --max-cost <tokens>` | Two-phase projection maintenance. |
| `engram project --kind <k> --anchor entity:<ULID>` | Author a single projection. |
| `engram export wiki --out ./wiki` | Export active projections as markdown. |
| `engram search <query>` | Hybrid FTS + vector search. |
| `engram show <entity>` | Entity details, edges, evidence. |
| `engram history <entity>` | Temporal evolution of facts. |
| `engram context <query>` | Token-budgeted pack for an agent prompt. |
| `engram companion --harness <name>` | Emit agent-harness instructions. |
| `engram visualize` | Local HTTP server, defaults to `http://127.0.0.1:7878`. |
| `engram ownership` | Ownership risk report (decay + owners). |
| `engram decay` | Knowledge decay report. |
| `engram status` | Health dashboard (providers, counts, config). |
| `engram stats` | Raw graph counts. |
| `engram doctor` | Diagnostics and optional repair. |
| `engram verify` | Validate `.engram/` integrity. |
| `engram embed` | Manage vector embeddings. |
| `engram rebuild-index` | Rebuild the FTS index. |
| `engram plugin list` | List discovered plugins (add `--available` for installable bundled plugins). |
| `engram plugin install <name>` | Wire a bundled first-party plugin into XDG (or project with `--project`). |
| `engram plugin uninstall <name>` | Remove an installed plugin (`--force` for user-authored). |

Every command has `--help` with examples.

## Ingestion

### Git — free, no tokens

`engram ingest git` reads commits, blame, and file histories to produce:

- **Entities** — authors, files, modules, issue references.
- **Observed edges** — git blame attribution, file change records.
- **Inferred edges** — co-change patterns, likely ownership, bus factor
  signals. Clearly marked as inferred, never presented as observed fact.
- **Evidence chains** — every edge traces back to specific commits.
- **Temporal validity** — every relationship carries a `[valid_from,
  valid_until)` window.

### Source code — tree-sitter

`engram ingest source` walks the working tree, parses source files with
tree-sitter, and creates file, module, and symbol entities. Respects
`.gitignore` by default; always skips `node_modules`, build artifacts, and
lockfiles.

TypeScript and JavaScript are supported today. Additional grammars land in
later versions.

```bash
engram ingest source                            # current directory
engram ingest source packages/engram-core       # specific path
engram ingest source --exclude "*.test.ts"      # extra exclusions
engram ingest source --dry-run --verbose
```

### Enrichment — why, not just what

Git tells you *what* changed. Enrichment adapters tell you *why* — PR
discussions, review comments, linked issues, rationale behind decisions.

| Source | Status | Scope flag | Notes |
|---|---|---|---|
| GitHub | Built-in | `--scope owner/repo` | Public works without a token. |
| Gerrit | Plugin | `--scope <project>` | Basic or bearer auth; `--endpoint <url>`. Install via `engram plugin install gerrit`. |
| GitLab | Planned | — | — |
| Jira | Planned | — | — |
| Linear | Planned | — | — |
| Slack | Desired | — | Out-of-code-review decisions. |
| Confluence | Desired | — | Internal docs and ADRs. |

Anything in the "Planned" or "Desired" tier can land earlier as a **plugin** —
see [Plugins](#plugins).

```bash
# GitHub (public repo — no token needed)
engram ingest enrich github --scope owner/repo

# GitHub (private or high-rate-limit)
engram ingest enrich github --scope owner/repo --token $GITHUB_TOKEN

# Gerrit (install the plugin first)
engram plugin install gerrit
engram ingest enrich gerrit --scope chromium/src \
  --endpoint https://gerrit-review.googlesource.com \
  --username alice --password $GERRIT_PASSWORD
```

All enrichment adapters speak the same v2 contract: `--scope`, a shared set
of auth flags (`--token`, `--username`/`--password`, `--service-account`,
`--oauth-token`), and per-adapter environment variables
(`<ADAPTER>_TOKEN`, `<ADAPTER>_USERNAME`, etc.).

## Projections and reconcile

Projections are the output layer — AI-synthesized documents anchored to the
graph substrate. Unlike a static wiki, they know when they are stale and
re-reconcile themselves as new evidence arrives. Like every other fact,
they carry validity windows and trace back to source material.

Built-in projection kinds:

| Kind | What it produces |
|---|---|
| `entity_summary` | What an entity is, who owns it, how it has changed. |
| `decision_page` | Key decisions, rationale, alternatives considered. |
| `contradiction_report` | Conflicting facts or ownership overlaps. |
| `topic_cluster` | Synthesized view across a theme or system boundary. |

Projection authoring needs an LLM provider (Anthropic / Gemini / OpenAI —
auto-detected from the API key you export; see [AI providers](#ai-providers)).

### Reconcile — the main workflow

`reconcile` runs in two phases:

1. **Assess** — finds projections whose inputs have drifted and regenerates
   them.
2. **Discover** — surveys uncovered substrate and proposes new projections.

`--max-cost <n>` caps the **token budget** for the run (not dollars). Start
small, watch the summary output, then scale up.

```bash
# Both phases with a 50,000-token budget
engram reconcile --max-cost 50000

# Assess only (refresh stale projections, no discovery)
engram reconcile --phase assess --max-cost 10000

# Preview without persisting
engram reconcile --dry-run

# Limit to a single kind or anchor
engram reconcile --scope kind:entity_summary --max-cost 20000
engram reconcile --scope anchor:entity:01HN... --max-cost 20000
```

### Author a single projection

```bash
engram project --kind entity_summary \
               --anchor entity:<ULID> \
               --input episode:<ULID> \
               --input episode:<ULID>
```

### Export as a wiki

```bash
engram export wiki --out ./wiki
# One markdown file per active projection.
```

## Plugins

Engram ships with a GitHub built-in adapter and a Gerrit first-party plugin.
Anything else — GitLab, Jira, Linear, a proprietary review system, a custom
knowledge source — can live as a plugin without forking engram.

The Gerrit adapter (`packages/plugins/gerrit/`) is the reference implementation
for the plugin contract (ADR-008) — proof that the contract is adequate for a
full-featured first-party adapter.

### Discovery

Plugins are discovered from (highest precedence first):

- `<project>/.engram/plugins/<name>/` — project-local, wins on name collision.
- `$XDG_DATA_HOME/engram/plugins/<name>/` (fallback
  `~/.local/share/engram/plugins/<name>/`) — user-wide on Linux and macOS.
- `%LOCALAPPDATA%\engram\plugins\<name>\` — user-wide on Windows.

Each plugin directory needs a `manifest.json`. Discovered plugins are
auto-registered as `engram ingest enrich <plugin-name>` subcommands and
appear in `engram plugin list`.

### Transports

- **`js-module`** — dynamic `import()` of a JavaScript module exporting an
  `EnrichmentAdapter`. Runs in-process.
- **`executable`** — a subprocess communicating over a JSON-lines protocol.
  Language-agnostic (Python, Go, anything that can read and write stdio).
  Engram owns all graph writes; the plugin only emits records.

See
[`docs/internal/specs/plugin-loading.md`](docs/internal/specs/plugin-loading.md)
for the full spec: manifest schema, protocol messages, vocabulary
extensions, and security model.

```bash
engram plugin list

NAME        VERSION  TRANSPORT   SCOPE    SOURCE    STATUS
----------  -------  ----------  -------  --------  ------
my-jira     0.1.0    executable  user     user      OK
my-linear   0.2.0    js-module   project  symlinked OK
```

### Install and uninstall

First-party bundled plugins (those shipped in the engram install under
`packages/plugins/`) can be wired into the XDG plugin directory with a
single command — no manual symlinking required:

```bash
# List what is available to install
engram plugin list --available

# Install a bundled plugin user-wide (symlink into XDG_DATA_HOME/engram/plugins/)
engram plugin install gerrit

# Install into a specific project only
engram plugin install gerrit --project /path/to/project

# Uninstall a bundled or symlinked plugin
engram plugin uninstall gerrit

# Uninstall a user-authored (plain-directory) plugin — requires --force
engram plugin uninstall my-custom --force
```

**Source column** — `engram plugin list` reports how each plugin was
installed:

| Source | Meaning |
|---|---|
| `bundled` | Symlink pointing into the engram install root (installed via `engram plugin install`). |
| `symlinked` | A user-created symlink to an external directory. |
| `user` | A plain directory created by the user. |

On Windows, where symlinks may require elevated permissions, `engram plugin
install` falls back to a recursive copy automatically.

## AI providers

Engram uses AI for two distinct purposes. Support differs between them.

### Embeddings (hybrid search)

Blends vector similarity into search scores during ingest and retrieval.
Falls back to FTS-only if no provider is configured. Embedding failures
never corrupt the graph.

| Provider | Configuration | Default model |
|---|---|---|
| none | (default) — FTS only | — |
| Ollama | `ENGRAM_AI_PROVIDER=ollama` | `nomic-embed-text` |
| Gemini | `ENGRAM_AI_PROVIDER=gemini` + `GEMINI_API_KEY` | `gemini-embedding-001` |

```bash
# FTS only (default)
engram search "auth module ownership"

# With local Ollama
ENGRAM_AI_PROVIDER=ollama engram ingest git .
ENGRAM_AI_PROVIDER=ollama engram search "auth module ownership"

# With Gemini
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<key> engram search "…"
```

### Projection authoring

Used by `reconcile` and `project`. Providers are auto-detected from the
API key you have exported — no `ENGRAM_AI_PROVIDER` required unless you
want to be explicit.

| Provider | Auto-detected from | Explicit override |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `ENGRAM_AI_PROVIDER=anthropic` |
| Gemini | `GEMINI_API_KEY` | `ENGRAM_AI_PROVIDER=gemini` |
| OpenAI | `OPENAI_API_KEY` | `ENGRAM_AI_PROVIDER=openai` |

Engram defaults to a capable general-purpose model for each provider and
tracks new model releases as dependencies are updated. Run `engram status`
to see the model your installation will pick.

```bash
# Just export a key and go — auto-detected
ANTHROPIC_API_KEY=<key> engram reconcile --max-cost 50000

# Explicit selection when multiple keys are present
ENGRAM_AI_PROVIDER=gemini GEMINI_API_KEY=<key> engram reconcile --max-cost 50000
```

## Programmatic API

```typescript
import {
  createProvider,
  search,
  storeEmbedding,
  findSimilar,
} from "engram-core";

// Create a provider (reads ENGRAM_AI_PROVIDER env by default)
const provider = createProvider({ provider: "ollama" });

// Hybrid search (FTS + vector)
const results = await search(graph, "auth module ownership", { provider });

// Compute an embedding through the provider
const sourceText = "Auth module owned by the platform team";
const [vector] = await provider.embed([sourceText]);

// Store that embedding against an entity
storeEmbedding(graph, entityId, "entity", "nomic-embed-text", vector, sourceText);

// Find similar items by vector (here, reusing the same embedding as the query)
const similar = findSimilar(graph, vector, {
  limit: 10,
  target_type: "entity",
});
```

Plugin loading has its own entry point:

```typescript
import { discoverPlugins, loadManifest } from "engram-core/plugins";
```

## Architecture

```
engram-core       The library (the product). Graph, temporal, retrieval,
                  ingestion, projection, plugin-loader engines. Zero CLI
                  or transport dependencies.
engram-cli        CLI wrapper. commander + @clack/prompts.
engram-web        Visualizer backend (served by `engram visualize`).
```

The `.engram/` directory layout is the durable contract. The CLI is the
reference implementation over that contract.

Deeper reading:

- [`docs/internal/VISION.md`](docs/internal/VISION.md) — product vision.
- [`docs/internal/DECISIONS.md`](docs/internal/DECISIONS.md) — ADRs.
- [`docs/internal/specs/`](docs/internal/specs) — plugin loading,
  cross-source references, vocabulary, mutable sources.
- [`docs/format-spec.md`](docs/format-spec.md) — `.engram` format spec.

## Status

**v0.2 (schema) — in development.** Breaking changes expected before 1.0.

| Area | State |
|---|---|
| Git ingest (structural graph) | Stable |
| Source ingest (TS/JS) | Stable |
| GitHub enrichment | Stable |
| Gerrit enrichment | Experimental |
| Plugin loader (js-module + executable) | Experimental |
| Projections + reconcile | Experimental |
| Cross-source reference resolution | Experimental |
| Hybrid search (FTS + vector) | Stable |
| `engram visualize` | Experimental |

## License

MIT
