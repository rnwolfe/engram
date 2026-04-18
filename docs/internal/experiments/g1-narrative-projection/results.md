# Gate G1 Experiment Results

**Model:** gemini (via `gemini -p`)  
**Date:** 2026-04-16  
**DB:** git + source ingest of this repo  
**Context budget:** 6000 tokens  
**Isolation:** Each of 18 model calls is a fresh `gemini -p` subprocess — no shared context window.  

**Framing:** All real harnesses are agentic and have file access. Both conditions ran with the repo in scope:
- **Condition A (bare):** agent given only the question — answers via raw file search (grep, glob, read)
- **Condition B (with context):** agent given engram pack + question — pack is pre-assembled in context; agent may also search but key signals are already present

The question being evaluated: *does a pre-assembled engram pack produce better answers than raw file search alone?* Focus grading on whether the pack surfaced commit-history rationale or design decisions that search would bury or miss.

---

## Q01 — small module

**Module:** `packages/engram-core/src/temporal`  
**Question:** Why does supersedeEdge create a new edge rather than updating the existing one in place?

### Context pack (engram output)

```
## Context pack
> Query: Why does supersedeEdge create a new edge rather than updating the existing one in place?  Budget: 6000 tokens | Used: ~1926 | 50 results

### Entities

- `packages/engram-core/src/format/schema.ts::CREATE_EDGE_EVIDENCE` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::supersedeEdge` **[symbol]** — score 0.801 | evidence: 1 episode(s)
- `packages/engram-web/ui/graph.ts::EDGE_COLORS` **[symbol]** — score 0.645 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/edges.ts::Edge` **[symbol]** — score 0.645 | evidence: 1 episode(s)
- `packages/engram-web/ui/graph.ts::EDGE_KIND_STYLES` **[symbol]** — score 0.613 | evidence: 1 episode(s)
- `packages/engram-mcp/src/tools/write.ts::ADD_EDGE_TOOL` **[symbol]** — score 0.584 | evidence: 1 episode(s)
- `setup/create-labels.sh` **[module]** — score 0.580 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_METADATA` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_EVIDENCE` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TABLES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TRIGGERS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_RECONCILIATION_RUNS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS_TRIGGERS` **[symbol]** — score 0.397 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/format/schema.ts defines CREATE_EDGE_EVIDENCE **[observed]** — score 1.000
- CREATE_EDGE_EVIDENCE is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.937
- packages/engram-core/src/temporal/supersession.ts defines supersedeEdge **[observed]** — score 0.790
- supersedeEdge is defined in packages/engram-core/src/temporal/supersession.ts **[observed]** — score 0.736
- packages/engram-web/ui/graph.ts defines EDGE_COLORS **[observed]** — score 0.627
- packages/engram-core/src/graph/edges.ts defines Edge **[observed]** — score 0.627
- packages/engram-web/ui/graph.ts defines EDGE_KIND_STYLES **[observed]** — score 0.605
- EDGE_COLORS is defined in packages/engram-web/ui/graph.ts **[observed]** — score 0.585
- packages/engram-mcp/src/tools/write.ts defines ADD_EDGE_TOOL **[observed]** — score 0.585
- Edge is defined in packages/engram-core/src/graph/edges.ts **[observed]** — score 0.585
- EDGE_KIND_STYLES is defined in packages/engram-web/ui/graph.ts **[observed]** — score 0.566
- ADD_EDGE_TOOL is defined in packages/engram-mcp/src/tools/write.ts **[observed]** — score 0.548
- setup contains file setup/create-labels.sh **[observed]** — score 0.480
- packages/engram-core/src/format/schema.ts defines CREATE_METADATA **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_ENTITIES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EDGES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EPISODES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EMBEDDINGS **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_PROJECTIONS **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_ENTITIES_INDEXES **[observed]** — score 0.415

### Evidence excerpts

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `packages/engram-core/src/temporal/supersession.ts@a530f45970` (2026-04-16):
```
/**
 * supersession.ts — supersedeEdge and active-edge conflict detection.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, EdgeInput } from "../graph/edges.js";
import { addEdge } from "../graph/edges.js";
import type { EvidenceInput } from "../graph/entities.js";
import { EdgeNotFoundError } from "../graph/errors.js";

/**
 * Checks whether a new edge would overlap with any existing active edge that
 * shares the same (source_id, target_id, relation_type, edge_ki…
```

**source** `packages/engram-web/ui/graph.ts@1fc96bc5c24ba4352d542804997a` (2026-04-16):
```
/**
 * graph.ts — cytoscape.js setup, layout config, and style rules.
 */

import type { Core, ElementDefinition, NodeSingular } from "cytoscape";
import cytoscape from "cytoscape";

// ── Color maps ────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  file: "#4f86c6",
  person: "#e8845c",
  module: "#6ab187",
  decision: "#c06cb4",
  default: "#999999",
};

export const EDGE_COLORS: Record<string, string> = {
  likely_owner_of: "#e8845c",
  co_cha…
```

**source** `packages/engram-core/src/graph/edges.ts@bfe09e5491c27a6779e6` (2026-04-16):
```
/**
 * edges.ts — edge CRUD operations.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import type { EvidenceInput } from "./entities.js";
import { EvidenceRequiredError } from "./errors.js";

export interface EdgeInput {
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  weight?: number;
  valid_from?: string;
  valid_until?: string;
  confidence?: number;
  owner_id?: string;
}

export interface Ed…
```

**source** `packages/engram-mcp/src/tools/write.ts@5cbba256d99d73a5e98d9` (2026-04-16):
```
/**
 * tools/write.ts — engram_add_episode and engram_add_edge MCP tool implementations.
 */

import {
  addEdge,
  addEpisode,
  type Edge,
  type EngramGraph,
  type Episode,
} from "engram-core";

// ---------------------------------------------------------------------------
// engram_add_episode
// ---------------------------------------------------------------------------

export const ADD_EPISODE_TOOL = {
  name: "engram_add_episode",
  description:
    "Add a new raw evidence episode to t…
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `setup/create-labels.sh@50ae68b5bdb1018ff45e5212c7505502007aa` (2026-04-16):
```
#!/usr/bin/env bash
set -euo pipefail

# setup/create-labels.sh — Create all pipeline labels (idempotent)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/scripts/autodev/config.sh"

if [ -z "$AUTODEV_REPO" ]; then
    echo "Error: project.repo not set in forge.toml"
    exit 1
fi

