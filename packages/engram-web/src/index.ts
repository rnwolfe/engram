/**
 * index.ts — public API for engram-web.
 *
 * Exports startServer(opts) for use by the CLI.
 */

import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph } from "engram-core";
import { createHandler, verifyStaticAssets } from "./server.js";

export interface ServerOpts {
  dbPath: string;
  port?: number;
  host?: string;
}

export interface ServerHandle {
  graph: EngramGraph;
  server: ReturnType<typeof Bun.serve>;
  stop: () => void;
}

/**
 * Starts the engram-web HTTP server.
 *
 * Opens the .engram database at dbPath, binds on host:port (defaults: 127.0.0.1:7878),
 * and returns a handle with a stop() function to close cleanly.
 */
export async function startServer(opts: ServerOpts): Promise<ServerHandle> {
  const port = opts.port ?? 7878;
  const host = opts.host ?? "127.0.0.1";

  await verifyStaticAssets();

  const graph = openGraph(opts.dbPath);
  const handler = createHandler(graph);

  const server = Bun.serve({
    port,
    hostname: host,
    fetch: handler,
  });

  function stop() {
    server.stop();
    closeGraph(graph);
  }

  return { graph, server, stop };
}

export {
  handleEdgeDetail,
  handleEntityDetail,
  handleEpisodeDetail,
} from "./api/detail.js";
export { handleGraph } from "./api/graph.js";
export { handleSearch } from "./api/search.js";
export { handleStats } from "./api/stats.js";
export { handleTemporalBounds } from "./api/temporal.js";
export { createHandler } from "./server.js";
