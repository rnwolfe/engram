/**
 * reconcile.ts — reconcile() assess + discover phases and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 *
 * ## Assess phase
 * Re-evaluates every stale active projection whose input_fingerprint has drifted.
 * For each stale projection the generator verdict determines whether to
 * softRefresh (still_accurate) or supersedeProjection (needs_update/contradicted).
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run reconcile run (same
 * scope), loads the active-projection catalog and kind catalog, then calls
 * generator.discover() to obtain ProjectionProposal[]. Each accepted proposal
 * is authored via project(). Dry runs count proposals but skip authoring.
 * Partial runs (budget exhausted) record what was authored and advance the cursor.
 *
 * Cursor semantics:
 * - Dry runs count proposals (discovered > 0 is possible) but do NOT author them
 *   and do NOT advance the cursor.
 * - Partial runs advance the cursor to what was successfully authored.
 * - The cursor is the `completed_at` timestamp of the last non-dry-run
 *   reconciliation_runs row with the same scope.
 *
 * Exported: reconcile, softRefresh, currentInputState, ReconcileOpts, ReconciliationRunResult
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { Budget } from "../ai/budget.js";
import { loadKindCatalog } from "../ai/kinds.js";
import type {
  ActiveProjectionSummary,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
  SubstrateDeltaItem,
} from "../ai/projection-generator.js";
import type { EngramGraph } from "../format/index.js";
import { project, supersedeProjection } from "./projections.js";
import { listActiveProjections } from "./projections-list.js";
import type {
  AnchorType,
  Projection,
  ProjectionEvidenceRow,
  ProjectionInputType,
} from "./projections-types.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ReconcileOpts {
  /** Optional filter to limit which projections to assess (e.g. 'kind:entity_summary'). */
  scope?: string;
  /** Which phases to run. Defaults to ['assess', 'discover']. */
  phases?: ("assess" | "discover")[];
  /** Token budget shared across all LLM calls. Unlimited if undefined. */
  maxCost?: number;
  /** If true, assess but don't write any changes to the database. */
  dryRun?: boolean;
  /**
   * Maximum number of substrate delta items to include in a single discover
   * call. Items are sampled proportionally from episodes/entities/edges,
   * taking the most recent. Defaults to 500.
   */
  maxDeltaItems?: number;
}

