/**
 * plugin.test.ts — Tests for `engram plugin` subcommands.
 *
 * Tests install, uninstall, collision, missing-source, and project-vs-user scope.
 */

import { describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { registerPlugin } from "../../src/commands/plugin.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerPlugin(program);
  return program;
}

async function captureOutput(
  fn: () => Promise<void> | void,
): Promise<{ stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
    stdoutChunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return origStdoutWrite(
      chunk,
      ...(args as Parameters<typeof process.stdout.write>).slice(1),
    );
  };

  process.stderr.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
    stderrChunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return origStderrWrite(
      chunk,
      ...(args as Parameters<typeof process.stderr.write>).slice(1),
    );
  };

  try {
    await fn();
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  return { stdout: stdoutChunks.join(""), stderr: stderrChunks.join("") };
}

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Creates a fake bundled plugins root with the given plugin names.
 * Each plugin gets a minimal manifest.json so install → loadManifest works.
 */
function makeBundledRoot(names: string[]): string {
  const bundledRoot = makeTmpDir("engram-bundled-plugins-");
  for (const name of names) {
    const pluginDir = path.join(bundledRoot, name);
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "manifest.json"),
      JSON.stringify({
        name,
        version: "0.1.0",
        contract_version: 1,
        transport: "js-module",
        entry: "index.js",
        capabilities: {
          supported_auth: ["none"],
          supports_cursor: true,
          scope_schema: { description: "project name", pattern: ".*" },
        },
      }),
    );
    fs.writeFileSync(path.join(pluginDir, "index.js"), "// stub");
  }
  return bundledRoot;
}

/**
 * Returns the XDG user plugins root, overriding XDG_DATA_HOME for isolation.
 * Call restoreXdg() after each test.
 */
function overrideXdgUserDir(): { xdgRoot: string; restoreXdg: () => void } {
  const xdgRoot = makeTmpDir("engram-xdg-");
  const prev = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = xdgRoot;
  const restoreXdg = () => {
    if (prev === undefined) delete process.env.XDG_DATA_HOME;
    else process.env.XDG_DATA_HOME = prev;
  };
  return { xdgRoot, restoreXdg };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("plugin list", () => {
  it("shows 'No plugins found' when no plugins are installed", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const projectDir = makeTmpDir("engram-proj-");
    try {
      const program = makeProgram();
      const _infoMsg = "";
      // Capture @clack/prompts log.info by patching stdout
      const { stdout } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "list",
            "--project",
            projectDir,
          ]);
        } catch {
          // exitOverride throws on exit
        }
      });
      // Should not output a table row
      expect(stdout).not.toContain("NAME");
    } finally {
      restoreXdg();
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("shows installed plugins with source column", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["my-plugin"]);

    try {
      // Simulate an installed (symlinked) plugin in user plugins dir
      const userPluginsDir = path.join(xdgRoot, "engram", "plugins");
      fs.mkdirSync(userPluginsDir, { recursive: true });
      const src = path.join(bundledRoot, "my-plugin");
      const dest = path.join(userPluginsDir, "my-plugin");
      fs.symlinkSync(src, dest, "junction");

      const projectDir = makeTmpDir("engram-proj-");
      const program = makeProgram();
      const { stdout } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "list",
            "--project",
            projectDir,
            "--bundled-root",
            bundledRoot,
          ] as string[]);
        } catch {
          // exitOverride throws
        }
      });

      expect(stdout).toContain("NAME");
      expect(stdout).toContain("SOURCE");
      expect(stdout).toContain("my-plugin");
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("shows available bundled plugins with --available", async () => {
    const bundledRoot = makeBundledRoot(["gerrit", "gitlab"]);
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();

    try {
      const program = makeProgram();
      const { stdout } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "list",
            "--available",
            "--bundled-root",
            bundledRoot,
          ] as string[]);
        } catch {
          // exitOverride
        }
      });
      expect(stdout).toContain("gerrit");
      expect(stdout).toContain("gitlab");
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });
});

