# MCP Graph Traversal Tools — Spec

**Phase**: 1 (completion)
**Status**: Draft
**Proposed**: 2026-04-07
**Vision fit**: Advances principle 2 — "compositional queries across signals" — by exposing the graph's structural operations (neighborhood, edge-filter, path) through the MCP surface so agents can actually compose them.

## Strategic Rationale

`engram-core` has a complete graph traversal API: `getNeighbors`, `findEdges`, `getPath`. The CLI uses it. `search()` uses it internally (entity-anchored retrieval, #42). The EngRAMark runners use it directly. But the **MCP server does not expose any of it**.

Today an MCP client has six tools: `search`, `context`, `get_entity`, `add_entity`, `add_edge`, `history`, `decay`. Every one of them is either text-first or CRUD. There is no way for an agent to ask:

- "What entities are connected to `auth/token.ts` within 2 hops?"
- "Show me every `likely_owner_of` edge for `@mcollina`."
- "What's the shortest path between `fastify` and `schema-ref-resolver`?"

These are the exact questions the graph was built to answer. Without MCP tools, the engine's structural capabilities are invisible to the primary consumer (Claude Code, Cursor, any MCP agent).

This is the cheapest, highest-leverage Phase 1 gap: the logic already exists, each tool is a thin wrapper (~80-120 lines per tool including schema + handler + tests), and it immediately unlocks compositional agent workflows that today require bouncing through `search()` and hoping entity anchoring kicks in.

## What It Does

Adds three new MCP tools that wrap the existing `engram-core` graph operations. Agents can directly request neighborhood expansion, edge filtering, or path-finding without routing through text search.

Example interactions (conceptual, via an MCP client):

```
> engram_get_neighbors { entity: "auth/token.ts", depth: 2 }
Returns: { entities: [...], edges: [...] } — subgraph centered on the anchor

> engram_find_edges { source: "@mcollina", relation_type: "likely_owner_of", active_only: true }
Returns: [{ target: "lib/reply.js", confidence: 0.032, ... }, ...]

> engram_get_path { from: "fastify", to: "schema-ref-resolver" }
Returns: { path: [entity, edge, entity, edge, entity], length: 2 }
```

## Command Surface / API Surface

| Tool | Wraps | Purpose |
|------|-------|---------|
| `engram_get_neighbors` | `getNeighbors(graph, id, { depth, valid_at? })` | Return subgraph within N hops of an anchor entity |
| `engram_find_edges` | `findEdges(graph, { source_id?, target_id?, relation_type?, active_only, valid_at? })` | Filter edges by source/target/relation/time |
| `engram_get_path` | `getPath(graph, from_id, to_id, { max_depth? })` | Shortest path between two entities via BFS |

Each tool:
- Accepts either `entity_id` or `canonical_name` for convenience (resolves via `resolveEntity` when a name is given).
- Returns structured JSON (not formatted text) — callers compose further.
- Respects existing temporal model: `valid_at` optional, defaults to "now".
- Enforces a response-size budget (similar to `context`) to prevent runaway subgraphs.

## Architecture / Design

- **Module location**: `packages/engram-mcp/src/tools/traversal.ts` — single file, three exported tool constants + handlers, following the pattern of `entity.ts`.
- **Registration**: add to the tool list in `packages/engram-mcp/src/server.ts`.
- **No new core APIs**: all three operations already exist and are tested.
- **Input validation**: reject missing IDs, invalid depths (>5), unknown relation types. Fail loud; MCP clients expect structured errors.
- **Response budget**: cap results at 200 entities + 500 edges per call. If exceeded, return a truncation flag so the agent knows to narrow the query. Reuses the truncation pattern from the `context` tool.
- **Entity name resolution**: when given `canonical_name` instead of `entity_id`, call `resolveEntity` first. If resolution fails, return a structured "not_found" error — don't guess.

### Integration points

- `search` already does entity-anchored retrieval under the hood (#42). `get_neighbors` is the **explicit** version of that — useful when the agent has already resolved the entity and wants a pure structural expansion without FTS noise.
- `context` can internally call `get_neighbors` to build evidence packs around a topic entity.
- `decay` results (stale, dormant, orphaned entities) become directly actionable: the agent can call `get_neighbors` on a dormant entity to see what's around it before deciding to archive.

### Security

- No new attack surface: all three operations are read-only.
- Entity IDs and canonical names come from the graph; there's no arbitrary SQL or file access.
- Depth cap prevents pathological traversals on dense subgraphs.

### Performance

- `getNeighbors(depth: 2)` on Fastify's graph is sub-millisecond in EngRAMark measurements.
- Depth 3+ on large repos could touch thousands of entities — the response-size budget is the real limiter, not traversal time.

## Dependencies

- **Internal**: `engram-core` graph traversal (shipped), `resolveEntity` (shipped), MCP server scaffolding (shipped).
- **External**: none.
- **Blocked by**: nothing. This is purely additive.

## Acceptance Criteria

- [ ] `engram_get_neighbors` returns a subgraph for a valid entity ID and for a canonical name.
- [ ] `engram_find_edges` filters correctly by `source_id`, `target_id`, `relation_type`, and `active_only`.
- [ ] `engram_get_path` returns the shortest path between two connected entities, and `null` when no path exists.
- [ ] Each tool rejects invalid inputs with a structured error (unknown entity, depth out of range, etc.).
- [ ] Response budget enforced: over-limit responses include `truncated: true` and a summary count.
- [ ] `canonical_name` input resolves via `resolveEntity` and returns a clear error on miss (not a silent null).
- [ ] `valid_at` parameter respected for temporal snapshots.
- [ ] Unit tests for each tool covering happy path, not-found, truncation, and temporal filtering.
- [ ] MCP server registers all three tools and reports them via `tools/list`.
- [ ] CLAUDE.md updated with the new tools under the MCP section.

## Out of Scope

- **No new traversal algorithms** — weighted paths, k-shortest-paths, community detection are Phase 2.
- **No mutation tools** — this spec is read-only. Write tools (`add_edge`, etc.) already exist.
- **No formatted-text rendering** — results are structured JSON. Any human-readable formatting is the client's job.
- **No cross-graph traversal** — single `.engram` file per session (same as today).

## Documentation Required

- [ ] MCP tools list in CLAUDE.md updated with three new entries
- [ ] Spec marked `Implemented` when shipped
- [ ] Brief example in `packages/engram-mcp/README.md` (if one exists) showing a neighbor query
