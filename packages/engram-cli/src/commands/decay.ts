import * as path from "node:path";
import type { Command } from "commander";
import type { DecayReport, EngramGraph } from "engram-core";
import {
  closeGraph,
  getDecayReport,
  openGraph,
  resolveDbPath,
} from "engram-core";

interface DecayOpts {
  staleDays: string;
  dormantDays: string;
  format: string;
  db: string;
  j?: boolean;
}

function renderTable(report: DecayReport): void {
  console.log(`Decay Report — ${report.generated_at}`);
  console.log(
    `Entities: ${report.total_entities}  Edges: ${report.total_edges}`,
  );
  console.log("");
  console.log("Summary:");
  console.log(`  stale_evidence:     ${report.summary.stale_evidence}`);
  console.log(`  contradicted:       ${report.summary.contradicted}`);
  console.log(`  concentrated_risk:  ${report.summary.concentrated_risk}`);
  console.log(`  dormant_owner:      ${report.summary.dormant_owner}`);
  console.log(`  orphaned:           ${report.summary.orphaned}`);

  if (report.decay_items.length === 0) {
    console.log("\nNo decay items found.");
    return;
  }

  console.log(`\nDecay Items (${report.decay_items.length}):`);
  for (const item of report.decay_items) {
    console.log(
      `  [${item.severity.toUpperCase()}] [${item.decay_category}] ${item.name}`,
    );
    console.log(`    ${item.details}`);
    if (item.last_evidence_at) {
      console.log(`    last evidence: ${item.last_evidence_at}`);
    }
  }
}

export function registerDecay(program: Command): void {
  program
    .command("decay")
    .description("Show knowledge decay report")
    .option("--stale-days <n>", "days without evidence to mark as stale", "180")
    .option("--dormant-days <n>", "days of owner inactivity to flag", "90")
    .option("--format <fmt>", "output format: table or json", "table")
    .option("-j", "shorthand for --format json")
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Show decay report with default thresholds (180-day stale, 90-day dormant)
  engram decay

  # Tighten the stale threshold to 60 days
  engram decay --stale-days 60

  # Tighten both thresholds
  engram decay --stale-days 60 --dormant-days 30

  # JSON output for scripting
  engram decay --format json

When to use:
  Run periodically to surface knowledge that has gone stale or owners who
  have become inactive — before their absence causes incidents.

See also:
  engram verify   check graph evidence invariants`,
    )
    .action((opts: DecayOpts) => {
      if (opts.j) opts.format = "json";
      const dbPath = resolveDbPath(path.resolve(opts.db));
      const staleDays = parseInt(opts.staleDays, 10);
      const dormantDays = parseInt(opts.dormantDays, 10);
      const format = opts.format;

      if (Number.isNaN(staleDays) || staleDays < 1) {
        console.error("Error: --stale-days must be a positive integer");
        process.exit(1);
      }
      if (Number.isNaN(dormantDays) || dormantDays < 1) {
        console.error("Error: --dormant-days must be a positive integer");
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

      let report: DecayReport;
      try {
        report = getDecayReport(graph, {
          stale_days: staleDays,
          dormant_days: dormantDays,
        });
        closeGraph(graph);
      } catch (err) {
        console.error(
          `Decay report failed: ${err instanceof Error ? err.message : String(err)}`,
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
