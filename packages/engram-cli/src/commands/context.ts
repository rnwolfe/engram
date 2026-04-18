/**
 * context.ts — `engram context` command.
 *
 * Assembles a token-budgeted context pack from the knowledge graph for a
 * given query and writes it to stdout. Intended for injection into agent
 * prompts via harness plugins or manual use.
 *
 * Output includes: ranked entities (with type), edges (with kind), and
 * evidence excerpts from backing episodes. A budget accounting line at the
 * top lets the consumer know how much was truncated.
 */

import * as path from "node:path";
import type { Command } from "commander";
import type { EngramGraph, Entity, Episode } from "engram-core";
import {
  closeGraph,
  createProvider,
  getEntity,
  getEpisode,
  openGraph,
  search,
} from "engram-core";

// ---------------------------------------------------------------------------
// Query preprocessing
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "doing",
  "done",
  "have",
  "has",
  "had",
  "what",
  "how",
  "why",
  "where",
  "when",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "it",
  "its",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "from",
  "by",
  "with",
  "about",
  "and",
  "or",
  "but",
  "if",
  "not",
  "can",
  "will",
  "would",
  "could",
  "should",
  // Connective words that survive the above list but carry no search signal
  "rather",
  "than",
  "instead",
  "because",
  "since",
  "also",
  "just",
  "even",
  "only",
  "both",
  "more",
  "most",
  "less",
  "very",
  "such",
  "each",
  "any",
]);

/**
 * Strip stop words from a natural language query so FTS receives only
 * meaningful terms. Falls back to the original query if stripping removes
 * everything (e.g. the query is a file path or symbol name).
 */
function toFtsQuery(query: string): string {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
  return terms.length > 0 ? terms.join(" ") : query.trim();
}

// ---------------------------------------------------------------------------
// Token budget helpers
// ---------------------------------------------------------------------------

const CHARS_PER_TOKEN = 4; // rough 4-char/token estimate

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// Truncation limits per episode source_type (in characters).
// Source file bodies can be huge; commit messages are short.
const EPISODE_EXCERPT_CHARS: Record<string, number> = {
  git_commit: 400,
  source: 500,
  github_pr: 500,
  github_issue: 500,
  manual: 600,
};
const EPISODE_EXCERPT_DEFAULT = 400;

function excerptEpisode(ep: Episode): string {
  const limit =
    EPISODE_EXCERPT_CHARS[ep.source_type] ?? EPISODE_EXCERPT_DEFAULT;
  const content = ep.content.trim();
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}…`;
}

// Longer excerpts for directly retrieved discussions — PR/issue bodies
// contain design rationale and deserve more space than entity provenance.
const DISCUSSION_EXCERPT_CHARS: Record<string, number> = {
  github_pr: 1200,
  github_issue: 1000,
  git_commit: 600,
};

function excerptDiscussion(content: string, sourceType: string): string {
  const limit = DISCUSSION_EXCERPT_CHARS[sourceType] ?? 800;
  const trimmed = content.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}…`;
}

// ---------------------------------------------------------------------------
// Markdown assembly
// ---------------------------------------------------------------------------

interface ContextOpts {
  tokenBudget: number;
  format: "md" | "json";
  /** Minimum normalized confidence (0.0–1.0) for a discussion hit to be included. */
  minConfidence: number;
  verbose: boolean;
  /** Hard cap on entities included, applied before the token budget loop. */
  maxEntities?: number;
  /** Hard cap on edges included, applied before the token budget loop. */
  maxEdges?: number;
}

interface EnrichedEntity {
  result_id: string;
  canonical_name: string;
  entity_type: string;
  score: number;
  provenance: string[];
}

interface EnrichedEdge {
  result_id: string;
  fact: string;
  edge_kind: string;
  valid_from: string | null;
  valid_until: string | null;
  score: number;
  provenance: string[];
}

interface EvidenceExcerpt {
  episode_id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  excerpt: string;
}

interface DirectEpisodeHit {
  episode_id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  excerpt: string;
  score: number;
}

interface ContextPack {
  query: string;
  tokenBudgetUsed: number;
  tokenBudget: number;
  truncated: number;
  entities: EnrichedEntity[];
  edges: EnrichedEdge[];
  evidence: EvidenceExcerpt[];
  discussions: DirectEpisodeHit[];
}

