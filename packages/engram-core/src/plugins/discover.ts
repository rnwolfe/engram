/**
 * discover.ts — enumerate plugin directories from XDG and project-local paths.
 *
 * Precedence (highest wins on name collision):
 *   1. <project>/.engram/plugins/<name>/
 *   2. $XDG_DATA_HOME/engram/plugins/<name>/  (fallback: ~/.local/share/engram/plugins/)
 *      Windows: %LOCALAPPDATA%\engram\plugins\<name>\
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * How a plugin arrived in the plugins directory.
 *
 * - `bundled`   — a first-party plugin installed via `engram plugin install`
 *                 (symlink or copy pointing into the engram install root)
 * - `symlinked` — a user-created symlink to an external directory
 * - `user`      — a plain directory created by the user (no symlink)
 */
export type PluginSource = "bundled" | "symlinked" | "user";

export interface PluginDirectory {
  name: string;
  dir: string;
  /** 'project' | 'user' — project-local takes precedence on name collision */
  scope: "project" | "user";
  /** How the plugin was installed */
  source: PluginSource;
}

/**
 * Returns the platform-appropriate XDG data home for engram.
 * Exported so install/uninstall logic can use the same path resolution.
 */
export function xdgDataHome(): string {
  if (process.platform === "win32") {
    return path.join(
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
      "engram",
    );
  }
  return path.join(
    process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"),
    "engram",
  );
}

/**
 * Returns the XDG plugins root directory (user-wide).
 */
export function userPluginsRoot(): string {
  return path.join(xdgDataHome(), "plugins");
}

/**
 * Returns the project-local plugins root directory.
 */
export function projectPluginsRoot(projectRoot: string): string {
  return path.join(projectRoot, ".engram", "plugins");
}

/**
 * Detects whether an installed plugin directory is bundled (symlink to engram
 * install root), a user symlink, or a plain user directory.
 */
function detectSource(dir: string, bundledPluginsRoot?: string): PluginSource {
  let realTarget: string | null = null;
  try {
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink()) {
      realTarget = fs.realpathSync(dir);
    }
  } catch {
    // Cannot stat — treat as user
  }

  if (realTarget !== null) {
    // It's a symlink. Bundled means the target is inside the bundled plugins root.
    if (bundledPluginsRoot) {
      const realBundled = (() => {
        try {
          return fs.realpathSync(bundledPluginsRoot);
        } catch {
          return bundledPluginsRoot;
        }
      })();
      if (
        realTarget === realBundled ||
        realTarget.startsWith(realBundled + path.sep)
      ) {
        return "bundled";
      }
    }
    return "symlinked";
  }

  return "user";
}

function listPluginsIn(
  base: string,
  scope: "project" | "user",
  bundledPluginsRoot?: string,
): PluginDirectory[] {
  const pluginsRoot = path.join(base, "plugins");
  if (!fs.existsSync(pluginsRoot)) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pluginsRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((e) => e.isDirectory() || e.isSymbolicLink())
    .map((e) => {
      const dir = path.join(pluginsRoot, e.name);
      return {
        name: e.name,
        dir,
        scope,
        source: detectSource(dir, bundledPluginsRoot),
      };
    });
}

/**
 * Discovers all installed plugin directories.
 *
 * @param projectRoot - optional path to project root containing .engram/
 * @param bundledPluginsRoot - optional path to bundled plugins directory (for source detection)
 * @returns Deduplicated list of PluginDirectory, project-local wins on name collision.
 */
export function discoverPlugins(
  projectRoot?: string,
  bundledPluginsRoot?: string,
): PluginDirectory[] {
  const user = listPluginsIn(xdgDataHome(), "user", bundledPluginsRoot);
  const project = projectRoot
    ? listPluginsIn(
        path.join(projectRoot, ".engram"),
        "project",
        bundledPluginsRoot,
      )
    : [];

  // Build map: name → entry, project-local overrides user on collision
  const byName = new Map<string, PluginDirectory>();
  for (const p of user) byName.set(p.name, p);
  for (const p of project) byName.set(p.name, p);

  return Array.from(byName.values());
}

/**
 * Returns the path to the bundled first-party plugins directory.
 *
 * In a development monorepo, looks for `packages/plugins/` relative to the
 * directory two levels up from this file's location (i.e., the monorepo root).
 *
 * In a production install, looks for a `plugins/` directory sibling of the
 * binary's parent directory.
 *
 * Returns null if no bundled plugins directory is found.
 */
export function bundledPluginsRoot(): string | null {
  // Dev: __dirname is packages/engram-core/src/plugins/
  // Go up to monorepo root: ../../../../
  const candidates: string[] = [];

  // Walk up from this file looking for a packages/plugins/ dir
  let dir = path.dirname(
    typeof __dirname !== "undefined" ? __dirname : process.cwd(),
  );
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "packages", "plugins");
    candidates.push(candidate);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Also check sibling of process.execPath's parent (production install)
  if (process.execPath) {
    const execDir = path.dirname(process.execPath);
    candidates.push(path.join(execDir, "..", "plugins"));
    candidates.push(path.join(execDir, "plugins"));
  }

  for (const candidate of candidates) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) return candidate;
    } catch {
      // not found, try next
    }
  }

  return null;
}

/**
 * Lists available bundled (first-party) plugins.
 * Returns plugin names found in the bundled plugins root.
 * Returns an empty array if no bundled plugins directory exists.
 */
export function listBundledPlugins(root?: string): string[] {
  const bundledRoot = root ?? bundledPluginsRoot();
  if (!bundledRoot) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(bundledRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
