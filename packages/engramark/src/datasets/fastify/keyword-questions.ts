/**
 * datasets/fastify/keyword-questions.ts — Keyword ground-truth questions.
 *
 * 20 keyword questions: answer is text-scannable in raw git log / FTS.
 */

import type { GroundTruthQuestion } from "./questions.js";

export const KEYWORD_QUESTIONS: GroundTruthQuestion[] = [
  // ─── Ownership (7) ────────────────────────────────────────────────────────

  {
    id: "fastify-own-001",
    category: "ownership",
    query_type: "keyword",
    question: "matteocollina",
    expected_entities: ["hello@matteocollina.com"],
    notes:
      "Searching 'matteocollina' finds the entity hello@matteocollina.com " +
      "via FTS on the email canonical_name. Matteo Collina is the top committer " +
      "to fastify.js (27 commits in the 500-commit window).",
  },
  {
    id: "fastify-own-002",
    category: "ownership",
    query_type: "keyword",
    question: "fastify.js",
    expected_entities: ["fastify.js"],
    expected_relation: "authored_by",
    notes:
      "fastify.js is the core entry point; entity canonical_name matches exactly.",
  },
  {
    id: "fastify-own-003",
    category: "ownership",
    query_type: "keyword",
    question: "contentTypeParser",
    expected_entities: ["lib/contentTypeParser.js", "kaka@kakawebsitedemo.com"],
    expected_relation: "authored_by",
    notes:
      "KaKa (kaka@kakawebsitedemo.com) has the most commits to lib/contentTypeParser.js " +
      "in this window (3 commits, tied with Uzlopak).",
  },
  {
    id: "fastify-own-004",
    category: "ownership",
    query_type: "keyword",
    question: "hooks",
    expected_entities: ["lib/hooks.js"],
    expected_relation: "authored_by",
    notes:
      "Uzlopak (aras.abbasi@googlemail.com) is the top committer to lib/hooks.js (3 commits).",
  },
  {
    id: "fastify-own-005",
    category: "ownership",
    query_type: "keyword",
    question: "validation",
    expected_entities: ["lib/validation.js"],
    expected_relation: "authored_by",
    notes:
      "Manuel Spigolon (behemoth89@gmail.com) is top committer to lib/validation.js (3 commits).",
  },
  {
    id: "fastify-own-006",
    category: "ownership",
    query_type: "keyword",
    question: "wrapThenable",
    expected_entities: ["lib/wrapThenable.js"],
    expected_relation: "likely_owner_of",
    notes:
      "lib/wrapThenable.js is owned by Matteo Collina via the likely_owner_of edge " +
      "(all 5 commits in this window are by hello@matteocollina.com).",
  },
  {
    id: "fastify-own-007",
    category: "ownership",
    query_type: "keyword",
    question: "pluginUtils",
    expected_entities: ["lib/pluginUtils.js"],
    expected_relation: "authored_by",
    notes:
      "lib/pluginUtils.js is primarily maintained by Manuel Spigolon (2 commits, highest in window).",
  },
  // ─── Bus Factor (7) ───────────────────────────────────────────────────────

  {
    id: "fastify-bus-001",
    category: "bus_factor",
    query_type: "keyword",
    question: "package.json",
    expected_entities: ["package.json"],
    expected_relation: "likely_owner_of",
    notes:
      "package.json is dominated by Matteo Collina (44 of ~75 commits in window). " +
      "Single-contributor dominance = high bus-factor risk.",
  },
  {
    id: "fastify-bus-002",
    category: "bus_factor",
    query_type: "keyword",
    question: "wrapThenable",
    expected_entities: ["lib/wrapThenable.js"],
    expected_relation: "likely_owner_of",
    notes:
      "lib/wrapThenable.js is exclusively authored by Matteo Collina in this 500-commit window " +
      "— all 5 commits touching the file are from hello@matteocollina.com.",
  },
  {
    id: "fastify-bus-003",
    category: "bus_factor",
    query_type: "keyword",
    question: "handleRequest",
    expected_entities: ["lib/handleRequest.js"],
    notes:
      "lib/handleRequest.js has a concentrated authorship (2 commits from one author " +
      "in the window).",
  },
  {
    id: "fastify-bus-004",
    category: "bus_factor",
    query_type: "keyword",
    question: "error-handler",
    expected_entities: ["lib/error-handler.js"],
    notes:
      "lib/error-handler.js is owned by Matteo Collina via likely_owner_of.",
  },
  {
    id: "fastify-bus-005",
    category: "bus_factor",
    query_type: "keyword",
    question: "warnings",
    expected_entities: ["lib/warnings.js"],
    notes:
      "lib/warnings.js has concentrated authorship (Gurgun Dayioglu is the likely_owner).",
  },
  {
    id: "fastify-bus-006",
    category: "bus_factor",
    query_type: "keyword",
    question: "fastify.js",
    expected_entities: ["fastify.js"],
    expected_relation: "likely_owner_of",
    notes:
      "fastify.js is owned by Matteo Collina (27 commits = dominant bus-factor risk).",
  },
  {
    id: "fastify-bus-007",
    category: "bus_factor",
    query_type: "keyword",
    question: "error-serializer",
    expected_entities: ["lib/error-serializer.js"],
    expected_relation: "likely_owner_of",
    notes:
      "lib/error-serializer.js is owned by Matteo Collina via the likely_owner_of edge. " +
      "Single-author concentration = bus-factor risk.",
  },

  // ─── Co-change (6) ────────────────────────────────────────────────────────

  {
    id: "fastify-coc-001",
    category: "co_change",
    query_type: "keyword",
    question: "fastify.js",
    expected_entities: ["fastify.js", "package.json"],
    expected_relation: "co_changes_with",
    notes:
      "fastify.js and package.json have the highest co_changes_with weight (1.0) in this window. " +
      "The query returns fastify.js as the primary entity.",
  },
  {
    id: "fastify-coc-002",
    category: "co_change",
    query_type: "keyword",
    question: "reply",
    expected_entities: ["lib/reply.js", "test/internals/reply.test.js"],
    expected_relation: "co_changes_with",
    notes:
      "lib/reply.js and test/internals/reply.test.js co-change with weight 1.0. " +
      "vcs-only finds lib/reply.js via entity FTS; grep-baseline finds both in " +
      "episode file lists.",
  },
  {
    id: "fastify-coc-003",
    category: "co_change",
    query_type: "keyword",
    question: "instance",
    expected_entities: ["types/instance.d.ts", "test/types/instance.test-d.ts"],
    expected_relation: "co_changes_with",
    notes:
      "types/instance.d.ts and test/types/instance.test-d.ts co-change with weight 1.0. " +
      "grep-baseline finds both in commit file lists touching these type files.",
  },
  {
    id: "fastify-coc-004",
    category: "co_change",
    query_type: "keyword",
    question: "errors",
    expected_entities: ["lib/errors.js", "docs/Reference/Errors.md"],
    expected_relation: "co_changes_with",
    notes:
      "lib/errors.js and docs/Reference/Errors.md co-change with weight 0.9. " +
      "Both appear in commit file lists for error-related changes.",
  },
  {
    id: "fastify-coc-005",
    category: "co_change",
    query_type: "keyword",
    question: "route",
    expected_entities: ["lib/route.js", "fastify.js"],
    expected_relation: "co_changes_with",
    notes:
      "lib/route.js and fastify.js co-change with weight 0.9. " +
      "Both appear in commit file lists for routing changes.",
  },
  {
    id: "fastify-coc-006",
    category: "co_change",
    query_type: "keyword",
    question: "request",
    expected_entities: ["lib/request.js", "types/request.d.ts"],
    expected_relation: "co_changes_with",
    notes:
      "lib/request.js co-changes with types/request.d.ts. " +
      "Both appear in commit file lists for request handling changes.",
  },
];