function renderMarkdown(pack: ContextPack): string {
  const lines: string[] = [];

  lines.push(`## Context pack`);
  lines.push(
    `> Query: ${pack.query}  ` +
      `Budget: ${pack.tokenBudget} tokens | Used: ~${pack.tokenBudgetUsed} | ` +
      `${pack.entities.length + pack.edges.length} results` +
      (pack.truncated > 0 ? ` (${pack.truncated} truncated by budget)` : ""),
  );
  lines.push("");

  if (pack.entities.length > 0) {
    lines.push("### Entities");
    lines.push(
      "_Navigation aid — use as a starting point for lookup, not as authority._",
    );
    lines.push("");
    for (const e of pack.entities) {
      lines.push(
        `- \`${e.canonical_name}\` **[${e.entity_type}]** — score ${e.score.toFixed(3)} | evidence: ${e.provenance.length} episode(s)`,
      );
    }
    lines.push("");
  }

  if (pack.edges.length > 0) {
    lines.push("### Structural signals (verify before citing)");
    lines.push(
      "_Co-change, ownership, and supersession facts derived from git history. Reflect historical patterns current code may not reveal._",
    );
    lines.push("");
    for (const e of pack.edges) {
      const validity =
        e.valid_from || e.valid_until
          ? ` | valid: ${e.valid_from ?? "?"} → ${e.valid_until ?? "present"}`
          : "";
      lines.push(
        `- ${e.fact} **[${e.edge_kind}]** — score ${e.score.toFixed(3)}${validity}`,
      );
    }
    lines.push("");
  }

  if (pack.discussions.length > 0) {
    lines.push("### Possibly relevant discussions");
    lines.push(
      "_These may or may not address your question — verify by reading the source before citing._",
    );
    lines.push("");
    for (const d of pack.discussions) {
      const who = d.actor ? ` by ${d.actor}` : "";
      const ref = d.source_ref ? ` \`${d.source_ref.slice(0, 80)}\`` : "";
      lines.push(
        `**${d.source_type}**${ref} (${d.timestamp.slice(0, 10)}${who}) — confidence ${d.score.toFixed(3)}:`,
      );
      lines.push("```");
      lines.push(d.excerpt);
      lines.push("```");
      lines.push("");
    }
  }

  if (pack.evidence.length > 0) {
    lines.push("### Evidence excerpts");
    lines.push(
      "_Raw source text. Citable if you verify it matches current code._",
    );
    lines.push("");
    for (const ev of pack.evidence) {
      const who = ev.actor ? ` by ${ev.actor}` : "";
      const ref = ev.source_ref ? ` \`${ev.source_ref.slice(0, 60)}\`` : "";
      lines.push(
        `**${ev.source_type}**${ref} (${ev.timestamp.slice(0, 10)}${who}):`,
      );
      lines.push("```");
      lines.push(ev.excerpt);
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Assembly logic
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Direct entity FTS query
// ---------------------------------------------------------------------------

interface EntityFtsRow {
  id: string;
  canonical_name: string;
  entity_type: string;
  updated_at: string;
  rank: number;
}

interface EdgeFtsRow {
  id: string;
  fact: string;
  edge_kind: string;
  valid_from: string | null;
  valid_until: string | null;
  rank: number;
}

interface EvidenceRow {
  episode_id: string;
}

/**
 * Returns true for config/lockfile/fixture entities that tend to crowd out
 * real results when a large commit touches many files. These are low-signal in
 * almost every query — they contain no architectural rationale.
 *
 * Applied as a post-filter in the episode-body fallback path, where a single
 * large commit can link 15+ files as entities at equal rank.
 */
function isConfigNoise(canonicalName: string): boolean {
  const base = (canonicalName.split("/").pop() ?? canonicalName).toLowerCase();
  const NOISE_BASENAMES = new Set([
    "package.json",
    "package-lock.json",
    "bun.lock",
    "yarn.lock",
    "pnpm-lock.yaml",
    "biome.json",
    "eslint.json",
    ".eslintrc.json",
    "prettier.json",
    ".prettierrc.json",
    "tsconfig.json",
    "tsconfig.build.json",
    "tsconfig.base.json",
  ]);
  if (NOISE_BASENAMES.has(base)) return true;
  if (base.endsWith(".lock")) return true;
  if (
    base.endsWith(".toml") &&
    base !== "forge.toml" &&
    base !== "cargo.toml" &&
    base !== "pyproject.toml"
  ) {
    return true;
  }
  // Binary / generated / distribution artifacts
  if (
    base.endsWith(".bin") ||
    base.endsWith(".wasm") ||
    /\.min\.[cm]?js$/.test(base) ||
    base === "bundle.js"
  ) {
    return true;
  }
  // Test fixture paths and generated data paths — high entity count, zero rationale
  if (
    canonicalName.includes("/test/fixtures/") ||
    canonicalName.includes("/node_modules/") ||
    canonicalName.includes("/dist/") ||
    canonicalName.includes("/datasets/")
  ) {
    return true;
  }
  // Test files — they shadow the source modules they test and add no unique rationale
  // in the episode-fallback path (the source file itself is more authoritative).
  if (base.endsWith(".test.ts") || base.endsWith(".test.js")) {
    return true;
  }
  // Build/copy scripts and benchmark runners — infrastructure, not architecture.
  if (
    base === "copy-assets.ts" ||
    base === "copy-assets.js" ||
    canonicalName.includes("/engramark/") ||
    canonicalName.includes("/scripts/")
  ) {
    return true;
  }
  return false;
}

/**
 * Returns true for low-signal entities that tend to crowd out real results.
 * Specifically: all-caps DDL/schema constants like CREATE_EDGE_EVIDENCE,
 * INDEX_ENTITIES, etc. — they match query terms like "edge" or "entity"
 * but contain no architectural rationale.
 */
function isLowSignalEntity(row: EntityFtsRow): boolean {
  const sep = row.canonical_name.lastIndexOf("::");
  if (sep === -1) return false;
  const symbol = row.canonical_name.slice(sep + 2);
  // All-caps with underscores = DDL/config constant, not behavioural code
  return /^[A-Z][A-Z0-9_]{2,}$/.test(symbol);
}

/**
 * FTS query against entities_fts only — avoids episode bodies flooding the
 * ranking when source files contain the search terms many times.
 * Post-filters low-signal DDL constants.
 */
function searchEntitiesFts(
  graph: EngramGraph,
  ftsQuery: string,
  limit: number,
): EntityFtsRow[] {
  try {
    const rows = graph.db
      .query<EntityFtsRow, [string]>(
        `SELECT entities.id, entities.canonical_name, entities.entity_type,
                entities.updated_at, bm25(entities_fts) AS rank
         FROM entities_fts
         JOIN entities ON entities._rowid = entities_fts.rowid
         WHERE entities_fts MATCH ?
           AND entities.status = 'active'
         ORDER BY rank
         LIMIT ${limit * 3}`,
      )
      .all(ftsQuery);
    // Filter DDL noise then take the requested limit
    return rows.filter((r) => !isLowSignalEntity(r)).slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * LIKE-based search against entity canonical names.
 *
 * Catches two cases FTS5 misses:
 * 1. camelCase/PascalCase tokens — FTS5 treats "computeSubstrateDelta" as one
 *    token, so searching "substrate" via FTS won't match it.
 * 2. Inflectional variants — FTS5 has no stemmer, so "priority" won't match
 *    "priorities" or "modalPriorities". We generate a stem (dropping the
 *    trailing character for terms > 6 chars) to catch plural/suffix variants.
 *
 * Always runs alongside FTS, adding only entities not already in the FTS set.
 * Results are capped to avoid flooding the pack.
 */
const MIN_FTS_RESULTS = 5;

/**
 * For a given query term, return the LIKE patterns to search.
 * Includes the exact term plus a stem (last char dropped) for longer terms,
 * which handles "priority" → "priorit" matching "priorities", "modalPriorities".
 */
function likePatterns(term: string): string[] {
  const lower = term.toLowerCase();
  const patterns = [`%${lower}%`];
  // Add a stem pattern for terms long enough that one-char truncation is safe
  // and likely to represent a real inflectional variant (not just a prefix).
  if (lower.length > 6) {
    patterns.push(`%${lower.slice(0, -1)}%`);
  }
  return patterns;
}

function searchEntitiesLike(
  graph: EngramGraph,
  terms: string[],
  excludeIds: Set<string>,
  limit: number,
): EntityFtsRow[] {
  if (terms.length === 0) return [];
  try {
    // Build one LIKE condition per (term × pattern) combination.
    const allPatterns = terms.flatMap(likePatterns);
    const conditions = allPatterns
      .map(() => `LOWER(entities.canonical_name) LIKE ?`)
      .join(" OR ");
    const rows = graph.db
      .query<EntityFtsRow, string[]>(
        `SELECT id, canonical_name, entity_type, updated_at, -0.5 AS rank
         FROM entities
         WHERE (${conditions})
           AND status = 'active'
         ORDER BY length(canonical_name) ASC
         LIMIT ${limit * 2}`,
      )
      .all(...allPatterns);
    return rows
      .filter((r) => !excludeIds.has(r.id) && !isLowSignalEntity(r))
      .slice(0, limit);
  } catch {
    return [];
  }
}

/**
 * Episode FTS search — returns entities linked to episodes whose bodies
 * contain ALL the given terms (AND query, not OR). Used as a last-resort
 * fallback for queries about schema column names or concepts not visible in
 * entity/edge names (e.g. "invalidated_at", "valid_until").
 *
 * AND matching keeps results specific: an episode must reference all key terms
 * in the same body, which strongly implies it is actually about that concept.
 * OR matching floods results with files that merely mention any one term.
 *
 * Prefers source episodes over git_commit episodes (source bodies contain
 * actual field usage in context; commit messages are less structured).
 *
 * Fix 1: Config/lockfile entities (biome.json, package.json, *.lock, etc.)
 * are filtered out — they crowd out relevant code entities when a large commit
 * touches many files and all share the same baseline rank.
 *
 * Fix 2: Entities whose canonical name contains one of the raw query terms
 * get a better rank (-0.1 vs -0.3) so they sort above generic noise entities
 * after normalization.
 */
function searchEntitiesViaEpisodeFts(
  graph: EngramGraph,
  terms: string[],
  excludeIds: Set<string>,
  limit: number,
  rawQueryTerms: string[],
): EntityFtsRow[] {
  if (terms.length === 0) return [];
  // AND all terms so only episodes that mention every term are returned.
  // Terms are already FTS-quoted from the caller; reconstruct as AND expression.
  const andExpr = terms.join(" AND ");
  // Bare terms (without FTS quoting) for name-matching heuristic.
  const bareTerms = terms.map((t) => t.replace(/^"|"$/g, "").toLowerCase());
  // First, get matching episodes with their BM25 scores.
  const episodeScores = new Map<string, number>();
  try {
    const epRows = graph.db
      .query<{ id: string; rank: number }, [string]>(
        `SELECT episodes.id, bm25(episodes_fts) AS rank
         FROM episodes_fts
         JOIN episodes ON episodes._rowid = episodes_fts.rowid
         WHERE episodes_fts MATCH ?
           AND episodes.status = 'active'`,
      )
      .all(andExpr);
    for (const r of epRows) episodeScores.set(r.id, r.rank);
  } catch {
    // ignore; falls back to flat -0.3 rank below
  }

  try {
    const rows = graph.db
      .query<EntityFtsRow, [string]>(
        `SELECT DISTINCT entities.id, entities.canonical_name, entities.entity_type,
                entities.updated_at, -0.3 AS rank
         FROM episodes_fts
         JOIN episodes ON episodes._rowid = episodes_fts.rowid
         JOIN entity_evidence ON entity_evidence.episode_id = episodes.id
         JOIN entities ON entities.id = entity_evidence.entity_id
         WHERE episodes_fts MATCH ?
           AND episodes.status = 'active'
           AND entities.status = 'active'
         ORDER BY
           CASE episodes.source_type WHEN 'source' THEN 0 WHEN 'git' THEN 1 ELSE 2 END,
           entities.entity_type ASC
         LIMIT ${limit * 3}`,
      )
      .all(andExpr);

    // Collect matching episode bodies for entity-name frequency scoring.
    // We count how often each entity's file stem appears in the matching episode
    // bodies — entities like "reconcile.ts" appear 50+ times in a commit about
    // the reconcile phase, vs 2 times for unrelated "gemini-generator.ts".
    const epBodies: string[] = [];
    for (const [epId] of episodeScores) {
      try {
        const ep = graph.db
          .query<{ content: string }, [string]>(
            "SELECT content FROM episodes WHERE id = ?",
          )
          .get(epId);
        if (ep) epBodies.push(ep.content.toLowerCase());
      } catch {
        // ignore
      }
    }

    // Fix 1: filter config/noise files; Fix 2: boost rank for term-matching entities.
    // Note: BM25 ranks are negative — more negative = better match. Normalization:
    //   score = abs(rank) / abs(minRank), so a more negative rank → higher score.
    //
    // Rank assignment (applied in priority order, first match wins):
    // a) Entity canonical_name contains a raw query term or episode AND term → -0.5
    // b) Entity file stem appears frequently (≥ 5 times) in matching episode bodies → -0.45
    // c) Entity file stem appears rarely (1-4 times) → -0.35
    // d) Default fallback rank: -0.3
    const allTermsToMatch = [
      ...rawQueryTerms.map((t) => t.toLowerCase()),
      ...bareTerms,
    ].filter((t) => t.length > 0);
    return rows
      .filter(
        (r) =>
          !excludeIds.has(r.id) &&
          !isLowSignalEntity(r) &&
          !isConfigNoise(r.canonical_name),
      )
      .map((r) => {
        const lowerName = r.canonical_name.toLowerCase();
        // Priority a: canonical name contains a raw query term or episode AND term.
        if (allTermsToMatch.some((t) => lowerName.includes(t))) {
          return { ...r, rank: -0.5 };
        }
        // Priority b/c: file stem frequency in matching episode bodies.
        // Extract file stem (base name without extension).
        const base = r.canonical_name.split("/").pop() ?? "";
        const stem = base.replace(/\.[^.]+$/, "").toLowerCase();
        if (stem.length >= 6 && epBodies.length > 0) {
          const stemRe = new RegExp(`\\b${stem}`, "gi");
          const totalCount = epBodies.reduce((sum, body) => {
            return sum + (body.match(stemRe) ?? []).length;
          }, 0);
          if (totalCount >= 5) return { ...r, rank: -0.45 };
          if (totalCount >= 1) return { ...r, rank: -0.35 };
        }
        return r; // keep default -0.3
      })
      .sort((a, b) => a.rank - b.rank) // more negative rank = better score, sort ascending
      .slice(0, limit);
  } catch {
    return [];
  }
}

interface EpisodeSearchRow {
  id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  content: string;
  rank: number;
}

/**
 * Direct episode FTS search — searches episode bodies (PR descriptions,
 * issue discussions, commit messages) for the query terms.
 *
 * This is a separate retrieval track from entity FTS. It surfaces PR/issue
 * discussions that contain design rationale directly, rather than requiring
 * them to be linked as evidence for a code entity that FTS already found.
 *
 * PR and issue episodes are ranked before git_commit episodes since they
 * contain richer decision rationale. Within each type, BM25 rank determines
 * order.
 */
function searchEpisodesDirectly(
  graph: EngramGraph,
  ftsQuery: string,
  limit: number,
): EpisodeSearchRow[] {
  try {
    return graph.db
      .query<EpisodeSearchRow, [string]>(
        `SELECT episodes.id, episodes.source_type, episodes.source_ref,
                episodes.actor, episodes.timestamp, episodes.content,
                bm25(episodes_fts) AS rank
         FROM episodes_fts
         JOIN episodes ON episodes._rowid = episodes_fts.rowid
         WHERE episodes_fts MATCH ?
           AND episodes.source_type IN ('github_pr', 'github_issue', 'git_commit')
           AND episodes.status = 'active'
         ORDER BY
           CASE episodes.source_type
             WHEN 'github_pr'    THEN 0
             WHEN 'github_issue' THEN 1
             ELSE                     2
           END ASC,
           rank ASC
         LIMIT ${limit}`,
      )
      .all(ftsQuery);
  } catch {
    return [];
  }
}

/**
 * FTS query against edges_fts only.
 */
function searchEdgesFts(
  graph: EngramGraph,
  ftsQuery: string,
  limit: number,
): EdgeFtsRow[] {
  try {
    return graph.db
      .query<EdgeFtsRow, [string]>(
        `SELECT edges.id, edges.fact, edges.edge_kind,
                edges.valid_from, edges.valid_until,
                bm25(edges_fts) AS rank
         FROM edges_fts
         JOIN edges ON edges._rowid = edges_fts.rowid
         WHERE edges_fts MATCH ?
           AND edges.invalidated_at IS NULL
         ORDER BY rank
         LIMIT ${limit}`,
      )
      .all(ftsQuery);
  } catch {
    return [];
  }
}

// Source-type confidence prior: PR bodies contain richer design rationale than
// commit messages; issue bodies fall between the two.
const SOURCE_TYPE_PRIOR: Record<string, number> = {
  github_pr: 1.0,
  github_issue: 0.9,
  git_commit: 0.7,
};

/**
 * Compute a normalized discussion confidence score (0–1) that combines the
 * BM25 rank, an optional vector similarity score, and a source-type prior.
 *
 *   confidence = 0.60 × bm25_norm + 0.20 × vector_sim + 0.20 × source_prior
 *
 * When no vector scores are available the two remaining weights scale up:
 *   confidence = 0.75 × bm25_norm + 0.25 × source_prior
 */
function computeDiscussionConfidence(
  bm25Norm: number,
  vectorSim: number | undefined,
  sourceType: string,
): number {
  const prior = SOURCE_TYPE_PRIOR[sourceType] ?? 0.6;
  if (vectorSim !== undefined) {
    return 0.6 * bm25Norm + 0.2 * vectorSim + 0.2 * prior;
  }
  return 0.75 * bm25Norm + 0.25 * prior;
}

interface StructuralEdgeRow {
  id: string;
  fact: string;
  edge_kind: string;
  relation_type: string;
  valid_from: string | null;
  valid_until: string | null;
}

/**
 * Fetch edges structurally connected to a set of entities — co-change,
 * ownership, and supersession signals — ordered by relation-type priority.
 * Excludes authored_by (too noisy) and edges already shown via FTS.
 *
 * Used to surface relational signals when entity FTS returns only greppable
 * file entities that an agent could find via plain file search.
 */
function fetchStructuralEdges(
  graph: EngramGraph,
  entityIds: string[],
  excludeEdgeIds: Set<string>,
  limit: number,
): StructuralEdgeRow[] {
  if (entityIds.length === 0) return [];
  const placeholders = entityIds.map(() => "?").join(",");
  try {
    const rows = graph.db
      .query<StructuralEdgeRow, string[]>(
        `SELECT id, fact, edge_kind, relation_type, valid_from, valid_until
         FROM edges
         WHERE (source_id IN (${placeholders}) OR target_id IN (${placeholders}))
           AND invalidated_at IS NULL
           AND relation_type != 'authored_by'
         ORDER BY
           CASE relation_type
             WHEN 'co_changes_with'  THEN 0
             WHEN 'likely_owner_of'  THEN 1
             WHEN 'supersedes'       THEN 2
             ELSE 3
           END ASC,
           valid_from DESC NULLS LAST
         LIMIT ${limit * 2}`,
      )
      .all(...entityIds, ...entityIds);
    return rows.filter((r) => !excludeEdgeIds.has(r.id)).slice(0, limit);
  } catch {
    return [];
  }
}

function getEntityProvenance(graph: EngramGraph, entityId: string): string[] {
  return graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM entity_evidence WHERE entity_id = ?",
    )
    .all(entityId)
    .map((r) => r.episode_id);
}

function getEdgeProvenance(graph: EngramGraph, edgeId: string): string[] {
  return graph.db
    .query<EvidenceRow, [string]>(
      "SELECT episode_id FROM edge_evidence WHERE edge_id = ?",
    )
    .all(edgeId)
    .map((r) => r.episode_id);
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

async function assembleContextPack(
  graph: EngramGraph,
  query: string,
  opts: ContextOpts,
): Promise<ContextPack> {
  // Create provider once; used for vector episode scoring and vector entity fallback.
  const provider = createProvider();

  // Vector episode track — BM25 ∪ vector candidate set for the discussion section.
  // We run hybrid search upfront and collect episode-type results with their
  // composite scores. These scores are used in confidence computation below.
  const vectorEpisodeScores = new Map<string, number>(); // episode_id → [0,1]
  const vectorOnlyEpisodeIds = new Set<string>(); // episode IDs found by vector but not BM25
  try {
    const vectorResults = await search(graph, query, {
      limit: 30,
      mode: "hybrid",
      provider,
    });
    for (const r of vectorResults) {
      if (r.type === "episode") {
        vectorEpisodeScores.set(r.id, r.score);
        vectorOnlyEpisodeIds.add(r.id);
      }
    }
  } catch {
    // AI provider not available or embedding failed — vector track is absent.
    // BM25 + source-type prior drive confidence scoring instead.
  }

  // Stop-word filtered query for FTS; original query preserved in output.
  const ftsQuery = toFtsQuery(query);

  // Build FTS5 MATCH expression.
  // Single term: exact phrase match ("supersedeEdge").
  // Multi-term: OR across terms so entities matching any key word are returned.
  // Only terms longer than 3 chars are included to avoid noise from short words
  // that survive stop-word filtering (e.g. "new", "use", "run").
  const ftsTerms = ftsQuery
    .split(/\s+/)
    .filter((t) => t.length > 3)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .slice(0, 6); // cap at 6 terms to keep the query manageable

  const escapedFts =
    ftsTerms.length === 0
      ? `"${ftsQuery.replace(/"/g, '""')}"` // fallback: use full query as phrase
      : ftsTerms.length === 1
        ? ftsTerms[0]
        : ftsTerms.join(" OR ");

  // Run entity and edge FTS separately so episode content doesn't flood ranking.
  const entityRows = searchEntitiesFts(graph, escapedFts, 30);
  const edgeRows = searchEdgesFts(graph, escapedFts, 20);

  const seenEntityIds = new Set(entityRows.map((r) => r.id));

  // LIKE scan — always runs alongside FTS, adding only entities not already
  // in the FTS result set. Catches two gaps:
  //   1. camelCase tokens: "substrate" → matches "computeSubstrateDelta"
  //   2. Inflectional variants: "priority" → stem "priorit" → matches
  //      "priorities", "modalPriorities", "MODAL_PRIORITIES"
  // Capped at 10 new results to avoid crowding out FTS-ranked entities.
  if (ftsTerms.length > 0) {
    const rawTerms = ftsTerms.map((t) => t.replace(/^"|"$/g, "")); // strip FTS quoting
    const likeRows = searchEntitiesLike(graph, rawTerms, seenEntityIds, 10);
    for (const r of likeRows) {
      entityRows.push(r);
      seenEntityIds.add(r.id);
    }
  }

  // Fallback — episode body FTS for queries about column names / concepts
  // not present in entity canonical names (e.g. "invalidated_at", "valid_until").
  // Only use identifier-like terms (containing underscore or mixed-case) for the
  // AND expression — natural language words like "tracked" or "separately" don't
  // appear in code bodies and make the AND too restrictive.
  if (entityRows.length < MIN_FTS_RESULTS && ftsTerms.length > 0) {
    const identifierTerms = ftsTerms.filter((t) => {
      const bare = t.replace(/^"|"$/g, "");
      return bare.includes("_") || /[a-z][A-Z]/.test(bare);
    });
    const termsForEpisode =
      identifierTerms.length > 0 ? identifierTerms : ftsTerms.slice(0, 2);
    const rawTerms = ftsTerms.map((t) => t.replace(/^"|"$/g, ""));
    const episodeRows = searchEntitiesViaEpisodeFts(
      graph,
      termsForEpisode,
      seenEntityIds,
      15,
      rawTerms,
    );
    for (const r of episodeRows) {
      entityRows.push(r);
      seenEntityIds.add(r.id);
    }
  }

  // Fallback 3 — vector search when all text-based paths find nothing.
  // Reuse the provider already created for the vector episode track above.
  const fallbackEntityIds = new Set<string>();
  if (entityRows.length === 0) {
    try {
      const fallback = await search(graph, query, { limit: 30, provider });
      for (const r of fallback) {
        if (r.type === "entity") fallbackEntityIds.add(r.id);
      }
    } catch {
      // Provider unavailable — entity fallback remains empty.
    }
  }

  // Direct episode search track — independent of entity retrieval.
  // Searches PR/issue/commit bodies directly so design rationale in discussions
  // is surfaced even when the relevant code entity wasn't found by entity FTS.
  const directEpisodeRows = searchEpisodesDirectly(graph, escapedFts, 20);

  const entities: EnrichedEntity[] = [];
  const edges: EnrichedEdge[] = [];
  const evidenceMap = new Map<string, EvidenceExcerpt>();
  const discussions: DirectEpisodeHit[] = [];
  let truncated = 0;
  let tokensUsed = 0;

  // Reserve 35% of total budget for the discussion track so PR/issue rationale
  // always gets space even when the entity section fills up on code entities.
  const discussionsBudget = Math.floor(opts.tokenBudget * 0.35);
  const entityBudget = opts.tokenBudget - discussionsBudget;

  const budgetExceeded = () => tokensUsed >= entityBudget;

  // Normalise FTS ranks (bm25 is negative; closer to 0 = better match).
  const minRank = Math.min(...entityRows.map((r) => r.rank), 0);
  const rankRange = Math.abs(minRank) || 1;

  // Process entity results.
  const entityRowsToProcess: Array<{
    id: string;
    canonical_name: string;
    entity_type: string;
    score: number;
  }> = [
    ...entityRows.map((r) => ({
      id: r.id,
      canonical_name: r.canonical_name,
      entity_type: r.entity_type,
      score: Math.abs(r.rank) / rankRange,
    })),
    // Fallback from vector search — give a modest fixed score.
    ...(entityRows.length === 0
      ? Array.from(fallbackEntityIds)
          .map((id) => {
            const e: Entity | null = getEntity(graph, id);
            return e
              ? {
                  id,
                  canonical_name: e.canonical_name,
                  entity_type: e.entity_type,
                  score: 0.5,
                }
              : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
      : []),
  ];

  const cappedEntityRows =
    opts.maxEntities !== undefined
      ? entityRowsToProcess.slice(0, opts.maxEntities)
      : entityRowsToProcess;

  for (const row of cappedEntityRows) {
    if (budgetExceeded()) {
      truncated++;
      continue;
    }

    const provenance = getEntityProvenance(graph, row.id);
    const line = `\`${row.canonical_name}\` [${row.entity_type}]`;
    tokensUsed += estimateTokens(line);
    entities.push({
      result_id: row.id,
      canonical_name: row.canonical_name,
      entity_type: row.entity_type,
      score: row.score,
      provenance,
    });

    // Collect evidence episodes (up to 2 per entity, prefer commits then PRs).
    const sortedProvenance = [...provenance].sort((a, b) => {
      const ea = getEpisode(graph, a);
      const eb = getEpisode(graph, b);
      const rank = (e: Episode | null) => {
        switch (e?.source_type) {
          case "git_commit":
            return 0;
          case "github_pr":
            return 1;
          case "github_issue":
            return 2;
          default:
            return 3;
        }
      };
      return rank(ea) - rank(eb);
    });

    let epCount = 0;
    for (const epId of sortedProvenance) {
      if (epCount >= 2 || budgetExceeded()) break;
      if (evidenceMap.has(epId)) {
        epCount++;
        continue;
      }
      const ep: Episode | null = getEpisode(graph, epId);
      if (!ep || ep.status !== "active") continue;
      const excerpt = excerptEpisode(ep);
      const epTokens = estimateTokens(excerpt) + 20;
      if (tokensUsed + epTokens > opts.tokenBudget) break;
      tokensUsed += epTokens;
      evidenceMap.set(epId, {
        episode_id: epId,
        source_type: ep.source_type,
        source_ref: ep.source_ref,
        actor: ep.actor,
        timestamp: ep.timestamp,
        excerpt,
      });
      epCount++;
    }
  }

  // Process edge results.
  const cappedEdgeRows =
    opts.maxEdges !== undefined ? edgeRows.slice(0, opts.maxEdges) : edgeRows;

  const edgeMinRank = Math.min(...cappedEdgeRows.map((r) => r.rank), 0);
  const edgeRankRange = Math.abs(edgeMinRank) || 1;

  for (const row of cappedEdgeRows) {
    if (budgetExceeded()) {
      truncated++;
      continue;
    }
    const provenance = getEdgeProvenance(graph, row.id);
    const score = Math.abs(row.rank) / edgeRankRange;
    const line = `${row.fact} [${row.edge_kind}]`;
    tokensUsed += estimateTokens(line);
    edges.push({
      result_id: row.id,
      fact: row.fact,
      edge_kind: row.edge_kind,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      score,
      provenance,
    });
  }

  // Process direct episode hits — uses the pre-reserved 35% discussion budget.
  let discussionsUsed = 0;
  // Track episode IDs already shown as entity provenance to avoid duplication.
  const shownEpisodeIds = new Set(evidenceMap.keys());
  const epMinRank = Math.min(...directEpisodeRows.map((r) => r.rank), 0);
  const epRankRange = Math.abs(epMinRank) || 1;

  // Remove BM25 hits from the vector-only set — they'll be scored with both signals below.
  const bm25EpisodeIds = new Set(directEpisodeRows.map((r) => r.id));
  // Remove BM25 hits from the vector-only set — they'll be scored with both signals.
  for (const id of bm25EpisodeIds) vectorOnlyEpisodeIds.delete(id);

  for (const row of directEpisodeRows) {
    if (discussionsUsed >= discussionsBudget) {
      truncated++;
      break;
    }
    if (shownEpisodeIds.has(row.id)) continue;

    const bm25Norm = Math.abs(row.rank) / epRankRange;
    const vectorSim = vectorEpisodeScores.get(row.id);
    const confidence = computeDiscussionConfidence(
      bm25Norm,
      vectorSim,
      row.source_type,
    );

    // Omit below threshold — an empty Discussions section is strictly better
    // than a misleading one.
    if (confidence < opts.minConfidence) continue;

    const excerpt = excerptDiscussion(row.content, row.source_type);
    const epTokens = estimateTokens(excerpt) + 30;
    if (discussionsUsed + epTokens > discussionsBudget) break;

    discussionsUsed += epTokens;
    tokensUsed += epTokens;
    shownEpisodeIds.add(row.id);
    discussions.push({
      episode_id: row.id,
      source_type: row.source_type,
      source_ref: row.source_ref,
      actor: row.actor,
      timestamp: row.timestamp,
      excerpt,
      score: confidence,
    });
  }

  // Vector-only episode augmentation — episodes the vector track surfaced but
  // BM25 missed. Add them if they clear the confidence threshold and budget remains.
  if (discussionsUsed < discussionsBudget) {
    for (const epId of vectorOnlyEpisodeIds) {
      if (discussionsUsed >= discussionsBudget) break;
      if (shownEpisodeIds.has(epId)) continue;

      const ep = getEpisode(graph, epId);
      if (
        !ep ||
        ep.status !== "active" ||
        !["github_pr", "github_issue", "git_commit"].includes(ep.source_type)
      ) {
        continue;
      }

      const vectorSim = vectorEpisodeScores.get(epId) ?? 0;
      const confidence = computeDiscussionConfidence(
        0,
        vectorSim,
        ep.source_type,
      );
      if (confidence < opts.minConfidence) continue;

      const excerpt = excerptDiscussion(ep.content, ep.source_type);
      const epTokens = estimateTokens(excerpt) + 30;
      if (discussionsUsed + epTokens > discussionsBudget) break;

      discussionsUsed += epTokens;
      tokensUsed += epTokens;
      shownEpisodeIds.add(epId);
      discussions.push({
        episode_id: epId,
        source_type: ep.source_type,
        source_ref: ep.source_ref,
        actor: ep.actor,
        timestamp: ep.timestamp,
        excerpt,
        score: confidence,
      });
    }
    // Sort combined results by confidence descending.
    discussions.sort((a, b) => b.score - a.score);
  }

  // Structural edge augmentation — fetch co-change, ownership, and supersession
  // edges connected to the entities we found. These relational signals are
  // underused but capture patterns (coupling, historical ownership) that file
  // search cannot derive. We add them to the edge section after FTS edges.
  const seenEdgeIds = new Set(edges.map((e) => e.result_id));
  const foundEntityIds = entities.map((e) => e.result_id);
  const structuralLimit =
    opts.maxEdges !== undefined
      ? Math.max(0, opts.maxEdges - edges.length)
      : 15;
  const structuralRows = fetchStructuralEdges(
    graph,
    foundEntityIds,
    seenEdgeIds,
    structuralLimit,
  );
  for (const row of structuralRows) {
    if (budgetExceeded()) {
      truncated++;
      break;
    }
    const provenance = getEdgeProvenance(graph, row.id);
    const line = `${row.fact} [${row.edge_kind}]`;
    tokensUsed += estimateTokens(line);
    edges.push({
      result_id: row.id,
      fact: row.fact,
      edge_kind: row.edge_kind,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      // Structural edges are fetched by entity connection, not FTS rank; give
      // a relation-type-weighted score so co-change > ownership > other.
      score:
        row.relation_type === "co_changes_with"
          ? 0.8
          : row.relation_type === "likely_owner_of"
            ? 0.7
            : row.relation_type === "supersedes"
              ? 0.75
              : 0.5,
      provenance,
    });
  }

  // Fix 3: Suggest enrichment when the pack is sparse and no discussions found.
  // A pack with fewer than 3 entities and no confident discussion hits is likely
  // the result of an under-populated knowledge base (no markdown or source ingestion).
  // Gate on --verbose or TTY so CI pipelines are not spammed on every query.
  if (
    entities.length < 3 &&
    discussions.length === 0 &&
    (opts.verbose || process.stderr.isTTY)
  ) {
    process.stderr.write(
      "Note: fewer than 3 entities found. Run 'engram ingest md <docs-dir>'" +
        " or\n'engram ingest source' to enrich the knowledge base.\n",
    );
  }

  return {
    query,
    tokenBudgetUsed: tokensUsed,
    tokenBudget: opts.tokenBudget,
    truncated,
    entities,
    edges,
    evidence: Array.from(evidenceMap.values()),
    discussions,
  };
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

interface ContextCommandOpts {
  tokenBudget: string;
  format: string;
  db: string;
  minConfidence: string;
  verbose: boolean;
  maxEntities?: string;
  maxEdges?: string;
}

export function registerContext(program: Command): void {
  program
    .command("context <query>")
    .description(
      "Assemble a token-budgeted context pack for injection into an agent prompt",
    )
    .option("--token-budget <n>", "max tokens in the assembled pack", "8000")
    .option("--format <fmt>", "output format: md or json", "md")
    .option("--db <path>", "path to .engram file", ".engram")
    .option(
      "--min-confidence <n>",
      "minimum confidence (0.0–1.0) for a discussion hit to be included; prefer silence to noise",
      "0.0",
    )
    .option(
      "--verbose",
      "emit diagnostic notes (e.g. sparse-results hint) to stderr",
      false,
    )
    .option(
      "--max-entities <n>",
      "hard cap on entities included regardless of token budget (default: uncapped)",
    )
    .option(
      "--max-edges <n>",
      "hard cap on edges included regardless of token budget (default: uncapped)",
    )
    .addHelpText(
      "after",
      `
Examples:
  # Get a context pack for a query (pipe into an agent prompt)
  engram context "auth middleware"

  # Larger budget for complex queries
  engram context "why was X refactored" --token-budget 16000

  # Limit to exactly 5 entities
  engram context "auth middleware" --max-entities 5

  # Limit both entities and edges
  engram context "database schema" --max-entities 5 --max-edges 3

  # JSON output for programmatic use
  engram context "database schema" --format json

When to use:
  Call before modifying unfamiliar code, answering "why is this written
  this way?", or making multi-file changes. Output is Markdown by default
  for direct injection into CLAUDE.md or agent system prompts.

  Use --max-entities / --max-edges when you need predictable output sizing
  regardless of token budget (e.g. when injecting into a fixed-size prompt).

See also:
  engram companion   Write a reusable agent prompt fragment
  engram ingest git  Populate the knowledge graph from git history`,
    )
    .action(async (query: string, opts: ContextCommandOpts) => {
      const dbPath = path.resolve(opts.db);
      const tokenBudget = parseInt(opts.tokenBudget, 10);
      const minConfidence = parseFloat(opts.minConfidence);

      if (Number.isNaN(tokenBudget) || tokenBudget < 100) {
        console.error(
          "Error: --token-budget must be a positive integer >= 100",
        );
        process.exit(1);
      }

      if (opts.format !== "md" && opts.format !== "json") {
        console.error("Error: --format must be 'md' or 'json'");
        process.exit(1);
      }

      if (
        Number.isNaN(minConfidence) ||
        minConfidence < 0 ||
        minConfidence > 1
      ) {
        console.error(
          "Error: --min-confidence must be a number between 0.0 and 1.0",
        );
        process.exit(1);
      }

      let maxEntities: number | undefined;
      if (opts.maxEntities !== undefined) {
        maxEntities = parseInt(opts.maxEntities, 10);
        if (Number.isNaN(maxEntities) || maxEntities < 1) {
          console.error("Error: --max-entities must be a positive integer");
          process.exit(1);
        }
      }

      let maxEdges: number | undefined;
      if (opts.maxEdges !== undefined) {
        maxEdges = parseInt(opts.maxEdges, 10);
        if (Number.isNaN(maxEdges) || maxEdges < 1) {
          console.error("Error: --max-edges must be a positive integer");
          process.exit(1);
        }
      }

      let graph: EngramGraph | undefined;
      try {
        graph = openGraph(dbPath);
      } catch (err) {
        console.error(
          `Error opening graph: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exit(1);
      }

      try {
        const pack = await assembleContextPack(graph, query, {
          tokenBudget,
          format: opts.format as "md" | "json",
          minConfidence,
          verbose: opts.verbose,
          maxEntities,
          maxEdges,
        });

        if (opts.format === "json") {
          console.log(JSON.stringify(pack, null, 2));
        } else {
          console.log(renderMarkdown(pack));
        }
      } catch (err) {
        console.error(
          `Context assembly failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        closeGraph(graph);
        process.exit(1);
      }

      closeGraph(graph);
    });
}
