/**
 * diff.ts — `engram diff` command.
 *
 * Computes the temporal diff of the knowledge graph between two refs.
 *
 * Ref forms accepted:
 *   - Git SHA / branch name / tag  → resolved via `git rev-parse` to a commit timestamp
 *   - ISO8601 UTC timestamp
 *   - Bare date (YYYY-MM-DD)
 *   - Relative duration (e.g. "30d", "2w", "1y")
 *   - Range syntax: <ref-A>..<ref-B>
 *   - --since <duration>  (e.g. --since 30d)
 */

import { execFileSync } from "node:child_process";
import * as path from "node:path";
import type { Command } from "commander";
import type {
  DiffEdgeEntry,
  DiffProjectionEntry,
  EngramGraph,
  GraphDiff,
} from "engram-core";
import {
  closeGraph,
  diffGraph,
  InvalidAsOfError,
  openGraph,
  resolveAsOf,
  resolveDbPath,
} from "engram-core";
import { c } from "../colors.js";

// ─── Ref resolution ───────────────────────────────────────────────────────────

/**
 * Parse a duration shorthand like "30d", "2w", "6m", "1y" into milliseconds.
 * Returns null if not a duration shorthand.
 */
function parseDurationShorthand(s: string): number | null {
  const m = s.match(/^(\d+)([smhdwMy])$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  const unitMs: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
    M: 30 * 86_400_000,
    y: 365 * 86_400_000,
  };
  return n * (unitMs[unit] ?? 0);
}

/**
 * Attempt to resolve a git ref (SHA, branch, tag) to a commit ISO timestamp.
 * Returns null if the ref is not a valid git ref or git is not available.
 */
function resolveGitRef(ref: string, cwd: string): string | null {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cI", ref], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 5_000,
    })
      .toString()
      .trim();
    if (!out) return null;
    // Validate it's a parseable date
    const d = new Date(out);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/**
 * Resolve any ref form to a UTC ISO8601 string.
 *
 * Priority:
 * 1. Duration shorthand (e.g. "30d") → relative from now
 * 2. resolveAsOf (ISO8601, bare date, named relative)
 * 3. Git ref via `git rev-parse` + `git log`
 *
 * Throws if no form matches.
 */