export interface ReconciliationRunResult {
  run_id: string;
  status: "completed" | "partial" | "failed";
  assessed: number;
  superseded: number;
  soft_refreshed: number;
  /** Number of new projections authored during the discover phase. */
  discovered: number;
  started_at: string;
  completed_at: string;
  /** Set when status='partial' to explain why the run did not complete. */
  error?: string;
  /** True when the generator has no API key — cursor was not advanced. */
  stub_mode?: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Inserts a reconciliation_runs row with status='running'.
 * Returns the run ID.
 */
function startReconciliationRun(
  graph: EngramGraph,
  runId: string,
  opts: ReconcileOpts,
  startedAt: string,
): void {
  const phases = (opts.phases ?? ["assess", "discover"]).join(",");
  graph.db
    .prepare(
      `INSERT INTO reconciliation_runs
         (id, started_at, scope, phases, dry_run, status,
          projections_checked, projections_refreshed, projections_superseded, projections_discovered)
       VALUES (?, ?, ?, ?, ?, 'running', 0, 0, 0, 0)`,
    )
    .run(runId, startedAt, opts.scope ?? null, phases, opts.dryRun ? 1 : 0);
}

/**
 * Updates the reconciliation_runs row with final counts, status, and optional error.
 */
function finishReconciliationRun(
  graph: EngramGraph,
  runId: string,
  completedAt: string,
  status: "completed" | "partial" | "failed",
  assessed: number,
  refreshed: number,
  superseded: number,
  discovered: number,
  error?: string,
): void {
  graph.db
    .prepare(
      `UPDATE reconciliation_runs
          SET completed_at = ?,
              status = ?,
              projections_checked = ?,
              projections_refreshed = ?,
              projections_superseded = ?,
              projections_discovered = ?,
              error = ?
        WHERE id = ?`,
    )
    .run(
      completedAt,
      status,
      assessed,
      refreshed,
      superseded,
      discovered,
      error ?? null,
      runId,
    );
}

/**
 * Recomputes the input fingerprint for a projection from its current
 * projection_evidence rows, using each target's *current* content hash.
 *
 * This is the same algorithm as recomputeFingerprint() in projections.ts,
 * duplicated here to avoid a circular dependency (projections.ts is not exported
 * through this module, and the helper is private there).
 */
function recomputeCurrentFingerprint(
  graph: EngramGraph,
  projectionId: string,
): string {
  const evidenceRows = graph.db
    .query<ProjectionEvidenceRow, [string]>(
      "SELECT * FROM projection_evidence WHERE projection_id = ? AND role = 'input'",
    )
    .all(projectionId);

  const entries: string[] = [];

  for (const row of evidenceRows) {
    let currentHash: string | null = null;

    switch (row.target_type) {
      case "episode": {
        const ep = graph.db
          .query<{ content_hash: string; status: string }, [string]>(
            "SELECT content_hash, status FROM episodes WHERE id = ?",
          )
          .get(row.target_id);
        currentHash = ep && ep.status !== "redacted" ? ep.content_hash : null;
        break;
      }
      case "entity": {
        const ent = graph.db
          .query<{ canonical_name: string; summary: string | null }, [string]>(
            "SELECT canonical_name, summary FROM entities WHERE id = ?",
          )
          .get(row.target_id);
        if (ent) {
          const c = `${ent.canonical_name}${ent.summary ? `: ${ent.summary}` : ""}`;
          currentHash = createHash("sha256").update(c).digest("hex");
        }
        break;
      }
      case "edge": {
        const edge = graph.db
          .query<{ fact: string; invalidated_at: string | null }, [string]>(
            "SELECT fact, invalidated_at FROM edges WHERE id = ?",
          )
          .get(row.target_id);
        if (edge && edge.invalidated_at === null) {
          currentHash = createHash("sha256").update(edge.fact).digest("hex");
        }
        break;
      }
      case "projection": {
        const proj = graph.db
          .query<{ body: string; invalidated_at: string | null }, [string]>(
            "SELECT body, invalidated_at FROM projections WHERE id = ?",
          )
          .get(row.target_id);
        if (proj && proj.invalidated_at === null) {
          currentHash = createHash("sha256").update(proj.body).digest("hex");
        }
        break;
      }
    }

    entries.push(`${row.target_type}:${row.target_id}:${currentHash ?? ""}`);
  }

  entries.sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

// ─── Exported helpers ─────────────────────────────────────────────────────────

/**
 * Resolves the current state of all inputs for a projection from
 * projection_evidence rows, reading fresh content from the substrate.
 *
 * Used by assess() and regenerate() calls during the reconcile assess phase.
 */
export function currentInputState(
  graph: EngramGraph,
  projectionId: string,
): ResolvedInput[] {
  const evidenceRows = graph.db
    .query<ProjectionEvidenceRow, [string]>(
      "SELECT * FROM projection_evidence WHERE projection_id = ? AND role = 'input'",
    )
    .all(projectionId);

  const resolved: ResolvedInput[] = [];

  for (const row of evidenceRows) {
    const type = row.target_type as ProjectionInputType;
    let content: string | null = null;
    let content_hash: string | null = null;

    switch (type) {
      case "episode": {
        const ep = graph.db
          .query<
            { content: string; content_hash: string; status: string },
            [string]
          >("SELECT content, content_hash, status FROM episodes WHERE id = ?")
          .get(row.target_id);
        if (ep && ep.status !== "redacted") {
          content = ep.content;
          content_hash = ep.content_hash;
        }
        break;
      }
      case "entity": {
        const ent = graph.db
          .query<
            { canonical_name: string; summary: string | null; status: string },
            [string]
          >("SELECT canonical_name, summary, status FROM entities WHERE id = ?")
          .get(row.target_id);
        if (ent && ent.status !== "archived") {
          content = `${ent.canonical_name}${ent.summary ? `: ${ent.summary}` : ""}`;
          content_hash = createHash("sha256").update(content).digest("hex");
        }
        break;
      }
      case "edge": {
        const edge = graph.db
          .query<{ fact: string; invalidated_at: string | null }, [string]>(
            "SELECT fact, invalidated_at FROM edges WHERE id = ?",
          )
          .get(row.target_id);
        if (edge && edge.invalidated_at === null) {
          content = edge.fact;
          content_hash = createHash("sha256").update(content).digest("hex");
        }
        break;
      }
      case "projection": {
        const proj = graph.db
          .query<{ body: string; invalidated_at: string | null }, [string]>(
            "SELECT body, invalidated_at FROM projections WHERE id = ?",
          )
          .get(row.target_id);
        if (proj && proj.invalidated_at === null) {
          content = proj.body;
          content_hash = createHash("sha256").update(content).digest("hex");
        }
        break;
      }
    }

    resolved.push({ type, id: row.target_id, content, content_hash });
  }

  return resolved;
}

/**
 * Updates input_fingerprint and last_assessed_at for a projection WITHOUT
 * changing valid_from, valid_until, invalidated_at, or superseded_by.
 *
 * Also updates content_hash values in projection_evidence to reflect the
 * current substrate state at assessment time.
 *
 * Used when assess() returns 'still_accurate': the projection content is
 * correct, but the fingerprint needs updating to reflect the new input state.
 */
export function softRefresh(
  graph: EngramGraph,
  projectionId: string,
  newFingerprint: string,
  assessedAt: string,
  currentInputs: ResolvedInput[],
): void {
  graph.db.transaction(() => {
    graph.db
      .prepare(
        `UPDATE projections
            SET input_fingerprint = ?,
                last_assessed_at = ?
          WHERE id = ?`,
      )
      .run(newFingerprint, assessedAt, projectionId);

    const updateEvidence = graph.db.prepare(
      `UPDATE projection_evidence
          SET content_hash = ?
        WHERE projection_id = ? AND target_type = ? AND target_id = ? AND role = 'input'`,
    );

    for (const inp of currentInputs) {
      updateEvidence.run(inp.content_hash, projectionId, inp.type, inp.id);
    }
  })();
}

// ─── Discover phase helpers ───────────────────────────────────────────────────

/**
 * Returns the completed_at timestamp of the last non-dry-run reconciliation run
 * for the given scope. Returns null if no such run exists (fresh database).
 *
 * This is the cursor for the discover phase: episodes/entities/edges added or
 * changed after this timestamp are included in the substrate delta.
 */
function lastNonDryRunCompletedAt(
  graph: EngramGraph,
  scope?: string,
): string | null {
  const row = graph.db
    .query<{ completed_at: string | null }, [number, string | null]>(
      `SELECT completed_at FROM reconciliation_runs
        WHERE dry_run = ? AND scope IS ? AND status != 'running'
          AND completed_at IS NOT NULL
        ORDER BY completed_at DESC
        LIMIT 1`,
    )
    .get(0, scope ?? null);
  return row?.completed_at ?? null;
}

/**
 * Computes the substrate delta since the given cursor timestamp (or all rows if
 * cursor is null). Returns a SubstrateDelta with short summaries for each item.
 *
 * Only includes non-redacted episodes, non-archived entities, and non-invalidated
 * edges to avoid surfacing deleted substrate in discover proposals.
 *
 * Column mapping:
 * - episodes: cursor column is `ingested_at` (episodes have no `created_at`)
 * - entities: cursor column is `created_at`
 * - edges: cursor column is `created_at`
 */
function computeSubstrateDelta(
  graph: EngramGraph,
  since: string | null,
): SubstrateDelta {
  // Episodes — use ingested_at as the timestamp column
  const episodeRows = since
    ? graph.db
        .query<{ id: string; content: string; ingested_at: string }, [string]>(
          `SELECT id, content, ingested_at FROM episodes
            WHERE status != 'redacted' AND ingested_at > ?
            ORDER BY ingested_at ASC`,
        )
        .all(since)
    : graph.db
        .query<{ id: string; content: string; ingested_at: string }, []>(
          `SELECT id, content, ingested_at FROM episodes
            WHERE status != 'redacted'
            ORDER BY ingested_at ASC`,
        )
        .all();

  const episodes: SubstrateDeltaItem[] = episodeRows.map((row) => ({
    type: "episode" as const,
    id: row.id,
    summary: row.content.slice(0, 200),
    changed_at: row.ingested_at,
  }));

  // Entities — use created_at
  const entityRows = since
    ? graph.db
        .query<
          {
            id: string;
            canonical_name: string;
            summary: string | null;
            created_at: string;
          },
          [string]
        >(
          `SELECT id, canonical_name, summary, created_at FROM entities
            WHERE status != 'archived' AND created_at > ?
            ORDER BY created_at ASC`,
        )
        .all(since)
    : graph.db
        .query<
          {
            id: string;
            canonical_name: string;
            summary: string | null;
            created_at: string;
          },
          []
        >(
          `SELECT id, canonical_name, summary, created_at FROM entities
            WHERE status != 'archived'
            ORDER BY created_at ASC`,
        )
        .all();

  const entities: SubstrateDeltaItem[] = entityRows.map((row) => ({
    type: "entity" as const,
    id: row.id,
    summary: `${row.canonical_name}${row.summary ? `: ${row.summary}` : ""}`,
    changed_at: row.created_at,
  }));

  // Edges — use created_at, non-invalidated only
  const edgeRows = since
    ? graph.db
        .query<{ id: string; fact: string; created_at: string }, [string]>(
          `SELECT id, fact, created_at FROM edges
            WHERE invalidated_at IS NULL AND created_at > ?
            ORDER BY created_at ASC`,
        )
        .all(since)
    : graph.db
        .query<{ id: string; fact: string; created_at: string }, []>(
          `SELECT id, fact, created_at FROM edges
            WHERE invalidated_at IS NULL
            ORDER BY created_at ASC`,
        )
        .all();

  const edges: SubstrateDeltaItem[] = edgeRows.map((row) => ({
    type: "edge" as const,
    id: row.id,
    summary: row.fact.slice(0, 200),
    changed_at: row.created_at,
  }));

  return { since, episodes, entities, edges };
}

/**
 * Loads the active-projection catalog for the discover phase.
 * Returns lightweight summaries — no projection bodies — to keep context small.
 */
function loadActiveProjectionCatalog(
  graph: EngramGraph,
  scope?: string,
): ActiveProjectionSummary[] {
  const scopeOpts = parseScopeToOpts(scope);
  const results = listActiveProjections(graph, scopeOpts);
  return results.map((r) => ({
    id: r.projection.id,
    kind: r.projection.kind,
    title: r.projection.title,
    anchor_type: r.projection.anchor_type,
    anchor_id: r.projection.anchor_id,
    last_assessed_at: r.projection.last_assessed_at,
  }));
}

/**
 * Validates a ProjectionProposal from the generator before calling project().
 *
 * Returns an error string if the proposal is malformed, or null if valid.
 *
 * Checks:
 * - kind must be a non-empty string matching a known KindCatalog entry
 * - inputs must be a non-empty array with valid type strings
 * - anchor.type (if provided) must be a valid AnchorType
 */
function validateProposal(
  proposal: ProjectionProposal,
  knownKinds: Set<string>,
): string | null {
  if (!proposal.kind || typeof proposal.kind !== "string") {
    return "proposal.kind must be a non-empty string";
  }
  if (!knownKinds.has(proposal.kind)) {
    return `proposal.kind '${proposal.kind}' is not in the kind catalog`;
  }
  if (!Array.isArray(proposal.inputs) || proposal.inputs.length === 0) {
    return "proposal.inputs must be a non-empty array";
  }
  const validInputTypes = new Set(["episode", "entity", "edge", "projection"]);
  for (const inp of proposal.inputs) {
    if (!inp.type || !validInputTypes.has(inp.type)) {
      return `proposal.inputs entry has invalid type '${inp.type}'`;
    }
    if (!inp.id || typeof inp.id !== "string") {
      return `proposal.inputs entry missing id`;
    }
  }
  if (proposal.anchor != null) {
    const validAnchorTypes = new Set([
      "entity",
      "edge",
      "episode",
      "projection",
      "none",
    ]);
    if (!proposal.anchor.type || !validAnchorTypes.has(proposal.anchor.type)) {
      return `proposal.anchor.type '${proposal.anchor.type}' is not a valid AnchorType`;
    }
    if (!proposal.anchor.id || typeof proposal.anchor.id !== "string") {
      return `proposal.anchor.id must be a non-empty string when anchor is provided`;
    }
  }
  return null;
}

// ─── Delta sampling ───────────────────────────────────────────────────────────

/**
 * Samples a SubstrateDelta down to at most maxTotal items, preserving the
 * proportional ratio of episodes/entities/edges and taking the most recent
 * items of each type (delta items are ordered ASC, so we slice from the tail).
 *
 * Returns the sampled delta and the original total item count so callers can
 * log how much was dropped.
 */
function sampleDelta(
  delta: SubstrateDelta,
  maxTotal: number,
): { sampled: SubstrateDelta; totalItems: number; sampledCount: number } {
  const totalItems =
    delta.episodes.length + delta.entities.length + delta.edges.length;

  if (totalItems <= maxTotal) {
    return { sampled: delta, totalItems, sampledCount: totalItems };
  }

  // Proportional allocation — at least 1 of each non-empty type
  const epRatio = delta.episodes.length / totalItems;
  const entRatio = delta.entities.length / totalItems;
  const edgeRatio = delta.edges.length / totalItems;

  const maxEp =
    delta.episodes.length > 0 ? Math.max(1, Math.round(maxTotal * epRatio)) : 0;
  const maxEnt =
    delta.entities.length > 0
      ? Math.max(1, Math.round(maxTotal * entRatio))
      : 0;
  const maxEdge =
    delta.edges.length > 0 ? Math.max(1, Math.round(maxTotal * edgeRatio)) : 0;

  const sampled: SubstrateDelta = {
    since: delta.since,
    episodes: delta.episodes.slice(-maxEp),
    entities: delta.entities.slice(-maxEnt),
    edges: delta.edges.slice(-maxEdge),
  };

  const sampledCount =
    sampled.episodes.length + sampled.entities.length + sampled.edges.length;

  return { sampled, totalItems, sampledCount };
}

// ─── Scope filter helper ──────────────────────────────────────────────────────

/**
 * Parses the scope string into ListProjectionsOpts-compatible fields.
 * Supported formats:
 *   'kind:entity_summary'  → { kind: 'entity_summary' }
 *   'anchor:entity'        → { anchor_type: 'entity' }
 *   undefined              → {} (no filter)
 */
function parseScopeToOpts(scope?: string): {
  kind?: string;
  anchor_type?: string;
} {
  if (!scope) return {};
  const colonIdx = scope.indexOf(":");
  if (colonIdx === -1) return {};
  const key = scope.slice(0, colonIdx);
  const value = scope.slice(colonIdx + 1);
  if (key === "kind" && value) return { kind: value };
  if (key === "anchor" && value) return { anchor_type: value };
  return {};
}

// ─── reconcile() ─────────────────────────────────────────────────────────────

/**
 * Reconciliation loop — assess phase and discover phase.
 *
 * ## Assess phase
 * For each stale active projection whose input_fingerprint has drifted:
 * - Calls generator.assess() to determine the verdict.
 * - 'still_accurate': calls softRefresh() to update fingerprint + evidence hashes.
 * - 'needs_update' | 'contradicted': calls generator.regenerate() then supersedeProjection().
 *
 * ## Discover phase
 * Computes the substrate delta since the last non-dry-run reconcile (same scope),
 * loads the active-projection catalog and kind catalog, then calls
 * generator.discover() to get ProjectionProposal[]. Each proposal is validated
 * then authored via project(). Dry runs count proposals but skip authoring.
 *
 * Both phases:
 * - If dryRun=true, track counts but skip all database writes.
 * - Stop early if the budget is exhausted (status='partial').
 * - Dry runs do NOT advance the discover cursor.
 *
 * Inserts a reconciliation_runs row at start and updates it at completion.
 */
export async function reconcile(
  graph: EngramGraph,
  generator: ProjectionGenerator,
  opts?: ReconcileOpts,
): Promise<ReconciliationRunResult> {
  const runId = ulid();
  const startedAt = new Date().toISOString();
  const budget = new Budget(opts?.maxCost);
  const dryRun = opts?.dryRun ?? false;
  const phases = opts?.phases ?? ["assess", "discover"];
  // If the generator has no API key, treat this run as a dry-run for cursor
  // purposes so the discover cursor is not advanced and the same delta is
  // retried once a key is configured.
  const stubMode = !generator.isConfigured();
  const effectiveDryRun = dryRun || stubMode;

  startReconciliationRun(
    graph,
    runId,
    { ...(opts ?? {}), dryRun: effectiveDryRun },
    startedAt,
  );

  let assessed = 0;
  let superseded = 0;
  let softRefreshed = 0;
  let discovered = 0;
  let budgetHit = false;
  let partialReason: string | undefined;

  if (stubMode && phases.includes("discover")) {
    console.warn(
      "[engram] reconcile: generator is not configured (no API key) — " +
        "discover phase will not advance the cursor. Set the API key env var and re-run.",
    );
  }

  // ── Phase 1: assess existing active projections ────────────────────────────
  if (phases.includes("assess")) {
    const scopeOpts = parseScopeToOpts(opts?.scope);
    const activeProjections = listActiveProjections(graph, scopeOpts);

    // Only process stale projections
    const staleResults = activeProjections.filter((r) => r.stale);

    for (const result of staleResults) {
      if (budget.exhausted()) {
        budgetHit = true;
        partialReason = "budget exhausted during assess phase";
        break;
      }

      const projection: Projection = result.projection;
      const inputs = currentInputState(graph, projection.id);

      const verdict = await generator.assess(projection, inputs);
      const assessedAt = new Date().toISOString(); // after assess completes

      // Treat token usage as 1 per assess call (generators don't report tokens yet)
      budget.consume(1);

      assessed++;

      switch (verdict.verdict) {
        case "still_accurate": {
          const newFingerprint = recomputeCurrentFingerprint(
            graph,
            projection.id,
          );
          if (!effectiveDryRun) {
            softRefresh(
              graph,
              projection.id,
              newFingerprint,
              assessedAt,
              inputs,
            );
          }
          softRefreshed++;
          break;
        }

        case "needs_update":
        case "contradicted": {
          if (budget.exhausted()) {
            budgetHit = true;
            partialReason = "budget exhausted during assess phase (regenerate)";
            break;
          }

          const generated = await generator.regenerate(projection, inputs);
          budget.consume(1);

          if (!effectiveDryRun) {
            // Recompute fingerprint from current substrate state — never inherit
            // from the old projection or rely on generator frontmatter, which
            // would cause the new projection to read as immediately stale.
            const currentFingerprint = recomputeCurrentFingerprint(
              graph,
              projection.id,
            );
            const newData = buildNewProjectionData(
              projection,
              generated.body,
              generated.confidence,
              currentFingerprint,
            );
            supersedeProjection(graph, projection.id, newData, inputs);
          }
          superseded++;
          break;
        }
      }

      if (budget.exhausted()) {
        budgetHit = true;
        partialReason = "budget exhausted during assess phase";
        break;
      }
    }
  }

  // ── Phase 2: discover new projections from the substrate delta ─────────────
  //
  // Flow:
  // 1. Resolve cursor: completed_at of last non-dry-run reconcile (same scope).
  // 2. Compute substrate delta since cursor (episodes, entities, edges).
  // 3. Load active-projection catalog (titles, kinds, anchors — not bodies).
  // 4. Load kind catalog via loadKindCatalog().
  // 5. Call generator.discover({ delta, catalog, kinds }) → ProjectionProposal[].
  // 6. For each proposal: validate → project() → increment discovered.
  // 7. Budget exhaustion mid-phase sets status='partial' and records reason.
  //
  // Dry runs count proposals but skip project() authoring and do not advance cursor.
  // Unconfigured generators (no API key) are treated as dry runs: the discover
  // cursor is NOT advanced so the same delta is retried once a key is set.
  if (phases.includes("discover") && !budgetHit) {
    const kindCatalog = loadKindCatalog();
    if (kindCatalog.length === 0) {
      throw new Error(
        "reconcile: kind catalog is empty — built-in kinds could not be loaded. " +
          "This is a build/packaging bug: the kinds/ directory is missing from the runtime location. " +
          "If running the bundled CLI, ensure the build step copies src/ai/kinds/*.yaml into dist/kinds/.",
      );
    }
    const knownKinds = new Set(kindCatalog.map((k) => k.name));

    const cursor = lastNonDryRunCompletedAt(graph, opts?.scope);
    const rawDelta = computeSubstrateDelta(graph, cursor);
    const {
      sampled: delta,
      totalItems,
      sampledCount,
    } = sampleDelta(rawDelta, opts?.maxDeltaItems ?? 500);

    if (sampledCount < totalItems) {
      console.warn(
        `[engram] reconcile: delta has ${totalItems} items — sampled ${sampledCount} (most recent) for this discover call. ` +
          `Run reconcile again after ingesting new data to process incrementally, or raise --max-delta-items.`,
      );
    }

    const catalog = loadActiveProjectionCatalog(graph, opts?.scope);

    // Single structured LLM call to propose new projections
    const proposals = await generator.discover({
      delta,
      catalog,
      kinds: kindCatalog,
    });
    budget.consume(1); // one discover call counts as one budget unit

    for (const proposal of proposals) {
      if (budget.exhausted()) {
        budgetHit = true;
        partialReason = "budget exhausted during discover phase";
        break;
      }

      // Validate proposal structure before attempting project()
      const validationError = validateProposal(proposal, knownKinds);
      if (validationError) {
        console.warn(
          `[engram] reconcile: skipping proposal — ${validationError}`,
        );
        continue;
      }

      if (!effectiveDryRun) {
        try {
          await project(graph, {
            kind: proposal.kind,
            anchor: proposal.anchor
              ? {
                  type: proposal.anchor.type as AnchorType,
                  id: proposal.anchor.id,
                }
              : { type: "none" as AnchorType },
            inputs: proposal.inputs.map((i) => ({
              type: i.type as "episode" | "entity" | "edge" | "projection",
              id: i.id,
            })),
            generator,
          });
          discovered++;
        } catch (err) {
          // project() throws on cycle detection, missing inputs, etc.
          // Skip this proposal and continue — partial authoring is valid.
          const anchorStr = proposal.anchor
            ? `${proposal.anchor.type}:${proposal.anchor.id}`
            : "none";
          const inputsStr = proposal.inputs
            .map((i) => `${i.type}:${i.id}`)
            .join(", ");
          console.warn(
            `[engram] reconcile: project() failed for ${proposal.kind} (anchor=${anchorStr}, inputs=[${inputsStr}]) — ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }
      } else {
        // Dry run (or stub mode): count the proposal but don't author it
        discovered++;
      }

      budget.consume(1); // one project() call counts as one budget unit
    }

    if (budget.exhausted() && !budgetHit) {
      budgetHit = true;
      partialReason = "budget exhausted during discover phase";
    }
  }

  const completedAt = new Date().toISOString();
  const status: "completed" | "partial" = budgetHit ? "partial" : "completed";

  finishReconciliationRun(
    graph,
    runId,
    completedAt,
    status,
    assessed,
    softRefreshed,
    superseded,
    discovered,
    partialReason,
  );

  return {
    run_id: runId,
    status,
    assessed,
    superseded,
    soft_refreshed: softRefreshed,
    discovered,
    ...(stubMode ? { stub_mode: true } : {}),
    started_at: startedAt,
    completed_at: completedAt,
    ...(partialReason !== undefined ? { error: partialReason } : {}),
  };
}

// ─── Internal: build newData for supersedeProjection ─────────────────────────

/**
 * Extracts frontmatter values from a generated body and builds the newData
 * argument for supersedeProjection(). Falls back to the original projection's
 * metadata when frontmatter values are not present.
 */
function buildNewProjectionData(
  original: Projection,
  body: string,
  confidence: number,
  input_fingerprint: string,
): {
  kind: string;
  anchor_type: import("./projections-types.js").AnchorType;
  anchor_id: string | null;
  title: string;
  body: string;
  model: string;
  prompt_template_id: string | null;
  prompt_hash: string | null;
  input_fingerprint: string;
  confidence: number;
  owner_id: string | null;
} {
  const title = extractFrontmatterValue(body, "title") ?? original.title;
  const model = extractFrontmatterValue(body, "model") ?? original.model;
  const prompt_template_id =
    extractFrontmatterValue(body, "prompt_template_id") ??
    original.prompt_template_id;
  const prompt_hash =
    extractFrontmatterValue(body, "prompt_hash") ?? original.prompt_hash;
  // input_fingerprint is passed in from caller (recomputed from substrate),
  // not extracted from frontmatter — prevents infinite re-supersession

  return {
    kind: original.kind,
    anchor_type: original.anchor_type,
    anchor_id: original.anchor_id,
    title,
    body,
    model,
    prompt_template_id,
    prompt_hash,
    input_fingerprint,
    confidence,
    owner_id: original.owner_id,
  };
}

/**
 * Extracts a scalar value from a YAML frontmatter block.
 * Returns null if not found or body has no valid frontmatter.
 */
function extractFrontmatterValue(body: string, key: string): string | null {
  if (!body.startsWith("---\n")) return null;
  const endIdx = body.indexOf("\n---", 4);
  if (endIdx === -1) return null;
  const frontmatter = body.slice(4, endIdx);
  const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "");
  const regex = new RegExp(`^${safeKey}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m");
  const match = frontmatter.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}
