# @engram/engram-web

HTTP server and browser UI for the `engram visualize` command.

## Usage

```
engram visualize --db path/to/repo.engram
# Opens: http://127.0.0.1:7878
```

## Architecture

- **Server**: `src/server.ts` — Bun.serve() HTTP server
- **API**: `src/api/` — stats, graph, temporal-bounds, search, detail, decay, ownership
- **UI**: `ui/` TypeScript source → `dist/ui/` pre-built bundle
- **Graph**: cytoscape.js with cose force-directed layout

## Rebuilding the frontend

```
cd packages/engram-web
bun run build
```

## API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stats` | Entity/edge/episode counts |
| `GET /api/graph?valid_at=ISO` | Full graph snapshot |
| `GET /api/temporal-bounds` | Edge validity date range |
| `GET /api/search?q=text` | Entity search |
| `GET /api/entities/:id` | Entity detail + evidence |
| `GET /api/edges/:id` | Edge detail + evidence |
| `GET /api/episodes/:id` | Raw episode content |
| `GET /api/decay` | Decay report |
| `GET /api/ownership` | Ownership risk report |
