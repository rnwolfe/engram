# Bus Factor / Ownership Risk Report — Spec

**Phase**: 1 (completion → Phase 2 gateway)
**Status**: Draft
**Proposed**: 2026-04-07
**Vision fit**: Advances principle 2 ("compositional queries across signals") and delivers the flagship example called out in `docs/internal/VISION.md` prior art section — the "who is the last person who touched this, and are they still around?" query that motivated the project.

## Strategic Rationale

Engram has all the raw signals for ownership risk analysis:

- `likely_owner_of` edges with confidence scores (from git blame concentration)
- `authored_by` edges (every commit → committer)
- `co_changes_with` edges (structural coupling between files)
- Decay detection: `concentrated-risk`, `dormant`, `stale`, `orphaned`
- Temporal validity windows on every edge (so "still active" is a real query, not a guess)

But **there is no single command that answers the actual question**: *which parts of my codebase are one-person-deep, and is that person still contributing?*

Today you'd have to:
1. Run `engram decay --type concentrated-risk` to find concentration hotspots.
2. Cross-reference with `engram search "<entity>"` to find the owner.
3. Check `engram history <edge>` to see if the ownership is still current.
4. Manually correlate timestamps to judge whether the owner is dormant.

That's four commands producing four disjoint outputs. A human can do it; an agent won't bother; a team lead won't do it regularly. The signal decays into noise.

This spec collapses those signals into a single report that's **the exact thing the vision promised**. It's also the feature that makes engram's value obvious in a demo: "here are the five files in your repo that only one person understands, and three of them haven't committed in 6 months."

