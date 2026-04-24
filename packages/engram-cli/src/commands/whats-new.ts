/**
 * whats-new.ts — `engram whats-new` command.
 *
 * Renders user-facing highlights from `docs/whats-new.json` filtered to the
 * versions the user has not yet acknowledged (everything strictly newer than
 * the graph's `last_seen_engine_version`).
 *
 * On successful human-format output, bumps `last_seen_engine_version` to the
 * running `ENGINE_VERSION` so the nudge from `doctor`/`status` goes quiet.
 * `--no-mark` suppresses that side effect — useful for re-reading notes.
 *
 * The file `docs/whats-new.json` is written alongside `CHANGELOG.md` by the
 * /release skill so the two cannot drift.
 */

import * as path from "node:path";
import type { Command } from "commander";
import {
  closeGraph,
  ENGINE_VERSION,
  type EngramGraph,
  markEngineVersionSeen,
  openGraph,
  resolveDbPath,
} from "engram-core";
// Bundled into dist/cli.js at build time via bun's JSON import.
import whatsNewData from "../../../../docs/whats-new.json" with {
  type: "json",
};
import { c } from "../colors.js";
import { compareSemver } from "../release-check.js";

interface WhatsNewItem {
  title: string;
  summary: string;
  command?: string;
  migration?: string;
  docs?: string;
}

interface WhatsNewVersion {
  version: string;
  date: string;
  headline?: string;
  added?: WhatsNewItem[];
  changed?: WhatsNewItem[];
  deprecated?: WhatsNewItem[];
  breaking?: WhatsNewItem[];
  removed?: WhatsNewItem[];
  fixes_summary?: string;
}

interface WhatsNewData {
  versions: WhatsNewVersion[];
}

interface WhatsNewOpts {
  db: string;
  since?: string;
  all: boolean;
  /**
   * Commander negates `--no-mark` into the positive option `mark`. Defaults
   * true; set to false when the user passes `--no-mark`.
   */
  mark: boolean;
  format: string;
  j?: boolean;
}

const SECTION_LABELS: Array<{
  key: keyof Pick<
    WhatsNewVersion,
    "added" | "changed" | "deprecated" | "breaking" | "removed"
  >;
  label: string;
}> = [
  { key: "breaking", label: "Breaking" },
  { key: "added", label: "Added" },
  { key: "changed", label: "Changed" },
  { key: "deprecated", label: "Deprecated" },
  { key: "removed", label: "Removed" },
];

function getData(): WhatsNewData {
  // The cast is safe — the JSON's shape is exercised by tests.
  return whatsNewData as unknown as WhatsNewData;
}

function pickVersions(
  all: WhatsNewVersion[],
  since: string | null,
  showAll: boolean,
): WhatsNewVersion[] {
  if (showAll)
    return all.slice().sort((a, b) => compareSemver(b.version, a.version));
  if (since === null) {
    // No prior observation — show everything up to current.
    return all
      .filter((v) => compareSemver(v.version, ENGINE_VERSION) <= 0)
      .sort((a, b) => compareSemver(b.version, a.version));
  }
  return all
    .filter(
      (v) =>
        compareSemver(v.version, since) > 0 &&
        compareSemver(v.version, ENGINE_VERSION) <= 0,
    )
    .sort((a, b) => compareSemver(b.version, a.version));
}

function renderItem(item: WhatsNewItem, indent: string): string {
  const lines: string[] = [];
  const head = c.bold(item.title);
  const cmd = item.command ? ` ${c.dim(`(${item.command})`)}` : "";
  lines.push(`${indent}• ${head}${cmd}`);
  lines.push(`${indent}  ${item.summary}`);
  if (item.migration) {
    lines.push(`${indent}  ${c.yellow("Migration:")} ${item.migration}`);
  }
  if (item.docs) {
    lines.push(`${indent}  ${c.dim(`docs: ${item.docs}`)}`);
  }
  return lines.join("\n");
}

