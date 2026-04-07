/**
 * fixtures/fastify.ts — Pinned Fastify repository fixture for EngRAMark.
 *
 * Defines the canonical Fastify repo URL and pinned release tag used by bench.ts.
 *
 * To update the pinned tag:
 *   1. Browse https://github.com/fastify/fastify/releases and pick a new tag.
 *   2. Update FASTIFY_TAG below.
 *   3. Re-run `bun run -F engramark bench` to verify the dataset questions still pass.
 *   4. If question expected_entities change (e.g. new top committers), update
 *      src/datasets/fastify/questions.ts accordingly.
 */

/** GitHub URL for the Fastify repository. */
export const FASTIFY_REPO_URL = "https://github.com/fastify/fastify";

/**
 * Pinned release tag for the benchmark fixture.
 *
 * Pinned to a specific tag to ensure reproducible benchmark results.
 * Shallow-clone with `--depth 500 --branch <tag>` provides ~500 commits of
 * history for meaningful bus-factor, co-change, and ownership analysis.
 */
export const FASTIFY_TAG = "v4.28.1";
