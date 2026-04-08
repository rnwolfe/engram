/**
 * visualize.ts — `engram visualize` command.
 *
 * Starts the engram-web HTTP server, prints the URL, and waits for SIGINT.
 */

import * as path from "node:path";
import { startServer } from "@engram/engram-web";
import type { Command } from "commander";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

interface VisualizeOpts {
  db: string;
  port: string;
  host: string;
  readOnly: boolean;
}

export function registerVisualize(program: Command): void {
  program
    .command("visualize")
    .description("Start a local HTTP server to visualize the knowledge graph")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--port <n>", "HTTP port", "7878")
    .option("--host <addr>", "bind address", "127.0.0.1")
    .option("--read-only", "read-only mode (default; reserved for v1)", true)
    .action((opts: VisualizeOpts) => {
      const dbPath = path.resolve(opts.db);
      const port = Number.parseInt(opts.port, 10);
      const host = opts.host;

      if (!LOOPBACK_HOSTS.has(host)) {
        console.warn(
          `\nWARNING: Serving on a non-loopback address. Anyone on the network can access your knowledge graph.\n`,
        );
      }

      let handle: ReturnType<typeof startServer> | undefined;
      try {
        handle = startServer({ dbPath, port, host });
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
