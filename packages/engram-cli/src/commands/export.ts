/**
 * export.ts — `engram export` command.
 *
 * Exports the graph as deterministic JSONL (one object per line, sorted by ID)
 * or as markdown summaries. Includes `engram export wiki` subcommand.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph, Projection } from "engram-core";
import {
  closeGraph,
  findEdges,
  findEntities,
  listActiveProjections,
  openGraph,
} from "engram-core";

interface ExportOpts {
  format: string;
  db: string;
}

interface EpisodeRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  content: string;
  actor: string | null;
  status: string;
  timestamp: string;
  ingested_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Sanitize an anchor string to be filesystem-safe.
 * Replaces non-alphanumeric chars (except underscores) with '-', truncates to 64 chars.
 */
function toSlug(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

/**
 * Sanitize a kind string for use as a directory path component.
 * Strips path-traversal chars (../, slashes, null) while preserving underscores
 * so that kind names like "entity_summary" remain readable.
 */
function toKindPath(kind: string): string {
  return (
    kind
      .replace(/[/\\]/g, "-")
      .replace(/\.\./g, "-")
      .replace(/\0/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "unknown"
  );
}

/**
 * Return the last 8 chars of a projection id as a short id.
 */
function shortId(id: string): string {
  return id.slice(-8);
}

/**
 * Build the output filename for a projection.
 * Pattern: <kind>/<anchor-slug>__<short-id>.md
 */
function projectionFilename(projection: Projection): string {
  // Sanitize kind as a path component — prevents directory traversal
  // if a malicious DB row contains kind = "../evil".
  const kindSlug = toKindPath(projection.kind);
  const anchorSlug = toSlug(projection.anchor_id ?? projection.anchor_type);
  return path.join(kindSlug, `${anchorSlug}__${shortId(projection.id)}.md`);
}

// ─── Wiki subcommand ──────────────────────────────────────────────────────────

interface WikiOpts {
  out: string;
  scope?: string;
  includeSuperseded: boolean;
}

interface WikiGlobalOpts {
  db: string;
}

function registerWiki(exportCmd: Command): void {
  exportCmd
    .command("wiki")
    .description("Materialize projections to a markdown folder (wiki export)")
    .requiredOption("--out <dir>", "output directory for wiki files")
    .option("--scope <kind>", "filter by projection kind (e.g. entity_summary)")
    .option("--include-superseded", "include invalidated projections", false)
    .action(function (this: Command, opts: WikiOpts) {
      const globalOpts = this.optsWithGlobals<WikiGlobalOpts & WikiOpts>();
      const dbPath = path.resolve(globalOpts.db ?? ".engram");
      const outDir = path.resolve(opts.out);

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        // Query projections
        let projections: Projection[];
        if (opts.includeSuperseded) {
          const kindFilter = opts.scope ? "WHERE kind = ?" : "";
          const params = opts.scope ? [opts.scope] : [];
          projections = graph.db
            .query<Projection, string[]>(
              `SELECT * FROM projections ${kindFilter} ORDER BY created_at DESC`,
            )
            .all(...params);
        } else {
          const results = listActiveProjections(graph, {
            kind: opts.scope,
          });
          projections = results.map((r) => r.projection);
        }

        // Create output dir
        fs.mkdirSync(outDir, { recursive: true });

        // Track written files for index
        const writtenByKind = new Map<
          string,
          Array<{ filename: string; anchorSlug: string }>
        >();
        let filesWritten = 0;

        for (const projection of projections) {
          const relPath = projectionFilename(projection);
          const absPath = path.join(outDir, relPath);
          const kindDir = path.join(outDir, toKindPath(projection.kind));

          fs.mkdirSync(kindDir, { recursive: true });

          if (fs.existsSync(absPath)) {
            console.warn(`warn: overwriting existing file ${relPath}`);
          }

          // Write body verbatim (round-trip property)
          fs.writeFileSync(absPath, projection.body, { encoding: "utf8" });
          filesWritten++;

          const anchorSlug = toSlug(
            projection.anchor_id ?? projection.anchor_type,
          );
          const kindEntry = writtenByKind.get(projection.kind) ?? [];
          kindEntry.push({ filename: relPath, anchorSlug });
          writtenByKind.set(projection.kind, kindEntry);
        }

        // Write index.md
        const now = new Date().toISOString();
        const indexLines: string[] = [
          "# Engram Wiki Export",
          "",
          `Generated: ${now}`,
          "",
        ];

        for (const [kind, entries] of [...writtenByKind.entries()].sort()) {
          indexLines.push(`## ${kind} (${entries.length})`);
          for (const entry of entries) {
            indexLines.push(
              `- [${entry.anchorSlug}](${entry.filename.replace(/\\/g, "/")})`,
            );
          }
          indexLines.push("");
        }

        const indexPath = path.join(outDir, "index.md");
        if (fs.existsSync(indexPath)) {
          console.warn("warn: overwriting existing file index.md");
        }
        fs.writeFileSync(indexPath, indexLines.join("\n"), {
          encoding: "utf8",
        });

        console.log(`Wrote ${filesWritten} projection file(s) to ${outDir}`);
        console.log(`Index: ${indexPath}`);
      } catch (err) {
        console.error(
          `Wiki export failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (graph) closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}

// ─── Main export command ──────────────────────────────────────────────────────

export function registerExport(program: Command): void {
  const exportCmd = program
    .command("export")
    .description(
      "Export the knowledge graph to JSONL, markdown, or wiki folder",
    )
    .option("--format <fmt>", "output format: jsonl or md", "jsonl")
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Export full graph as JSONL (default)
  engram export

  # Export as markdown summaries
  engram export --format md

  # Materialize projections to a wiki folder
  engram export wiki --out ./wiki

When to use:
  When you need a portable snapshot of the graph for backup, diffing,
  or loading into another tool.

See also:
  engram project    author projections on graph entities`,
    )
    .action((opts: ExportOpts) => {
      const dbPath = path.resolve(opts.db);

      if (opts.format !== "jsonl" && opts.format !== "md") {
        console.error("Error: --format must be 'jsonl' or 'md'");
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

      try {
        const entities = findEntities(graph).sort((a, b) =>
          a.id.localeCompare(b.id),
        );
        const edges = findEdges(graph, { include_invalidated: true }).sort(
          (a, b) => a.id.localeCompare(b.id),
        );
        const episodes = graph.db
          .query<EpisodeRow, []>("SELECT * FROM episodes ORDER BY id ASC")
          .all();

        if (opts.format === "jsonl") {
          for (const entity of entities) {
            console.log(JSON.stringify({ _type: "entity", ...entity }));
          }
          for (const edge of edges) {
            console.log(JSON.stringify({ _type: "edge", ...edge }));
          }
          for (const episode of episodes) {
            console.log(JSON.stringify({ _type: "episode", ...episode }));
          }
        } else {
          // Markdown format
          console.log("# Engram Export\n");

          console.log(`## Entities (${entities.length})\n`);
          for (const entity of entities) {
            console.log(`### ${entity.canonical_name}`);
            console.log(`- **id**: ${entity.id}`);
            console.log(`- **type**: ${entity.entity_type}`);
            console.log(`- **status**: ${entity.status}`);
            if (entity.summary) {
              console.log(`- **summary**: ${entity.summary}`);
            }
            console.log("");
          }

          console.log(`## Edges (${edges.length})\n`);
          for (const edge of edges) {
            const status = edge.invalidated_at ? " *(superseded)*" : "";
            console.log(`- [${edge.edge_kind}] ${edge.fact}${status}`);
            console.log(`  - id: ${edge.id}`);
            console.log(`  - relation: ${edge.relation_type}`);
          }

          console.log(`\n## Episodes (${episodes.length})\n`);
          for (const ep of episodes) {
            console.log(`### ${ep.id}`);
            console.log(
              `- **source**: ${ep.source_type}${ep.source_ref ? ` (${ep.source_ref})` : ""}`,
            );
            console.log(`- **timestamp**: ${ep.timestamp}`);
            if (ep.actor) {
              console.log(`- **actor**: ${ep.actor}`);
            }
            const snippet =
              ep.content.length > 200
                ? `${ep.content.slice(0, 200)}…`
                : ep.content;
            console.log(`\n${snippet}\n`);
          }
        }
      } catch (err) {
        console.error(
          `Export failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });

  registerWiki(exportCmd);
}
