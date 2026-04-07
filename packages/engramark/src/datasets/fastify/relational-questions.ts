/**
 * datasets/fastify/relational-questions.ts — Relational ground-truth questions.
 *
 * 12 relational questions: require following 1-2 graph edges.
 */

import type { GroundTruthQuestion } from "./questions.js";

export const RELATIONAL_QUESTIONS: GroundTruthQuestion[] = [
  {
    id: "fastify-rel-001",
    category: "ownership",
    query_type: "relational",
    question: "hello@matteocollina.com",
    expected_entities: [
      "fastify.js",
      "lib/wrapThenable.js",
      "lib/error-handler.js",
      "lib/error-serializer.js",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from hello@matteocollina.com " +
      "to discover which files they own. Grep finds the email in commit " +
      "messages but not the owned file list.",
  },
  {
    id: "fastify-rel-002",
    category: "ownership",
    query_type: "relational",
    question: "hey@gurgun.day",
    expected_entities: [
      "lib/reply.js",
      "lib/warnings.js",
      "lib/contentTypeParser.js",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from hey@gurgun.day " +
      "to discover file ownership. Gurgun owns lib/reply.js, lib/warnings.js, " +
      "and lib/contentTypeParser.js by recency.",
  },
  {
    id: "fastify-rel-003",
    category: "ownership",
    query_type: "relational",
    question: "aras.abbasi@googlemail.com",
    expected_entities: ["lib/errors.js", "lib/logger.js", "lib/schemas.js"],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from Uzlopak (aras.abbasi) " +
      "to discover owned files: lib/errors.js, lib/logger.js, lib/schemas.js.",
  },
  {
    id: "fastify-rel-004",
    category: "ownership",
    query_type: "relational",
    question: "behemoth89@gmail.com",
    expected_entities: [
      "lib/validation.js",
      "lib/decorate.js",
      "lib/pluginUtils.js",
      "lib/request.js",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from Manuel Spigolon " +
      "(behemoth89) to discover file ownership.",
  },
  {
    id: "fastify-rel-005",
    category: "ownership",
    query_type: "relational",
    question: "dan.castillo@jasper.ai",
    expected_entities: [
      "lib/configValidator.js",
      "lib/reqIdGenFactory.js",
      "lib/symbols.js",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from dan.castillo " +
      "to discover owned files.",
  },
  {
    id: "fastify-rel-006",
    category: "co_change",
    query_type: "relational",
    question: "lib/reply.js",
    expected_entities: [
      "lib/warnings.js",
      "test/internals/reply.test.js",
      "types/reply.d.ts",
    ],
    expected_relation: "co_changes_with",
    notes:
      "Requires following co_changes_with edges from lib/reply.js to find " +
      "its co-change partners. All have confidence 0.8.",
  },
  {
    id: "fastify-rel-007",
    category: "co_change",
    query_type: "relational",
    question: "docs/Reference/Reply.md",
    expected_entities: ["lib/reply.js", "lib/warnings.js", "types/reply.d.ts"],
    expected_relation: "co_changes_with",
    notes:
      "Requires following co_changes_with edges from docs/Reference/Reply.md " +
      "to find coupled files: lib/reply.js, lib/warnings.js, types/reply.d.ts.",
  },
  {
    id: "fastify-rel-008",
    category: "ownership",
    query_type: "relational",
    question: "frazer.dev@outlook.com",
    expected_entities: [
      "build/build-error-serializer.js",
      "build/sync-version.js",
      ".github/dependabot.yml",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from Frazer Smith " +
      "to discover owned files.",
  },
  {
    id: "fastify-rel-009",
    category: "co_change",
    query_type: "relational",
    question: "test/types/type-provider.test-d.ts",
    expected_entities: ["types/route.d.ts", "types/utils.d.ts"],
    expected_relation: "co_changes_with",
    notes:
      "Requires following co_changes_with edges from the type-provider test " +
      "to find coupled type definition files.",
  },
  {
    id: "fastify-rel-010",
    category: "ownership",
    query_type: "relational",
    question: "giulio@fiscozen.it",
    expected_entities: [
      "test/logger/request.test.js",
      "test/logger/response.test.js",
      "types/context.d.ts",
    ],
    expected_relation: "likely_owner_of",
    notes:
      "Requires following likely_owner_of edges from giulio@fiscozen.it " +
      "to discover owned files.",
  },
  {
    id: "fastify-rel-011",
    category: "co_change",
    query_type: "relational",
    question: "docs/Reference/Server.md",
    expected_entities: ["lib/error-handler.js", "lib/fourOhFour.js"],
    expected_relation: "co_changes_with",
    notes:
      "Requires following co_changes_with edges from docs/Reference/Server.md " +
      "to find coupled implementation files.",
  },
  {
    id: "fastify-rel-012",
    category: "co_change",
    query_type: "relational",
    question: "docs/Reference/Warnings.md",
    expected_entities: ["lib/warnings.js"],
    expected_relation: "co_changes_with",
    notes:
      "Requires following co_changes_with edges from docs/Reference/Warnings.md " +
      "to find lib/warnings.js as a co-change partner (confidence 0.8).",
  },
];
