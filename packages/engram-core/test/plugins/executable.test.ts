/**
 * executable.test.ts — integration test for the subprocess transport.
 *
 * Spawns the sample-exec Python fixture and verifies episodes are written
 * to the graph. Skipped if Python is not available.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as path from "node:path";
import type { EngramGraph } from "../../src/index.js";
import { closeGraph, createGraph } from "../../src/index.js";
import { loadManifest } from "../../src/plugins/manifest.js";
import { loadExecutablePlugin } from "../../src/plugins/transport/executable.js";

const SAMPLE_EXEC_DIR = path.resolve(
  import.meta.dir,
  "../fixtures/plugins/sample-exec",
);

function pythonAvailable(): boolean {
  try {
    execSync("python3 --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const SKIP = !pythonAvailable();

describe("loadExecutablePlugin", () => {
  let graph: EngramGraph;

  beforeEach(() => {
    graph = createGraph(":memory:");
  });

  afterEach(() => {
    closeGraph(graph);
  });

  test(
    "spawns sample-exec and writes 2 episodes to graph",
    async () => {
      if (SKIP) {
        console.log(
          "Skipping executable transport test — python3 not available",
        );
        return;
      }

      const manifest = loadManifest(SAMPLE_EXEC_DIR);
      const adapter = loadExecutablePlugin(SAMPLE_EXEC_DIR, manifest);

      expect(adapter.name).toBe("sample-exec");
      expect(adapter.kind).toBe("enrichment");

      const result = await adapter.enrich(graph, {});

      expect(result.episodesCreated).toBe(2);

      const episodes = graph.db
        .query<{ source_ref: string }, []>(
          "SELECT source_ref FROM episodes ORDER BY source_ref",
        )
        .all();
      expect(episodes).toHaveLength(2);
      expect(episodes[0].source_ref).toBe("sample-exec-ep-1");
      expect(episodes[1].source_ref).toBe("sample-exec-ep-2");
    },
    { timeout: 15000 },
  );

  test("returns an adapter with correct metadata", () => {
    const manifest = loadManifest(SAMPLE_EXEC_DIR);
    const adapter = loadExecutablePlugin(SAMPLE_EXEC_DIR, manifest);

    expect(adapter.name).toBe("sample-exec");
    expect(adapter.supportsAuth).toEqual(["none"]);
    expect(adapter.supportsCursor).toBe(false);
  });
});
