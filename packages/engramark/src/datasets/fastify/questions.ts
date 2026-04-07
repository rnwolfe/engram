/**
 * datasets/fastify/questions.ts — Ground-truth Q&A dataset for the Fastify repository.
 *
 * Ground truth derived from ingesting 500 commits of fastify v4.28.1 history.
 *
 * Design notes
 * ────────────
 * The benchmark runners use SQLite FTS5 with AND semantics: every token in the
 * question string must appear in the indexed content. Natural language questions
 * ("Who has the most commits to fastify.js?") therefore return 0 results because
 * stop words like "Who", "has", "the" don't appear in entity canonical names or
 * commit messages.
 *
 * To produce meaningful, non-trivial recall scores, questions are written as
 * focused keyword queries (1–3 tokens) that:
 *   1. Match entity canonical_name / summary via entities_fts (used by vcs-only)
 *   2. Match episode content (commit messages with file lists) via episodes_fts
 *      (used by grep-baseline)
 *
 * Entity canonical name conventions (produced by ingestGitRepo):
 *   - Person entities:  email address   e.g. hello@matteocollina.com
 *   - Module entities:  relative path   e.g. lib/reply.js, fastify.js
 *
 * Query types:
 *   - keyword:         answer is text-scannable in raw git log
 *   - relational:      answer requires following 1-2 graph edges
 *   - graph_traversal: answer requires multi-hop reasoning or aggregation
 *
 * Key contributors in the 500-commit window (v4.28.1 history):
 *   hello@matteocollina.com           — Matteo Collina  (27 commits to fastify.js)
 *   aras.abbasi@googlemail.com        — Uzlopak          (top committer to lib/hooks.js)
 *   behemoth89@gmail.com              — Manuel Spigolon  (top to lib/validation.js)
 *   kaka@kakawebsitedemo.com          — KaKa             (top to lib/contentTypeParser.js)
 *   37849741+cesarvspr@users.noreply.github.com — Cesar V. Sampaio
 *   frazer.dev@outlook.com            — Frazer Smith
 *   hey@gurgun.day                    — Gürgün Dayıoğlu  (owns lib/reply.js by recency)
 *
 * Categories:
 *   ownership (7): primary authors / likely owners
 *   bus_factor (7): files dominated by ≤1 contributor
 *   co_change  (6): file pairs with co_changes_with weight ≥ 0.7 in this window
 */

/** Query complexity type for stratified benchmark analysis. */
export type QueryType = "keyword" | "relational" | "graph_traversal";

export interface GroundTruthQuestion {
  id: string;
  category: "ownership" | "bus_factor" | "co_change";
  query_type: QueryType;
  question: string;
  /** Entity canonical names that should appear in top-k results. */
  expected_entities: string[];
  /** relation_type that should appear in results, if applicable. */
  expected_relation?: string;
  notes?: string;
}

export const FASTIFY_QUESTIONS: GroundTruthQuestion[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // KEYWORD questions (20) — text-scannable in raw git log / FTS
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONAL questions (12) — require following 1-2 graph edges
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH TRAVERSAL questions (8) — require multi-hop or aggregation
  // ═══════════════════════════════════════════════════════════════════════════

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
