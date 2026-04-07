/**
 * datasets/fastify/graph-questions.ts — Graph traversal ground-truth questions.
 *
 * 8 graph traversal questions: require multi-hop reasoning or aggregation.
 */

import type { GroundTruthQuestion } from "./questions.js";

export const GRAPH_TRAVERSAL_QUESTIONS: GroundTruthQuestion[] = [
  {
    id: "fastify-graph-001",
    category: "ownership",
    query_type: "graph_traversal",
    question: "hello@matteocollina.com",
    expected_entities: [
      "fastify.js",
      "package.json",
      "lib/error-serializer.js",
    ],
    expected_relation: "co_changes_with",
    notes:
      "Multi-hop: find files owned by matteocollina (likely_owner_of), " +
      "then find their co-change partners. fastify.js co-changes with " +
      "package.json and lib/error-serializer.js (confidence 0.8). " +
      "Requires owner -> file -> co-change traversal.",
  },
  {
    id: "fastify-graph-002",
    category: "bus_factor",
    query_type: "graph_traversal",
    question: "lib/reply.js",
    expected_entities: [
      "hey@gurgun.day",
      "docs/Reference/Reply.md",
      "types/reply.d.ts",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Multi-hop: find owner of lib/reply.js (hey@gurgun.day via " +
      "likely_owner_of), then find co-change partners of lib/reply.js " +
      "(docs/Reference/Reply.md, types/reply.d.ts). Requires combining " +
      "ownership + co-change edges.",
  },
  {
    id: "fastify-graph-003",
    category: "bus_factor",
    query_type: "graph_traversal",
    question: "lib/errors.js",
    expected_entities: [
      "aras.abbasi@googlemail.com",
      "docs/Reference/Errors.md",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Multi-hop: find owner of lib/errors.js (aras.abbasi via " +
      "likely_owner_of), then find co-change partner (docs/Reference/Errors.md). " +
      "Aggregates ownership + co-change topology.",
  },
  {
    id: "fastify-graph-004",
    category: "co_change",
    query_type: "graph_traversal",
    question: "lib/warnings.js",
    expected_entities: [
      "hey@gurgun.day",
      "lib/reply.js",
      "docs/Reference/Reply.md",
      "docs/Reference/Warnings.md",
    ],
    expected_relation: "co_changes_with",
    notes:
      "Multi-hop: find owner of lib/warnings.js (hey@gurgun.day), " +
      "then traverse its co-change cluster (lib/reply.js, " +
      "docs/Reference/Reply.md, docs/Reference/Warnings.md). " +
      "Requires aggregating across ownership + co-change edges.",
  },
  {
    id: "fastify-graph-005",
    category: "ownership",
    query_type: "graph_traversal",
    question: "37849741+cesarvspr@users.noreply.github.com",
    expected_entities: [
      "lib/headRoute.js",
      "lib/noop-set.js",
      "lib/initialConfigValidation.js",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Aggregation: cesarvspr has the most authored_by edges (302) but " +
      "only owns a few lib/ files via likely_owner_of. Requires " +
      "aggregating ownership edges to identify core module ownership.",
  },
  {
    id: "fastify-graph-006",
    category: "co_change",
    query_type: "graph_traversal",
    question: "types/reply.d.ts",
    expected_entities: [
      "lib/reply.js",
      "test/types/reply.test-d.ts",
      "docs/Reference/Reply.md",
      "lib/warnings.js",
    ],
    expected_relation: "co_changes_with",
    notes:
      "Multi-hop co-change cluster: types/reply.d.ts co-changes with " +
      "lib/reply.js (0.8), test/types/reply.test-d.ts (0.8), " +
      "docs/Reference/Reply.md (0.8), lib/warnings.js (0.8). " +
      "Requires traversing the full reply co-change cluster.",
  },
  {
    id: "fastify-graph-007",
    category: "bus_factor",
    query_type: "graph_traversal",
    question: "test/internals/reply.test.js",
    expected_entities: ["hey@gurgun.day", "lib/reply.js", "types/reply.d.ts"],
    expected_relation: "co_changes_with",
    notes:
      "Multi-hop: find owner of test/internals/reply.test.js " +
      "(hey@gurgun.day via likely_owner_of), then find co-change " +
      "partners (lib/reply.js, types/reply.d.ts). Requires " +
      "traversing ownership + co-change edges.",
  },
  {
    id: "fastify-graph-008",
    category: "ownership",
    query_type: "graph_traversal",
    question: "bienzaaronj@gmail.com",
    expected_entities: ["lib/hooks.js", "types/hooks.d.ts"],
    expected_relation: "likely_owner_of",
    notes:
      "Multi-hop: bienzaaronj owns lib/hooks.js and types/hooks.d.ts " +
      "via likely_owner_of. Requires traversing ownership edges " +
      "and recognizing the hooks module cluster across source + types.",
  },
];
