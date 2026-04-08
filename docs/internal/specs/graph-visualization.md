# Graph Visualization — Spec

**Phase**: 2 (first deliverable)
**Status**: Implemented
**Proposed**: 2026-04-08
**Vision fit**: Advances principles 2 ("compositional queries across signals") and 6 ("every claim has provenance") by making the graph visible — turning the abstract promise of a "temporal knowledge graph" into a surface a human can point at. Also delivers the explicit Phase 2 line item from `docs/internal/VISION.md`: "Rich TUI and graph visualization."

## Strategic Rationale

Engram's value is three things users cannot see from a CLI output:

1. **Shape** — which entities cluster, which are bridges, which are orphans.
2. **Time** — edges have validity windows; facts supersede other facts. Today this is buried in `engram history`.
3. **Provenance** — every edge traces back to episodes. Today it's `engram show` + copy-paste.

A text-only interface forces the user to mentally reconstruct all three from disjoint command outputs. That's fine for power users who already trust the engine. It is a dead end for onboarding, demos, incident response, and any workflow where the question is "what does this codebase *look* like?"

The market signal is clear: Obsidian, Sourcegraph, Gephi, and every modern graph database ships a visualization because **graphs are a spatial data structure and the terminal is not a spatial medium**. A node-link diagram with 372 nodes (Fastify's active graph) is instantly legible in a browser and incomprehensible in a terminal.

This spec is the cheapest-possible-web-view that delivers:

- The "wow" demo moment (run one command, see your codebase)
- A click-through surface for the bus-factor / ownership report (#45)
- A visual home for the graph traversal operations exposed via MCP (#44)
- A time slider that shows off the temporal model in a way nothing else does

## What It Does

Adds a new command `engram visualize` that starts a tiny local HTTP server bundled with the CLI, prints the URL, and waits for the user to open it. The browser UI loads a force-directed render of the active graph with filters, a time slider, search-to-focus, entity/edge detail panels with full evidence drill-down, and a decay overlay.

```bash
engram visualize                           # starts on 127.0.0.1:7878, prints URL
engram visualize --port 9000               # custom port
engram visualize --host 0.0.0.0            # bind all interfaces (for screen recording / demos)
engram visualize --db path/to/.engram      # custom database
engram visualize --read-only               # disable any interactions that mutate (default for v1 anyway)
```

The CLI prints exactly one actionable line and then blocks until Ctrl+C:

```
engram visualize
  Graph: /path/to/.engram (372 entities, 742 edges)
  URL:   http://127.0.0.1:7878
  (press Ctrl+C to stop)
```

No auto-open. The user copies the URL, opens a browser, and sees:

- **Main canvas**: cytoscape.js force-directed layout of all active entities + edges.
- **Left sidebar**: filters (entity type, edge relation type, edge kind, decay status), search input.
- **Right sidebar**: entity/edge detail panel, including evidence chain with clickable episode references.
- **Bottom**: time slider (drag to change `valid_at`; graph re-renders with edges valid at that instant).
- **Toolbar**: layout selector, zoom-to-fit, decay overlay toggle, legend.

## Command Surface / API Surface

### CLI

| Flag | Default | Purpose |
|------|---------|---------|
| `--db <path>` | `.engram` | Database file |
| `--port <n>` | `7878` | HTTP port |
| `--host <addr>` | `127.0.0.1` | Bind address (use `0.0.0.0` for recording / remote) |
| `--read-only` | `true` | Always on in v1; reserved for future mutation tools |

### HTTP API (JSON)

All endpoints return `application/json`. All are read-only.

| Endpoint | Purpose |
|---|---|
| `GET /api/graph?valid_at=ISO8601&types=...` | Full subgraph (nodes + edges) for rendering. Filters optional. |
| `GET /api/entities/:id` | Entity detail + evidence chain |
| `GET /api/edges/:id` | Edge detail + evidence chain |
| `GET /api/episodes/:id` | Raw episode content (subject to redaction) |
| `GET /api/neighbors/:id?depth=N&valid_at=...` | Wraps `getNeighbors` |
| `GET /api/path?from=ID&to=ID` | Wraps `getPath` |
| `GET /api/search?q=<text>` | Wraps `search()` for the focus-on-search feature |
| `GET /api/decay` | Wraps `getDecayReport` for the overlay |
| `GET /api/stats` | Entity/edge/episode counts for the header |
| `GET /api/temporal-bounds` | `{min_valid_from, max_valid_until}` to calibrate the time slider |

Response payloads are intentionally close to the `engram-core` types — the frontend does not need a second schema.

### Static asset routes

| Path | Content |
|---|---|
| `GET /` | `index.html` (shipped as a static asset in the package) |
| `GET /assets/*` | Bundled JS/CSS/fonts |

## Architecture / Design

### Package layout

New package: **`packages/engram-web/`**

```
packages/engram-web/
├── src/
│   ├── server.ts       # HTTP server: routes, JSON API, static asset serving
│   ├── api/
│   │   ├── graph.ts    # GET /api/graph handler
│   │   ├── entities.ts
│   │   ├── edges.ts
│   │   ├── episodes.ts
│   │   ├── search.ts
│   │   ├── decay.ts
│   │   └── temporal.ts
│   └── index.ts        # exports `startServer(opts)` for the CLI to call
├── ui/                 # Frontend source (built to dist/ui/)
│   ├── index.html
│   ├── main.ts
│   ├── graph.ts        # cytoscape wiring
│   ├── panels.ts       # detail sidebar rendering
│   ├── time-slider.ts
│   ├── filters.ts
│   └── styles.css
├── dist/               # Built frontend assets (checked in? see below)
├── package.json
└── test/
```

CLI integration: **`packages/engram-cli/src/commands/visualize.ts`** — thin wrapper that parses flags, opens the graph, calls `startServer()` from `engram-web`, prints the URL, and waits on SIGINT.

### Why a separate package

- `engram-cli` stays thin. It should not carry a frontend build, static assets, or HTTP server concerns.
- `engram-web` can be imported by other hosts (future Electron app, MCP-over-HTTP, etc.) without pulling in the CLI.
- The frontend build tooling is isolated — the rest of the monorepo doesn't need to care about it.
- From the user's perspective, nothing changes: it's still invoked as `engram visualize`, still ships in one npm install.

### HTTP server choice

Bun has `Bun.serve()` built in. **No new HTTP dependency.** Routing is a switch on `url.pathname`. For <15 endpoints this is cleaner than bringing in a router.

### Frontend stack

- **Graph library**: [cytoscape.js](https://js.cytoscape.org/) — mature, stable, ~380KB gzipped, handles 10k+ nodes, built-in force-directed (`cose`), hierarchical, and circle layouts. Confirmed fit: Fastify's 372 entities × 742 edges is well within comfort.
- **Framework**: **none** (vanilla TypeScript). The UI has ~6 panels and maybe a hundred DOM nodes of chrome. A framework would be pure overhead.
- **Bundler**: Bun's built-in `Bun.build()` for the frontend, output to `dist/ui/`. Frontend is built at `engram-web` build time, not at runtime.
- **Ship model**: `dist/ui/` is checked into git (like many library packages ship built frontends). The HTTP server serves it from disk at runtime. Users get a pre-built UI with zero frontend tooling on their machine.

### Host flag rationale

`--host 0.0.0.0` exists for a concrete need: **screen recording demos and talks**. A localhost-only server is invisible to OBS/Camtasia on some configurations, and remote-access-for-demo is a legitimate use case. Default is strict loopback so the footgun is explicit, not accidental.

When `--host` is not `127.0.0.1` / `localhost`, print a loud warning:

```
⚠  engram visualize bound to 0.0.0.0 — the graph is accessible from the network.
   Stop the server when you're done (Ctrl+C).
```

### Read-only posture

v1 is strictly read-only. No mutation endpoints. No cookies, no auth, no sessions. The graph is rendered from a JSON snapshot; interactions re-query the API. This keeps the security surface at zero for v1.

### Temporal rendering

- `GET /api/temporal-bounds` returns the earliest `valid_from` and the latest `valid_until` (or "now" if null) across all edges.
- Time slider is bound to this range.
- Dragging the slider updates a local `valid_at` state and re-requests `/api/graph?valid_at=...`.
- Cytoscape does an animated diff update — edges fade in/out, nodes that become disconnected gray out.
- Debounced at 150ms so scrubbing doesn't DOS the server.

### Decay overlay

When toggled on, the frontend calls `/api/decay` once, receives a map of entity_id → decay status, and applies CSS classes to cytoscape nodes (`risk-critical`, `risk-elevated`, `risk-stale`, etc.). Zero new graph calls — it's a layer on top of the existing render.

Synergizes directly with the bus-factor report (#45). The ownership report's JSON format is the same shape this overlay consumes. When #45 lands, the overlay can also shade by `likely_owner_of` coverage.

### Integration points

- Calls `engram-core` directly — no intermediate abstraction. Same pattern as the CLI commands.
- Reuses `resolveEntity`, `getNeighbors`, `findEdges`, `getPath`, `search`, `getDecayReport`, `getEvidenceForEntity`.
- Does **not** depend on #44 (MCP graph traversal tools) — both wrap the same core ops. Shipping order is independent.
- Does **not** depend on #45 (ownership report) — the overlay uses decay data that already exists, and gains extra signal when #45 lands.

### Security

- Read-only: no mutation endpoints, no credential handling.
- Default bind is `127.0.0.1` — loopback only.
- `--host` opt-in is documented with a warning banner.
- Path traversal protection on static asset routes (standard).
- Episode content respects the `redacted` status — redacted episodes return `null` content.
- No arbitrary SQL or file-system access exposed.
- No CORS headers in v1 (same-origin only). If the frontend and server diverge later, revisit.

### Performance

- Full graph request for Fastify-scale: ~372 entities + 742 edges ≈ 80KB JSON. Sub-ms server time.
- Cytoscape cose layout on this scale: <200ms on a mid-range laptop.
- Time-slider updates are incremental (send new `valid_at`, replace the edge set, keep node positions). <50ms per scrub step after initial layout.
- Decay overlay is a single ~5KB JSON fetch.
- **Budget**: v1 targets <1s from `engram visualize` to a rendered graph on Fastify-scale.

## Dependencies

- **Internal**: all `engram-core` retrieval ops already exist. No blockers.
- **External**: cytoscape.js (MIT, mature). No other runtime deps. Bun's built-ins for HTTP and build.
- **Blocked by**: nothing. Optionally synergizes with #44 and #45 but does not depend on them.

## Phased delivery (sprint plan)

Seven coherent deliverables, each independently reviewable. Filed as separate issues so the sprint can parallelize.

### Phase 1: Foundation (#47)
- New package `packages/engram-web` scaffold.
- `startServer(opts)` using `Bun.serve()`.
- `GET /api/stats`, `GET /api/graph`, `GET /api/temporal-bounds`.
- Static asset serving with path-traversal protection.
- `engram visualize` CLI command that calls `startServer`, prints the URL, waits on SIGINT.
- `--port`, `--host`, `--db`, `--read-only` flags with the network warning banner.
- Placeholder `index.html` that says "coming soon" + entity count.
- Unit tests for the API handlers.

### Phase 2: Graph rendering (#48)
- Frontend bundler setup (`Bun.build()` of `ui/main.ts` to `dist/ui/`).
- cytoscape.js integration, vanilla TS wiring.
- Renders the full active graph from `/api/graph`.
- Pan / zoom / drag-to-move / zoom-to-fit.
- Node color by entity type, edge color by relation type, edge style by edge_kind (solid = observed, dashed = inferred, dotted = asserted).
- Legend in the top-right corner.

### Phase 3: Detail panels + evidence drill-down (#49)
- Right sidebar with entity and edge detail panels.
- `GET /api/entities/:id`, `GET /api/edges/:id`, `GET /api/episodes/:id` endpoints.
- Click a node → entity detail with evidence list → click an episode → raw content view.
- Click an edge → edge detail with its evidence.
- "Go to" links between connected entities.

### Phase 4: Filters + search-to-focus (#50)
- Left sidebar with filter controls: entity type, relation type, edge kind, decay status.
- Filters are client-side (the data is already loaded) — instant response.
- Search input at the top: typed text calls `/api/search?q=...`, matching nodes are highlighted and the viewport pans to the best match.
- Keyboard: `/` focuses the search input (like vim and every good TUI).

### Phase 5: Time slider (#51)
- Bottom-anchored time slider bound to `/api/temporal-bounds`.
- Scrubbing re-requests `/api/graph?valid_at=...` with 150ms debounce.
- Animated diff update in cytoscape (edges fade in/out).
- Current-time readout next to the slider.
- "Now" button resets to current time.

### Phase 6: Decay / ownership overlay (#52)
- Toolbar toggle for the decay overlay.
- Calls `/api/decay` once on toggle.
- Applies CSS classes to nodes based on decay status.
- Summary count in the toolbar ("3 critical, 12 elevated").
- When #45 (ownership report) lands, extend the overlay to read from `/api/ownership` for richer shading. Gate behind a separate flag if #45 isn't ready at ship time.

### Phase 7: Polish + docs (#53)
- README for `packages/engram-web` with screenshots.
- CLAUDE.md update: new package, new command, new architecture section.
- Main README example: "Visualize your codebase".
- Keyboard shortcut reference in-app (`?` opens a cheatsheet modal).
- Benchmark: verify <1s from command to rendered graph on Fastify.
- Spec marked Implemented.

Phases 1-2 are the minimum shippable state. 3-6 are each one-day-scale and independently valuable. 7 is the closing pass.

## Acceptance Criteria (overall)

- [ ] `engram visualize --db <path>` starts a server and prints a reachable URL.
- [ ] Default host is `127.0.0.1`; `--host 0.0.0.0` works and prints the warning banner.
- [ ] The browser UI renders the full active graph from Fastify (372/742) in <1s after page load.
- [ ] Clicking a node shows its entity detail including full evidence chain.
- [ ] Clicking an edge shows its detail including evidence.
- [ ] Filters (entity type, relation type, edge kind, decay status) update the view instantly.
- [ ] Search-to-focus pans to and highlights the matching entity.
- [ ] Time slider scrubs across the full temporal range and edges update.
- [ ] Decay overlay shades entities by risk level.
- [ ] All HTTP endpoints are read-only and respect redaction status on episodes.
- [ ] All tests pass (`bun test`) including new HTTP API handler tests.
- [ ] `bun run build` succeeds including the frontend bundle.
- [ ] New package `engram-web` lints clean.

## Out of Scope (v1)

- **No write operations.** No add-entity, add-edge, edit-evidence UI. v1 is strictly read-only.
- **No auth / sessions / cookies.** If you bind to a network interface, you accept the exposure.
- **No multi-graph.** One `.engram` file per server instance, same as the CLI.
- **No saved views or URL state.** v1.1 can add `#e=<id>` deep links.
- **No export-as-image.** Browser "print to PDF" or screenshot is acceptable for v1.
- **No graph editing (drag to reconnect, etc.).** The graph is a read view.
- **No real-time updates.** Refresh the page to pick up new data.
- **No IDE integration.** VS Code webview wrapping is Phase 3+.
- **No mobile-optimized UI.** Target is laptop/desktop browsers.
- **No TUI browser.** Separate work, separate spec if we decide to do it later.

## Documentation Required

- [ ] `packages/engram-web/README.md` — setup, architecture, how to rebuild the frontend
- [ ] CLAUDE.md — new package entry, new CLI command, architecture note
- [ ] Main README — example invocation with a screenshot
- [ ] VISION.md — mark "graph visualization" as Phase 2 in-progress / shipped
- [ ] STATUS.md — add under Phase 2 when shipped
- [ ] Spec marked `Implemented` when Phase 7 closes