**Caveat (per user note 2026-04-07)**: the engram repo itself is too small and single-owner to provide a meaningful test case. This feature needs to be validated against a real multi-contributor repo (Fastify is the natural choice, since it's already the EngRAMark target).

## What It Does

Adds a new command `engram ownership` (and equivalent MCP tool `engram_ownership_report`) that computes a ranked list of ownership-risk entities by combining decay signals with ownership-edge analysis.

```bash
engram ownership                       # Top 20 risks, default thresholds
engram ownership --limit 50            # More results
engram ownership --module lib/core     # Scope to a subtree
engram ownership --format json         # Machine-readable output
engram ownership --min-confidence 0.5  # Filter weak ownership signals
```

Example output (text format):

```
Ownership risk report — 2026-04-07

🔴 CRITICAL (3)
  lib/auth/token.ts
    Owner: @mcollina (confidence 0.89)
    Status: dormant — last commit 247 days ago
    Coupling: 14 co_changes_with edges (high blast radius)

  lib/schema/validator.ts
    Owner: @alice (confidence 0.76)
    Status: concentrated-risk — 91% of commits from one person
    Coupling: 8 co_changes_with edges

  ...

🟡 ELEVATED (12)
  ...

🟢 STABLE — not shown (use --all to include)
```

JSON format returns structured records for agent consumption.

## Command Surface / API Surface

| Surface | Entry point | Purpose |
|---------|-------------|---------|
| Core API | `getOwnershipReport(graph, opts): OwnershipReport` | Compute report from signals |
| CLI | `engram ownership [flags]` | Human-readable or JSON report |
| MCP | `engram_ownership_report` | Same, for agent consumption |

### Core API signature (sketch)

```ts
interface OwnershipReportOpts {
  limit?: number;              // default 20
  module?: string;             // path prefix filter
  min_confidence?: number;     // default 0.1 (likely_owner_of edges are low-confidence by design)
  dormant_days?: number;       // default 180
  valid_at?: string;           // temporal snapshot, default "now"
}

interface OwnershipRiskEntry {
  entity: Entity;
  risk_level: "critical" | "elevated" | "stable";
  owner: { entity: Entity; confidence: number } | null;
  signals: {
    concentrated_risk: boolean;
    dormant: boolean;
    days_since_last_activity: number | null;
    coupling_count: number;   // co_changes_with edge count
  };
  evidence_ids: string[];     // pointers back to episodes
}

interface OwnershipReport {
  generated_at: string;
  entries: OwnershipRiskEntry[];
  summary: { critical: number; elevated: number; stable: number };
}
```

## Architecture / Design

- **Module location**: `packages/engram-core/src/retrieval/ownership.ts` — new file. Sits alongside `decay.ts` since they share signal sources.
- **Algorithm**: compose existing operations; no new graph primitives.
  1. Start from `getDecayReport(graph, { types: ["concentrated-risk", "dormant", "orphaned"] })`.
  2. For each candidate entity, find its strongest active `likely_owner_of` edge.
  3. For the owner entity, find the most recent `authored_by` edge to compute "days since last activity."
  4. Count `co_changes_with` edges to quantify blast radius.
  5. Classify: `critical` = dormant owner + high coupling; `elevated` = concentrated risk or medium coupling; `stable` = otherwise.
- **CLI wiring**: `packages/engram-cli/src/commands/ownership.ts` — parses flags, calls core API, renders via `@clack/prompts` (text) or `JSON.stringify` (json).
- **MCP wiring**: `packages/engram-mcp/src/tools/ownership.ts` — returns structured JSON, respects response-size budget.

### Integration points

- **`decay`**: this is the consumer story for decay detection. Decay finds the signals; ownership composes them into a decision.
- **Graph traversal tools** (MCP spec in `mcp-graph-traversal-tools.md`): an agent can use `engram_ownership_report` to find risks, then `engram_get_neighbors` to explore the blast radius of each one.
- **Evidence chain**: every risk entry carries `evidence_ids` so the caller can drill down to the underlying git commits and PRs.

### Risk classification thresholds (initial defaults)

| Level | Criteria |
|-------|----------|
| critical | Dormant owner (>180 days) **AND** (concentrated-risk OR coupling ≥ 10) |
| elevated | Concentrated-risk owner **OR** dormant owner **OR** coupling ≥ 10 |
| stable | Otherwise |

Thresholds are constants initially. Make them CLI flags if usage justifies it.

### Security

- Read-only analysis. No new attack surface.
- No PII beyond what's already in the graph (git author names/emails from commits).

### Performance

- The expensive work (decay detection, blame concentration) is already done. This pass is O(candidates × avg_edges_per_entity), where candidates ≈ decay report size (tens to low thousands for Fastify-scale repos).
- Measure against Fastify in EngRAMark to confirm the report runs in <1s on a realistic graph.

## Dependencies

- **Internal**: `getDecayReport` (shipped), `findEdges` (shipped), `getEntity` (shipped), temporal model (shipped).
- **External**: none.
- **Blocked by**: nothing. Optionally synergizes with MCP graph traversal tools (separate spec) but does not depend on them.

## Acceptance Criteria

- [ ] `getOwnershipReport` returns ranked entries for a graph with known concentration and dormancy.
- [ ] Critical / elevated / stable classification matches documented thresholds.
- [ ] `--module` flag scopes correctly to a path prefix.
- [ ] `--min-confidence` filters out weak ownership edges.
- [ ] `--format json` emits valid JSON parseable by downstream tools.
- [ ] Dormant-owner detection uses the most recent `authored_by` edge timestamp, not entity `updated_at`.
- [ ] Every risk entry includes at least one `evidence_id` pointing to a real episode (evidence invariant).
- [ ] MCP tool returns the same structured report and honors response budget.
- [ ] CLI output is readable without a terminal emulator (no ANSI color in `--format json`).
- [ ] Unit tests cover: happy path, empty graph, all-stable graph, module filter, temporal `valid_at`.
- [ ] Benchmark run on Fastify completes in <1s and produces non-empty results.
- [ ] Documentation: CLI README updated with example usage.

## Out of Scope

- **Team-level aggregation** — "what does team X own?" requires team membership, which is Phase 2.
- **Predictive models** — this is a descriptive report, not a forecast. No ML.
- **Remediation suggestions** — report surfaces risks; it doesn't recommend reassignment.
- **Historical trends** — "how has our bus factor changed over time?" is Phase 2. This spec is a point-in-time snapshot.
- **Custom risk rules** — thresholds are constants. User-definable rules are Phase 2 if demanded.
- **Testing on engram's own repo** — single owner, insufficient signal. Validate against Fastify via EngRAMark.

## Documentation Required

- [ ] New CLI command documented in `packages/engram-cli/README.md`
- [ ] New MCP tool documented in CLAUDE.md MCP section
- [ ] Example invocation in main README "what can engram do?" section
- [ ] Spec marked `Implemented` when shipped