describe("plugin install", () => {
  it("installs a bundled plugin into user plugins dir (symlink)", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "install",
            "gerrit",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      const destDir = path.join(xdgRoot, "engram", "plugins", "gerrit");
      expect(fs.existsSync(destDir)).toBe(true);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("installs into project-local dir with --project", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);
    const projectDir = makeTmpDir("engram-proj-");

    try {
      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "install",
            "gerrit",
            "--bundled-root",
            bundledRoot,
            "--project",
            projectDir,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      const destDir = path.join(projectDir, ".engram", "plugins", "gerrit");
      expect(fs.existsSync(destDir)).toBe(true);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero for a non-existent bundled plugin", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      const _prevExitCode = process.exitCode;
      process.exitCode = undefined;

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "install",
            "nonexistent",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(process.exitCode).toBe(1);
      expect(stderr).toContain("nonexistent");
      expect(stderr).toContain("engram plugin list --available");

      process.exitCode = 0;
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero when no bundled plugins root is found", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    // Use a non-existent bundled root
    const fakeBundledRoot = path.join(os.tmpdir(), "does-not-exist-xyzxyz");

    try {
      const _prevExitCode = process.exitCode;
      process.exitCode = undefined;

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "install",
            "gerrit",
            "--bundled-root",
            fakeBundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      // When bundled root doesn't exist, listBundledPlugins returns [] so
      // install treats as "no bundled plugin named X"
      expect(process.exitCode).toBe(1);
      expect(stderr).toContain("gerrit");

      process.exitCode = 0;
    } finally {
      restoreXdg();
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero when plugin is already installed (collision)", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      const _prevExitCode = process.exitCode;
      process.exitCode = undefined;

      // Pre-create the dest directory to simulate an existing install
      const destDir = path.join(xdgRoot, "engram", "plugins", "gerrit");
      fs.mkdirSync(destDir, { recursive: true });

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "install",
            "gerrit",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(process.exitCode).toBe(1);
      expect(stderr).toContain("already installed");

      process.exitCode = 0;
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });
});

describe("plugin uninstall", () => {
  it("removes a symlinked (bundled) plugin without --force", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      // Install first
      const userPluginsDir = path.join(xdgRoot, "engram", "plugins");
      fs.mkdirSync(userPluginsDir, { recursive: true });
      const src = path.join(bundledRoot, "gerrit");
      const dest = path.join(userPluginsDir, "gerrit");
      fs.symlinkSync(src, dest, "junction");

      expect(fs.existsSync(dest)).toBe(true);

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "gerrit",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      // After uninstall the dest should not exist
      // (lstatSync won't follow symlinks, so even if src still exists, dest is gone)
      let destExists = false;
      try {
        fs.lstatSync(dest);
        destExists = true;
      } catch {
        // not found = good
      }
      expect(destExists).toBe(false);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("removes a bundled-copy (non-symlink) plugin listed in bundled root", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      // Simulate Windows-style copy (plain directory, not a symlink)
      const userPluginsDir = path.join(xdgRoot, "engram", "plugins", "gerrit");
      fs.mkdirSync(userPluginsDir, { recursive: true });
      fs.writeFileSync(path.join(userPluginsDir, "manifest.json"), "{}");

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "gerrit",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      expect(
        fs.existsSync(path.join(xdgRoot, "engram", "plugins", "gerrit")),
      ).toBe(false);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero for user-authored plugin without --force", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot([]); // empty bundled root

    try {
      const _prevExitCode = process.exitCode;
      process.exitCode = undefined;

      // A user-authored plugin (plain dir, not in bundled root)
      const userPluginsDir = path.join(
        xdgRoot,
        "engram",
        "plugins",
        "my-custom",
      );
      fs.mkdirSync(userPluginsDir, { recursive: true });

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "my-custom",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(process.exitCode).toBe(1);
      expect(stderr).toContain("--force");
      // Dir should still exist
      expect(fs.existsSync(userPluginsDir)).toBe(true);

      process.exitCode = 0;
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("removes user-authored plugin with --force", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot([]); // empty bundled root

    try {
      const userPluginsDir = path.join(
        xdgRoot,
        "engram",
        "plugins",
        "my-custom",
      );
      fs.mkdirSync(userPluginsDir, { recursive: true });

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "my-custom",
            "--force",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      expect(fs.existsSync(userPluginsDir)).toBe(false);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("exits non-zero when plugin is not installed", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);

    try {
      const _prevExitCode = process.exitCode;
      process.exitCode = undefined;

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "gerrit",
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(process.exitCode).toBe(1);
      expect(stderr).toContain("not installed");

      process.exitCode = 0;
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });

  it("uninstalls from project-local scope with --project", async () => {
    const { xdgRoot, restoreXdg } = overrideXdgUserDir();
    const bundledRoot = makeBundledRoot(["gerrit"]);
    const projectDir = makeTmpDir("engram-proj-");

    try {
      // Install into project-local
      const projPluginsDir = path.join(
        projectDir,
        ".engram",
        "plugins",
        "gerrit",
      );
      fs.mkdirSync(projPluginsDir, { recursive: true });
      fs.symlinkSync(
        path.join(bundledRoot, "gerrit"),
        `${projPluginsDir}-link`,
        "junction",
      );
      // Recreate as symlink
      fs.rmdirSync(projPluginsDir);
      fs.symlinkSync(
        path.join(bundledRoot, "gerrit"),
        projPluginsDir,
        "junction",
      );

      const program = makeProgram();
      const { stderr } = await captureOutput(async () => {
        try {
          await program.parseAsync([
            "node",
            "engram",
            "plugin",
            "uninstall",
            "gerrit",
            "--project",
            projectDir,
            "--bundled-root",
            bundledRoot,
          ]);
        } catch {
          // exitOverride
        }
      });

      expect(stderr).toBe("");
      let destExists = false;
      try {
        fs.lstatSync(projPluginsDir);
        destExists = true;
      } catch {
        // not found
      }
      expect(destExists).toBe(false);
    } finally {
      restoreXdg();
      fs.rmSync(bundledRoot, { recursive: true, force: true });
      fs.rmSync(projectDir, { recursive: true, force: true });
      fs.rmSync(xdgRoot, { recursive: true, force: true });
    }
  });
});
