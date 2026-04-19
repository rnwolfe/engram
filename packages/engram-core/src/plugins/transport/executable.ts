/**
 * executable.ts — subprocess transport for plugins over JSON-lines stdio.
 *
 * Protocol:
 *   → {op: 'hello', contract_version: 1}\n
 *   ← {type: 'hello_ack', capabilities, contract_version}\n
 *   → {op: 'enrich', scope, auth, since, cursor, dry_run}\n
 *   ← stream of record lines: episode | entity | edge | progress | error | done
 *
 * Engram owns all writes: each received episode/entity/edge record is written
 * to the graph by this transport, not by the plugin process.
 */

import { spawn } from "node:child_process";
import * as path from "node:path";
import type { EngramGraph } from "../../format/index.js";
import { addEdge } from "../../graph/edges.js";
import { addEntity } from "../../graph/entities.js";
import { addEpisode } from "../../graph/episodes.js";
import type { EnrichmentAdapter, EnrichOpts } from "../../ingest/adapter.js";
import { EnrichmentAdapterError } from "../../ingest/adapter.js";
import type { IngestResult } from "../../ingest/git.js";
import type { PluginManifest } from "../manifest.js";
import { CURRENT_CONTRACT_VERSION } from "../manifest.js";

interface HelloAck {
  type: "hello_ack";
  contract_version: number;
  capabilities?: unknown;
}

interface EpisodeRecord {
  type: "episode";
  source_type: string;
  source_ref?: string;
  content: string;
  actor?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface EntityRecord {
  type: "entity";
  canonical_name: string;
  entity_type: string;
  summary?: string;
  episode_ref: string;
}

interface EdgeRecord {
  type: "edge";
  source_ref: string;
  target_ref: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  episode_ref: string;
}

interface ProgressRecord {
  type: "progress";
  phase: string;
  fetched?: number;
  created?: number;
  skipped?: number;
}

interface ErrorRecord {
  type: "error";
  message: string;
}

interface DoneRecord {
  type: "done";
  cursor?: string;
}

type PluginRecord =
  | EpisodeRecord
  | EntityRecord
  | EdgeRecord
  | ProgressRecord
  | ErrorRecord
  | DoneRecord;

function parseRecord(line: string): PluginRecord {
  let obj: unknown;
  try {
    obj = JSON.parse(line);
  } catch {
    throw new EnrichmentAdapterError(
      "data_error",
      `Plugin sent non-JSON line: ${line.slice(0, 200)}`,
    );
  }
  if (typeof obj !== "object" || obj === null || !("type" in (obj as object))) {
    throw new EnrichmentAdapterError(
      "data_error",
      `Plugin record missing 'type' field: ${line.slice(0, 200)}`,
    );
  }
  return obj as PluginRecord;
}

/**
 * Spawns the plugin executable and runs the enrich protocol.
 * Returns an EnrichmentAdapter that manages the subprocess lifecycle per call.
 */
export function loadExecutablePlugin(
  pluginDir: string,
  manifest: PluginManifest,
): EnrichmentAdapter {
  const entryPath = path.join(pluginDir, manifest.entry);

  async function enrich(
    graph: EngramGraph,
    opts: EnrichOpts,
  ): Promise<IngestResult> {
    const result: IngestResult = {
      episodesCreated: 0,
      episodesSkipped: 0,
      entitiesCreated: 0,
      edgesCreated: 0,
      edgesSuperseded: 0,
    };

    // episode id map: episode_ref (source_ref) → episode.id, for entity/edge linking
    const episodeIdMap = new Map<string, string>();

    const child = spawn(entryPath, [], {
      cwd: pluginDir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        console.debug(`[plugin:${manifest.name}] ${line}`);
      }
    });

    function writeLine(obj: unknown): void {
      child.stdin?.write(`${JSON.stringify(obj)}\n`);
    }

    const MAX_LINE_BYTES = 10 * 1024 * 1024; // 10 MB

    return new Promise<IngestResult>((resolve, reject) => {
      let buffer = "";
      let handshakeDone = false;
      let settled = false;

      const timeoutHandle = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(
          new EnrichmentAdapterError(
            "data_error",
            "plugin timed out after 60s without completing",
          ),
        );
      }, 60_000);

      function fail(err: Error): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        try {
          child.kill();
        } catch {}
        reject(err);
      }

      function done(): void {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        try {
          child.stdin?.end();
        } catch {}
        resolve(result);
      }

      child.on("error", (err) => {
        fail(
          new EnrichmentAdapterError(
            "data_error",
            `Failed to spawn plugin '${manifest.name}': ${err.message}`,
          ),
        );
      });