function renderVersion(v: WhatsNewVersion): string {
  const lines: string[] = [];
  lines.push(`\n${c.bold(`v${v.version}`)}  ${c.dim(v.date)}`);
  if (v.headline) {
    lines.push(`  ${v.headline}`);
  }
  for (const { key, label } of SECTION_LABELS) {
    const items = v[key];
    if (!items || items.length === 0) continue;
    lines.push(`\n  ${c.bold(label)}`);
    for (const item of items) {
      lines.push(renderItem(item, "    "));
    }
  }
  if (v.fixes_summary) {
    lines.push(`\n  ${c.bold("Fixed")}`);
    lines.push(`    ${v.fixes_summary}`);
  }
  return lines.join("\n");
}

function renderHuman(
  versions: WhatsNewVersion[],
  lastSeen: string | null,
  showAll: boolean,
): void {
  if (versions.length === 0) {
    if (showAll) {
      console.log("No release notes found.");
    } else if (lastSeen === ENGINE_VERSION) {
      console.log(
        `You're up to date — v${ENGINE_VERSION} has already been reviewed.`,
      );
    } else {
      console.log(`No new releases since v${lastSeen ?? "(initial)"}.`);
    }
    return;
  }

  const since =
    lastSeen === null ? "the initial graph creation" : `v${lastSeen}`;
  console.log(
    `\n${c.bold(`engram — what's new since ${since}`)} (running v${ENGINE_VERSION})`,
  );

  for (const v of versions) {
    console.log(renderVersion(v));
  }
  console.log();
}

export function registerWhatsNew(program: Command): void {
  program
    .command("whats-new")
    .description(
      "Show user-facing highlights for engram versions newer than the one this graph last reviewed.",
    )
    .option("--db <path>", "path to .engram directory", ".engram")
    .option(
      "--since <version>",
      "override the stored last-seen version (e.g. 0.1.0)",
    )
    .option("--all", "show every recorded version, ignoring stored last-seen")
    .option("--no-mark", "do not bump last_seen_engine_version after rendering")
    .option("--format <fmt>", "output format: text or json", "text")
    .option("-j", "shorthand for --format json")
    .addHelpText(
      "after",
      `
Examples:
  engram whats-new                 # notes since your last acknowledged version
  engram whats-new --since 0.1.0   # notes since v0.1.0 regardless of state
  engram whats-new --all -j        # everything, JSON

After rendering in text format, this command bumps last_seen_engine_version
to the running binary so that 'engram doctor' and 'engram status' stop
reporting engine-version drift. Use --no-mark to re-read notes without
acknowledging them, or --since/--all to view an arbitrary slice.`,
    )
    .action((opts: WhatsNewOpts) => {
      if (opts.j) opts.format = "json";
      if (opts.format !== "text" && opts.format !== "json") {
        console.error("Error: --format must be 'text' or 'json'");
        process.exit(1);
      }

      const dbPath = resolveDbPath(path.resolve(opts.db));

      let graph: EngramGraph;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      const since = opts.since ?? graph.lastSeenEngineVersion;
      const all = opts.all === true;
      const versions = pickVersions(getData().versions, since, all);

      if (opts.format === "json") {
        process.stdout.write(
          `${JSON.stringify(
            {
              currentVersion: ENGINE_VERSION,
              lastSeen: graph.lastSeenEngineVersion,
              since: since ?? null,
              versions,
            },
            null,
            2,
          )}\n`,
        );
      } else {
        renderHuman(versions, since, all);
      }

      // Mark as seen so doctor/status stop nudging. Gates:
      //   - text format only — scripts consuming JSON output should not have
      //     metadata side effects. Use `engram whats-new` (no --format json)
      //     after reading notes, or rely on an interactive invocation.
      //   - default slice only — --since/--all are ad-hoc reads that should
      //     not silently advance the acknowledged version.
      //   - --no-mark opts out explicitly.
      const shouldMark =
        opts.mark !== false &&
        opts.format === "text" &&
        opts.since === undefined &&
        !all;
      if (shouldMark) {
        markEngineVersionSeen(graph);
      }

      closeGraph(graph);
    });
}
