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

import { GRAPH_TRAVERSAL_QUESTIONS } from "./graph-questions.js";
import { KEYWORD_QUESTIONS } from "./keyword-questions.js";
import { RELATIONAL_QUESTIONS } from "./relational-questions.js";

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
  ...KEYWORD_QUESTIONS,
  ...RELATIONAL_QUESTIONS,
  ...GRAPH_TRAVERSAL_QUESTIONS,
];