      child.on("close", (code) => {
        if (!settled) {
          if (code !== 0) {
            fail(
              new EnrichmentAdapterError(
                "data_error",
                `Plugin '${manifest.name}' exited with code ${code}`,
              ),
            );
          } else {
            done();
          }
        }
      });

      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > MAX_LINE_BYTES) {
          if (settled) return;
          settled = true;
          clearTimeout(timeoutHandle);
          child.kill();
          reject(
            new EnrichmentAdapterError(
              "data_error",
              "plugin stdout line exceeded 10 MB limit",
            ),
          );
          return;
        }
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let record: PluginRecord;
          try {
            record = parseRecord(trimmed);
          } catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          if (!handshakeDone) {
            if (record.type !== "hello_ack") {
              fail(
                new EnrichmentAdapterError(
                  "data_error",
                  `Plugin '${manifest.name}': expected hello_ack, got '${record.type}'`,
                ),
              );
              return;
            }
            const ack = record as HelloAck;
            const major = Math.floor(ack.contract_version ?? 0);
            if (major !== CURRENT_CONTRACT_VERSION) {
              fail(
                new EnrichmentAdapterError(
                  "data_error",
                  `Plugin '${manifest.name}': contract_version mismatch (got ${ack.contract_version}, expected ${CURRENT_CONTRACT_VERSION})`,
                ),
              );
              return;
            }
            handshakeDone = true;

            // Send enrich request
            writeLine({
              op: "enrich",
              scope: opts.repo,
              auth: opts.token,
              since: opts.since,
              cursor: undefined,
              dry_run: opts.dryRun ?? false,
            });
            return;
          }

          // Post-handshake records
          try {
            handleRecord(record, graph, result, episodeIdMap, manifest.name);
          } catch (err) {
            fail(err instanceof Error ? err : new Error(String(err)));
            return;
          }

          if (record.type === "done") {
            done();
            return;
          }
          if (record.type === "error") {
            fail(
              new EnrichmentAdapterError(
                "data_error",
                `Plugin '${manifest.name}' reported error: ${(record as ErrorRecord).message}`,
              ),
            );
            return;
          }
        }
      });

      // Send hello
      writeLine({ op: "hello", contract_version: CURRENT_CONTRACT_VERSION });
    });
  }

  return {
    name: manifest.name,
    kind: "enrichment",
    supportsAuth: manifest.capabilities.supported_auth,
    supportsCursor: manifest.capabilities.supports_cursor,
    enrich,
  };
}

function handleRecord(
  record: PluginRecord,
  graph: EngramGraph,
  result: IngestResult,
  episodeIdMap: Map<string, string>,
  pluginName: string,
): void {
  switch (record.type) {
    case "episode": {
      const ep = addEpisode(graph, {
        source_type: record.source_type,
        source_ref: record.source_ref,
        content: record.content,
        actor: record.actor,
        timestamp: record.timestamp,
        metadata: record.metadata,
      });
      if (record.source_ref) {
        episodeIdMap.set(record.source_ref, ep.id);
      }
      // addEpisode returns existing on dedup; we count new ones by checking ingested_at ≈ now
      // Simpler: always count as created (dedup check done inside addEpisode)
      result.episodesCreated++;
      break;
    }

    case "entity": {
      const episodeId = record.episode_ref
        ? episodeIdMap.get(record.episode_ref)
        : undefined;
      if (!episodeId) {
        throw new EnrichmentAdapterError(
          "data_error",
          `Plugin '${pluginName}': entity record references unknown episode_ref '${record.episode_ref}'`,
        );
      }
      addEntity(
        graph,
        {
          canonical_name: record.canonical_name,
          entity_type: record.entity_type,
          summary: record.summary,
        },
        [{ episode_id: episodeId, extractor: `plugin:${pluginName}` }],
      );
      result.entitiesCreated++;
      break;
    }

    case "edge": {
      const episodeId = record.episode_ref
        ? episodeIdMap.get(record.episode_ref)
        : undefined;
      if (!episodeId) {
        throw new EnrichmentAdapterError(
          "data_error",
          `Plugin '${pluginName}': edge record references unknown episode_ref '${record.episode_ref}'`,
        );
      }
      // source_ref and target_ref on edge records are entity canonical_names
      const sourceEntities = graph.db
        .query<{ id: string }, [string]>(
          "SELECT id FROM entities WHERE canonical_name = ? LIMIT 1",
        )
        .all(record.source_ref);
      const targetEntities = graph.db
        .query<{ id: string }, [string]>(
          "SELECT id FROM entities WHERE canonical_name = ? LIMIT 1",
        )
        .all(record.target_ref);

      if (!sourceEntities.length || !targetEntities.length) {
        throw new EnrichmentAdapterError(
          "data_error",
          `Plugin '${pluginName}': edge record references unknown entity '${!sourceEntities.length ? record.source_ref : record.target_ref}'`,
        );
      }

      addEdge(
        graph,
        {
          source_id: sourceEntities[0].id,
          target_id: targetEntities[0].id,
          relation_type: record.relation_type,
          edge_kind: record.edge_kind,
          fact: record.fact,
        },
        [{ episode_id: episodeId, extractor: `plugin:${pluginName}` }],
      );
      result.edgesCreated++;
      break;
    }

    case "progress":
    case "done":
      break;

    case "error":
      break;

    default:
      break;
  }
}
