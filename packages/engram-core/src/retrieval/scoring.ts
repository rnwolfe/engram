/**
 * scoring.ts — Scoring helpers for the retrieval engine.
 *
 * Provides normalization and composite score computation for search results.
 */

export interface ScoreComponents {
  fts_score: number; // FTS5 rank normalized to 0-1
  graph_score: number; // 1-hop neighbor count, normalized
  temporal_score: number; // recency decay (0-1)
  evidence_score: number; // evidence strength (0-1)
  vector_score: number; // always 0.0 (deferred)
}

/**
 * Weights for composite score computation.
 * Hybrid mode boosts graph_score slightly at the expense of fts_score.
 */
const WEIGHTS_FULLTEXT = {
  fts: 0.4,
  evidence: 0.3,
  temporal: 0.2,
  graph: 0.1,
  vector: 0.0,
};

const WEIGHTS_HYBRID = {
  fts: 0.25,
  evidence: 0.25,
  temporal: 0.15,
  graph: 0.1,
  vector: 0.25,
};

/**
 * Half-life of 30 days: λ = ln(2) / 30
 */
const LAMBDA = Math.LN2 / 30;

/**
 * Normalize FTS5 rank to [0, 1].
 * FTS5 rank is a negative float: lower (more negative) = worse match.
 * We negate and apply a sigmoid-like normalization.
 *
 * The raw rank is typically in range [-50, 0] for typical queries.
 * We use a simple min-max normalization across the result set.
 */
export function normalizeFtsRanks(ranks: number[]): number[] {
  if (ranks.length === 0) return [];

  const negated = ranks.map((r) => -r);
  const max = Math.max(...negated);
  const min = Math.min(...negated);

  if (max === min) {
    // All ranks are equal — return 1.0 for all (they all matched equally well)
    return ranks.map(() => 1.0);
  }

  return negated.map((r) => (r - min) / (max - min));
}

/**
 * Compute temporal score using exponential decay.
 * Returns 1.0 for very recent items and approaches 0 for old items.
 *
 * @param updatedAt ISO8601 UTC timestamp of last update
 * @param referenceDate Optional reference date (defaults to now)
 */
export function computeTemporalScore(
  updatedAt: string,
  referenceDate?: Date,
): number {
  const ref = referenceDate ?? new Date();
  const updated = new Date(updatedAt);
  const daysSince = (ref.getTime() - updated.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSince < 0) return 1.0; // Future timestamp — treat as current
  return Math.exp(-LAMBDA * daysSince);
}

/**
 * Normalize evidence count to [0, 1] using a logarithmic scale.
 * count=1 → ~0.5, count=10 → ~0.83, count=100 → ~1.0
 * Episodes always return 1.0.
 */
export function normalizeEvidenceCount(count: number): number {
  if (count <= 0) return 0;
  // log1p(1) ≈ 0.693, log1p(9) ≈ 2.303, log1p(99) ≈ 4.605
  // We use log1p(count) / log1p(100) to get a 0-1 range
  return Math.min(1.0, Math.log1p(count) / Math.log1p(100));
}

/**
 * Normalize edge/neighbor count to [0, 1] using logarithmic scale.
 */
export function normalizeGraphScore(edgeCount: number): number {
  if (edgeCount <= 0) return 0;
  return Math.min(1.0, Math.log1p(edgeCount) / Math.log1p(50));
}

/**
 * Compute composite score from components.
 */
export function computeCompositeScore(
  components: ScoreComponents,
  mode: "fulltext" | "hybrid" = "fulltext",
): number {
  const w = mode === "hybrid" ? WEIGHTS_HYBRID : WEIGHTS_FULLTEXT;

  return (
    w.fts * components.fts_score +
    w.evidence * components.evidence_score +
    w.temporal * components.temporal_score +
    w.graph * components.graph_score +
    w.vector * components.vector_score
  );
}
