/**
 * discover.test.ts — tests for plugin directory discovery.
 *
 * Uses real filesystem via temp directories; mocks env vars.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { discoverPlugins } from "../../src/plugins/discover.js";

let tmpDir: string;
const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-discover-test-"));
  originalEnv.XDG_DATA_HOME = process.env.XDG_DATA_HOME;
  originalEnv.LOCALAPPDATA = process.env.LOCALAPPDATA;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

function mkPluginDir(base: string, name: string): string {
  const p = path.join(base, "plugins", name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

describe("discoverPlugins", () => {
  test("returns empty array when no plugin directories exist", () => {
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg");
    const result = discoverPlugins(tmpDir);
    expect(result).toEqual([]);
  });

  test("discovers user-scoped plugins via XDG_DATA_HOME", () => {
    const xdgBase = path.join(tmpDir, "xdg", "engram");
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg");
    mkPluginDir(xdgBase, "my-plugin");

    const result = discoverPlugins();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-plugin");
    expect(result[0].scope).toBe("user");
  });

  test("discovers project-local plugins via .engram/plugins/", () => {
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg-empty");
    const projectBase = path.join(tmpDir, "project", ".engram");
    mkPluginDir(projectBase, "local-plugin");

    const result = discoverPlugins(path.join(tmpDir, "project"));
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("local-plugin");
    expect(result[0].scope).toBe("project");
  });

  test("project-local wins on name collision", () => {
    const xdgBase = path.join(tmpDir, "xdg", "engram");
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg");
    mkPluginDir(xdgBase, "shared-plugin");

    const projectBase = path.join(tmpDir, "project", ".engram");
    mkPluginDir(projectBase, "shared-plugin");

    const result = discoverPlugins(path.join(tmpDir, "project"));
    expect(result).toHaveLength(1);
    expect(result[0].scope).toBe("project");
    expect(result[0].name).toBe("shared-plugin");
  });

  test("discovers multiple plugins from both scopes", () => {
    const xdgBase = path.join(tmpDir, "xdg", "engram");
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg");
    mkPluginDir(xdgBase, "plugin-a");
    mkPluginDir(xdgBase, "plugin-b");

    const projectBase = path.join(tmpDir, "project", ".engram");
    mkPluginDir(projectBase, "plugin-c");

    const result = discoverPlugins(path.join(tmpDir, "project"));
    const names = result.map((p) => p.name).sort();
    expect(names).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
  });

  test("returns correct dir paths", () => {
    const xdgBase = path.join(tmpDir, "xdg", "engram");
    process.env.XDG_DATA_HOME = path.join(tmpDir, "xdg");
    mkPluginDir(xdgBase, "test-plugin");

    const result = discoverPlugins();
    expect(result[0].dir).toBe(path.join(xdgBase, "plugins", "test-plugin"));
  });
});
