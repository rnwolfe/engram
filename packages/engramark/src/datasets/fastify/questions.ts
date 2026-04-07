/**
 * datasets/fastify/questions.ts — Ground-truth Q&A dataset for the Fastify repository.
 *
 * Representative fixture dataset modelling what real answers would look like
 * after ingesting the Fastify git history. Used by the EngRAMark benchmark runner.
 *
 * Categories:
 *  - ownership  (7 questions): primary authors, module owners
 *  - bus_factor (7 questions): single-contributor files
 *  - co_change  (6 questions): files that frequently change together
 */

export interface GroundTruthQuestion {
  id: string;
  category: "ownership" | "bus_factor" | "co_change";
  question: string;
  /** Entity canonical names that should appear in top-k results. */
  expected_entities: string[];
  /** relation_type that should appear in results, if applicable. */
  expected_relation?: string;
  notes?: string;
}

export const FASTIFY_QUESTIONS: GroundTruthQuestion[] = [
  // ─── Ownership (7) ────────────────────────────────────────────────────────

  {
    id: "fastify-own-001",
    category: "ownership",
    question: "Who is the primary author of fastify/fastify.js?",
    expected_entities: ["Matteo Collina", "fastify/fastify.js"],
    expected_relation: "authored",
    notes:
      "Matteo Collina is historically the top committer to the core entry point.",
  },
  {
    id: "fastify-own-002",
    category: "ownership",
    question: "Who owns the lib/reply.js module?",
    expected_entities: ["Tomas Della Vedova", "lib/reply.js"],
    expected_relation: "authored",
    notes: "Tomas Della Vedova has the most commits touching lib/reply.js.",
  },
  {
    id: "fastify-own-003",
    category: "ownership",
    question: "Who is the primary maintainer of lib/route.js?",
    expected_entities: ["Matteo Collina", "lib/route.js"],
    expected_relation: "maintains",
  },
  {
    id: "fastify-own-004",
    category: "ownership",
    question: "Who authored the benchmarks/ directory?",
    expected_entities: ["Matteo Collina", "benchmarks/"],
    expected_relation: "authored",
    notes: "Initial benchmark suite created by Matteo Collina.",
  },
  {
    id: "fastify-own-005",
    category: "ownership",
    question: "Who is the primary author of lib/validation.js?",
    expected_entities: ["Tomas Della Vedova", "lib/validation.js"],
    expected_relation: "authored",
  },
  {
    id: "fastify-own-006",
    category: "ownership",
    question: "Who owns test/helper.js?",
    expected_entities: ["Matteo Collina", "test/helper.js"],
    expected_relation: "authored",
  },
  {
    id: "fastify-own-007",
    category: "ownership",
    question: "Who is the primary contributor to docs/Reference/Server.md?",
    expected_entities: ["James Sumners", "docs/Reference/Server.md"],
    expected_relation: "authored",
    notes: "James Sumners has significantly contributed to documentation.",
  },

  // ─── Bus Factor (7) ───────────────────────────────────────────────────────

  {
    id: "fastify-bus-001",
    category: "bus_factor",
    question:
      "Which files have only one contributor in the last year and are thus high bus-factor risk?",
    expected_entities: ["lib/logger.js", "lib/content-type-parser.js"],
    notes:
      "Singleton-authored files represent bus-factor risk if contributor leaves.",
  },
  {
    id: "fastify-bus-002",
    category: "bus_factor",
    question:
      "Is lib/logger.js a single-author file, making it a bus factor risk?",
    expected_entities: ["lib/logger.js"],
    expected_relation: "sole_author",
    notes: "logger.js has historically had one primary author.",
  },
  {
    id: "fastify-bus-003",
    category: "bus_factor",
    question:
      "Which utility files under lib/ have had only one committer in the past 12 months?",
    expected_entities: ["lib/errors.js", "lib/pluginUtils.js"],
    notes: "Small utility files are often touched by a single author.",
  },
  {
    id: "fastify-bus-004",
    category: "bus_factor",
    question: "Does types/index.d.ts have a single owner?",
    expected_entities: ["types/index.d.ts"],
    expected_relation: "sole_author",
  },
  {
    id: "fastify-bus-005",
    category: "bus_factor",
    question:
      "Which configuration files (e.g. .eslintrc, .github/workflows) have a single contributor?",
    expected_entities: [".github/workflows/ci.yml", "Matteo Collina"],
    expected_relation: "sole_author",
  },
  {
    id: "fastify-bus-006",
    category: "bus_factor",
    question: "Are there any benchmark scripts maintained by only one person?",
    expected_entities: ["benchmarks/benchmark.js", "Matteo Collina"],
    expected_relation: "sole_author",
  },
  {
    id: "fastify-bus-007",
    category: "bus_factor",
    question: "Which test files have had exactly one contributor?",
    expected_entities: ["test/internals/reply.test.js"],
    notes: "Single-author test files may lack review coverage.",
  },

  // ─── Co-change (6) ────────────────────────────────────────────────────────

  {
    id: "fastify-coc-001",
    category: "co_change",
    question:
      "Which files most frequently change together with fastify/fastify.js?",
    expected_entities: ["lib/route.js", "fastify/fastify.js"],
    expected_relation: "co_changes_with",
    notes:
      "Core entry point and route module are tightly coupled and change together.",
  },
  {
    id: "fastify-coc-002",
    category: "co_change",
    question: "Which files change together with lib/reply.js?",
    expected_entities: ["lib/request.js", "lib/reply.js"],
    expected_relation: "co_changes_with",
    notes:
      "request and reply are symmetric; changes to one often require changes to the other.",
  },
  {
    id: "fastify-coc-003",
    category: "co_change",
    question:
      "What files are commonly modified in the same commit as lib/validation.js?",
    expected_entities: ["lib/schema-controller.js", "lib/validation.js"],
    expected_relation: "co_changes_with",
  },
  {
    id: "fastify-coc-004",
    category: "co_change",
    question: "Which test files frequently change together with lib/route.js?",
    expected_entities: ["test/route.test.js", "lib/route.js"],
    expected_relation: "co_changes_with",
    notes: "Route tests are expected to co-change with route implementation.",
  },
  {
    id: "fastify-coc-005",
    category: "co_change",
    question:
      "Which files change together when the TypeScript types are updated?",
    expected_entities: ["types/index.d.ts", "test/types/index.test-d.ts"],
    expected_relation: "co_changes_with",
    notes: "Type definition changes require type test updates.",
  },
  {
    id: "fastify-coc-006",
    category: "co_change",
    question: "Which files change together most often with package.json?",
    expected_entities: ["package.json", "package-lock.json"],
    expected_relation: "co_changes_with",
    notes: "Lock file always changes with package.json for dependency updates.",
  },
];
