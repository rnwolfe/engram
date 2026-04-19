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

export interface PluginDirectory {
  name: string;
  dir: string;
  /** 'project' | 'user' — project-local takes precedence on name collision */
  scope: "project" | "user";
}

function xdgDataHome(): string {
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

function listPluginsIn(
  base: string,
  scope: "project" | "user",
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
    .filter((e) => e.isDirectory())
    .map((e) => ({
      name: e.name,
      dir: path.join(pluginsRoot, e.name),
      scope,
    }));
}

/**
 * Discovers all installed plugin directories.
 *
 * @param projectRoot - optional path to project root containing .engram/
 * @returns Deduplicated list of PluginDirectory, project-local wins on name collision.
 */
export function discoverPlugins(projectRoot?: string): PluginDirectory[] {
  const user = listPluginsIn(xdgDataHome(), "user");
  const project = projectRoot
    ? listPluginsIn(path.join(projectRoot, ".engram"), "project")
    : [];

  // Build map: name → entry, project-local overrides user on collision
  const byName = new Map<string, PluginDirectory>();
  for (const p of user) byName.set(p.name, p);
  for (const p of project) byName.set(p.name, p);

  return Array.from(byName.values());
}
