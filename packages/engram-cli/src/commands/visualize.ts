/**
 * visualize.ts — `engram visualize` command.
 *
 * Starts the engram-web HTTP server, prints the URL, and waits for SIGINT.
 *
 * engram-web is loaded via dynamic import so a missing dev build (no
 * `dist/ui/` output) can surface a helpful "run bun run build" message
 * instead of Bun's bare "Cannot find module" error. In a compiled binary
 * the asset imports resolve against the embedded FS so this path is never
 * taken.
 */

import * as path from "node:path";
import type { Command } from "commander";
import { resolveDbPath } from "engram-core";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

interface VisualizeOpts {
  db: string;
  port: string;
  host: string;
  readOnly: boolean;
}

async function loadEngramWeb() {
  try {
    return await import("@engram/engram-web");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("dist/ui")) {
      console.error("engram visualize: web UI assets have not been built.");
      console.error(
        "If you are running from a source clone, build the workspace first:",
      );
      console.error("  bun run build");
      process.exit(1);
    }
    throw err;
  }
}

export function registerVisualize(program: Command): void {
  program
    .command("visualize")
    .description("Start a local HTTP server to visualize the knowledge graph")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--port <n>", "HTTP port", "7878")
    .option("--host <addr>", "bind address", "127.0.0.1")
    .option("--read-only", "read-only mode (default; reserved for v1)", true)
    .addHelpText(
      "after",
      `
Examples:
  # Start the visualizer (opens at http://127.0.0.1:7878)
  engram visualize

  # Serve on a custom port
  engram visualize --port 8080

When to use:
  Explore the graph structure visually during debugging or onboarding.
  Open in a browser to browse entities and edges interactively.

See also:
  engram show      display entity details in the terminal
  engram search    find entities by keyword`,
    )
    .action(async (opts: VisualizeOpts) => {
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const port = Number.parseInt(opts.port, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error("Error: --port must be an integer between 1 and 65535");
        process.exit(1);
      }
      const host = opts.host;

      if (!LOOPBACK_HOSTS.has(host)) {
        console.warn(
          `\nWARNING: Serving on a non-loopback address. Anyone on the network can access your knowledge graph.\n`,
        );
      }

      const { startServer } = await loadEngramWeb();

      let handle: Awaited<ReturnType<typeof startServer>> | undefined;
      try {
        handle = await startServer({ dbPath, port, host });
      } catch (err) {
        console.error(
          `Error starting server: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      console.log(`engram visualize: http://${host}:${port}`);
      console.log("  (press Ctrl+C to stop)");

      function shutdown() {
        if (handle) {
          handle.stop();
        }
        process.exit(0);
      }

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);

      // Block until signal
    });
}