function resolveRef(ref: string, cwd: string): string {
  // Duration shorthand: 30d, 2w, 6M, 1y, etc.
  const ms = parseDurationShorthand(ref);
  if (ms !== null) {
    return new Date(Date.now() - ms).toISOString();
  }

  // ISO8601 / bare date / named relative (yesterday, last week, etc.)
  try {
    return resolveAsOf(ref).iso;
  } catch (e) {
    if (!(e instanceof InvalidAsOfError)) throw e;
  }

  // Git ref
  const gitTs = resolveGitRef(ref, cwd);
  if (gitTs) return gitTs;

  throw new Error(
    `Cannot resolve ref "${ref}". ` +
      "Accepted forms: git SHA/branch/tag, ISO8601 timestamp, bare date (YYYY-MM-DD), " +
      "relative string (yesterday, last week, <N> days ago), or duration shorthand (30d, 2w).",
  );
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatEdgeCount(entries: DiffEdgeEntry[]): string {
  const byKind = new Map<string, number>();
  for (const e of entries) {
    byKind.set(
      e.edge.relation_type,
      (byKind.get(e.edge.relation_type) ?? 0) + 1,
    );
  }
  const parts = [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)
    .join(", ");
  return parts || "0";
}

function renderTextOutput(
  diff: GraphDiff,
  opts: { includeTransient: boolean },
): void {
  const { edges, projections, ownership_shifts, decision_reversals } = diff;

  console.log(`\nengram diff  ${c.dim(diff.refA)}  →  ${c.dim(diff.refB)}\n`);

  // ── Edges ──
  console.log(c.bold("Edges"));
  const addedCount = edges.added.length;
  const invalidatedCount = edges.invalidated.length;
  const supersededCount = edges.superseded.length;
  const transientCount = edges.transient.length;

  if (addedCount > 0) {
    console.log(
      `  ${c.green(`+${addedCount}`).padEnd(6)} added       (${formatEdgeCount(edges.added)})`,
    );
  }
  if (invalidatedCount > 0) {
    console.log(
      `  ${c.red(`-${invalidatedCount}`).padEnd(6)} invalidated (${formatEdgeCount(edges.invalidated)})`,
    );
  }
  if (supersededCount > 0) {
    console.log(
      `  ${String(supersededCount).padEnd(4)} superseded  (${formatEdgeCount(edges.superseded)})`,
    );
  }
  if (opts.includeTransient && transientCount > 0) {
    console.log(
      `  ${c.dim(`~${transientCount}`).padEnd(6)} transient   (${formatEdgeCount(edges.transient)})`,
    );
  }
  if (addedCount + invalidatedCount + supersededCount === 0) {
    console.log("  (no changes)");
  }

  // ── Projections ──
  console.log(`\n${c.bold("Projections")}`);
  const createdCount = projections.created.length;
  const supProjCount = projections.superseded.length;
  const invProjCount = projections.invalidated.length;

  if (createdCount > 0) {
    console.log(`  ${c.green(`+${createdCount}`).padEnd(6)} created`);
    for (const e of projections.created.slice(0, 5)) {
      console.log(
        `             ${c.dim(e.projection.kind)} · "${e.projection.title}"`,
      );
    }
    if (createdCount > 5) {
      console.log(`             ${c.dim(`... and ${createdCount - 5} more`)}`);
    }
  }
  if (supProjCount > 0) {
    console.log(`  ${String(supProjCount).padEnd(4)} superseded`);
    for (const e of projections.superseded.slice(0, 5)) {
      console.log(
        `             ${c.dim(e.projection.kind)} · "${e.projection.title}"`,
      );
    }
  }
  if (invProjCount > 0) {
    console.log(`  ${c.red(`-${invProjCount}`).padEnd(6)} invalidated`);
  }
  if (createdCount + supProjCount + invProjCount === 0) {
    console.log("  (no changes)");
  }

  // ── Ownership shifts ──
  console.log(`\n${c.bold("Ownership shifts")}`);
  if (ownership_shifts.length === 0) {
    console.log("  (none)");
  } else {
    for (const s of ownership_shifts) {
      const from = s.from_owner_name ?? "(unowned)";
      const to = s.to_owner_name ?? "(unowned)";
      console.log(
        `  ${c.bold(s.entity_name)}  →  ${c.green(to)}  (was ${c.dim(from)})`,
      );
    }
  }

  // ── Decision reversals ──
  console.log(`\n${c.bold("Decision reversals")}`);
  if (decision_reversals.length === 0) {
    console.log("  (none)");
  } else {
    for (const d of decision_reversals) {
      console.log(`  ${c.bold(d.title)}  [superseded]`);
    }
  }
}

function renderMarkdownOutput(
  diff: GraphDiff,
  opts: { includeTransient: boolean },
): void {
  const { edges, projections, ownership_shifts, decision_reversals } = diff;

  console.log(
    `## engram diff\n\n**A:** \`${diff.refA}\`  →  **B:** \`${diff.refB}\`\n`,
  );

  console.log("### Edges\n");
  if (edges.added.length > 0)
    console.log(
      `- **+${edges.added.length} added** (${formatEdgeCount(edges.added)})`,
    );
  if (edges.invalidated.length > 0)
    console.log(
      `- **-${edges.invalidated.length} invalidated** (${formatEdgeCount(edges.invalidated)})`,
    );
  if (edges.superseded.length > 0)
    console.log(
      `- **${edges.superseded.length} superseded** (${formatEdgeCount(edges.superseded)})`,
    );
  if (opts.includeTransient && edges.transient.length > 0)
    console.log(
      `- **~${edges.transient.length} transient** (${formatEdgeCount(edges.transient)})`,
    );
  if (
    edges.added.length + edges.invalidated.length + edges.superseded.length ===
    0
  )
    console.log("_(no changes)_");

  console.log("\n### Projections\n");
  for (const e of projections.created) {
    console.log(`- **created** ${e.projection.kind} · "${e.projection.title}"`);
  }
  for (const e of projections.superseded) {
    console.log(
      `- **superseded** ${e.projection.kind} · "${e.projection.title}"`,
    );
  }
  for (const e of projections.invalidated) {
    console.log(
      `- **invalidated** ${e.projection.kind} · "${e.projection.title}"`,
    );
  }
  if (
    projections.created.length +
      projections.superseded.length +
      projections.invalidated.length ===
    0
  )
    console.log("_(no changes)_");

  console.log("\n### Ownership shifts\n");
  if (ownership_shifts.length === 0) {
    console.log("_(none)_");
  } else {
    for (const s of ownership_shifts) {
      const from = s.from_owner_name ?? "(unowned)";
      const to = s.to_owner_name ?? "(unowned)";
      console.log(`- **${s.entity_name}**: ${from} → **${to}**`);
    }
  }

  console.log("\n### Decision reversals\n");
  if (decision_reversals.length === 0) {
    console.log("_(none)_");
  } else {
    for (const d of decision_reversals) {
      console.log(`- **${d.title}** (superseded)`);
    }
  }
}

function buildCitationArray(entry: DiffEdgeEntry | DiffProjectionEntry) {
  if ("edge" in entry) {
    return [{ edge_id: entry.edge.id, source_type: "edge" }];
  }
  return [{ projection_id: entry.projection.id, source_type: "projection" }];
}

function renderJsonOutput(
  diff: GraphDiff,
  opts: { includeTransient: boolean },
): void {
  const output = {
    refA: diff.refA,
    refB: diff.refB,
    edges: {
      added: diff.edges.added.map((e) => ({
        ...e.edge,
        citations: buildCitationArray(e),
      })),
      invalidated: diff.edges.invalidated.map((e) => ({
        ...e.edge,
        citations: buildCitationArray(e),
      })),
      superseded: diff.edges.superseded.map((e) => ({
        ...e.edge,
        superseded_by: e.superseded_by,
        citations: buildCitationArray(e),
      })),
      ...(opts.includeTransient
        ? {
            transient: diff.edges.transient.map((e) => ({
              ...e.edge,
              citations: buildCitationArray(e),
            })),
          }
        : {}),
    },
    projections: {
      created: diff.projections.created.map((e) => ({
        id: e.projection.id,
        kind: e.projection.kind,
        title: e.projection.title,
        created_at: e.projection.created_at,
        citations: buildCitationArray(e),
      })),
      superseded: diff.projections.superseded.map((e) => ({
        id: e.projection.id,
        kind: e.projection.kind,
        title: e.projection.title,
        superseded_by: e.superseded_by,
        invalidated_at: e.projection.invalidated_at,
        citations: buildCitationArray(e),
      })),
      invalidated: diff.projections.invalidated.map((e) => ({
        id: e.projection.id,
        kind: e.projection.kind,
        title: e.projection.title,
        invalidated_at: e.projection.invalidated_at,
        citations: buildCitationArray(e),
      })),
    },
    ownership_shifts: diff.ownership_shifts,
    decision_reversals: diff.decision_reversals,
  };
  console.log(JSON.stringify(output, null, 2));
}

// ─── Command registration ─────────────────────────────────────────────────────

interface DiffOpts {
  db: string;
  format: string;
  j?: boolean;
  since?: string;
  kinds?: string;
  projections?: string;
  entity?: string;
  includeTransient: boolean;
  narrate: boolean;
}

export function registerDiff(program: Command): void {
  program
    .command("diff [ref-a] [ref-b]")
    .description("Show temporal diff of the knowledge graph between two refs")
    .option("--db <path>", "path to .engram file", ".engram")
    .option("--format <fmt>", "output format: text, json, or markdown", "text")
    .option("-j", "shorthand for --format json")
    .option(
      "--since <duration>",
      "diff from <duration> ago to now (e.g. 30d, 2w)",
    )
    .option("--kinds <kinds>", "filter by relation kinds (comma-separated)")
    .option("--projections <kind>", "filter projections by kind")
    .option("--entity <id>", "scope diff to one entity (by id)")
    .option("--include-transient", "include net-zero (transient) edges", false)
    .option("--narrate", "AI-rendered prose summary of the diff", false)
    .addHelpText(
      "after",
      `
Ref forms accepted:
  Git SHA / branch / tag       engram diff HEAD~50 HEAD
  Range syntax                 engram diff HEAD~50..HEAD
  ISO8601 timestamp            engram diff 2025-01-01T00:00:00Z 2026-01-01T00:00:00Z
  Bare date                    engram diff 2025-01-01 2026-01-01
  Relative duration (--since)  engram diff --since 30d

Examples:
  engram diff HEAD~50 HEAD
  engram diff HEAD~50..HEAD
  engram diff --since 30d
  engram diff HEAD~50 HEAD --kinds owns,reviewed_by
  engram diff HEAD~50 HEAD --format json
  engram diff HEAD~50 HEAD --projections decision_page
  engram diff HEAD~50 HEAD --entity <id>
  engram diff HEAD~50 HEAD --include-transient

See also:
  engram history   trace temporal fact evolution for a specific entity pair
  engram show      display current entity details and active edges`,
    )
    .action(
      async (
        refAArg: string | undefined,
        refBArg: string | undefined,
        opts: DiffOpts,
      ) => {
        if (opts.j) opts.format = "json";
        if (!["text", "json", "markdown"].includes(opts.format)) {
          console.error(
            `${c.red("Error:")} --format must be 'text', 'json', or 'markdown'`,
          );
          process.exit(1);
        }

        const dbPath = resolveDbPath(path.resolve(opts.db));
        const cwd = path.dirname(dbPath);

        let graph: EngramGraph | undefined;
        try {
          graph = openGraph(dbPath);
        } catch (err) {
          console.error(
            `${c.red("Error:")} opening graph: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          process.exit(1);
        }

        try {
          // ── Resolve ref-A and ref-B ──────────────────────────────────────────
          let rawA: string;
          let rawB: string;

          if (opts.since) {
            rawA = opts.since;
            rawB = new Date().toISOString();
          } else if (refAArg?.includes("..")) {
            // Range syntax: ref-a..ref-b (two-dot only; reject three-dot)
            const dotIdx = refAArg.indexOf("..");
            const after = refAArg.slice(dotIdx + 2);
            if (after.startsWith(".")) {
              console.error(
                `${c.red("Error:")} three-dot ranges are not supported — use ref-A..ref-B`,
              );
              closeGraph(graph);
              process.exit(1);
            }
            rawA = refAArg.slice(0, dotIdx);
            rawB = after || new Date().toISOString();
            if (!rawA) {
              console.error(
                `${c.red("Error:")} ref-A is empty in range syntax — use ref-A..ref-B`,
              );
              closeGraph(graph);
              process.exit(1);
            }
          } else if (refAArg && refBArg) {
            rawA = refAArg;
            rawB = refBArg;
          } else if (refAArg) {
            rawA = refAArg;
            rawB = new Date().toISOString();
          } else {
            console.error(
              `${c.red("Error:")} provide two refs, a range (A..B), or --since <duration>`,
            );
            closeGraph(graph);
            process.exit(1);
          }

          let isoA: string;
          let isoB: string;

          try {
            isoA = resolveRef(rawA, cwd);
          } catch (err) {
            console.error(
              `${c.red("Error:")} cannot resolve ref-A "${rawA}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            closeGraph(graph);
            process.exit(1);
          }

          try {
            isoB = resolveRef(rawB, cwd);
          } catch (err) {
            console.error(
              `${c.red("Error:")} cannot resolve ref-B "${rawB}": ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            closeGraph(graph);
            process.exit(1);
          }

          // Swap if A > B; notify
          let swapped = false;
          if (isoA > isoB) {
            [isoA, isoB] = [isoB, isoA];
            swapped = true;
          }

          if (swapped && opts.format === "text") {
            console.log(`${c.dim("note: swapped refs so A < B")}\n`);
          }

          // Same timestamp → empty diff
          if (isoA === isoB) {
            if (opts.format === "json") {
              console.log(
                JSON.stringify(
                  {
                    refA: isoA,
                    refB: isoB,
                    edges: { added: [], invalidated: [], superseded: [] },
                    projections: {
                      created: [],
                      superseded: [],
                      invalidated: [],
                    },
                    ownership_shifts: [],
                    decision_reversals: [],
                  },
                  null,
                  2,
                ),
              );
            } else {
              console.log(
                "info: refs resolve to the same timestamp — empty diff",
              );
            }
            closeGraph(graph);
            process.exit(0);
          }

          // ── Validate timestamps are within the graph ─────────────────────────
          const firstEpisode = graph.db
            .query<{ timestamp: string }, []>(
              "SELECT timestamp FROM episodes ORDER BY timestamp ASC LIMIT 1",
            )
            .get();

          if (firstEpisode && isoA < firstEpisode.timestamp) {
            console.error(
              `${c.red("Error:")} ref-A (${isoA}) is before the earliest episode in the graph (${firstEpisode.timestamp}). ` +
                "Run 'engram ingest git' to populate the graph first.",
            );
            closeGraph(graph);
            process.exit(1);
          }

          // ── Narrate check ────────────────────────────────────────────────────
          if (opts.narrate) {
            console.error(
              `${c.red("Error:")} --narrate requires an AI provider to be configured. ` +
                "Run 'engram init' to configure a provider.",
            );
            closeGraph(graph);
            process.exit(2);
          }

          // ── Build diff ───────────────────────────────────────────────────────
          const kindsFilter = opts.kinds
            ? opts.kinds
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
            : undefined;

          const diff = diffGraph(graph, isoA, isoB, {
            kinds: kindsFilter,
            projectionKind: opts.projections,
            entityId: opts.entity,
            includeTransient: opts.includeTransient,
          });

          // ── Render ───────────────────────────────────────────────────────────
          const renderOpts = { includeTransient: opts.includeTransient };

          switch (opts.format) {
            case "json":
              renderJsonOutput(diff, renderOpts);
              break;
            case "markdown":
              renderMarkdownOutput(diff, renderOpts);
              break;
            default:
              renderTextOutput(diff, renderOpts);
          }
        } catch (err) {
          console.error(
            `${c.red("Error:")} ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          closeGraph(graph);
          process.exit(1);
        }

        closeGraph(graph);
      },
    );
}
