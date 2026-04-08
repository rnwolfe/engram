/**
 * server.ts — Bun.serve() HTTP server for engram-web.
 *
 * Routes:
 *   GET /              → dist/ui/index.html
 *   GET /assets/*      → dist/ui/assets/*
 *   GET /api/stats     → StatsResponse
 *   GET /api/graph     → GraphResponse (optional ?valid_at=ISO8601)
 *   GET /api/temporal-bounds → TemporalBoundsResponse
 *   GET /api/search    → SearchResponse (required ?q=<text>)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { EngramGraph } from "engram-core";
import { handleDecay } from "./api/decay.js";
import {
  handleEdgeDetail,
  handleEntityDetail,
  handleEpisodeDetail,
} from "./api/detail.js";
import { handleGraph } from "./api/graph.js";
import { handleOwnership } from "./api/ownership-api.js";
import { handleSearch } from "./api/search.js";
import { handleStats } from "./api/stats.js";
import { handleTemporalBounds } from "./api/temporal.js";

const DIST_UI_DIR = path.resolve(import.meta.dir, "..", "dist", "ui");

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serveStatic(requestPath: string): Response {
  // Resolve path and ensure it stays within dist/ui/
  const resolved = path.resolve(DIST_UI_DIR, requestPath.replace(/^\//, ""));
  if (
    !resolved.startsWith(DIST_UI_DIR + path.sep) &&
    resolved !== DIST_UI_DIR
  ) {
    return new Response("Not Found", { status: 404 });
  }

  if (!fs.existsSync(resolved)) {
    return new Response("Not Found", { status: 404 });
  }

  const file = Bun.file(resolved);
  return new Response(file);
}

export function createHandler(graph: EngramGraph) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // API routes
    if (pathname === "/api/stats") {
      try {
        return json(handleStats(graph));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (pathname === "/api/graph") {
      try {
        const validAt = url.searchParams.get("valid_at") ?? undefined;
        return json(handleGraph(graph, validAt));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (pathname === "/api/temporal-bounds") {
      try {
        return json(handleTemporalBounds(graph));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (pathname === "/api/search") {
      try {
        const q = url.searchParams.get("q") ?? "";
        const result = await handleSearch(graph, q);
        return json(result);
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (pathname === "/api/decay") {
      try {
        return json(handleDecay(graph));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    if (pathname === "/api/ownership") {
      try {
        return json(handleOwnership(graph));
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    // Detail routes: /api/entities/:id, /api/edges/:id, /api/episodes/:id
    const entityMatch = pathname.match(/^\/api\/entities\/([^/]+)$/);
    if (entityMatch) {
      try {
        const result = handleEntityDetail(graph, entityMatch[1]);
        if (!result) return json({ error: "Entity not found" }, 404);
        return json(result);
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    const edgeMatch = pathname.match(/^\/api\/edges\/([^/]+)$/);
    if (edgeMatch) {
      try {
        const result = handleEdgeDetail(graph, edgeMatch[1]);
        if (!result) return json({ error: "Edge not found" }, 404);
        return json(result);
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    const episodeMatch = pathname.match(/^\/api\/episodes\/([^/]+)$/);
    if (episodeMatch) {
      try {
        const result = handleEpisodeDetail(graph, episodeMatch[1]);
        if (!result) return json({ error: "Episode not found" }, 404);
        return json(result);
      } catch (err) {
        return json(
          { error: err instanceof Error ? err.message : String(err) },
          500,
        );
      }
    }

    // Static asset serving
    if (pathname === "/") {
      const indexPath = path.join(DIST_UI_DIR, "index.html");
      if (!fs.existsSync(indexPath)) {
        return new Response(
          "UI not built. Run `bun run build` in packages/engram-web.",
          { status: 503, headers: { "Content-Type": "text/plain" } },
        );
      }
      return new Response(Bun.file(indexPath));
    }

    if (pathname.startsWith("/assets/")) {
      return serveStatic(pathname);
    }

    // Serve other static files (main.js, main.css)
    if (pathname.match(/\.(js|css|html|map)$/)) {
      return serveStatic(pathname);
    }

    return new Response("Not Found", { status: 404 });
  };
}