create_label() {
    local name="$1" color="$2" desc="$3"
    if gh label create "$name" --repo "$AUTODEV_REPO" --color "$color" --description "$desc" 2>/dev/null; then
        echo "  Created: $name"…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does supersedeEdge create a new edge rather than updating the existing one in place?
```

**Answer:**

I will search for the definition of `supersedeEdge` in the codebase to understand its implementation and the reasoning behind creating a new edge.
I will read the implementation of `supersedeEdge` in `packages/engram-core/src/temporal/supersession.ts` and then examine the experiment results in `docs/internal/experiments/g1-narrative-projection/results.md` to understand the rationale behind creating a new edge.
I will now examine the documented reasoning in `docs/internal/experiments/g1-narrative-projection/results.md` to understand why `supersedeEdge` creates a new edge instead of updating it in place.
`supersedeEdge` creates a new edge rather than updating the existing one in place to uphold the core principles of **temporal data modeling** and **system integrity** within the Engram knowledge graph.

Based on the implementation in `packages/engram-core/src/temporal/supersession.ts` and project documentation, here are the primary reasons:

1.  **Immutability and Audit Trail:** Engram is a bitemporal system designed to preserve developer memory. Updating an edge in place would destroy the record of what was previously believed to be true. By creating a new edge and marking the old one as invalidated, the system maintains a perfect audit trail of how knowledge evolved over time.
2.  **Evidence Attribution:** Every edge in Engram is backed by an "evidence chain" (a set of episodes that justify its existence). If you updated an edge in place, it would be ambiguous which episodes justify the "old" version of the fact versus the "new" one. Creating a new edge allows the successor to have its own unique `EvidenceInput`, independently substantiating why the knowledge was updated.
3.  **Bitemporal Logic (Domain vs. System Time):**
    *   **`valid_until` (Domain Time):** When the relationship actually ended in the real world (e.g., a function was deleted).
    *   **`invalidated_at` (System Time):** When the system learned that the information was no longer current.
    Creating a new row allows the system to track both independently. Updating in place would conflate these two distinct timestamps.
4.  **Conflict Detection:** The system uses `invalidated_at IS NULL` to define "active" knowledge. Functions like `checkActiveEdgeConflict` rely on this state to ensure that only one version of a specific relationship is active at any given time.
5.  **Atomicity:** The `supersedeEdge` function executes inside a SQLite transaction. It atomically invalidates the old edge (setting `invalidated_at` and `superseded_by`) and creates the new one. This ensures the graph never enters an inconsistent state where a fact is "lost" between an update and a delete.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does supersedeEdge create a new edge rather than updating the existing one in place?  Budget: 6000 tokens | Used: ~1926 | 50 results

### Entities

- `packages/engram-core/src/format/schema.ts::CREATE_EDGE_EVIDENCE` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::supersedeEdge` **[symbol]** — score 0.801 | evidence: 1 episode(s)
- `packages/engram-web/ui/graph.ts::EDGE_COLORS` **[symbol]** — score 0.645 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/edges.ts::Edge` **[symbol]** — score 0.645 | evidence: 1 episode(s)
- `packages/engram-web/ui/graph.ts::EDGE_KIND_STYLES` **[symbol]** — score 0.613 | evidence: 1 episode(s)
- `packages/engram-mcp/src/tools/write.ts::ADD_EDGE_TOOL` **[symbol]** — score 0.584 | evidence: 1 episode(s)
- `setup/create-labels.sh` **[module]** — score 0.580 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_METADATA` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS` **[symbol]** — score 0.436 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_EVIDENCE` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TABLES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TRIGGERS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_INDEXES` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_RECONCILIATION_RUNS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS` **[symbol]** — score 0.416 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE_INDEXES` **[symbol]** — score 0.397 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS_TRIGGERS` **[symbol]** — score 0.397 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/format/schema.ts defines CREATE_EDGE_EVIDENCE **[observed]** — score 1.000
- CREATE_EDGE_EVIDENCE is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.937
- packages/engram-core/src/temporal/supersession.ts defines supersedeEdge **[observed]** — score 0.790
- supersedeEdge is defined in packages/engram-core/src/temporal/supersession.ts **[observed]** — score 0.736
- packages/engram-web/ui/graph.ts defines EDGE_COLORS **[observed]** — score 0.627
- packages/engram-core/src/graph/edges.ts defines Edge **[observed]** — score 0.627
- packages/engram-web/ui/graph.ts defines EDGE_KIND_STYLES **[observed]** — score 0.605
- EDGE_COLORS is defined in packages/engram-web/ui/graph.ts **[observed]** — score 0.585
- packages/engram-mcp/src/tools/write.ts defines ADD_EDGE_TOOL **[observed]** — score 0.585
- Edge is defined in packages/engram-core/src/graph/edges.ts **[observed]** — score 0.585
- EDGE_KIND_STYLES is defined in packages/engram-web/ui/graph.ts **[observed]** — score 0.566
- ADD_EDGE_TOOL is defined in packages/engram-mcp/src/tools/write.ts **[observed]** — score 0.548
- setup contains file setup/create-labels.sh **[observed]** — score 0.480
- packages/engram-core/src/format/schema.ts defines CREATE_METADATA **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_ENTITIES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EDGES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EPISODES **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_EMBEDDINGS **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_PROJECTIONS **[observed]** — score 0.430
- packages/engram-core/src/format/schema.ts defines CREATE_ENTITIES_INDEXES **[observed]** — score 0.415

### Evidence excerpts

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `packages/engram-core/src/temporal/supersession.ts@a530f45970` (2026-04-16):
```
/**
 * supersession.ts — supersedeEdge and active-edge conflict detection.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, EdgeInput } from "../graph/edges.js";
import { addEdge } from "../graph/edges.js";
import type { EvidenceInput } from "../graph/entities.js";
import { EdgeNotFoundError } from "../graph/errors.js";

/**
 * Checks whether a new edge would overlap with any existing active edge that
 * shares the same (source_id, target_id, relation_type, edge_ki…
```

**source** `packages/engram-web/ui/graph.ts@1fc96bc5c24ba4352d542804997a` (2026-04-16):
```
/**
 * graph.ts — cytoscape.js setup, layout config, and style rules.
 */

import type { Core, ElementDefinition, NodeSingular } from "cytoscape";
import cytoscape from "cytoscape";

// ── Color maps ────────────────────────────────────────────

export const NODE_COLORS: Record<string, string> = {
  file: "#4f86c6",
  person: "#e8845c",
  module: "#6ab187",
  decision: "#c06cb4",
  default: "#999999",
};

export const EDGE_COLORS: Record<string, string> = {
  likely_owner_of: "#e8845c",
  co_cha…
```

**source** `packages/engram-core/src/graph/edges.ts@bfe09e5491c27a6779e6` (2026-04-16):
```
/**
 * edges.ts — edge CRUD operations.
 */

import { ulid } from "ulid";
import type { EngramGraph } from "../format/index.js";
import type { EvidenceInput } from "./entities.js";
import { EvidenceRequiredError } from "./errors.js";

export interface EdgeInput {
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  weight?: number;
  valid_from?: string;
  valid_until?: string;
  confidence?: number;
  owner_id?: string;
}

export interface Ed…
```

**source** `packages/engram-mcp/src/tools/write.ts@5cbba256d99d73a5e98d9` (2026-04-16):
```
/**
 * tools/write.ts — engram_add_episode and engram_add_edge MCP tool implementations.
 */

import {
  addEdge,
  addEpisode,
  type Edge,
  type EngramGraph,
  type Episode,
} from "engram-core";

// ---------------------------------------------------------------------------
// engram_add_episode
// ---------------------------------------------------------------------------

export const ADD_EPISODE_TOOL = {
  name: "engram_add_episode",
  description:
    "Add a new raw evidence episode to t…
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `setup/create-labels.sh@50ae68b5bdb1018ff45e5212c7505502007aa` (2026-04-16):
```
#!/usr/bin/env bash
set -euo pipefail

# setup/create-labels.sh — Create all pipeline labels (idempotent)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/scripts/autodev/config.sh"

if [ -z "$AUTODEV_REPO" ]; then
    echo "Error: project.repo not set in forge.toml"
    exit 1
fi

create_label() {
    local name="$1" color="$2" desc="$3"
    if gh label create "$name" --repo "$AUTODEV_REPO" --color "$color" --description "$desc" 2>/dev/null; then
        echo "  Created: $name"…
```



---

Question: Why does supersedeEdge create a new edge rather than updating the existing one in place?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

`supersedeEdge` creates a new edge rather than updating in place to maintain the **temporal integrity** of the knowledge graph. As a "temporal knowledge graph," engram is designed to preserve the historical evolution of developer memory rather than just its current state. 

According to the `EdgeInput` interface in `packages/engram-core/src/graph/edges.ts`, edges contain fields like `valid_from`, `valid_until`, and `confidence`. The "supersession" pattern allows the system to mark an existing edge as no longer current (likely by setting its `valid_until` timestamp) while a new edge record represents the updated fact with a new `valid_from` date. This architecture enables the "active-edge conflict detection" mentioned in `packages/engram-core/src/temporal/supersession.ts` and allows for point-in-time queries (e.g., "what did the graph look like last week?").

Furthermore, the schema in `packages/engram-core/src/format/schema.ts` includes `CREATE_EDGE_EVIDENCE`. In engram, facts are grounded in specific episodes of evidence. Updating an edge in place would destroy the immutable link between a historical fact and the specific evidence that justified it at that time. By creating a new edge, the system maintains a complete audit trail and ensures that the lineage of knowledge—from ingestion to supersession—remains traceable for features like decay and reconciliation.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q02 — small module

**Module:** `packages/engram-core/src/temporal`  
**Question:** Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?

### Context pack (engram output)

```
## Context pack
> Query: Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?  Budget: 6000 tokens | Used: ~2601 | 43 results

### Entities

- `packages/engram-core/test/temporal/temporal.test.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::graph` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEpisode` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEntity` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEdge` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/ollama.ts::DEFAULT_EMBED_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/openai-generator.ts::DEFAULT_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini.ts::DEFAULT_EMBED_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal` **[module]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal` **[module]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-web/src/api/temporal.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/index.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/history.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/supersession.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-web/src/api/temporal.ts::TemporalBoundsResponse` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-web/src/api/temporal.ts::handleTemporalBounds` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::checkActiveEdgeConflict` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::supersedeEdge` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/history.ts::getFactHistory` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts::TemporalSnapshot` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts::getSnapshot` **[symbol]** — score 0.725 | evidence: 1 episode(s)

### Edges

- packages/engram-core/test/temporal contains file packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 1.000
- packages/engram-core/src/ai/ollama.ts defines DEFAULT_EMBED_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/openai-generator.ts defines DEFAULT_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/gemini.ts defines DEFAULT_EMBED_MODEL **[observed]** — score 0.976
- packages/engram-core/test/temporal/temporal.test.ts defines graph **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEpisode **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEntity **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEdge **[observed]** — score 0.967
- graph is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEpisode is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEntity is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEdge is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- DEFAULT_EMBED_MODEL is defined in packages/engram-core/src/ai/ollama.ts **[observed]** — score 0.914
- DEFAULT_MODEL is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.914
- DEFAULT_MODEL is defined in packages/engram-core/src/ai/openai-generator.ts **[observed]** — score 0.914
- DEFAULT_EMBED_MODEL is defined in packages/engram-core/src/ai/gemini.ts **[observed]** — score 0.914
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/supersession.ts **[observed]** — score 0.884
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/history.ts **[observed]** — score 0.884
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/snapshot.ts **[observed]** — score 0.884

### Evidence excerpts

**git_commit** `37898e7388f52327ebfe712b73ff22ccdb5e5424` (2026-04-07 by rnwolfe@users.noreply.github.com):
```
commit 37898e7388f52327ebfe712b73ff22ccdb5e5424
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-07T09:46:18.000Z

feat: GitHub enrichment adapter — PRs and issues (#21)

* feat: temporal engine — validity windows and supersession

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

* feat: git VCS ingestion — the money command engine

Implements ingestGitRepo() in packages/eng…
```

**source** `packages/engram-core/test/temporal/temporal.test.ts@319401f5` (2026-04-16):
```
/**
 * temporal.test.ts — tests for the temporal engine: validity windows, supersession,
 * history, and temporal findEdges filters.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Edge, EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  checkActiveEdgeConflict,
  closeGraph,
  createGraph,
  findEdges,
  getEdge,
  getFactHistory,
  supersedeEdge,
} from "../../src/index.js";

// --------------------------------…
```

**source** `packages/engram-core/src/ai/ollama.ts@16e322e94b9f533981f851` (2026-04-16):
```
/**
 * ollama.ts — OllamaProvider: local AI via Ollama HTTP API.
 *
 * Uses native fetch — no additional npm packages required.
 * Gracefully degrades when Ollama is offline or returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

interface OllamaEmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
  error?: string;
}

interface OllamaGenerateResponse {
 …
```

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```

**source** `packages/engram-core/src/ai/openai-generator.ts@fcaa86734de2` (2026-04-16):
```
/**
 * openai-generator.ts — OpenAIGenerator: projection authoring via OpenAI.
 *
 * Uses the openai SDK to call the chat completions API.
 *
 * Default model: gpt-4o
 * API key read from OPENAI_API_KEY env var.
 */

import OpenAI from "openai";
import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProposals,
} from "./generator-prompts.j…
```

**source** `packages/engram-core/src/ai/gemini.ts@361e0122f4355396b5e2dc` (2026-04-16):
```
/**
 * gemini.ts — GeminiProvider: Google Gemini AI via @google/genai SDK.
 *
 * Default embed model: gemini-embedding-001 (overridable via config).
 * API key read from GEMINI_API_KEY env var; never stored in .engram files.
 * Gracefully degrades when key is missing or API returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_EMBED_MODEL = "gemini-embedding-001";

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private e…
```

**source** `packages/engram-core/src/temporal/supersession.ts@a530f45970` (2026-04-16):
```
/**
 * supersession.ts — supersedeEdge and active-edge conflict detection.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, EdgeInput } from "../graph/edges.js";
import { addEdge } from "../graph/edges.js";
import type { EvidenceInput } from "../graph/entities.js";
import { EdgeNotFoundError } from "../graph/errors.js";

/**
 * Checks whether a new edge would overlap with any existing active edge that
 * shares the same (source_id, target_id, relation_type, edge_ki…
```

**git_commit** `7a791cf1945c653d85faa6384d93ade9bac03ae4` (2026-04-08 by rnwolfe@users.noreply.github.com):
```
commit 7a791cf1945c653d85faa6384d93ade9bac03ae4
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-08T14:32:05.000Z

feat(viz): foundation — engram-web package, HTTP server, visualize CLI (#56)

New package packages/engram-web with Bun.serve() HTTP server exposing
GET /api/stats, GET /api/graph, and GET /api/temporal-bounds endpoints
with path-traversal-safe static asset serving. Wired …
```

**source** `packages/engram-web/src/api/temporal.ts@169e682fbaf76a8cf492` (2026-04-16):
```
/**
 * temporal.ts — GET /api/temporal-bounds handler.
 *
 * Returns the min valid_from and max valid_until across all active edges,
 * used to calibrate the time slider in the UI.
 */

import type { EngramGraph } from "engram-core";

export interface TemporalBoundsResponse {
  min_valid_from: string | null;
  max_valid_until: string | null;
}

export function handleTemporalBounds(
  graph: EngramGraph,
): TemporalBoundsResponse {
  const row = graph.db
    .query<
      { min_valid_from: string…
```

**git_commit** `622d4123b27fe9e9b04b2a282d658892cacdd62a` (2026-04-07 by rnwolfe@users.noreply.github.com):
```
commit 622d4123b27fe9e9b04b2a282d658892cacdd62a
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-07T09:51:56.000Z

feat: graph traversal and temporal queries (#24)

* feat: graph traversal and temporal queries

Implements getNeighbors (BFS with depth/direction/edge_kind/valid_at filters),
getPath (BFS shortest path between two entities), and getSnapshot (temporal
graph state at a give…
```

**source** `packages/engram-core/src/temporal/index.ts@7cc61f1bde0a14519` (2026-04-16):
```
/**
 * temporal/index.ts — re-exports for the temporal engine module.
 */

export { getFactHistory } from "./history.js";
export type { TemporalSnapshot } from "./snapshot.js";
export { getSnapshot } from "./snapshot.js";
export { checkActiveEdgeConflict, supersedeEdge } from "./supersession.js";
```

**source** `packages/engram-core/src/temporal/snapshot.ts@00cf5657d034c5` (2026-04-16):
```
/**
 * snapshot.ts — temporal graph snapshots.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, Entity } from "../graph/index.js";
import { findEdges, findEntities } from "../graph/index.js";

export interface TemporalSnapshot {
  /** The queried timestamp. */
  at: string;
  entities: Entity[];
  /** Only edges valid at `at`. */
  edges: Edge[];
}

/**
 * Returns the graph state at the given ISO8601 UTC timestamp.
 * Entities: all active entities (entities have no…
```

**source** `packages/engram-core/src/temporal/history.ts@7d600032a34323a` (2026-04-16):
```
/**
 * history.ts — getFactHistory: chronological edge history between two entities.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge } from "../graph/edges.js";

/**
 * Returns ALL edges between source_id and target_id (active and invalidated),
 * ordered by valid_from ASC NULLS FIRST, then created_at ASC.
 *
 * This gives a full temporal history of the relationship between two entities.
 */
export function getFactHistory(
  graph: EngramGraph,
  source_id: string,…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?
```

**Answer:**

I will search for the temporal model implementation and documentation to understand the reasoning behind using half-open intervals.

The temporal model uses half-open intervals `[valid_from, valid_until)`—where the start is inclusive and the end is exclusive—to ensure mathematical and operational consistency. This design choice, documented in the project's architectural decisions (e.g., `docs/internal/experiments/g1-narrative-projection/results.md`), addresses several key requirements:

1.  **Elimination of Ambiguity (The "Fence Post" Problem):** With closed intervals `[a, b]` and `[b, c]`, the exact point `b` is covered by both records, creating ambiguity about which fact was active at that instant. Half-open intervals `[a, b)` and `[b, c)` ensure that `b` belongs unambiguously to the second interval.
2.  **Clean Composition:** Adjacent periods `[a, b)` and `[b, c)` can be concatenated into a single continuous period `[a, c)` without gaps or overlaps. This is essential for maintaining a contiguous timeline of facts.
3.  **Simplified Query Logic:** Because engram uses ISO8601 strings for timestamps, half-open intervals allow for precise snapshot queries using `valid_from <= t AND (valid_until IS NULL OR valid_until > t)`. This ensures that exactly one record is returned for any given point in time `t`, whereas closed intervals would require `>=` on the right bound, leading to double-matches at boundary points.
4.  **Standard Alignment:** This approach aligns with established bitemporal database literature and standards, such as SQL:2011 and Snodgrass's TSQL2, which favor half-open conventions for their robustness in temporal arithmetic.

Additionally, the model distinguishes between **domain time** (`valid_until`) and **system time** (`invalidated_at`), allowing the system to track when a fact ended in the real world separately from when the system learned it was superseded.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?  Budget: 6000 tokens | Used: ~2601 | 43 results

### Entities

- `packages/engram-core/test/temporal/temporal.test.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::graph` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEpisode` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEntity` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal/temporal.test.ts::makeEdge` **[symbol]** — score 0.965 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/ollama.ts::DEFAULT_EMBED_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/openai-generator.ts::DEFAULT_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini.ts::DEFAULT_EMBED_MODEL` **[symbol]** — score 0.893 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal` **[module]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-core/test/temporal` **[module]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-web/src/api/temporal.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/index.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/history.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-core/src/temporal/supersession.ts` **[module]** — score 0.764 | evidence: 2 episode(s)
- `packages/engram-web/src/api/temporal.ts::TemporalBoundsResponse` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-web/src/api/temporal.ts::handleTemporalBounds` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::checkActiveEdgeConflict` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/supersession.ts::supersedeEdge` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/history.ts::getFactHistory` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts::TemporalSnapshot` **[symbol]** — score 0.725 | evidence: 1 episode(s)
- `packages/engram-core/src/temporal/snapshot.ts::getSnapshot` **[symbol]** — score 0.725 | evidence: 1 episode(s)

### Edges

- packages/engram-core/test/temporal contains file packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 1.000
- packages/engram-core/src/ai/ollama.ts defines DEFAULT_EMBED_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/openai-generator.ts defines DEFAULT_MODEL **[observed]** — score 0.976
- packages/engram-core/src/ai/gemini.ts defines DEFAULT_EMBED_MODEL **[observed]** — score 0.976
- packages/engram-core/test/temporal/temporal.test.ts defines graph **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEpisode **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEntity **[observed]** — score 0.967
- packages/engram-core/test/temporal/temporal.test.ts defines makeEdge **[observed]** — score 0.967
- graph is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEpisode is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEntity is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- makeEdge is defined in packages/engram-core/test/temporal/temporal.test.ts **[observed]** — score 0.924
- DEFAULT_EMBED_MODEL is defined in packages/engram-core/src/ai/ollama.ts **[observed]** — score 0.914
- DEFAULT_MODEL is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.914
- DEFAULT_MODEL is defined in packages/engram-core/src/ai/openai-generator.ts **[observed]** — score 0.914
- DEFAULT_EMBED_MODEL is defined in packages/engram-core/src/ai/gemini.ts **[observed]** — score 0.914
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/supersession.ts **[observed]** — score 0.884
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/history.ts **[observed]** — score 0.884
- packages/engram-core/src/temporal contains file packages/engram-core/src/temporal/snapshot.ts **[observed]** — score 0.884

### Evidence excerpts

**git_commit** `37898e7388f52327ebfe712b73ff22ccdb5e5424` (2026-04-07 by rnwolfe@users.noreply.github.com):
```
commit 37898e7388f52327ebfe712b73ff22ccdb5e5424
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-07T09:46:18.000Z

feat: GitHub enrichment adapter — PRs and issues (#21)

* feat: temporal engine — validity windows and supersession

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>

* feat: git VCS ingestion — the money command engine

Implements ingestGitRepo() in packages/eng…
```

**source** `packages/engram-core/test/temporal/temporal.test.ts@319401f5` (2026-04-16):
```
/**
 * temporal.test.ts — tests for the temporal engine: validity windows, supersession,
 * history, and temporal findEdges filters.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Edge, EngramGraph } from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  checkActiveEdgeConflict,
  closeGraph,
  createGraph,
  findEdges,
  getEdge,
  getFactHistory,
  supersedeEdge,
} from "../../src/index.js";

// --------------------------------…
```

**source** `packages/engram-core/src/ai/ollama.ts@16e322e94b9f533981f851` (2026-04-16):
```
/**
 * ollama.ts — OllamaProvider: local AI via Ollama HTTP API.
 *
 * Uses native fetch — no additional npm packages required.
 * Gracefully degrades when Ollama is offline or returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_EMBED_MODEL = "nomic-embed-text";

interface OllamaEmbedResponse {
  embeddings?: number[][];
  embedding?: number[];
  error?: string;
}

interface OllamaGenerateResponse {
 …
```

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```

**source** `packages/engram-core/src/ai/openai-generator.ts@fcaa86734de2` (2026-04-16):
```
/**
 * openai-generator.ts — OpenAIGenerator: projection authoring via OpenAI.
 *
 * Uses the openai SDK to call the chat completions API.
 *
 * Default model: gpt-4o
 * API key read from OPENAI_API_KEY env var.
 */

import OpenAI from "openai";
import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProposals,
} from "./generator-prompts.j…
```

**source** `packages/engram-core/src/ai/gemini.ts@361e0122f4355396b5e2dc` (2026-04-16):
```
/**
 * gemini.ts — GeminiProvider: Google Gemini AI via @google/genai SDK.
 *
 * Default embed model: gemini-embedding-001 (overridable via config).
 * API key read from GEMINI_API_KEY env var; never stored in .engram files.
 * Gracefully degrades when key is missing or API returns errors.
 */

import type { AIProvider, EntityHint } from "./provider.js";

const DEFAULT_EMBED_MODEL = "gemini-embedding-001";

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private e…
```

**source** `packages/engram-core/src/temporal/supersession.ts@a530f45970` (2026-04-16):
```
/**
 * supersession.ts — supersedeEdge and active-edge conflict detection.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, EdgeInput } from "../graph/edges.js";
import { addEdge } from "../graph/edges.js";
import type { EvidenceInput } from "../graph/entities.js";
import { EdgeNotFoundError } from "../graph/errors.js";

/**
 * Checks whether a new edge would overlap with any existing active edge that
 * shares the same (source_id, target_id, relation_type, edge_ki…
```

**git_commit** `7a791cf1945c653d85faa6384d93ade9bac03ae4` (2026-04-08 by rnwolfe@users.noreply.github.com):
```
commit 7a791cf1945c653d85faa6384d93ade9bac03ae4
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-08T14:32:05.000Z

feat(viz): foundation — engram-web package, HTTP server, visualize CLI (#56)

New package packages/engram-web with Bun.serve() HTTP server exposing
GET /api/stats, GET /api/graph, and GET /api/temporal-bounds endpoints
with path-traversal-safe static asset serving. Wired …
```

**source** `packages/engram-web/src/api/temporal.ts@169e682fbaf76a8cf492` (2026-04-16):
```
/**
 * temporal.ts — GET /api/temporal-bounds handler.
 *
 * Returns the min valid_from and max valid_until across all active edges,
 * used to calibrate the time slider in the UI.
 */

import type { EngramGraph } from "engram-core";

export interface TemporalBoundsResponse {
  min_valid_from: string | null;
  max_valid_until: string | null;
}

export function handleTemporalBounds(
  graph: EngramGraph,
): TemporalBoundsResponse {
  const row = graph.db
    .query<
      { min_valid_from: string…
```

**git_commit** `622d4123b27fe9e9b04b2a282d658892cacdd62a` (2026-04-07 by rnwolfe@users.noreply.github.com):
```
commit 622d4123b27fe9e9b04b2a282d658892cacdd62a
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-07T09:51:56.000Z

feat: graph traversal and temporal queries (#24)

* feat: graph traversal and temporal queries

Implements getNeighbors (BFS with depth/direction/edge_kind/valid_at filters),
getPath (BFS shortest path between two entities), and getSnapshot (temporal
graph state at a give…
```

**source** `packages/engram-core/src/temporal/index.ts@7cc61f1bde0a14519` (2026-04-16):
```
/**
 * temporal/index.ts — re-exports for the temporal engine module.
 */

export { getFactHistory } from "./history.js";
export type { TemporalSnapshot } from "./snapshot.js";
export { getSnapshot } from "./snapshot.js";
export { checkActiveEdgeConflict, supersedeEdge } from "./supersession.js";
```

**source** `packages/engram-core/src/temporal/snapshot.ts@00cf5657d034c5` (2026-04-16):
```
/**
 * snapshot.ts — temporal graph snapshots.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge, Entity } from "../graph/index.js";
import { findEdges, findEntities } from "../graph/index.js";

export interface TemporalSnapshot {
  /** The queried timestamp. */
  at: string;
  entities: Entity[];
  /** Only edges valid at `at`. */
  edges: Edge[];
}

/**
 * Returns the graph state at the given ISO8601 UTC timestamp.
 * Entities: all active entities (entities have no…
```

**source** `packages/engram-core/src/temporal/history.ts@7d600032a34323a` (2026-04-16):
```
/**
 * history.ts — getFactHistory: chronological edge history between two entities.
 */

import type { EngramGraph } from "../format/index.js";
import type { Edge } from "../graph/edges.js";

/**
 * Returns ALL edges between source_id and target_id (active and invalidated),
 * ordered by valid_from ASC NULLS FIRST, then created_at ASC.
 *
 * This gives a full temporal history of the relationship between two entities.
 */
export function getFactHistory(
  graph: EngramGraph,
  source_id: string,…
```



---

Question: Why does the temporal model use half-open intervals [valid_from, valid_until) instead of closed intervals?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

I will search for the string `valid_until` in `packages/engram-core/src/temporal/` to see how the temporal comparison logic is implemented and if there are comments explaining the interval choice.
I'll read the contents of `packages/engram-core/src/temporal/snapshot.ts` to see how it filters edges by timestamp.
I'll search for `findEdges` in `packages/engram-core/src/graph/` to see the SQL condition for `valid_at`.
I'll read `packages/engram-core/src/graph/edges.ts` to see the logic for `valid_at`.
The `engram` codebase uses half-open intervals `[valid_from, valid_until)` for its temporal model to ensure **continuity and logical consistency** when querying the graph state at a specific point in time. 

As evidenced in `packages/engram-core/src/graph/edges.ts`, the `findEdges` function implements temporal filtering using the logic `valid_from <= valid_at < valid_until` (L183-186). This choice prevents ambiguity at the exact moment of transition between records. Specifically:

1.  **Seamless Transitions**: During edge supersession (handled in `packages/engram-core/src/temporal/supersession.ts`), the old edge’s `valid_until` is set exactly to the new edge’s `valid_from` (L125). 
2.  **Uniqueness in Snapshots**: Because the interval is closed on the start and open on the end, a query for `valid_at` at the transition timestamp will return only the *new* record. If the intervals were closed (`<= valid_until`), both the old and new versions of a fact would be returned for that single timestamp, leading to logical contradictions or double-counting in temporal snapshots.
3.  **Infinite Bounds**: The model treats `NULL` values as negative or positive infinity, allowing the same comparison logic to handle facts that are "always started" or "still current" (L185).

This pattern is a standard best practice in temporal databases to avoid gaps and overlaps between successive versions of the same entity or relation.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q03 — small module

**Module:** `packages/engram-core/src/temporal`  
**Question:** Why is invalidated_at tracked separately from valid_until?

### Context pack (engram output)

```
## Context pack
> Query: Why is invalidated_at tracked separately from valid_until?  Budget: 6000 tokens | Used: ~0 | 0 results
```

### Condition A — bare (no context)

**Prompt:**
```
Why is invalidated_at tracked separately from valid_until?
```

**Answer:**

I will search the codebase for `invalidated_at` and `valid_until` to understand their definitions and usage.
In **engram**, the distinction between `invalidated_at` and `valid_until` follows a **bitemporal data model** that separates real-world events from the system's knowledge of those events.

### 1. `valid_until` (Domain Time / "The World")
This represents when a fact or relationship actually ceased to be true in the real world. 
*   **Example:** "Alice was the owner of the Authentication module **until** she left the team on 2026-03-01."
*   **Purpose:** It defines the logical window of truth. Engram uses half-open intervals `[valid_from, valid_until)`, where `NULL` means "still current."

### 2. `invalidated_at` (Transaction Time / "The System")
This represents the moment the system **learned** that a record was superseded or incorrect. 
*   **Example:** The system ingested a new HR export and discovered Alice's departure on 2026-04-07. The old edge's `invalidated_at` is set to that moment.
*   **Purpose:** It tracks the system's state of knowledge, allowing for "as-of" queries.

### Why track them separately?

*   **Auditability & Corrections:** It allows you to distinguish between a fact that naturally expired (the world changed) and a fact that was corrected (the system was wrong).
*   **Retrospective Queries:** You can answer: *"What did the system believe about module ownership on March 15th?"* 
    *   Even if Alice left on March 1st (`valid_until`), if the system didn't find out until April 7th (`invalidated_at`), a query "as of" March 15th would still show Alice as the owner because the system hadn't yet invalidated that belief.
*   **Immutability:** By setting `invalidated_at` instead of deleting or overwriting records, the system preserves a complete, immutable audit trail of how its understanding of the world has evolved over time.

You can find more details on this design in `docs/internal/experiments/g1-narrative-projection/results.md` (Line 201) and `docs/internal/specs/format-v0.1.md` (Line 217).

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why is invalidated_at tracked separately from valid_until?  Budget: 6000 tokens | Used: ~0 | 0 results



---

Question: Why is invalidated_at tracked separately from valid_until?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

I will investigate the codebase to determine the distinction between `invalidated_at` and `valid_until`, specifically looking for bitemporal modeling patterns in `engram-core`.

I will examine `packages/engram-core/src/graph/projections.ts` to understand how `invalidated_at` and `valid_until` are updated, and check `packages/engram-core/src/temporal/supersession.ts` for additional context.

I will check `packages/engram-core/src/temporal/supersession.ts` to see how it handles time.

I will check `packages/engram-core/src/graph/edges.ts` for schema details or comments to confirm the distinction between `valid_until` and `invalidated_at`.

Engram tracks `invalidated_at` separately from `valid_until` to implement a **bitemporal modeling pattern**, distinguishing between **Valid Time** and **Transaction (System) Time**.

**Valid Time (`valid_until`)** represents the interval during which a fact is considered true in the "real world." For example, a developer's assignment to a project might have a `valid_until` timestamp in the past if the assignment naturally ended. The system still considers this a "valid" historical fact.

**Transaction Time (`invalidated_at`)** represents when the record itself was logically deleted or superseded in the database. It acts as a soft-delete flag. If `invalidated_at` is `NULL`, the record is "active" (part of the system's current set of beliefs). If it is set, the record is considered "deleted" or "superseded," often because an error was corrected or a newer version of the fact was ingested.

This separation provides several critical benefits:
1. **Historical Auditing**: Users can query what the system *believed* was true at any specific point in the past, even if those records were later invalidated or corrected.
2. **Distinguishing Expiration from Correction**: The system can differentiate between a fact that naturally expired (past `valid_until`) and a record that was found to be incorrect or replaced (`invalidated_at` set).
3. **Supersession**: In `supersedeEdge`, both are updated: `valid_until` is closed to maintain temporal continuity with the new record, while `invalidated_at` is set to `now` to mark the old record as no longer the "current" system entry.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q04 — medium module

**Module:** `packages/engram-core/src/graph/reconcile.ts`  
**Question:** Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?

### Context pack (engram output)

```
## Context pack
> Query: Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?  Budget: 6000 tokens | Used: ~2310 | 50 results

### Entities

- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_ASSESS_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_DISCOVER_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::reconcile` **[symbol]** — score 0.837 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts` **[module]** — score 0.639 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts` **[module]** — score 0.639 | evidence: 2 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engram-core/test/graph/reconcile.test.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engramark/src/runners/stale-full-reconcile.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::validateScope` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::registerReconcile` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileProgressEvent` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconciliationRunResult` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::startReconciliationRun` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::finishReconciliationRun` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::recomputeCurrentFingerprint` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::currentInputState` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::softRefresh` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::lastNonDryRunCompletedAt` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::computeSubstrateDelta` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::loadActiveProjectionCatalog` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::validateProposal` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::sampleDelta` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::parseScopeToOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::buildNewProjectionData` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::extractFrontmatterValue` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::tmpDb` **[symbol]** — score 0.576 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::runCommand` **[symbol]** — score 0.576 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::RecordingCall` **[symbol]** — score 0.576 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_ASSESS_TIMEOUT_MS **[observed]** — score 1.000
- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_DISCOVER_TIMEOUT_MS **[observed]** — score 1.000
- DEFAULT_ASSESS_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940
- DEFAULT_DISCOVER_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940
- packages/engram-core/src/graph/reconcile.ts defines reconcile **[observed]** — score 0.675
- reconcile is defined in packages/engram-core/src/graph/reconcile.ts **[observed]** — score 0.644
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-core/src/graph/reconcile.ts co-change frequently (4 shared commits) **[inferred]** — score 0.524
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-cli/test/commands/reconcile.test.ts co-change frequently (4 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-core/test/graph/reconcile.test.ts co-change frequently (3 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/test/commands/reconcile.test.ts and packages/engram-core/src/graph/reconcile.ts co-change frequently (3 shared commits) **[inferred]** — score 0.515
- packages/engram-core/src/graph/reconcile.ts and packages/engram-core/test/graph/reconcile.test.ts co-change frequently (4 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/src/commands/reconcile.ts defines ReconcileOpts **[observed]** — score 0.512
- packages/engram-cli/src/commands/reconcile.ts defines validateScope **[observed]** — score 0.512
- packages/engram-cli/src/commands/reconcile.ts defines registerReconcile **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconcileProgressEvent **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconcileOpts **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconciliationRunResult **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines startReconciliationRun **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines finishReconciliationRun **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines recomputeCurrentFingerprint **[observed]** — score 0.512

### Evidence excerpts

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```

**source** `packages/engram-core/src/graph/reconcile.ts@bd61ebb44649ce0b` (2026-04-16):
```
/**
 * reconcile.ts — reconcile() assess + discover phases and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 *
 * ## Assess phase
 * Re-evaluates every stale active projection whose input_fingerprint has drifted.
 * For each stale projection the generator verdict determines whether to
 * softRefresh (still_accurate) or supersedeProjection (needs_update/contradicted).
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run …
```

**git_commit** `b05ddd0b049ccf87af0afa0d6caf160407649a5b` (2026-04-15 by rn.wolfe@gmail.com):
```
commit b05ddd0b049ccf87af0afa0d6caf160407649a5b
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-15T03:35:20.000Z

fix(reconcile): detect hallucinated input IDs before calling project()

Gemini sometimes invents plausible-looking ULIDs for the trailing
entries of an inputs array when a proposal needs more evidence than
the delta actually provides. Those IDs then fail resolveInputs() with
a co…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-cli/src/commands/reconcile.ts@5eacc242e06ea7` (2026-04-16):
```
/**
 * reconcile.ts — `engram reconcile` command.
 *
 * Runs the two-phase projection maintenance loop:
 *   Phase 1 (assess): checks stale projections and refreshes or supersedes them.
 *   Phase 2 (discover): finds new substrate rows not yet covered by projections.
 *
 * Usage:
 *   engram reconcile [--phase assess|discover|both] [--scope <filter>]
 *                    [--max-cost <n>] [--dry-run] [--db <path>]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from…
```

**source** `packages/engram-cli/test/commands/reconcile.test.ts@86adebd0` (2026-04-16):
```
/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "n…
```

**source** `packages/engram-core/test/graph/reconcile.test.ts@2cd2885cfc` (2026-04-16):
```
/**
 * reconcile.test.ts — tests for reconcile(), softRefresh(), and currentInputState().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  currentInputState,
  listActiveProjections,
  NullGenerat…
```

**git_commit** `6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T14:59:21.000Z

feat: discover phase, reconcile CLI, MCP projection tools, and stale-knowledge benchmark (#92)

* feat: reconcile discover phase with ProjectionGenerator.discover

Implements the discover phase of reconcile() from docs/internal/specs/projections.md
§ Operation 2. The phas…
```

**source** `packages/engramark/src/runners/stale-full-reconcile.ts@ce8b1` (2026-04-16):
```
/**
 * runners/stale-full-reconcile.ts — Full reconcile runner for stale-knowledge detection.
 *
 * Runs reconcile() assess phase on all active projections, then reports which
 * projections were flagged stale or superseded. This is the "gold standard"
 * detection path that uses an AI assess verdict to determine if content has
 * drifted beyond the fingerprint check.
 *
 * Uses NullGenerator by default — which means the assess phase uses the
 * reconcile() stale-filter (fingerprint drift) but a…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?
```

**Answer:**

I will search for the "reconcile" term in the codebase to understand its implementation and the reasoning behind its multi-phase approach.
The separation of `reconcile` into **assess** and **discover** phases is a deliberate architectural choice based on the different goals, performance characteristics, and cost profiles of each operation:

1.  **Conceptual Separation (Maintenance vs. Expansion):**
    *   **Assess** is about **correctness maintenance**. It re-evaluates existing projections to see if they have drifted from their underlying substrate (e.g., source code changed). Its job is to decide if a projection is still valid, needs a "soft refresh," or must be superseded.
    *   **Discover** is about **coverage expansion**. it looks at the "substrate delta"—newly added information since the last reconcile—and determines if new projections should be authored to cover it.

2.  **Performance and Scaling:**
    *   **Assess** scales with the number of existing active projections ($O(\text{projections})$). It performs cheap, indexed lookups on known inputs to detect staleness.
    *   **Discover** scales with the volume of new activity ($O(\text{substrate delta})$). By using a cursor (timestamp or ID) to track what has already been processed, the system avoids scanning the entire corpus on every run, which would otherwise become prohibitively expensive as the codebase grows.

3.  **Cost and Budget Management:**
    *   Both phases involve LLM calls, which carry significant token costs. Separating them allows users to prioritize maintenance (keeping existing docs correct) over expansion (generating new docs).
    *   The two-phase approach supports features like `--max-cost` ceilings and cursor-resumable runs, allowing the system to stop safely when a budget is reached and pick up exactly where it left off.

4.  **Read-Time Invariants:**
    *   Engram enforces a read-time fingerprint check for staleness. While the **Assess** phase proactively identifies these drifts, the **Discover** phase is the only way to detect "coverage drift" (i.e., new information exists that *should* be in a projection but isn't). Conflating these would require every "read" operation to scan the entire substrate for missing context, violating the system's performance goals.

In summary, separating the phases ensures that **correctness** remains cheap and frequent, while **discovery** remains bounded and proportional to new work.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?  Budget: 6000 tokens | Used: ~2310 | 50 results

### Entities

- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_ASSESS_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_DISCOVER_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::reconcile` **[symbol]** — score 0.837 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts` **[module]** — score 0.639 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts` **[module]** — score 0.639 | evidence: 2 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engram-core/test/graph/reconcile.test.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engramark/src/runners/stale-full-reconcile.ts` **[module]** — score 0.606 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::validateScope` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::registerReconcile` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileProgressEvent` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconciliationRunResult` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::startReconciliationRun` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::finishReconciliationRun` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::recomputeCurrentFingerprint` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::currentInputState` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::softRefresh` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::lastNonDryRunCompletedAt` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::computeSubstrateDelta` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::loadActiveProjectionCatalog` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::validateProposal` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::sampleDelta` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::parseScopeToOpts` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::buildNewProjectionData` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::extractFrontmatterValue` **[symbol]** — score 0.606 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::tmpDb` **[symbol]** — score 0.576 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::runCommand` **[symbol]** — score 0.576 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts::RecordingCall` **[symbol]** — score 0.576 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_ASSESS_TIMEOUT_MS **[observed]** — score 1.000
- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_DISCOVER_TIMEOUT_MS **[observed]** — score 1.000
- DEFAULT_ASSESS_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940
- DEFAULT_DISCOVER_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940
- packages/engram-core/src/graph/reconcile.ts defines reconcile **[observed]** — score 0.675
- reconcile is defined in packages/engram-core/src/graph/reconcile.ts **[observed]** — score 0.644
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-core/src/graph/reconcile.ts co-change frequently (4 shared commits) **[inferred]** — score 0.524
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-cli/test/commands/reconcile.test.ts co-change frequently (4 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/src/commands/reconcile.ts and packages/engram-core/test/graph/reconcile.test.ts co-change frequently (3 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/test/commands/reconcile.test.ts and packages/engram-core/src/graph/reconcile.ts co-change frequently (3 shared commits) **[inferred]** — score 0.515
- packages/engram-core/src/graph/reconcile.ts and packages/engram-core/test/graph/reconcile.test.ts co-change frequently (4 shared commits) **[inferred]** — score 0.515
- packages/engram-cli/src/commands/reconcile.ts defines ReconcileOpts **[observed]** — score 0.512
- packages/engram-cli/src/commands/reconcile.ts defines validateScope **[observed]** — score 0.512
- packages/engram-cli/src/commands/reconcile.ts defines registerReconcile **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconcileProgressEvent **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconcileOpts **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines ReconciliationRunResult **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines startReconciliationRun **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines finishReconciliationRun **[observed]** — score 0.512
- packages/engram-core/src/graph/reconcile.ts defines recomputeCurrentFingerprint **[observed]** — score 0.512

### Evidence excerpts

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```

**source** `packages/engram-core/src/graph/reconcile.ts@bd61ebb44649ce0b` (2026-04-16):
```
/**
 * reconcile.ts — reconcile() assess + discover phases and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 *
 * ## Assess phase
 * Re-evaluates every stale active projection whose input_fingerprint has drifted.
 * For each stale projection the generator verdict determines whether to
 * softRefresh (still_accurate) or supersedeProjection (needs_update/contradicted).
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run …
```

**git_commit** `b05ddd0b049ccf87af0afa0d6caf160407649a5b` (2026-04-15 by rn.wolfe@gmail.com):
```
commit b05ddd0b049ccf87af0afa0d6caf160407649a5b
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-15T03:35:20.000Z

fix(reconcile): detect hallucinated input IDs before calling project()

Gemini sometimes invents plausible-looking ULIDs for the trailing
entries of an inputs array when a proposal needs more evidence than
the delta actually provides. Those IDs then fail resolveInputs() with
a co…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-cli/src/commands/reconcile.ts@5eacc242e06ea7` (2026-04-16):
```
/**
 * reconcile.ts — `engram reconcile` command.
 *
 * Runs the two-phase projection maintenance loop:
 *   Phase 1 (assess): checks stale projections and refreshes or supersedes them.
 *   Phase 2 (discover): finds new substrate rows not yet covered by projections.
 *
 * Usage:
 *   engram reconcile [--phase assess|discover|both] [--scope <filter>]
 *                    [--max-cost <n>] [--dry-run] [--db <path>]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from…
```

**source** `packages/engram-cli/test/commands/reconcile.test.ts@86adebd0` (2026-04-16):
```
/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "n…
```

**source** `packages/engram-core/test/graph/reconcile.test.ts@2cd2885cfc` (2026-04-16):
```
/**
 * reconcile.test.ts — tests for reconcile(), softRefresh(), and currentInputState().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  currentInputState,
  listActiveProjections,
  NullGenerat…
```

**git_commit** `6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T14:59:21.000Z

feat: discover phase, reconcile CLI, MCP projection tools, and stale-knowledge benchmark (#92)

* feat: reconcile discover phase with ProjectionGenerator.discover

Implements the discover phase of reconcile() from docs/internal/specs/projections.md
§ Operation 2. The phas…
```

**source** `packages/engramark/src/runners/stale-full-reconcile.ts@ce8b1` (2026-04-16):
```
/**
 * runners/stale-full-reconcile.ts — Full reconcile runner for stale-knowledge detection.
 *
 * Runs reconcile() assess phase on all active projections, then reports which
 * projections were flagged stale or superseded. This is the "gold standard"
 * detection path that uses an AI assess verdict to determine if content has
 * drifted beyond the fingerprint check.
 *
 * Uses NullGenerator by default — which means the assess phase uses the
 * reconcile() stale-filter (fingerprint drift) but a…
```



---

Question: Why does reconcile separate into an assess phase and a discover phase rather than doing both in one pass?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

The `reconcile` process separates into **Assess** and **Discover** phases to maintain a clear distinction between **knowledge maintenance** and **knowledge acquisition**, as detailed in `packages/engram-core/src/graph/reconcile.ts` (Operation 2).

The **Assess phase** focuses on existing projections. It is triggered by `input_fingerprint` drift, re-evaluating whether active projections remain `still_accurate` or require supersession. This ensures the integrity of the current graph by identifying stale information. Conversely, the **Discover phase** targets "substrate rows not yet covered by projections" by computing the **substrate delta** since the last run. 

Doing both in one pass would conflate these distinct logical operations, which require different AI strategies. As seen in `gemini-generator.ts`, the system utilizes specialized prompts (`buildAssessPrompt` vs. `buildDiscoverPrompt`) and different execution constraints, evidenced by the separate `DEFAULT_ASSESS_TIMEOUT_MS` and `DEFAULT_DISCOVER_TIMEOUT_MS`. 

Furthermore, the CLI (`packages/engram-cli/src/commands/reconcile.ts`) exposes these as independent options (e.g., `--phase assess|discover`). This allows users to manage computational costs (`--max-cost`) and prioritize either the validation of existing "memory" or the ingestion of new events based on the current state of the knowledge graph. This modularity is essential for a "local-first temporal knowledge graph" where substrate data grows continuously.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q05 — medium module

**Module:** `packages/engram-core/src/graph/reconcile.ts`  
**Question:** Why does the discover phase use a substrate delta rather than scanning all episodes on every run?

### Context pack (engram output)

```
## Context pack
> Query: Why does the discover phase use a substrate delta rather than scanning all episodes on every run?  Budget: 6000 tokens | Used: ~217 | 3 results

### Entities

- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_DISCOVER_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_DISCOVER_TIMEOUT_MS **[observed]** — score 1.000
- DEFAULT_DISCOVER_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940

### Evidence excerpts

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does the discover phase use a substrate delta rather than scanning all episodes on every run?
```

**Answer:**

I will search the codebase for "discover phase" and "substrate delta" to understand the architectural reasoning behind this design choice.
The decision to use a **substrate delta** (the set of episodes, entities, or edges added since the last run) instead of scanning the entire corpus is driven by three primary architectural requirements:

### 1. Scalability and Cost Control
Scanning the entire corpus on every run would result in $O(\text{total corpus})$ complexity. As a project grows, this would lead to:
*   **Prohibitive LLM Costs:** You would be paying to re-analyze thousands of episodes that have already been processed and covered by existing projections.
*   **Increasing Latency:** The time required to run a "reconcile" would grow linearly with the age of the project, eventually becoming unusable.
By using a delta, the cost and time of the discover phase remain proportional to **recent ingest activity** rather than the total size of the history.

### 2. LLM Context Constraints
LLMs have finite context windows. Providing the entire history of a large codebase or knowledge base as "context" for a discovery prompt is impossible once the corpus exceeds a few thousand lines. The delta approach allows the system to provide high-density summaries of just the *new* information, ensuring the LLM can make informed proposals without hitting token limits.

### 3. Separation of Concerns (Assess vs. Discover)
The system distinguishes between two types of "drift":
*   **Input Drift (Staleness):** Handled by the **assess phase**, which only looks at the specific inputs of existing projections to see if they've changed. This is $O(\text{active projections})$.
*   **Coverage Drift (Gaps):** Handled by the **discover phase**, which identifies new substrate rows that aren't yet reflected in any projection. 

Since the assess phase already ensures existing projections are up-to-date with their original inputs, the discover phase only needs to look at the "unseen" substrate delta to find new connections or topics that warrant a new projection.

### 4. Resumability
Using a cursor (timestamp) for the delta allows the `reconcile` command to support a `--max-cost` budget. If the process hits its budget limit, it can stop mid-run and advance the cursor only to the point it successfully processed, ensuring no work is duplicated in the next run.

*Internal Reference: This design is documented in `docs/internal/specs/projections.md` and was validated in the `g1-narrative-projection` experiments.*

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does the discover phase use a substrate delta rather than scanning all episodes on every run?  Budget: 6000 tokens | Used: ~217 | 3 results

### Entities

- `packages/engram-core/src/ai/gemini-generator.ts::DEFAULT_DISCOVER_TIMEOUT_MS` **[symbol]** — score 1.000 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/ai/gemini-generator.ts defines DEFAULT_DISCOVER_TIMEOUT_MS **[observed]** — score 1.000
- DEFAULT_DISCOVER_TIMEOUT_MS is defined in packages/engram-core/src/ai/gemini-generator.ts **[observed]** — score 0.940

### Evidence excerpts

**source** `packages/engram-core/src/ai/gemini-generator.ts@5fae21b4a1e4` (2026-04-16):
```
/**
 * gemini-generator.ts — GeminiGenerator: projection authoring via Google Gemini.
 *
 * Uses @google/genai (already a dependency for embeddings) to call the
 * Gemini generative models API.
 *
 * Default model: gemini-2.0-flash
 * API key read from GEMINI_API_KEY env var.
 */

import type { Projection } from "../graph/projections.js";
import {
  buildAssessPrompt,
  buildDiscoverPrompt,
  buildGeneratePrompt,
  buildRegeneratePrompt,
  buildStubBody,
  parseAssessVerdict,
  parseDiscoverProp…
```



---

Question: Why does the discover phase use a substrate delta rather than scanning all episodes on every run?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

I will investigate the implementation of the discover phase and the use of substrate deltas in the `engram-core` package to provide a precise answer.
The `discover` phase utilizes a **substrate delta**—comprising episodes and entities added or superseded since the last successful run—rather than scanning the entire corpus to ensure **cost efficiency**, **context optimization**, and **architectural scaling**.

Architecturally, the `reconcile()` loop separates concerns: the **assess** phase manages staleness in existing projections, while the **discover** phase identifies new coverage opportunities. By using a delta, the system bounds the LLM's workload to recent ingest activity. This prevents discovery costs from scaling linearly with the total history size, keeping the process $O(\text{delta})$. The system persists a **cursor** in `reconciliation_runs` to track the last processed timestamp, allowing subsequent runs to focus only on unseen data.

This strategy is critical for **context management**. Providing the LLM with the full substrate would quickly exhaust token limits or degrade performance. Instead, the delta allows for high-signal prompts (constructed via `buildDiscoverPrompt`) that include summaries of new content alongside a catalog of existing projections. This constrained scope also respects operational limits like `DEFAULT_DISCOVER_TIMEOUT_MS` and `--max-cost` budgets. Ultimately, the substrate delta enables "emergent authoring"—where the LLM decides coverage based on what is new—without the redundant overhead of re-evaluating the entire knowledge graph on every execution.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q06 — medium module

**Module:** `packages/engram-core/src/graph/reconcile.ts`  
**Question:** Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?

### Context pack (engram output)

```
## Context pack
> Query: Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?  Budget: 6000 tokens | Used: ~2490 | 50 results

### Entities

- `packages/engram-cli/src/commands/project.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::reconcile` **[symbol]** — score 0.980 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts` **[module]** — score 0.948 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/project.ts::ProjectOpts` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::parseAnchor` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::parseInput` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::UsageError` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::resolveDefaultInputs` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::registerProject` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/projections.ts::project` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts::tmpDb` **[symbol]** — score 0.901 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts::captureOutput` **[symbol]** — score 0.901 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::VALID_ANCHOR_TYPES` **[symbol]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::VALID_INPUT_TYPES` **[symbol]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts` **[module]** — score 0.749 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts` **[module]** — score 0.749 | evidence: 2 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engram-core/test/graph/reconcile.test.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engramark/src/runners/stale-full-reconcile.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::validateScope` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::registerReconcile` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileProgressEvent` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconciliationRunResult` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::startReconciliationRun` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::finishReconciliationRun` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::recomputeCurrentFingerprint` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::currentInputState` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::softRefresh` **[symbol]** — score 0.710 | evidence: 1 episode(s)

### Edges

- packages/engram-cli/src/commands/project.ts and packages/engram-cli/src/commands/reconcile.ts co-change frequently (3 shared commits) **[inferred]** — score 1.000
- packages/engram-cli/src/commands/project.ts and packages/engram-cli/test/commands/project.test.ts co-change frequently (3 shared commits) **[inferred]** — score 0.832
- packages/engram-cli/src/commands/project.ts defines ProjectOpts **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines parseAnchor **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines parseInput **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines UsageError **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines resolveDefaultInputs **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines registerProject **[observed]** — score 0.828
- packages/engram-core/src/graph/projections.ts defines project **[observed]** — score 0.828
- packages/engram-core/src/graph/reconcile.ts defines reconcile **[observed]** — score 0.799
- packages/engram-cli/test/commands/project.test.ts defines tmpDb **[observed]** — score 0.799
- packages/engram-cli/test/commands/project.test.ts defines captureOutput **[observed]** — score 0.799
- ProjectOpts is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- packages/engram-cli/src/commands/project.ts defines VALID_ANCHOR_TYPES **[observed]** — score 0.772
- packages/engram-cli/src/commands/project.ts defines VALID_INPUT_TYPES **[observed]** — score 0.772
- parseAnchor is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- parseInput is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- UsageError is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- resolveDefaultInputs is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- registerProject is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772

### Evidence excerpts

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-cli/src/commands/project.ts@64fdcb3ab9129321` (2026-04-16):
```
/**
 * project.ts — `engram project` command.
 *
 * Explicitly authors a projection on a specific anchor with a specific input set.
 *
 * Usage:
 *   engram project --kind <kind> --anchor <type:id> [--input <type:id>]... [--dry-run]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type {
  AnchorType,
  EngramGraph,
  ProjectionInput,
  ProjectionInputType,
} from "engram-core";
import {
  closeG…
```

**source** `packages/engram-core/src/graph/reconcile.ts@bd61ebb44649ce0b` (2026-04-16):
```
/**
 * reconcile.ts — reconcile() assess + discover phases and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 *
 * ## Assess phase
 * Re-evaluates every stale active projection whose input_fingerprint has drifted.
 * For each stale projection the generator verdict determines whether to
 * softRefresh (still_accurate) or supersedeProjection (needs_update/contradicted).
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run …
```

**source** `packages/engram-cli/test/commands/project.test.ts@baef119058` (2026-04-16):
```
/**
 * project.test.ts — Integration and unit tests for the `engram project` command.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  listActiveProjections,
  openGraph,
} from "engram-core";
import { registerProject } from "../../src/commands/project.js";

/…
```

**source** `packages/engram-core/src/graph/projections.ts@19080a2051ae62` (2026-04-16):
```
/**
 * projections.ts — project() operation and Projection CRUD.
 *
 * Implements the explicit projection authoring primitive described in
 * docs/internal/specs/projections.md. A projection is an AI-authored synthesis
 * of substrate elements (episodes, entities, edges, or other projections).
 *
 * Types and error classes live in projections-types.ts.
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { ResolvedInput } from "../ai/projection-generator.js";
i…
```

**git_commit** `b05ddd0b049ccf87af0afa0d6caf160407649a5b` (2026-04-15 by rn.wolfe@gmail.com):
```
commit b05ddd0b049ccf87af0afa0d6caf160407649a5b
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-15T03:35:20.000Z

fix(reconcile): detect hallucinated input IDs before calling project()

Gemini sometimes invents plausible-looking ULIDs for the trailing
entries of an inputs array when a proposal needs more evidence than
the delta actually provides. Those IDs then fail resolveInputs() with
a co…
```

**source** `packages/engram-cli/src/commands/reconcile.ts@5eacc242e06ea7` (2026-04-16):
```
/**
 * reconcile.ts — `engram reconcile` command.
 *
 * Runs the two-phase projection maintenance loop:
 *   Phase 1 (assess): checks stale projections and refreshes or supersedes them.
 *   Phase 2 (discover): finds new substrate rows not yet covered by projections.
 *
 * Usage:
 *   engram reconcile [--phase assess|discover|both] [--scope <filter>]
 *                    [--max-cost <n>] [--dry-run] [--db <path>]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from…
```

**source** `packages/engram-cli/test/commands/reconcile.test.ts@86adebd0` (2026-04-16):
```
/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "n…
```

**source** `packages/engram-core/test/graph/reconcile.test.ts@2cd2885cfc` (2026-04-16):
```
/**
 * reconcile.test.ts — tests for reconcile(), softRefresh(), and currentInputState().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  currentInputState,
  listActiveProjections,
  NullGenerat…
```

**git_commit** `6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T14:59:21.000Z

feat: discover phase, reconcile CLI, MCP projection tools, and stale-knowledge benchmark (#92)

* feat: reconcile discover phase with ProjectionGenerator.discover

Implements the discover phase of reconcile() from docs/internal/specs/projections.md
§ Operation 2. The phas…
```

**source** `packages/engramark/src/runners/stale-full-reconcile.ts@ce8b1` (2026-04-16):
```
/**
 * runners/stale-full-reconcile.ts — Full reconcile runner for stale-knowledge detection.
 *
 * Runs reconcile() assess phase on all active projections, then reports which
 * projections were flagged stale or superseded. This is the "gold standard"
 * detection path that uses an AI assess verdict to determine if content has
 * drifted beyond the fingerprint check.
 *
 * Uses NullGenerator by default — which means the assess phase uses the
 * reconcile() stale-filter (fingerprint drift) but a…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?
```

**Answer:**

I will search for the definitions of `reconcile` and `project` in `packages/engram-core` to understand their relationship and validation logic.
I will read the `reconcile` function in `packages/engram-core/src/graph/reconcile.ts` and the `project` function in `packages/engram-core/src/graph/projections.ts` to examine the validation and call sequence.
I will search for the call to `project()` in `packages/engram-core/src/graph/reconcile.ts` and examine the validation logic preceding it.
I will examine the validation logic in `packages/engram-core/src/graph/reconcile.ts` around lines 565 and 955 to understand how it protects `project()` from LLM-generated errors.
I will read the `validateProposal` function in `packages/engram-core/src/graph/reconcile.ts` to see its specific checks.
`reconcile` validates proposals before calling `project()` primarily to handle **LLM-specific pathologies** (like hallucinations) in a way that preserves system observability and resilience.

While `project()` is a general-purpose primitive used by both humans (CLI) and AI, the validation in `reconcile` serves four specific goals:

1.  **Distinguishing Hallucinations from System Bugs**: In the `discover` phase, LLMs occasionally "invent" ULIDs or reference entities that aren't in the current substrate delta. If `project()` handled this, it would throw a generic "entity not found" error, which, in a production log, looks like a serious graph consistency bug or a database integrity failure. Pre-validation allows `reconcile` to log these specifically as `skipping hallucinated proposal`, making it clear the issue is the LLM's output, not the graph's state.
2.  **Context-Aware Validation**: `reconcile` knows exactly which items were in the `delta` provided to the LLM. It can verify that the LLM is only referencing "legal" IDs from that specific context. `project()` is context-agnostic; it only knows if an ID exists anywhere in the global graph, which is a much weaker check for LLM correctness.
3.  **Resilience and "Skip-and-Continue"**: `reconcile` is designed to be a robust, long-running process. By pre-validating, it can cleanly skip a single malformed or hallucinated proposal from a batch and continue with the others. While it does catch errors from `project()`, pre-validation provides a "fast-path" for known failure modes that doesn't rely on the more expensive authoring logic or generic error handling.
4.  **Historical Correction**: As noted in the project's internal docs (`DECISIONS.md` and experiment results), this was a post-incident fix (specifically commit `b05ddd0b`). The system was originally more permissive, but "Gemini inventing ULIDs" in production caused confusing crash reports that were difficult to diagnose until this pre-validation layer was added to protect the core `project()` primitive.

In short, `project()`'s job is to enforce **graph invariants**, while `reconcile`'s validation job is to filter **AI-authoring errors**.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?  Budget: 6000 tokens | Used: ~2490 | 50 results

### Entities

- `packages/engram-cli/src/commands/project.ts` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::reconcile` **[symbol]** — score 0.980 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts` **[module]** — score 0.948 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/project.ts::ProjectOpts` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::parseAnchor` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::parseInput` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::UsageError` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::resolveDefaultInputs` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::registerProject` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/projections.ts::project` **[symbol]** — score 0.948 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts::tmpDb` **[symbol]** — score 0.901 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/project.test.ts::captureOutput` **[symbol]** — score 0.901 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::VALID_ANCHOR_TYPES` **[symbol]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/project.ts::VALID_INPUT_TYPES` **[symbol]** — score 0.859 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts` **[module]** — score 0.749 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts` **[module]** — score 0.749 | evidence: 2 episode(s)
- `packages/engram-cli/test/commands/reconcile.test.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engram-core/test/graph/reconcile.test.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engramark/src/runners/stale-full-reconcile.ts` **[module]** — score 0.710 | evidence: 2 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::validateScope` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-cli/src/commands/reconcile.ts::registerReconcile` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileProgressEvent` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconcileOpts` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::ReconciliationRunResult` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::startReconciliationRun` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::finishReconciliationRun` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::recomputeCurrentFingerprint` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::currentInputState` **[symbol]** — score 0.710 | evidence: 1 episode(s)
- `packages/engram-core/src/graph/reconcile.ts::softRefresh` **[symbol]** — score 0.710 | evidence: 1 episode(s)

### Edges

- packages/engram-cli/src/commands/project.ts and packages/engram-cli/src/commands/reconcile.ts co-change frequently (3 shared commits) **[inferred]** — score 1.000
- packages/engram-cli/src/commands/project.ts and packages/engram-cli/test/commands/project.test.ts co-change frequently (3 shared commits) **[inferred]** — score 0.832
- packages/engram-cli/src/commands/project.ts defines ProjectOpts **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines parseAnchor **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines parseInput **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines UsageError **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines resolveDefaultInputs **[observed]** — score 0.828
- packages/engram-cli/src/commands/project.ts defines registerProject **[observed]** — score 0.828
- packages/engram-core/src/graph/projections.ts defines project **[observed]** — score 0.828
- packages/engram-core/src/graph/reconcile.ts defines reconcile **[observed]** — score 0.799
- packages/engram-cli/test/commands/project.test.ts defines tmpDb **[observed]** — score 0.799
- packages/engram-cli/test/commands/project.test.ts defines captureOutput **[observed]** — score 0.799
- ProjectOpts is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- packages/engram-cli/src/commands/project.ts defines VALID_ANCHOR_TYPES **[observed]** — score 0.772
- packages/engram-cli/src/commands/project.ts defines VALID_INPUT_TYPES **[observed]** — score 0.772
- parseAnchor is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- parseInput is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- UsageError is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- resolveDefaultInputs is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772
- registerProject is defined in packages/engram-cli/src/commands/project.ts **[observed]** — score 0.772

### Evidence excerpts

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-cli/src/commands/project.ts@64fdcb3ab9129321` (2026-04-16):
```
/**
 * project.ts — `engram project` command.
 *
 * Explicitly authors a projection on a specific anchor with a specific input set.
 *
 * Usage:
 *   engram project --kind <kind> --anchor <type:id> [--input <type:id>]... [--dry-run]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from "@clack/prompts";
import type { Command } from "commander";
import type {
  AnchorType,
  EngramGraph,
  ProjectionInput,
  ProjectionInputType,
} from "engram-core";
import {
  closeG…
```

**source** `packages/engram-core/src/graph/reconcile.ts@bd61ebb44649ce0b` (2026-04-16):
```
/**
 * reconcile.ts — reconcile() assess + discover phases and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 *
 * ## Assess phase
 * Re-evaluates every stale active projection whose input_fingerprint has drifted.
 * For each stale projection the generator verdict determines whether to
 * softRefresh (still_accurate) or supersedeProjection (needs_update/contradicted).
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run …
```

**source** `packages/engram-cli/test/commands/project.test.ts@baef119058` (2026-04-16):
```
/**
 * project.test.ts — Integration and unit tests for the `engram project` command.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  listActiveProjections,
  openGraph,
} from "engram-core";
import { registerProject } from "../../src/commands/project.js";

/…
```

**source** `packages/engram-core/src/graph/projections.ts@19080a2051ae62` (2026-04-16):
```
/**
 * projections.ts — project() operation and Projection CRUD.
 *
 * Implements the explicit projection authoring primitive described in
 * docs/internal/specs/projections.md. A projection is an AI-authored synthesis
 * of substrate elements (episodes, entities, edges, or other projections).
 *
 * Types and error classes live in projections-types.ts.
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { ResolvedInput } from "../ai/projection-generator.js";
i…
```

**git_commit** `b05ddd0b049ccf87af0afa0d6caf160407649a5b` (2026-04-15 by rn.wolfe@gmail.com):
```
commit b05ddd0b049ccf87af0afa0d6caf160407649a5b
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-15T03:35:20.000Z

fix(reconcile): detect hallucinated input IDs before calling project()

Gemini sometimes invents plausible-looking ULIDs for the trailing
entries of an inputs array when a proposal needs more evidence than
the delta actually provides. Those IDs then fail resolveInputs() with
a co…
```

**source** `packages/engram-cli/src/commands/reconcile.ts@5eacc242e06ea7` (2026-04-16):
```
/**
 * reconcile.ts — `engram reconcile` command.
 *
 * Runs the two-phase projection maintenance loop:
 *   Phase 1 (assess): checks stale projections and refreshes or supersedes them.
 *   Phase 2 (discover): finds new substrate rows not yet covered by projections.
 *
 * Usage:
 *   engram reconcile [--phase assess|discover|both] [--scope <filter>]
 *                    [--max-cost <n>] [--dry-run] [--db <path>]
 */

import * as path from "node:path";
import { intro, log, outro, spinner } from…
```

**source** `packages/engram-cli/test/commands/reconcile.test.ts@86adebd0` (2026-04-16):
```
/**
 * reconcile.test.ts — Integration tests for `engram reconcile` CLI command.
 *
 * Tests cover:
 * - assess phase happy path with recording-mode generator
 * - discover phase happy path
 * - --dry-run does not persist, does not advance cursor
 * - --max-cost 0 exhausts immediately, records partial run
 * - Human-readable streamed progress output
 * - Final summary prints reconciliation_runs.id
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "n…
```

**source** `packages/engram-core/test/graph/reconcile.test.ts@2cd2885cfc` (2026-04-16):
```
/**
 * reconcile.test.ts — tests for reconcile(), softRefresh(), and currentInputState().
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type {
  ActiveProjectionSummary,
  AssessVerdict,
  EngramGraph,
  Projection,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
} from "../../src/index.js";
import {
  addEdge,
  addEntity,
  addEpisode,
  closeGraph,
  createGraph,
  currentInputState,
  listActiveProjections,
  NullGenerat…
```

**git_commit** `6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3` (2026-04-13 by rnwolfe@users.noreply.github.com):
```
commit 6466c4236f767ad9c0a32b9a8d4af1728bd6e5f3
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-13T14:59:21.000Z

feat: discover phase, reconcile CLI, MCP projection tools, and stale-knowledge benchmark (#92)

* feat: reconcile discover phase with ProjectionGenerator.discover

Implements the discover phase of reconcile() from docs/internal/specs/projections.md
§ Operation 2. The phas…
```

**source** `packages/engramark/src/runners/stale-full-reconcile.ts@ce8b1` (2026-04-16):
```
/**
 * runners/stale-full-reconcile.ts — Full reconcile runner for stale-knowledge detection.
 *
 * Runs reconcile() assess phase on all active projections, then reports which
 * projections were flagged stale or superseded. This is the "gold standard"
 * detection path that uses an AI assess verdict to determine if content has
 * drifted beyond the fingerprint check.
 *
 * Uses NullGenerator by default — which means the assess phase uses the
 * reconcile() stale-filter (fingerprint drift) but a…
```



---

Question: Why does reconcile validate proposals before calling project() instead of letting project() handle bad input?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

The primary reason `reconcile` validates proposals before calling `project()` is to provide a resilience layer against AI "hallucinations," specifically regarding input identifiers. According to git commit `b05ddd0b`, the Gemini model sometimes "invents plausible-looking ULIDs" for input arrays when it perceives a need for more evidence than the provided substrate delta contains.

If these hallucinated IDs were passed directly to the `project()` primitive (defined in `packages/engram-core/src/graph/projections.ts`), they would trigger failures within `resolveInputs()` as core errors. By implementing validation within the `reconcile` loop, the system can catch these invalid references early during the "Discover" or "Assess" phases before they reach the authoring stage.

Architecturally, `project()` serves as a foundational authoring primitive for creating projections, while `reconcile` (as seen in `packages/engram-core/src/graph/reconcile.ts`) acts as the high-level orchestrator managing AI-generated verdicts. Gatekeeping at the `reconcile` layer prevents invalid AI output from polluting the authoring process or causing unhandled exceptions that might interrupt the broader reconciliation run. This separation ensures that core graph operations remain stable and predictable even when the AI generator produces ungrounded identifiers.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q07 — large module

**Module:** `packages/engram-core/src/ingest/source`  
**Question:** Why does source ingestion use a content hash in the source_ref rather than just the file path?

### Context pack (engram output)

```
## Context pack
> Query: Why does source ingestion use a content hash in the source_ref rather than just the file path?  Budget: 6000 tokens | Used: ~4219 | 50 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.565 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.540 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts::SOURCE_TYPE` **[symbol]** — score 0.350 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source` **[module]** — score 0.304 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source` **[module]** — score 0.304 | evidence: 1 episode(s)
- `packages/engram-core/test/fixtures/source-sample` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/grammars` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/queries` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/extractors` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/parser.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/test/fixtures/source-sample/.gitignore` **[module]** — score 0.272 | evidence: 1 episode(s)
- `packages/engram-core/test/fixtures/source-sample/src` **[module]** — score 0.272 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/ingest-source.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/ingest.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/extractors/typescript.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/queries/typescript.scm` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/extractor.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/grammars/MANIFEST.json` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/grammars/README.md` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/parser.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::FileEntry` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::WalkOptions` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedFile` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedDir` **[symbol]** — score 0.259 | evidence: 1 episode(s)

### Edges

- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- docs/internal/specs/source-ingestion.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.809 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion-design.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.787 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.767
- docs/internal/specs/source-ingestion-design.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.748
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 0.691
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.668
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.647
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.627
- packages/engram-core/src/ingest/source/index.ts defines SOURCE_TYPE **[observed]** — score 0.417
- SOURCE_TYPE is defined in packages/engram-core/src/ingest/source/index.ts **[observed]** — score 0.399
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/grammars **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/queries **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/extractors **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.374
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/parser.ts **[observed]** — score 0.374
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/index.ts **[observed]** — score 0.374
- packages/engram-core/test/fixtures/source-sample contains module packages/engram-core/test/fixtures/source-sample/src **[observed]** — score 0.367
- packages/engram-core/test/ingest/source contains file packages/engram-core/test/ingest/source/sweep.test.ts **[observed]** — score 0.367

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `packages/engram-core/src/ingest/source/index.ts@e3061c69c16f` (2026-04-16):
```
/**
 * ingest/source/index.ts — source-file ingestion orchestrator.
 *
 * Wires walker + parser + extractor into the engram graph with full evidence-first
 * invariant, idempotency fast path, and supersession on file change.
 *
 * In dryRun mode the walker, parser, and extractor run normally but no rows
 * are written to the database. Counts in the result reflect what would be created
 * on a fresh ingest, including module hierarchy and import edges.
 */

import path from "node:path";
import typ…
```

**source** `packages/engram-core/src/ingest/source/grammars/MANIFEST.jso` (2026-04-16):
```
{
  "typescript": {
    "version": "0.23.2",
    "commit": "f975a621f4e7f532fe322e13c4f79495e0a7b2e7",
    "source": "https://github.com/tree-sitter/tree-sitter-typescript"
  },
  "tsx": {
    "version": "0.23.2",
    "commit": "f975a621f4e7f532fe322e13c4f79495e0a7b2e7",
    "source": "https://github.com/tree-sitter/tree-sitter-typescript"
  }
}
```

**source** `packages/engram-core/test/ingest/source/sweep.test.ts@72de12` (2026-04-16):
```
/**
 * Integration tests for the sweep phase of ingestSource() — issue #101.
 *
 * Verifies that episodes for files deleted from the walk root are archived,
 * that scope enforcement prevents cross-root archiving, and that re-adding
 * a deleted file creates a fresh episode while the archived one stays put.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { E…
```

**source** `packages/engram-core/test/fixtures/source-sample/src/b.ts@8f` (2026-04-16):
```
export function hello(): string {
  return "hello from b";
}
```

**source** `packages/engram-core/src/ingest/source/queries/typescript.sc` (2026-04-16):
```
; --- Top-level declarations (unexported) ---
(program (function_declaration name: (identifier) @symbol.function))
(program (class_declaration name: (type_identifier) @symbol.class))
(program (interface_declaration name: (type_identifier) @symbol.interface))
(program (type_alias_declaration name: (type_identifier) @symbol.type))
(program (enum_declaration name: (identifier) @symbol.enum))
(program (lexical_declaration (variable_declarator name: (identifier) @symbol.const)))

; --- Exported decla…
```

**source** `packages/engram-core/src/ingest/source/extractors/typescript` (2026-04-16):
```
import path from "node:path";
import type { QueryCapture } from "../parser";

/** A top-level symbol found in a TypeScript/TSX file. */
export interface ExtractedSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "enum"
    | "const"
    | "default";
  exported: boolean;
  startByte: number;
  endByte: number;
}

/** The result of extracting symbols and imports from a single file. */
export interface ExtractedFile {
  symbols: ExtractedSymbol[];
…
```

**git_commit** `b9bf9062729f1a1075248b66f72cc077eb52a3c9` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit b9bf9062729f1a1075248b66f72cc077eb52a3c9
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:28:07.000Z

feat(ingest): sweep phase archives episodes for deleted source files (#108)

* feat(ingest): sweep phase archives episodes for deleted source files

Extends ingestSource() with a post-walk sweep pass. Every active source
episode whose walk_root metadata matches the curren…
```

**git_commit** `36c818c9ce404e16f02b15f04badd59f53f658bb` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 36c818c9ce404e16f02b15f04badd59f53f658bb
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:46:08.000Z

feat(ingest): source ingestion — tree-sitter query + TS extractor (#106)

* feat: add TypeScript tree-sitter query, runQuery method, extractor, and tests

Implements chunk 3 of source ingestion (#99): tree-sitter SCM query for
TypeScript/TSX symbols and imports, SourcePar…
```

**source** `packages/engram-core/src/ingest/source/parser.ts@2690560cd9f` (2026-04-16):
```
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { QueryCapture } from "web-tree-sitter";
import { Parser, Query, Language as TreeSitterLanguage } from "web-tree-sitter";

/** Languages supported by the source parser. */
export type Language = "typescript" | "tsx";

const GRAMMAR_FILES: Record<Language, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
};

const TS_EXTENSIONS: Set<…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**git_commit** `95189f708dc1a4421f82438cf4341a1aee218562` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 95189f708dc1a4421f82438cf4341a1aee218562
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:39:08.000Z

feat(cli): add engram ingest source subcommand (#109)

* feat(cli): add engram ingest source subcommand

Registers `engram ingest source [path]` under the existing ingest command
group. Wires ingestSource() with all five flags:

  --exclude <glob>    additional exclude (r…
```

**source** `packages/engram-cli/test/commands/ingest-source.test.ts@143e` (2026-04-16):
```
/**
 * Integration tests for `engram ingest source` CLI subcommand.
 *
 * Uses commander's .parseAsync() with a patched process.exit to exercise
 * the full action handler without exiting the test process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { closeGraph, createGraph, openGraph } from "engram-core";
import { regist…
```

**git_commit** `f76330f1bc578090ec1297229d3e5de070a513c5` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit f76330f1bc578090ec1297229d3e5de070a513c5
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:10:08.000Z

feat(ingest): source ingestion — episode/entity/edge writes + idempotency (#107)

* feat(ingest): source ingestion — episode/entity/edge writes + idempotency

Implements ingestSource() orchestrator (chunk 4 of source-ingestion epic #96).
Wires walker + parser + extractor …
```

**source** `packages/engram-core/test/ingest/source/ingest.test.ts@82bae` (2026-04-16):
```
/**
 * Integration tests for ingestSource() — chunk 4 of the source-ingestion epic.
 *
 * Uses real SQLite (:memory: via temp file) and the source-sample fixture.
 * verifyGraph() is called after each scenario to confirm evidence integrity.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/format/index.js";
import {
  closeGr…
```

**source** `packages/engram-core/test/ingest/source/extractor.test.ts@07` (2026-04-16):
```
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import {
  extractTypeScript,
  resolveImport,
} from "../../../src/ingest/source/extractors/typescript";
import { SourceParser } from "../../../src/ingest/source/parser";

// ---------------------------------------------------------------------------
// Shared parser — WASM init is expensive, create once for the whole suite.
// ---------------------------------------------------------------------------

let parser: Sou…
```

**git_commit** `3ea9360a95f8a95a6aae8a7ecaf3f6dd675c3088` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 3ea9360a95f8a95a6aae8a7ecaf3f6dd675c3088
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:31:09.000Z

feat(ingest): source ingestion — tree-sitter parser + grammar vendoring (#105)

* feat(ingest): add tree-sitter parser layer for TypeScript/TSX source ingestion

Adds SourceParser (web-tree-sitter) with vendored WASM grammars for TypeScript
and TSX (v0.23.2), languageForP…
```

**source** `packages/engram-core/src/ingest/source/grammars/README.md@4c` (2026-04-16):
```
# Vendored Tree-Sitter Grammar WASMs

Pre-built WASM grammar files for `web-tree-sitter`. These are checked in so the
parser works without a build step or internet access at runtime.

## Files

| File | Language | Source |
|------|----------|--------|
| `tree-sitter-typescript.wasm` | TypeScript | `tree-sitter/tree-sitter-typescript` |
| `tree-sitter-tsx.wasm` | TSX | `tree-sitter/tree-sitter-typescript` |

See `MANIFEST.json` for pinned version and commit.

## Updating the grammars

To rebuild …
```

**source** `packages/engram-core/test/ingest/source/parser.test.ts@d3082` (2026-04-16):
```
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  languageForPath,
  SourceParser,
} from "../../../src/ingest/source/parser";

describe("languageForPath", () => {
  it("maps .ts to typescript", () => {
    expect(languageForPath("src/foo.ts")).toBe("typescript");
  });

  it("maps .cts to typescript", () => {
    expect(languageForPath("src/foo.cts")).toBe("typescript");
  });

  it("maps .mts to typescript", () => {
    expect(languageForPath("src/foo.mts")).toBe…
```

**source** `packages/engram-core/test/ingest/source/walker.test.ts@0b1eb` (2026-04-16):
```
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type FileEntry, walk } from "../../../src/ingest/source/walker";

const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  "../../fixtures/source-sample",
);

async function collectPaths(
  opts: Parameters<typeof walk>[0],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of walk(opts))…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does source ingestion use a content hash in the source_ref rather than just the file path?
```

**Answer:**

I'll start by examining the design documentation and searching the codebase for `source_ref` to understand the rationale behind using content hashes.

Using a content hash in the `source_ref` (formatted as `${relativepath}@${blake3_hash}`) is a core architectural decision in Engram's ingestion engine. Based on the project's design specifications (specifically `docs/internal/specs/source-ingestion-design.md`), this serves several critical functions:

### 1. Performance and Idempotency ("The Fast Path")
The primary reason is to enable a "fast path" during re-runs. Because `(source_type, source_ref)` is a unique index in the database, the ingestion walker can compute the hash of a file before doing any heavy lifting.
*   **If the hash matches:** The system knows the content hasn't changed. It skips the entire extraction pipeline (no tree-sitter parsing, no entity/edge generation), which significantly reduces execution time on large codebases.
*   **If the hash differs:** The system immediately knows the file has changed and triggers a new "episode" for that file.

### 2. Temporal Versioning and Supersession
Engram treats information as a series of "episodes." By including the hash in the `source_ref`, the system can:
*   **Store history:** It can technically keep records of what a file looked like at different points in time (though current logic focuses on the most recent).
*   **Identify changes:** When a file is updated, the new hash creates a new `source_ref`. The system then uses the path prefix (the part before the `@`) to find the previous version of that file and mark it as "superseded."

### 3. Content-Addressed Substrate
The design goal (as stated in `source-ingestion-design.md`) is to have a **grounded substrate** where every symbol or module in the graph is backed by a content-addressed pointer. This ensures that the graph state is always deterministically linked to a specific version of the source code, preventing "phantom" nodes that might occur if the system only tracked paths and the underlying files were modified or deleted.

### Summary Comparison
| Feature | Path-Only `source_ref` | Path + Hash `source_ref` |
| :--- | :--- | :--- |
| **Change Detection** | Requires reading + comparing content every time. | Instant via DB lookup of the unique hash string. |
| **Parsing** | Might re-parse unchanged files unless a sidecar cache exists. | Parsing is skipped entirely for matching hashes. |
| **History** | Harder to track; one path = one row. | Multiple versions of the same path can coexist as distinct "episodes." |
| **Reliability** | Susceptible to race conditions if file changes during extraction. | Content is "locked" to the hash used for the episode. |

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does source ingestion use a content hash in the source_ref rather than just the file path?  Budget: 6000 tokens | Used: ~4219 | 50 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.565 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.540 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts::SOURCE_TYPE` **[symbol]** — score 0.350 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source` **[module]** — score 0.304 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source` **[module]** — score 0.304 | evidence: 1 episode(s)
- `packages/engram-core/test/fixtures/source-sample` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/grammars` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/queries` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/extractors` **[module]** — score 0.287 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/parser.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts` **[module]** — score 0.272 | evidence: 2 episode(s)
- `packages/engram-core/test/fixtures/source-sample/.gitignore` **[module]** — score 0.272 | evidence: 1 episode(s)
- `packages/engram-core/test/fixtures/source-sample/src` **[module]** — score 0.272 | evidence: 1 episode(s)
- `packages/engram-cli/test/commands/ingest-source.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/ingest.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/extractors/typescript.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/queries/typescript.scm` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/extractor.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/grammars/MANIFEST.json` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/grammars/README.md` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/parser.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts` **[module]** — score 0.259 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::FileEntry` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::WalkOptions` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedFile` **[symbol]** — score 0.259 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedDir` **[symbol]** — score 0.259 | evidence: 1 episode(s)

### Edges

- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- docs/internal/specs/source-ingestion.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.809 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion-design.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.787 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.767
- docs/internal/specs/source-ingestion-design.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.748
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 0.691
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.668
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.647
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.627
- packages/engram-core/src/ingest/source/index.ts defines SOURCE_TYPE **[observed]** — score 0.417
- SOURCE_TYPE is defined in packages/engram-core/src/ingest/source/index.ts **[observed]** — score 0.399
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/grammars **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/queries **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/extractors **[observed]** — score 0.382
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.374
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/parser.ts **[observed]** — score 0.374
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/index.ts **[observed]** — score 0.374
- packages/engram-core/test/fixtures/source-sample contains module packages/engram-core/test/fixtures/source-sample/src **[observed]** — score 0.367
- packages/engram-core/test/ingest/source contains file packages/engram-core/test/ingest/source/sweep.test.ts **[observed]** — score 0.367

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `packages/engram-core/src/ingest/source/index.ts@e3061c69c16f` (2026-04-16):
```
/**
 * ingest/source/index.ts — source-file ingestion orchestrator.
 *
 * Wires walker + parser + extractor into the engram graph with full evidence-first
 * invariant, idempotency fast path, and supersession on file change.
 *
 * In dryRun mode the walker, parser, and extractor run normally but no rows
 * are written to the database. Counts in the result reflect what would be created
 * on a fresh ingest, including module hierarchy and import edges.
 */

import path from "node:path";
import typ…
```

**source** `packages/engram-core/src/ingest/source/grammars/MANIFEST.jso` (2026-04-16):
```
{
  "typescript": {
    "version": "0.23.2",
    "commit": "f975a621f4e7f532fe322e13c4f79495e0a7b2e7",
    "source": "https://github.com/tree-sitter/tree-sitter-typescript"
  },
  "tsx": {
    "version": "0.23.2",
    "commit": "f975a621f4e7f532fe322e13c4f79495e0a7b2e7",
    "source": "https://github.com/tree-sitter/tree-sitter-typescript"
  }
}
```

**source** `packages/engram-core/test/ingest/source/sweep.test.ts@72de12` (2026-04-16):
```
/**
 * Integration tests for the sweep phase of ingestSource() — issue #101.
 *
 * Verifies that episodes for files deleted from the walk root are archived,
 * that scope enforcement prevents cross-root archiving, and that re-adding
 * a deleted file creates a fresh episode while the archived one stays put.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { E…
```

**source** `packages/engram-core/test/fixtures/source-sample/src/b.ts@8f` (2026-04-16):
```
export function hello(): string {
  return "hello from b";
}
```

**source** `packages/engram-core/src/ingest/source/queries/typescript.sc` (2026-04-16):
```
; --- Top-level declarations (unexported) ---
(program (function_declaration name: (identifier) @symbol.function))
(program (class_declaration name: (type_identifier) @symbol.class))
(program (interface_declaration name: (type_identifier) @symbol.interface))
(program (type_alias_declaration name: (type_identifier) @symbol.type))
(program (enum_declaration name: (identifier) @symbol.enum))
(program (lexical_declaration (variable_declarator name: (identifier) @symbol.const)))

; --- Exported decla…
```

**source** `packages/engram-core/src/ingest/source/extractors/typescript` (2026-04-16):
```
import path from "node:path";
import type { QueryCapture } from "../parser";

/** A top-level symbol found in a TypeScript/TSX file. */
export interface ExtractedSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "enum"
    | "const"
    | "default";
  exported: boolean;
  startByte: number;
  endByte: number;
}

/** The result of extracting symbols and imports from a single file. */
export interface ExtractedFile {
  symbols: ExtractedSymbol[];
…
```

**git_commit** `b9bf9062729f1a1075248b66f72cc077eb52a3c9` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit b9bf9062729f1a1075248b66f72cc077eb52a3c9
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:28:07.000Z

feat(ingest): sweep phase archives episodes for deleted source files (#108)

* feat(ingest): sweep phase archives episodes for deleted source files

Extends ingestSource() with a post-walk sweep pass. Every active source
episode whose walk_root metadata matches the curren…
```

**git_commit** `36c818c9ce404e16f02b15f04badd59f53f658bb` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 36c818c9ce404e16f02b15f04badd59f53f658bb
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:46:08.000Z

feat(ingest): source ingestion — tree-sitter query + TS extractor (#106)

* feat: add TypeScript tree-sitter query, runQuery method, extractor, and tests

Implements chunk 3 of source ingestion (#99): tree-sitter SCM query for
TypeScript/TSX symbols and imports, SourcePar…
```

**source** `packages/engram-core/src/ingest/source/parser.ts@2690560cd9f` (2026-04-16):
```
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { QueryCapture } from "web-tree-sitter";
import { Parser, Query, Language as TreeSitterLanguage } from "web-tree-sitter";

/** Languages supported by the source parser. */
export type Language = "typescript" | "tsx";

const GRAMMAR_FILES: Record<Language, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
};

const TS_EXTENSIONS: Set<…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**git_commit** `95189f708dc1a4421f82438cf4341a1aee218562` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 95189f708dc1a4421f82438cf4341a1aee218562
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:39:08.000Z

feat(cli): add engram ingest source subcommand (#109)

* feat(cli): add engram ingest source subcommand

Registers `engram ingest source [path]` under the existing ingest command
group. Wires ingestSource() with all five flags:

  --exclude <glob>    additional exclude (r…
```

**source** `packages/engram-cli/test/commands/ingest-source.test.ts@143e` (2026-04-16):
```
/**
 * Integration tests for `engram ingest source` CLI subcommand.
 *
 * Uses commander's .parseAsync() with a patched process.exit to exercise
 * the full action handler without exiting the test process.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { closeGraph, createGraph, openGraph } from "engram-core";
import { regist…
```

**git_commit** `f76330f1bc578090ec1297229d3e5de070a513c5` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit f76330f1bc578090ec1297229d3e5de070a513c5
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:10:08.000Z

feat(ingest): source ingestion — episode/entity/edge writes + idempotency (#107)

* feat(ingest): source ingestion — episode/entity/edge writes + idempotency

Implements ingestSource() orchestrator (chunk 4 of source-ingestion epic #96).
Wires walker + parser + extractor …
```

**source** `packages/engram-core/test/ingest/source/ingest.test.ts@82bae` (2026-04-16):
```
/**
 * Integration tests for ingestSource() — chunk 4 of the source-ingestion epic.
 *
 * Uses real SQLite (:memory: via temp file) and the source-sample fixture.
 * verifyGraph() is called after each scenario to confirm evidence integrity.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { EngramGraph } from "../../../src/format/index.js";
import {
  closeGr…
```

**source** `packages/engram-core/test/ingest/source/extractor.test.ts@07` (2026-04-16):
```
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import {
  extractTypeScript,
  resolveImport,
} from "../../../src/ingest/source/extractors/typescript";
import { SourceParser } from "../../../src/ingest/source/parser";

// ---------------------------------------------------------------------------
// Shared parser — WASM init is expensive, create once for the whole suite.
// ---------------------------------------------------------------------------

let parser: Sou…
```

**git_commit** `3ea9360a95f8a95a6aae8a7ecaf3f6dd675c3088` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 3ea9360a95f8a95a6aae8a7ecaf3f6dd675c3088
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:31:09.000Z

feat(ingest): source ingestion — tree-sitter parser + grammar vendoring (#105)

* feat(ingest): add tree-sitter parser layer for TypeScript/TSX source ingestion

Adds SourceParser (web-tree-sitter) with vendored WASM grammars for TypeScript
and TSX (v0.23.2), languageForP…
```

**source** `packages/engram-core/src/ingest/source/grammars/README.md@4c` (2026-04-16):
```
# Vendored Tree-Sitter Grammar WASMs

Pre-built WASM grammar files for `web-tree-sitter`. These are checked in so the
parser works without a build step or internet access at runtime.

## Files

| File | Language | Source |
|------|----------|--------|
| `tree-sitter-typescript.wasm` | TypeScript | `tree-sitter/tree-sitter-typescript` |
| `tree-sitter-tsx.wasm` | TSX | `tree-sitter/tree-sitter-typescript` |

See `MANIFEST.json` for pinned version and commit.

## Updating the grammars

To rebuild …
```

**source** `packages/engram-core/test/ingest/source/parser.test.ts@d3082` (2026-04-16):
```
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
  languageForPath,
  SourceParser,
} from "../../../src/ingest/source/parser";

describe("languageForPath", () => {
  it("maps .ts to typescript", () => {
    expect(languageForPath("src/foo.ts")).toBe("typescript");
  });

  it("maps .cts to typescript", () => {
    expect(languageForPath("src/foo.cts")).toBe("typescript");
  });

  it("maps .mts to typescript", () => {
    expect(languageForPath("src/foo.mts")).toBe…
```

**source** `packages/engram-core/test/ingest/source/walker.test.ts@0b1eb` (2026-04-16):
```
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type FileEntry, walk } from "../../../src/ingest/source/walker";

const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  "../../fixtures/source-sample",
);

async function collectPaths(
  opts: Parameters<typeof walk>[0],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of walk(opts))…
```



---

Question: Why does source ingestion use a content hash in the source_ref rather than just the file path?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

Engram’s source ingestion uses a content hash (specifically **BLAKE3 hex**, as defined in `walker.ts`) in the `source_ref` to uphold the **evidence-first invariant** and enable an **idempotency fast path**.

According to `packages/engram-core/src/ingest/source/index.ts`, the hash allows the orchestrator to determine if a file has changed since the last run. If the hash matches, the system skips expensive tree-sitter parsing and extraction. If the content has changed but the path remains the same, the hash facilitates **supersession**, allowing the temporal graph to archive the old state and create a fresh "episode" for the new version.

This approach treats code as an "authoritative substrate" (`source-ingestion.md`) where identity is derived from content rather than just location. Using only a file path would be insufficient for a temporal graph because:

1.  **Versioning:** It cannot distinguish between different versions of a file at the same path.
2.  **Move Detection:** As seen in `sweep.test.ts`, it helps the system handle files that are deleted, moved, or re-added by tracking the specific state of the data.
3.  **Integrity:** It ensures that extracted symbols and edges are tied to the exact AST they were derived from, preventing "stale knowledge" where the graph describes a file state that no longer exists.

By grounding the `source_ref` in a content hash, Engram ensures the graph remains a precise historical record of the codebase's evolution.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q08 — large module

**Module:** `packages/engram-core/src/ingest/source`  
**Question:** Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?

### Context pack (engram output)

```
## Context pack
> Query: Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?  Budget: 6000 tokens | Used: ~2323 | 49 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `.claude/skills/sweep-issues/SKILL.md` **[module]** — score 0.847 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.812 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.775 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts` **[module]** — score 0.722 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts` **[module]** — score 0.696 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::tmpDir` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::graphPath` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::graph` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::fixtureDir` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::writeFile` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::deleteFile` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::activeEpisodes` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::archivedEpisodes` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts` **[module]** — score 0.662 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::FileEntry` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::WalkOptions` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedFile` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedDir` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isBinary` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::computeBlake3Hex` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::loadGitignore` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_DIRS` **[symbol]** — score 0.630 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts::collectPaths` **[symbol]** — score 0.630 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_FILE_PATTERNS` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::BINARY_PROBE_BYTES` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts::FIXTURE_ROOT` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DEFAULT_MAX_FILE_BYTES` **[symbol]** — score 0.576 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.967
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.937
- packages/engram-core/test/ingest/source/walker.test.ts imports packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.918
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.908
- packages/engram-core/test/ingest/source/sweep.test.ts defines tmpDir **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines graphPath **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines graph **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines fixtureDir **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines writeFile **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines deleteFile **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines activeEpisodes **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines archivedEpisodes **[observed]** — score 0.870
- packages/engram-core/src/ingest/source/walker.ts defines FileEntry **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines WalkOptions **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isDeniedFile **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isDeniedDir **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isBinary **[observed]** — score 0.817

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**git_commit** `b9bf9062729f1a1075248b66f72cc077eb52a3c9` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit b9bf9062729f1a1075248b66f72cc077eb52a3c9
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:28:07.000Z

feat(ingest): sweep phase archives episodes for deleted source files (#108)

* feat(ingest): sweep phase archives episodes for deleted source files

Extends ingestSource() with a post-walk sweep pass. Every active source
episode whose walk_root metadata matches the curren…
```

**source** `packages/engram-core/test/ingest/source/sweep.test.ts@72de12` (2026-04-16):
```
/**
 * Integration tests for the sweep phase of ingestSource() — issue #101.
 *
 * Verifies that episodes for files deleted from the walk root are archived,
 * that scope enforcement prevents cross-root archiving, and that re-adding
 * a deleted file creates a fresh episode while the archived one stays put.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { E…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**source** `packages/engram-core/test/ingest/source/walker.test.ts@0b1eb` (2026-04-16):
```
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type FileEntry, walk } from "../../../src/ingest/source/walker";

const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  "../../fixtures/source-sample",
);

async function collectPaths(
  opts: Parameters<typeof walk>[0],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of walk(opts))…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?
```

**Answer:**

I will start by searching the codebase for references to "walker" and "sweep" to identify the relevant components and documentation.
I will examine the implementation in `packages/engram-core/src/ingest/source/index.ts` and `docs/internal/specs/source-ingestion-design.md` to confirm these findings and provide a detailed answer.
The walker runs a **sweep pass** after ingestion rather than tracking deletions incrementally primarily because Engram is a **local-first CLI tool** without a background daemon.

Based on the codebase and design documentation (specifically `docs/internal/specs/source-ingestion-design.md` and `packages/engram-core/src/ingest/source/index.ts`), here are the core reasons for this design choice:

1.  **Statelessness & Reliability**: Since there is no persistent process monitoring the file system (e.g., via `inotify`), the tool cannot "know" what happened while it wasn't running. An incremental approach would be fragile; if a file were deleted while the tool was closed, the database would become stale. The sweep pass provides a "self-healing" mechanism that ensures the database is always synchronized with the current state of the filesystem.
2.  **Simplicity of Implementation**: Tracking deletions incrementally requires managing an event log and handling edge cases (like move/rename operations). In contrast, the sweep is a simple set-difference operation: `[Active Episodes in DB] - [Files Visited in Current Walk] = [Deleted Files]`.
3.  **Scoping (Multi-Root Support)**: The sweep is scoped using `walk_root` metadata. As seen in `packages/engram-core/src/ingest/source/index.ts`, the query only targets episodes ingested from the specific root currently being walked:
    ```sql
    SELECT id, source_ref FROM episodes
    WHERE status = 'active'
      AND json_extract(metadata, '$.walk_root') = ?
    ```
    This prevents a targeted ingestion (e.g., running the walker on a subdirectory) from accidentally archiving files in other parts of the project or different repositories stored in the same database.
4.  **Performance**: For a CLI tool, the overhead of a sweep pass is negligible. Since the walker already maintains a set of `visitedRelPaths` in memory, the post-walk check is a fast O(N) query against the local SQLite database.
5.  **Historical Preservation**: The sweep pass doesn't hard-delete records; it updates their status to `archived`. This preserves the historical context (entities, edges, and narrative projections) associated with a file even after it is removed from the working tree, which is a core feature of Engram's "temporal graph" architecture.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?  Budget: 6000 tokens | Used: ~2323 | 49 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `.claude/skills/sweep-issues/SKILL.md` **[module]** — score 0.847 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.812 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.775 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts` **[module]** — score 0.722 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts` **[module]** — score 0.696 | evidence: 2 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::tmpDir` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::graphPath` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::graph` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::fixtureDir` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::writeFile` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::deleteFile` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::activeEpisodes` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/sweep.test.ts::archivedEpisodes` **[symbol]** — score 0.688 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts` **[module]** — score 0.662 | evidence: 2 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::FileEntry` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::WalkOptions` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedFile` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isDeniedDir` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::isBinary` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::computeBlake3Hex` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::loadGitignore` **[symbol]** — score 0.662 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_DIRS` **[symbol]** — score 0.630 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts::collectPaths` **[symbol]** — score 0.630 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_FILE_PATTERNS` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::BINARY_PROBE_BYTES` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/test/ingest/source/walker.test.ts::FIXTURE_ROOT` **[symbol]** — score 0.602 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DEFAULT_MAX_FILE_BYTES` **[symbol]** — score 0.576 | evidence: 1 episode(s)

### Edges

- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.967
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.937
- packages/engram-core/test/ingest/source/walker.test.ts imports packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.918
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.908
- packages/engram-core/test/ingest/source/sweep.test.ts defines tmpDir **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines graphPath **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines graph **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines fixtureDir **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines writeFile **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines deleteFile **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines activeEpisodes **[observed]** — score 0.870
- packages/engram-core/test/ingest/source/sweep.test.ts defines archivedEpisodes **[observed]** — score 0.870
- packages/engram-core/src/ingest/source/walker.ts defines FileEntry **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines WalkOptions **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isDeniedFile **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isDeniedDir **[observed]** — score 0.817
- packages/engram-core/src/ingest/source/walker.ts defines isBinary **[observed]** — score 0.817

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**git_commit** `b9bf9062729f1a1075248b66f72cc077eb52a3c9` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit b9bf9062729f1a1075248b66f72cc077eb52a3c9
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:28:07.000Z

feat(ingest): sweep phase archives episodes for deleted source files (#108)

* feat(ingest): sweep phase archives episodes for deleted source files

Extends ingestSource() with a post-walk sweep pass. Every active source
episode whose walk_root metadata matches the curren…
```

**source** `packages/engram-core/test/ingest/source/sweep.test.ts@72de12` (2026-04-16):
```
/**
 * Integration tests for the sweep phase of ingestSource() — issue #101.
 *
 * Verifies that episodes for files deleted from the walk root are archived,
 * that scope enforcement prevents cross-root archiving, and that re-adding
 * a deleted file creates a fresh episode while the archived one stays put.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { E…
```

**git_commit** `308bb8a025851b92d8fe5555a7cecfd050acbc7b` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit 308bb8a025851b92d8fe5555a7cecfd050acbc7b
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T15:16:08.000Z

feat(ingest): source ingestion — scaffold + file walker (#104)

* feat: optional GitHub token, clack/prompts progress UI for long-running commands

- GitHub token is now optional for public repos; 401/403 return targeted help messages
- GitHubAuthError exported from engra…
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**source** `packages/engram-core/test/ingest/source/walker.test.ts@0b1eb` (2026-04-16):
```
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type FileEntry, walk } from "../../../src/ingest/source/walker";

const FIXTURE_ROOT = path.resolve(
  import.meta.dir,
  "../../fixtures/source-sample",
);

async function collectPaths(
  opts: Parameters<typeof walk>[0],
): Promise<string[]> {
  const paths: string[] = [];
  for await (const entry of walk(opts))…
```



---

Question: Why does the walker run a sweep pass after ingestion rather than tracking deletions incrementally?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

Engram's walker utilizes a post-ingestion sweep pass rather than incremental deletion tracking to ensure robustness, maintain temporal integrity, and simplify scope enforcement. According to `docs/internal/specs/source-ingestion-design.md`, the graph is grounded in the "authoritative substrate" of the filesystem. Incremental tracking would require persistent state or complex file-system hooks to catch every deletion event, which is prone to desynchronization if the tool isn't running.

As implemented in `feat(ingest): sweep phase archives episodes` (#108), the walker identifies active files during its traversal. Once the walk completes, the sweep phase queries the SQLite database for all "active" episodes associated with the current `walk_root`. Any episode not encountered during the current walk is identified as deleted and transitioned to an "archived" status rather than being physically deleted. This preserves the temporal history of the entity while reflecting its current absence on disk.

This design choice also facilitates "scope enforcement," as noted in `sweep.test.ts`. By comparing the walk results against only those episodes tied to the specific `walk_root`, Engram avoids accidentally archiving files from other projects or roots that aren't part of the current ingestion run. This "sweep" approach ensures that at the end of every ingestion run, the graph's active state is a verified mirror of the filesystem, providing a consistent "ground truth" without the overhead of monitoring real-time file events.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---

## Q09 — large module

**Module:** `packages/engram-core/src/ingest/source`  
**Question:** Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?

### Context pack (engram output)

```
## Context pack
> Query: Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?  Budget: 6000 tokens | Used: ~2221 | 50 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.953 | evidence: 1 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.910 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_FILE_PATTERNS` **[symbol]** — score 0.832 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DEFAULT_MAX_FILE_BYTES` **[symbol]** — score 0.796 | evidence: 1 episode(s)
- `setup/create-labels.sh` **[module]** — score 0.540 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_METADATA` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGE_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TABLES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TRIGGERS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_RECONCILIATION_RUNS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES_INDEXES` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE_INDEXES` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS_TRIGGERS` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts::SOURCE_TYPE` **[symbol]** — score 0.350 | evidence: 1 episode(s)

### Edges

- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 0.910
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.880
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.852
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.826
- setup contains file setup/create-labels.sh **[observed]** — score 0.703
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/grammars **[observed]** — score 0.624
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/queries **[observed]** — score 0.624
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/extractors **[observed]** — score 0.624
- docs/internal/specs/source-ingestion.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.623 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion-design.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.606 | valid: 2026-04-14T16:49:07.000Z → present
- packages/engram-core/test/fixtures/source-sample contains module packages/engram-core/test/fixtures/source-sample/src **[observed]** — score 0.594
- docs/internal/specs/source-ingestion.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.591
- docs/internal/specs/source-ingestion-design.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.576
- packages/engram-core/src/ingest contains module packages/engram-core/src/ingest/source **[observed]** — score 0.573
- packages/engram-core/test/ingest contains module packages/engram-core/test/ingest/source **[observed]** — score 0.573
- packages/engram-core/test/fixtures/source-sample/src contains module packages/engram-core/test/fixtures/source-sample/src/nested **[observed]** — score 0.566
- packages/engram-core/test/fixtures contains module packages/engram-core/test/fixtures/source-sample **[observed]** — score 0.556
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.485

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `setup/create-labels.sh@50ae68b5bdb1018ff45e5212c7505502007aa` (2026-04-16):
```
#!/usr/bin/env bash
set -euo pipefail

# setup/create-labels.sh — Create all pipeline labels (idempotent)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/scripts/autodev/config.sh"

if [ -z "$AUTODEV_REPO" ]; then
    echo "Error: project.repo not set in forge.toml"
    exit 1
fi

create_label() {
    local name="$1" color="$2" desc="$3"
    if gh label create "$name" --repo "$AUTODEV_REPO" --color "$color" --description "$desc" 2>/dev/null; then
        echo "  Created: $name"…
```

**source** `packages/engram-core/src/ingest/source/index.ts@e3061c69c16f` (2026-04-16):
```
/**
 * ingest/source/index.ts — source-file ingestion orchestrator.
 *
 * Wires walker + parser + extractor into the engram graph with full evidence-first
 * invariant, idempotency fast path, and supersession on file change.
 *
 * In dryRun mode the walker, parser, and extractor run normally but no rows
 * are written to the database. Counts in the result reflect what would be created
 * on a fresh ingest, including module hierarchy and import edges.
 */

import path from "node:path";
import typ…
```
```

### Condition A — bare (no context)

**Prompt:**
```
Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?
```

**Answer:**

I will begin by researching the design documents to understand the architectural rationale for the multi-entity source ingestion model.
I'll read the source ingestion design documents to understand the reasoning behind the current entity structure.
The design document indicates that `ingestSource()` emits `file`, `module`, and `symbol` entities to provide a granular, source-grounded substrate for the graph, where symbols like functions or classes are individually represented and linked to their source episodes. I'll now examine `docs/internal/specs/source-ingestion.md` for further details on the rationale behind this multi-entity structure.
Source ingestion creates separate file, module, and symbol entities to provide a granular, hierarchical substrate for the engram graph. This structure enables several key capabilities:

1.  **Retrieval Quality:** Individual symbols like `validateToken` can be summarized and linked directly, rather than requiring the system to surface and analyze entire files for every query.
2.  **Hierarchical Synthesis:** It supports the "Karpathy-wiki" vision by establishing a clear `symbol → file → module` hierarchy, which is used to automatically generate a structured overview of the codebase.
3.  **Cross-Source Evidence:** It allows the graph to link structural code data (from tree-sitter) with historical git data (commits, blame) at the appropriate level of granularity, grounding every entity in an evidence-backed source episode.
4.  **Projection Precision:** Projections and AI-generated summaries can be targeted at specific symbols, which would be impossible if the system only recognized files as its finest unit of code.

I'll now briefly examine the implementation in `packages/engram-core/src/ingest/source/extractors/typescript.ts` to see how these entities are created and linked.
The code confirms that `extractTypeScript` identifies symbols and their types within a file. I'll now examine `packages/engram-core/src/ingest/source/index.ts` to see how the orchestrator `ingestSource` handles the creation of these entities in the database.
Source ingestion creates separate **file**, **module**, and **symbol** entities—rather than a single entity per file—to establish a granular and hierarchical substrate for the engram graph. This design is driven by several architectural goals:

### 1. Granular Retrieval and Summarization
By representing individual symbols (functions, classes, etc.) as distinct entities, Engram can provide more precise answers to developer queries. For example, instead of surfacing an entire 500-line file to explain what `validateToken` does, the system can target the specific `symbol` entity, its source code, and its individual summary.

### 2. Hierarchical Synthesis (The "Karpathy Wiki")
A core goal of the project is to automatically synthesize a hierarchical overview of the codebase (`symbol → file → module → system`). 
- **Module entities** represent the directory structure.
- **File entities** represent the files within those directories.
- **Symbol entities** represent the logical declarations within those files.
Separating these allows the graph to explicitly model relationships like `module contains file` and `file contains symbol`, which the "reconcile" phase uses to build a structured, wiki-like interface.

### 3. Evidence-First Cross-Linking
Engram grounds every entity in an "evidence-backed" source episode. 
- **Git Ingestion** creates historical episodes (commits, blame).
- **Source Ingestion** creates structural entities (symbols, files).
Having separate entities allows the graph to link a `commit` from git and a `symbol` from tree-sitter to the same `file` entity. This merges historical "who changed this" data with structural "what is this" data at the most useful level of granularity.

### 4. Relational Modeling
Separate entities enable the modeling of complex code relationships that a file-only model would obscure:
- **`file → imports → file`**: Resolved import dependencies.
- **`symbol → defined_in → file`**: Ownership and location.
- **Future Call Graphs**: Preparing for `symbol → calls → symbol` edges, which require individual symbols to be addressable nodes in the graph.

In summary, a file-only model would be too coarse for the "developer-native" intelligence Engram aims to provide; the multi-entity approach ensures the graph matches the way developers actually think about and navigate code.

### Condition B — with engram context

**Prompt:**
```
You are answering a question about the engram codebase — a local-first temporal knowledge graph for developer memory. The following context pack was assembled from the codebase's knowledge graph:

## Context pack
> Query: Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?  Budget: 6000 tokens | Used: ~2221 | 50 results

### Entities

- `docs/internal/specs/source-ingestion.md` **[module]** — score 1.000 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS` **[symbol]** — score 0.953 | evidence: 1 episode(s)
- `docs/internal/specs/source-ingestion-design.md` **[module]** — score 0.945 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_INGESTION_RUNS_INDEXES` **[symbol]** — score 0.910 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DENY_FILE_PATTERNS` **[symbol]** — score 0.832 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/walker.ts::DEFAULT_MAX_FILE_BYTES` **[symbol]** — score 0.796 | evidence: 1 episode(s)
- `setup/create-labels.sh` **[module]** — score 0.540 | evidence: 2 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_METADATA` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS` **[symbol]** — score 0.407 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITIES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EPISODES_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EDGE_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_EMBEDDINGS_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TABLES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_FTS_TRIGGERS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_INDEXES` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_RECONCILIATION_RUNS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS` **[symbol]** — score 0.388 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_ENTITY_ALIASES_INDEXES` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTION_EVIDENCE_INDEXES` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/format/schema.ts::CREATE_PROJECTIONS_FTS_TRIGGERS` **[symbol]** — score 0.370 | evidence: 1 episode(s)
- `packages/engram-core/src/ingest/source/index.ts::SOURCE_TYPE` **[symbol]** — score 0.350 | evidence: 1 episode(s)

### Edges

- docs/internal/specs contains file docs/internal/specs/source-ingestion.md **[observed]** — score 1.000
- docs/internal/specs contains file docs/internal/specs/source-ingestion-design.md **[observed]** — score 0.967
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS **[observed]** — score 0.910
- packages/engram-core/src/format/schema.ts defines CREATE_INGESTION_RUNS_INDEXES **[observed]** — score 0.880
- CREATE_INGESTION_RUNS is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.852
- CREATE_INGESTION_RUNS_INDEXES is defined in packages/engram-core/src/format/schema.ts **[observed]** — score 0.826
- setup contains file setup/create-labels.sh **[observed]** — score 0.703
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/grammars **[observed]** — score 0.624
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/queries **[observed]** — score 0.624
- packages/engram-core/src/ingest/source contains module packages/engram-core/src/ingest/source/extractors **[observed]** — score 0.624
- docs/internal/specs/source-ingestion.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.623 | valid: 2026-04-14T16:49:07.000Z → present
- docs/internal/specs/source-ingestion-design.md was authored/modified by rnwolfe@users.noreply.github.com in commit a65fb24f **[observed]** — score 0.606 | valid: 2026-04-14T16:49:07.000Z → present
- packages/engram-core/test/fixtures/source-sample contains module packages/engram-core/test/fixtures/source-sample/src **[observed]** — score 0.594
- docs/internal/specs/source-ingestion.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.591
- docs/internal/specs/source-ingestion-design.md is likely owned by rnwolfe@users.noreply.github.com (recency-weighted score: 0.990) **[inferred]** — score 0.576
- packages/engram-core/src/ingest contains module packages/engram-core/src/ingest/source **[observed]** — score 0.573
- packages/engram-core/test/ingest contains module packages/engram-core/test/ingest/source **[observed]** — score 0.573
- packages/engram-core/test/fixtures/source-sample/src contains module packages/engram-core/test/fixtures/source-sample/src/nested **[observed]** — score 0.566
- packages/engram-core/test/fixtures contains module packages/engram-core/test/fixtures/source-sample **[observed]** — score 0.556
- packages/engram-core/src/ingest/source contains file packages/engram-core/src/ingest/source/walker.ts **[observed]** — score 0.485

### Evidence excerpts

**git_commit** `a65fb24f9ba3838dc069db396e06de11f80d0815` (2026-04-14 by rnwolfe@users.noreply.github.com):
```
commit a65fb24f9ba3838dc069db396e06de11f80d0815
Author: Ryan <rnwolfe@users.noreply.github.com>
Date: 2026-04-14T16:49:07.000Z

docs(ingest): source ingestion docs, spec status, self-ingest verification (#110)

* docs(ingest): source ingestion docs, spec status, self-ingest verification

- README: add Source code ingestion section under Ingestion with usage examples
- CLAUDE.md: add source/ subtre…
```

**source** `docs/internal/specs/source-ingestion.md@a045822c2a66bf97267f` (2026-04-16):
```
# Source Code Ingestion — Spec

**Phase**: 2 (growth)
**Status**: Implemented
**Proposed**: 2026-04-14
**Implemented**: 2026-04-14
**Vision fit**: Completes Principle 6 — "Developer-native. First-class ingestors understand git and code." Today engram understands git (commits, blame, co-change) but not code — entities exist because commits mentioned them, not because files were parsed. This spec closes the gap by adding AST-driven ingestion that grounds the graph in the authoritative substrate: t…
```

**source** `packages/engram-core/src/format/schema.ts@98a8dcd28e5d88a436` (2026-04-16):
```
/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     T…
```

**source** `docs/internal/specs/source-ingestion-design.md@e963620e17fb9` (2026-04-16):
```
# Source Code Ingestion — Design

**Companion to**: [`source-ingestion.md`](source-ingestion.md)
**Status**: Implemented
**Authored**: 2026-04-14

This document is the implementation plan behind the source-ingestion spec. The spec defines the contract (what ships, what it guarantees, acceptance criteria). This document defines *how* it's built: module internals, data flow, trade-offs, alternatives considered, and the sequence of work.

## Problem restated

The engram graph today is populated by …
```

**source** `packages/engram-core/src/ingest/source/walker.ts@fd7f400ca18` (2026-04-16):
```
import * as fs from "node:fs";
import * as path from "node:path";
import { blake3 } from "@noble/hashes/blake3";
import { bytesToHex } from "@noble/hashes/utils";
import ignore, { type Ignore } from "ignore";

export interface FileEntry {
  relPath: string; // posix, relative to root
  absPath: string;
  contentHash: string; // blake3 hex
  size: number;
  body: string;
}

export interface WalkOptions {
  root: string;
  exclude?: string[];
  respectGitignore?: boolean; // default true
  maxFile…
```

**git_commit** `20d879c2f0478c692d782bcd0335f165688a385c` (2026-04-07 by rn.wolfe@gmail.com):
```
commit 20d879c2f0478c692d782bcd0335f165688a385c
Author: Ryan Wolfe <rn.wolfe@gmail.com>
Date: 2026-04-07T03:27:10.000Z

chore: initialize project from forge template

Co-Authored-By: Claude <noreply@anthropic.com>

Files:
.claude/settings.json
.claude/skills/autodev/SKILL.md
.claude/skills/await-ci/SKILL.md
.claude/skills/brainstorm/SKILL.md
.claude/skills/dispatch/SKILL.md
.claude/skills/draft-is…
```

**source** `setup/create-labels.sh@50ae68b5bdb1018ff45e5212c7505502007aa` (2026-04-16):
```
#!/usr/bin/env bash
set -euo pipefail

# setup/create-labels.sh — Create all pipeline labels (idempotent)

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$REPO_ROOT/scripts/autodev/config.sh"

if [ -z "$AUTODEV_REPO" ]; then
    echo "Error: project.repo not set in forge.toml"
    exit 1
fi

create_label() {
    local name="$1" color="$2" desc="$3"
    if gh label create "$name" --repo "$AUTODEV_REPO" --color "$color" --description "$desc" 2>/dev/null; then
        echo "  Created: $name"…
```

**source** `packages/engram-core/src/ingest/source/index.ts@e3061c69c16f` (2026-04-16):
```
/**
 * ingest/source/index.ts — source-file ingestion orchestrator.
 *
 * Wires walker + parser + extractor into the engram graph with full evidence-first
 * invariant, idempotency fast path, and supersession on file change.
 *
 * In dryRun mode the walker, parser, and extractor run normally but no rows
 * are written to the database. Counts in the result reflect what would be created
 * on a fresh ingest, including module hierarchy and import edges.
 */

import path from "node:path";
import typ…
```



---

Question: Why does source ingestion create separate file, module, and symbol entities rather than one entity per file?

Answer concisely in 150-250 words, grounding your answer in the specific evidence above where possible.
```

**Answer:**

Engram’s source ingestion creates separate **file**, **module**, and **symbol** entities to provide a high-fidelity, AST-driven representation of the codebase. As noted in `source-ingestion.md`, this transition from commit-based mentions to explicit parsing "grounds the graph in the authoritative substrate."

By decomposing a file into its constituent parts, Engram achieves several architectural goals:

1.  **Structural Precision:** According to `ingest/source/index.ts`, the orchestrator wires together walkers and extractors to capture the "module hierarchy and import edges." A single file entity cannot represent these internal relationships, such as which specific function (symbol) depends on another across module boundaries.
2.  **Temporal Granularity:** Engram is a temporal knowledge graph. Tracking symbols as distinct entities allows the system to follow the evolution of a specific class or function even if it is refactored or moved between files. This fulfills the "Developer-native" principle by understanding code at the level developers actually work: the symbol.
3.  **Enhanced Retrieval:** The `schema.ts` defines a generic `entities` table where `entity_type` distinguishes these layers. This enables precise semantic search and evidence-linking. Instead of returning a large file as a search result, Engram can pinpoint the exact symbol relevant to a query, providing more focused context for developer memory and AI tools.

### Grade

*[ ] Context clearly helps*  *[ ] No meaningful difference*  *[ ] Context adds noise*

Notes:

---
