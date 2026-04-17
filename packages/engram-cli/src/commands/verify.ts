/**
 * verify.ts — `engram verify` command.
 *
 * Validates .engram integrity by checking evidence invariants.
 * Exit 0 = clean, Exit 2 = integrity issues found.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph } from "engram-core";
import { closeGraph, openGraph } from "engram-core";

interface VerifyOpts {
  db: string;
}

interface IdRow {
  id: string;
  name: string;
}

export function registerVerify(program: Command): void {
  program
    .command("verify")
    .description("Validate .engram integrity (evidence invariants)")
    .option("--db <path>", "path to .engram file", ".engram")
    .addHelpText(
      "after",
      `
Examples:
  # Verify the default .engram file
  engram verify

  # Verify a specific database file
  engram verify --db path/to/project.engram

When to use:
  After manual graph edits, merges, or any operation that might leave evidence
  invariants broken. Exit code 2 means violations were found.

See also:
  engram decay   surface stale or orphaned knowledge`,
    )
    .action((opts: VerifyOpts) => {
      const dbPath = path.resolve(opts.db);

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      const violations: string[] = [];

      try {
        // Check entities without evidence
        const orphanedEntities = graph.db
          .query<IdRow, []>(`
            SELECT e.id, e.canonical_name AS name
            FROM entities e
            WHERE e.status = 'active'
              AND NOT EXISTS (
                SELECT 1 FROM entity_evidence ee WHERE ee.entity_id = e.id
              )
          `)
          .all();

        for (const entity of orphanedEntities) {
          violations.push(
            `Entity ${entity.id} (${entity.name}) has no evidence links`,
          );
        }

        // Check edges without evidence
        const orphanedEdges = graph.db
          .query<{ id: string; fact: string }, []>(`
            SELECT ed.id, ed.fact
            FROM edges ed
            WHERE ed.invalidated_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM edge_evidence ee WHERE ee.edge_id = ed.id
              )
          `)
          .all();

        for (const edge of orphanedEdges) {
          violations.push(
            `Edge ${edge.id} ("${edge.fact}") has no evidence links`,
          );
        }

        // Check for entity_evidence pointing to missing episodes
        const danglingEntityEvidence = graph.db
          .query<{ entity_id: string; episode_id: string }, []>(`
            SELECT ee.entity_id, ee.episode_id
            FROM entity_evidence ee
            WHERE NOT EXISTS (
              SELECT 1 FROM episodes ep WHERE ep.id = ee.episode_id
            )
          `)
          .all();

        for (const ev of danglingEntityEvidence) {
          violations.push(
            `entity_evidence for entity ${ev.entity_id} references missing episode ${ev.episode_id}`,
          );
        }

        // Check for edge_evidence pointing to missing episodes
        const danglingEdgeEvidence = graph.db
          .query<{ edge_id: string; episode_id: string }, []>(`
            SELECT ee.edge_id, ee.episode_id
            FROM edge_evidence ee
            WHERE NOT EXISTS (
              SELECT 1 FROM episodes ep WHERE ep.id = ee.episode_id
            )
          `)
          .all();

        for (const ev of danglingEdgeEvidence) {
          violations.push(
            `edge_evidence for edge ${ev.edge_id} references missing episode ${ev.episode_id}`,
          );
        }
      } catch (err) {
        console.error(
          `Verify failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);

      if (violations.length === 0) {
        console.log("Graph integrity OK — no violations found.");
        return;
      }

      console.error(`Found ${violations.length} integrity violation(s):`);
      for (const v of violations) {
        console.error(`  - ${v}`);
      }
      process.exit(2);
    });
}
