/**
 * update.ts — `engram update` command.
 *
 * Self-updater for the bun-compiled engram binary distributed via GitHub
 * Releases. Pairs with the `update_available` doctor check and the
 * `engram whats-new` nudge shown after a successful upgrade.
 *
 * Two modes:
 *   --check     read-only: ask GitHub if a newer release is out and report
 *               (exits 1 when behind so scripts can gate on it).
 *   (default)   download the target release binary and atomically replace the
 *               running binary. Refuses when the running binary is a dev
 *               checkout or sits in a directory the user cannot write.
 *
 * Trust model (current): authenticity rests on HTTPS/TLS to
 * `github.com/<repo>/releases/download/...`. We do **not** yet verify against
 * a published SHA256 or signature. A compromised GitHub release asset would
 * not be caught. Follow-up: publish checksums in the release workflow and
 * have this command fail closed on mismatch. See issue #275.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { confirm } from "@clack/prompts";
import type { Command } from "commander";
import { ENGINE_VERSION } from "engram-core";
import { c } from "../colors.js";
import { checkForUpdate, compareSemver } from "../release-check.js";

interface UpdateOpts {
  check: boolean;
  offline: boolean;
  to?: string;
  yes: boolean;
  format: string;
  j?: boolean;
}

const DEFAULT_REPO = "rnwolfe/engram";

/** Maps Node's platform/arch to the asset naming convention used by install.sh. */
function detectTarget(): { os: "linux" | "macos"; arch: "x64" | "arm64" } {
  const platform = os.platform();
  const arch = os.arch();
  let target: "linux" | "macos";
  if (platform === "linux") target = "linux";
  else if (platform === "darwin") target = "macos";
  else throw new Error(`unsupported OS: ${platform}`);
  let archName: "x64" | "arm64";
  if (arch === "x64") archName = "x64";
  else if (arch === "arm64") archName = "arm64";
  else throw new Error(`unsupported arch: ${arch}`);
  return { os: target, arch: archName };
}

function assetUrl(
  repo: string,
  tag: string,
  target: { os: string; arch: string },
): string {
  return `https://github.com/${repo}/releases/download/${tag}/engram-${target.os}-${target.arch}`;
}

/**
 * Returns a reason string if the current binary is NOT upgradable in place
 * (dev install, not a release binary, etc). Null means "safe to replace".
 */
function rejectIfDevInstall(execPath: string): string | null {
  const base = path.basename(execPath);
  if (base !== "engram") {
    return `running via '${base}', not a compiled engram binary (dev install?)`;
  }
  // Heuristic: if the real path sits under a `node_modules/.bin` directory,
  // the user installed engram as a dep, not the release binary.
  const real = fs.realpathSync(execPath);
  if (real.includes(`${path.sep}node_modules${path.sep}.bin${path.sep}`)) {
    return `binary lives in node_modules/.bin — reinstall via your package manager instead`;
  }
  return null;
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0) {
    throw new Error(`download returned 0 bytes: ${url}`);
  }
  fs.writeFileSync(dest, buf);
}

