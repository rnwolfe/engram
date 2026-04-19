/**
 * plugin.ts — `engram plugin` command group.
 *
 * Subcommands:
 *   - plugin list   Discover and display installed plugins with status
 */

import * as path from "node:path";
import { log } from "@clack/prompts";
import type { Command } from "commander";
import {
  discoverPlugins,
  loadManifest,
  ManifestValidationError,
} from "engram-core/plugins";

interface PluginListOpts {
  project?: string;
}

export function registerPlugin(program: Command): void {
  const plugin = program.command("plugin").description("Manage engram plugins");

  plugin
    .command("list")
    .description("List discovered plugins and their status")
    .option(
      "--project <path>",
      "project root to check for .engram/plugins/ (default: cwd)",
    )
    .action(async (opts: PluginListOpts) => {
      const projectRoot = path.resolve(opts.project ?? ".");
      const discovered = discoverPlugins(projectRoot);

      if (discovered.length === 0) {
        log.info("No plugins found.");
        log.info(
          "Install plugins in:\n" +
            "  ~/.local/share/engram/plugins/<name>/  (user-wide)\n" +
            "  .engram/plugins/<name>/                (project-local)",
        );
        return;
      }

      const rows: Array<{
        name: string;
        version: string;
        transport: string;
        scope: string;
        status: string;
      }> = [];

      for (const pd of discovered) {
        try {
          const manifest = loadManifest(pd.dir);
          rows.push({
            name: manifest.name,
            version: manifest.version,
            transport: manifest.transport,
            scope: pd.scope,
            status: "OK",
          });
        } catch (err) {
          rows.push({
            name: pd.name,
            version: "-",
            transport: "-",
            scope: pd.scope,
            status:
              err instanceof ManifestValidationError
                ? `FAILED: ${err.message}`
                : `FAILED: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // Table formatting
      const headers = ["NAME", "VERSION", "TRANSPORT", "SCOPE", "STATUS"];
      const colWidths = headers.map((h, i) => {
        const key = ["name", "version", "transport", "scope", "status"][
          i
        ] as keyof (typeof rows)[0];
        return Math.max(h.length, ...rows.map((r) => r[key].length));
      });

      function formatRow(cells: string[]): string {
        return cells.map((c, i) => c.padEnd(colWidths[i])).join("  ");
      }

      const separator = colWidths.map((w) => "-".repeat(w)).join("  ");

      const lines = [
        formatRow(headers),
        separator,
        ...rows.map((r) =>
          formatRow([r.name, r.version, r.transport, r.scope, r.status]),
        ),
      ];

      process.stdout.write(`${lines.join("\n")}\n`);
    });
}
