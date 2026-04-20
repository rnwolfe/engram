/**
 * plugin.ts — `engram plugin` command group.
 *
 * Subcommands:
 *   - plugin list      Discover and display installed plugins with status
 *   - plugin install   Wire a bundled first-party plugin into XDG (or project)
 *   - plugin uninstall Remove a previously installed plugin
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { log } from "@clack/prompts";
import type { Command } from "commander";
import {
  bundledPluginsRoot,
  discoverPlugins,
  listBundledPlugins,
  loadManifest,
  ManifestValidationError,
  projectPluginsRoot,
  userPluginsRoot,
} from "engram-core/plugins";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Resolves the destination plugins root based on whether --project is set.
 */
function resolveDestRoot(projectOpt: string | undefined): string {
  if (projectOpt) {
    return projectPluginsRoot(path.resolve(projectOpt));
  }
  return userPluginsRoot();
}

/**
 * On Windows, symlinks may require elevated permissions. Fall back to a
 * directory copy when symlinking fails.
 */
function installPlugin(src: string, dest: string): "symlink" | "copy" {
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  try {
    fs.symlinkSync(src, dest, "junction");
    return "symlink";
  } catch {
    // Fallback: recursive copy
    copyDir(src, dest);
    return "copy";
  }
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// plugin list
// ---------------------------------------------------------------------------

interface PluginListOpts {
  project?: string;
  available?: boolean;
  bundledRoot?: string;
}

function registerList(plugin: Command): void {
  plugin
    .command("list")
    .description("List discovered plugins and their status")
    .option(
      "--project <path>",
      "project root to check for .engram/plugins/ (default: cwd)",
    )
    .option(
      "--available",
      "also list bundled first-party plugins available to install",
    )
    .option("--bundled-root <path>", "override bundled plugins root (testing)")
    .action(async (opts: PluginListOpts) => {
      const projectRoot = path.resolve(opts.project ?? ".");

      // Show available bundled plugins if requested
      if (opts.available) {
        const root = opts.bundledRoot ?? bundledPluginsRoot();
        const available = listBundledPlugins(root ?? undefined);
        if (available.length === 0) {
          log.info(
            "No bundled first-party plugins are available. " +
              "(packages/plugins/ not found in the engram install root)",
          );
        } else {
          process.stdout.write("Available bundled plugins:\n");
          for (const name of available) {
            process.stdout.write(`  ${name}\n`);
          }
          process.stdout.write(
            "\nInstall with: engram plugin install <name>\n",
          );
        }
        return;
      }

      const root = opts.bundledRoot ?? bundledPluginsRoot();
      const discovered = discoverPlugins(projectRoot, root ?? undefined);

      if (discovered.length === 0) {
        log.info("No plugins found.");
        log.info(
          "Install a bundled plugin:  engram plugin install <name>\n" +
            "Or place plugins manually in:\n" +
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
        source: string;
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
            source: pd.source,
            status: "OK",
          });
        } catch (err) {
          rows.push({
            name: pd.name,
            version: "-",
            transport: "-",
            scope: pd.scope,
            source: pd.source,
            status:
              err instanceof ManifestValidationError
                ? `FAILED: ${err.message}`
                : `FAILED: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }

      // Table formatting
      const headers = [
        "NAME",
        "VERSION",
        "TRANSPORT",
        "SCOPE",
        "SOURCE",
        "STATUS",
      ];
      const colWidths = headers.map((h, i) => {
        const key = [
          "name",
          "version",
          "transport",
          "scope",
          "source",
          "status",
        ][i] as keyof (typeof rows)[0];
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
          formatRow([
            r.name,
            r.version,
            r.transport,
            r.scope,
            r.source,
            r.status,
          ]),
        ),
      ];

      process.stdout.write(`${lines.join("\n")}\n`);
    });
}

// ---------------------------------------------------------------------------
// plugin install
// ---------------------------------------------------------------------------

interface PluginInstallOpts {
  project?: string;
  bundledRoot?: string; // internal override for tests
}

function registerInstall(plugin: Command): void {
  plugin
    .command("install <name>")
    .description(
      "Install a bundled first-party plugin into the XDG plugin directory " +
        "(or project-local with --project)",
    )
    .option(
      "--project <path>",
      "install into <project>/.engram/plugins/ instead of user-wide",
    )
    .option("--bundled-root <path>", "override bundled plugins root (testing)")
    .action(async (name: string, opts: PluginInstallOpts) => {
      const root = opts.bundledRoot ?? bundledPluginsRoot();

      if (!root) {
        process.stderr.write(
          "error: no bundled first-party plugins directory found\n" +
            "  (packages/plugins/ was not found in the engram install root)\n" +
            "  Ensure you are using a supported engram installation.\n",
        );
        process.exitCode = 1;
        return;
      }

      const available = listBundledPlugins(root);

      if (!available.includes(name)) {
        process.stderr.write(
          `error: no bundled plugin named '${name}'; see \`engram plugin list --available\`\n`,
        );
        if (available.length > 0) {
          process.stderr.write(`  Available: ${available.join(", ")}\n`);
        } else {
          process.stderr.write(
            "  No bundled plugins are currently available.\n",
          );
        }
        process.exitCode = 1;
        return;
      }

      const src = path.join(root, name);
      const destRoot = resolveDestRoot(opts.project);
      const dest = path.join(destRoot, name);

      if (fs.existsSync(dest)) {
        process.stderr.write(
          `error: plugin '${name}' is already installed at ${dest}\n` +
            `  Run \`engram plugin uninstall ${name}\` first to reinstall.\n`,
        );
        process.exitCode = 1;
        return;
      }

      const method = installPlugin(src, dest);

      log.success(
        `Installed plugin '${name}' → ${dest} (${method === "symlink" ? "symlinked" : "copied"})`,
      );
    });
}

// ---------------------------------------------------------------------------
// plugin uninstall
// ---------------------------------------------------------------------------

interface PluginUninstallOpts {
  project?: string;
  force?: boolean;
  bundledRoot?: string; // internal override for tests
}

function registerUninstall(plugin: Command): void {
  plugin
    .command("uninstall <name>")
    .description(
      "Remove an installed plugin. " + "User-authored plugins require --force.",
    )
    .option(
      "--project <path>",
      "target project-local install (.engram/plugins/) instead of user-wide",
    )
    .option(
      "--force",
      "allow removal of user-authored (non-bundled, non-symlinked) plugins",
    )
    .option("--bundled-root <path>", "override bundled plugins root (testing)")
    .action(async (name: string, opts: PluginUninstallOpts) => {
      const destRoot = resolveDestRoot(opts.project);
      const dest = path.join(destRoot, name);

      if (!fs.existsSync(dest)) {
        process.stderr.write(
          `error: plugin '${name}' is not installed at ${dest}\n`,
        );
        process.exitCode = 1;
        return;
      }

      // Determine how the plugin was installed
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(dest);
      } catch (err) {
        process.stderr.write(
          `error: cannot stat '${dest}': ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
        return;
      }

      const isSymlink = stat.isSymbolicLink();

      if (!isSymlink) {
        // Plain directory — could be a bundled copy (Windows fallback) or user-authored.
        // Without --force, only allow removal if it looks like a bundled copy.
        const root = opts.bundledRoot ?? bundledPluginsRoot();
        const available = root ? listBundledPlugins(root) : [];
        const isBundledCopy = available.includes(name);

        if (!isBundledCopy && !opts.force) {
          process.stderr.write(
            `error: '${name}' is a user-authored plugin and requires --force to remove.\n` +
              `  Run: engram plugin uninstall ${name} --force\n`,
          );
          process.exitCode = 1;
          return;
        }
      }

      // Remove: unlink for symlinks, rmdir for directories
      try {
        if (isSymlink) {
          fs.unlinkSync(dest);
        } else {
          fs.rmSync(dest, { recursive: true, force: true });
        }
      } catch (err) {
        process.stderr.write(
          `error: failed to remove '${dest}': ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
        return;
      }

      log.success(`Uninstalled plugin '${name}' (removed ${dest})`);
    });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPlugin(program: Command): void {
  const plugin = program.command("plugin").description("Manage engram plugins");

  registerList(plugin);
  registerInstall(plugin);
  registerUninstall(plugin);
}
