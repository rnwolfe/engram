/**
 * server.ts — Bun.serve() HTTP server for engram-web.
 *
 * Static assets (HTML, JS, CSS, fonts) are imported with
 * `with { type: "file" }` so `bun build --compile` embeds them into the
 * release binary. A static manifest maps each served URL to the resolved
 * file path — there is no runtime filesystem scan of `dist/ui/`.
 *
 * Routes:
 *   GET /              → dist/ui/index.html
 *   GET /main.js       → dist/ui/main.js
 *   GET /main.css      → dist/ui/main.css
 *   GET /fonts/*.woff2 → dist/ui/fonts/*.woff2
 *   GET /api/*         → JSON handlers
 */

import type { EngramGraph } from "engram-core";
import fontRegular from "../dist/ui/fonts/GeistMono-Regular.woff2" with {
  type: "file",
};
import fontVariable from "../dist/ui/fonts/GeistMono-Variable.woff2" with {
  type: "file",
};
import indexHtml from "../dist/ui/index.html" with { type: "file" };
import mainCss from "../dist/ui/main.css" with { type: "file" };
import mainJs from "../dist/ui/main.js" with { type: "file" };
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

const STATIC_ASSETS: Record<string, string> = {
  "/": indexHtml,
  "/index.html": indexHtml,
  "/main.js": mainJs,
  "/main.css": mainCss,
  "/fonts/GeistMono-Regular.woff2": fontRegular,
  "/fonts/GeistMono-Variable.woff2": fontVariable,
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serveStatic(requestPath: string): Response {
  const assetPath = STATIC_ASSETS[requestPath];
  if (!assetPath) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(Bun.file(assetPath));
}

/**
 * Verify every static asset is reachable. Run once at server startup so
 * missing build output fails fast with a clear message instead of silently
 * 404ing on the browser side. In a `bun build --compile` binary all paths
 * are embedded; in dev mode they resolve to files on disk.
 */
export async function verifyStaticAssets(): Promise<void> {
  const missing: string[] = [];
  for (const [route, assetPath] of Object.entries(STATIC_ASSETS)) {
    const exists = await Bun.file(assetPath).exists();
    if (!exists) {
      missing.push(`${route} (${assetPath})`);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `engram-web: web UI assets are missing. Run \`bun run build\` in the workspace root first.\nMissing: ${missing.join(", ")}`,
    );
  }
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

    return serveStatic(pathname);
  };
}
