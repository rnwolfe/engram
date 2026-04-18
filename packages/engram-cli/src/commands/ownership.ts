/**
 * ownership.ts — `engram ownership` command.
 *
 * Computes an ownership risk report combining decay signals and likely_owner_of edges.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type {
  EngramGraph,
  OwnershipReport,
  OwnershipRiskEntry,
} from "engram-core";
import {
  closeGraph,
  getOwnershipReport,
  openGraph,
  resolveDbPath,
} from "engram-core";

interface OwnershipOpts {
  limit: string;
  module?: string;
  format: string;
  minConfidence: string;
  db: string;
  j?: boolean;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderTable(report: OwnershipReport): void {
  console.log(`Ownership Risk Report — ${report.generated_at}`);
  console.log(
    `Analyzed: ${report.total_entities_analyzed} entities  Critical: ${report.critical_count}  Elevated: ${report.elevated_count}  Stable: ${report.stable_count}`,
  );
  console.log("");

  if (report.entries.length === 0) {
    console.log("No ownership risk entries found.");
    return;
  }

  const byLevel = {
    critical: report.entries.filter((e) => e.risk_level === "critical"),
    elevated: report.entries.filter((e) => e.risk_level === "elevated"),
    stable: report.entries.filter((e) => e.risk_level === "stable"),
  };

  if (byLevel.critical.length > 0) {
    console.log(`CRITICAL (${byLevel.critical.length})`);
    for (const entry of byLevel.critical) {
      renderEntry(entry);
    }
    console.log("");
  }

  if (byLevel.elevated.length > 0) {
    console.log(`ELEVATED (${byLevel.elevated.length})`);
    for (const entry of byLevel.elevated) {
      renderEntry(entry);
    }
    console.log("");
  }

  if (byLevel.stable.length > 0) {
    console.log(`STABLE (${byLevel.stable.length})`);
    for (const entry of byLevel.stable) {
      renderEntry(entry);
    }
    console.log("");
  }
}

function renderEntry(entry: OwnershipRiskEntry): void {
  console.log(`  ${entry.entity_name}`);

  if (entry.owner_name) {
    const conf = (entry.owner_confidence * 100).toFixed(0);
    console.log(`    Owner: ${entry.owner_name} (confidence ${conf}%)`);
  } else {
    console.log("    Owner: none found");
  }

  if (entry.days_since_owner_activity !== null) {
    const label = entry.days_since_owner_activity > 180 ? "dormant" : "active";
    console.log(
      `    Status: ${label} — last activity ${entry.days_since_owner_activity} days ago`,
    );
  }

  if (entry.decay_types.length > 0) {
    console.log(`    Decay signals: ${entry.decay_types.join(", ")}`);
  }

  if (entry.coupling_count > 0) {
    console.log(`    Coupling: ${entry.coupling_count} co_changes_with edges`);
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerOwnership(program: Command): void {
  program
    .command("ownership")
    .description(
      "Show ownership risk report combining decay signals and owner analysis",
    )
    .option("--limit <n>", "maximum number of entries to show", "20")
    .option("--module <path>", "scope to entities under this path prefix")
    .option("--format <fmt>", "output format: table or json", "table")
    .option("-j", "shorthand for --format json")
    .option(
      "--min-confidence <f>",
      "minimum likely_owner_of edge confidence (0.0-1.0)",
      "0.1",
    )
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Full ownership risk report
  engram ownership

  # Scoped to a path prefix
  engram ownership --module src/api

  # JSON output for scripting
  engram ownership --format json

When to use:
  Understand who has historically worked on a module or feature, and surface
  entities with decayed or missing ownership signals.

See also:
  engram show      display full entity details by ID
  engram stats     quick count of graph contents`,
    )
    .action((opts: OwnershipOpts) => {
      if (opts.j) opts.format = "json";
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const limit = parseInt(opts.limit, 10);
      const minConfidence = parseFloat(opts.minConfidence);
      const format = opts.format;

      if (Number.isNaN(limit) || limit < 1) {
        console.error("Error: --limit must be a positive integer");
        process.exit(1);
      }

      if (
        Number.isNaN(minConfidence) ||
        minConfidence < 0 ||
        minConfidence > 1
      ) {
        console.error(
          "Error: --min-confidence must be a number between 0 and 1",
        );
        process.exit(1);
      }

      if (format !== "table" && format !== "json") {
        console.error("Error: --format must be 'table' or 'json'");
        process.exit(1);
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      let report: OwnershipReport;
      try {
        report = getOwnershipReport(graph, {
          limit,
          module: opts.module,
          min_confidence: minConfidence,
        });
        closeGraph(graph);
      } catch (err) {
        console.error(
          `Ownership report failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
        return;
      }

      if (format === "json") {
        console.log(JSON.stringify(report, null, 2));
      } else {
        renderTable(report);
      }
    });
}