async function runUpgrade(
  current: string,
  targetVersion: string,
  tag: string,
  repo: string,
  opts: UpdateOpts,
): Promise<void> {
  const execPath = fs.realpathSync(process.execPath);
  const devReason = rejectIfDevInstall(execPath);
  if (devReason) {
    console.error(c.red("Cannot self-update:"));
    console.error(`  ${devReason}`);
    console.error(
      "  If you installed via the install.sh script, that binary is upgradable;",
    );
    console.error(`  running: ${execPath}`);
    process.exit(2);
  }

  const target = detectTarget();
  const installDir = path.dirname(execPath);
  // Write the temp file in the SAME directory as the target so the final
  // rename() is atomic on the same filesystem (no EXDEV).
  const tempFile = path.join(installDir, `.engram.update.${process.pid}`);

  if (!opts.yes && opts.format !== "json") {
    const direction =
      compareSemver(targetVersion, current) > 0 ? "upgrade" : "replace";
    const answer = await confirm({
      message: `${direction} engram v${current} → v${targetVersion} at ${execPath}?`,
    });
    if (typeof answer === "symbol" || answer !== true) {
      console.log("aborted.");
      process.exit(0);
    }
  }

  const url = assetUrl(repo, tag, target);
  console.log(`downloading ${url}`);
  try {
    await downloadTo(url, tempFile);
  } catch (err) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
    console.error(c.red("download failed"));
    console.error(`  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(3);
  }

  try {
    fs.chmodSync(tempFile, 0o755);
    fs.renameSync(tempFile, execPath);
  } catch (err) {
    try {
      fs.unlinkSync(tempFile);
    } catch {
      /* ignore */
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("EACCES") || msg.includes("EPERM")) {
      console.error(c.red(`cannot replace ${execPath}: permission denied`));
      console.error(
        `  Re-run with elevated permissions, or reinstall via install.sh.`,
      );
    } else {
      console.error(c.red(`replace failed: ${msg}`));
    }
    process.exit(4);
  }

  console.log(
    `${c.green("✓")} upgraded engram to v${targetVersion} at ${execPath}`,
  );
  console.log(`  run: ${c.bold("engram whats-new")} to see what changed`);
}

export function registerUpdate(program: Command): void {
  program
    .command("update")
    .description("Check for and install a newer engram release (self-update).")
    .option(
      "--check",
      "read-only: report whether an update is available",
      false,
    )
    .option(
      "--offline",
      "use only cached release info; do not hit the network",
      false,
    )
    .option(
      "--to <version>",
      "upgrade to a specific version rather than latest",
    )
    .option(
      "--yes",
      "skip confirmation prompt (non-interactive upgrade)",
      false,
    )
    .option("--format <fmt>", "output format: text or json", "text")
    .option("-j", "shorthand for --format json")
    .addHelpText(
      "after",
      `
Examples:
  engram update --check            # am I up to date? (exits 1 if not)
  engram update                    # upgrade to latest (will prompt)
  engram update --to v0.3.0        # pin a specific release
  engram update --check -j         # machine-readable check

Release info is cached under $XDG_CACHE_HOME/engram/latest-release.json for
24h so repeat checks do not hit the GitHub API.

Authenticity: downloads use HTTPS/TLS against github.com. Checksum or
signature verification is not yet implemented — a compromised release asset
would not be caught by this command alone. Review the release page if the
provenance matters to you.`,
    )
    .action(async (opts: UpdateOpts) => {
      if (opts.j) opts.format = "json";

      const result = await checkForUpdate({
        currentVersion: ENGINE_VERSION,
        offline: opts.offline === true,
        // --to implies we need fresh info (no point consulting cache for a
        // specific version the user typed in), so bypass cache in that case.
        noCache: Boolean(opts.to),
      });

      if (opts.format === "json") {
        process.stdout.write(
          `${JSON.stringify(
            {
              current: result.current,
              latest: result.latest?.version ?? null,
              tag: result.latest?.tag ?? null,
              url: result.latest?.url ?? null,
              updateAvailable: result.updateAvailable,
              fromCache: result.fromCache,
              error: result.error,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        printHuman(result, opts);
      }

      if (opts.check) {
        // --check is a pure status probe; exit non-zero when behind so
        // scripts can gate on it without parsing stdout.
        process.exit(result.updateAvailable ? 1 : 0);
      }

      if (result.error) {
        console.error(c.red(`cannot check for updates: ${result.error}`));
        process.exit(3);
      }

      const repo = process.env.ENGRAM_RELEASES_REPO ?? DEFAULT_REPO;
      let targetVersion: string;
      let targetTag: string;
      if (opts.to) {
        targetVersion = opts.to.startsWith("v") ? opts.to.slice(1) : opts.to;
        targetTag = opts.to.startsWith("v") ? opts.to : `v${opts.to}`;
      } else {
        if (!result.latest) {
          console.error(c.red("no release info available to upgrade from"));
          process.exit(3);
        }
        targetVersion = result.latest.version;
        targetTag = result.latest.tag;
      }

      if (!opts.to && !result.updateAvailable) {
        console.log(
          `already on the latest release (v${result.current}); nothing to do`,
        );
        return;
      }

      await runUpgrade(result.current, targetVersion, targetTag, repo, opts);
    });
}

function printHuman(
  result: Awaited<ReturnType<typeof checkForUpdate>>,
  opts: UpdateOpts,
): void {
  console.log(`engram ${c.bold(`v${result.current}`)} installed`);
  if (result.error) {
    console.log(
      `  ${c.yellow("⚠")} could not check for updates: ${result.error}`,
    );
    return;
  }
  if (!result.latest) {
    console.log("  no release info available");
    return;
  }
  const cacheNote = result.fromCache ? c.dim(" (cached)") : "";
  if (result.updateAvailable) {
    console.log(
      `  ${c.yellow("↑")} v${result.latest.version} is available${cacheNote}`,
    );
    console.log(`  release notes: ${result.latest.url}`);
    if (opts.check) {
      console.log(`  to upgrade, run: ${c.bold("engram update")}`);
    }
  } else {
    console.log(`  ${c.green("✓")} you are on the latest release${cacheNote}`);
  }
}
