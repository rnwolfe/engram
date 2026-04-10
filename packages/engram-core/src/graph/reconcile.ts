/**
 * reconcile.ts — reconcile() assess phase and softRefresh() helper.
 *
 * Implements Operation 2 from docs/internal/specs/projections.md.
 * The discover phase is stubbed as a no-op (out of scope for this issue).
 *
 * Exported: reconcile, softRefresh, currentInputState, ReconcileOpts, ReconciliationRunResult
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import { Budget } from "../ai/budget.js";
import type {
  ProjectionGenerator,
  ResolvedInput,
} from "../ai/projection-generator.js";
import type { EngramGraph } from "../format/index.js";
import { supersedeProjection } from "./projections.js";
import { listActiveProjections } from "./projections-list.js";
import type {
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
}

export interface ReconciliationRunResult {
  run_id: string;
  status: "completed" | "partial" | "failed";
  assessed: number;
  superseded: number;
  soft_refreshed: number;
  started_at: string;
  completed_at: string;
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
 * Updates the reconciliation_runs row with final counts and status.
 */
function finishReconciliationRun(
  graph: EngramGraph,
  runId: string,
  completedAt: string,
  status: "completed" | "partial" | "failed",
  assessed: number,
  refreshed: number,
  superseded: number,
): void {
  graph.db
    .prepare(
      `UPDATE reconciliation_runs
          SET completed_at = ?,
              status = ?,
              projections_checked = ?,
              projections_refreshed = ?,
              projections_superseded = ?
        WHERE id = ?`,
    )
    .run(completedAt, status, assessed, refreshed, superseded, runId);
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
  const [key, value] = scope.split(":");
  if (key === "kind" && value) return { kind: value };
  if (key === "anchor" && value) return { anchor_type: value };
  return {};
}

// ─── reconcile() ─────────────────────────────────────────────────────────────

/**
 * Reconciliation loop — assess phase (discover phase is a no-op stub).
 *
 * For each stale active projection whose input_fingerprint has drifted:
 * - Calls generator.assess() to determine the verdict.
 * - 'still_accurate': calls softRefresh() to update fingerprint + evidence hashes.
 * - 'needs_update' | 'contradicted': calls generator.regenerate() then supersedeProjection().
 * - If dryRun=true, tracks counts but skips writes.
 * - Stops early if the budget is exhausted (status='partial').
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

  startReconciliationRun(graph, runId, opts ?? {}, startedAt);

  let assessed = 0;
  let superseded = 0;
  let softRefreshed = 0;
  let budgetHit = false;

  // ── Phase 1: assess existing active projections ────────────────────────────
  if (phases.includes("assess")) {
    const scopeOpts = parseScopeToOpts(opts?.scope);
    const activeProjections = listActiveProjections(graph, scopeOpts);

    // Only process stale projections
    const staleResults = activeProjections.filter((r) => r.stale);

    for (const result of staleResults) {
      if (budget.exhausted()) {
        budgetHit = true;
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
          if (!dryRun) {
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
            break;
          }

          const generated = await generator.regenerate(projection, inputs);
          budget.consume(1);

          if (!dryRun) {
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
        break;
      }
    }
  }

  // ── Phase 2: discover new projections (stub — out of scope) ───────────────
  // The discover phase is not implemented in this issue. It is a no-op here.

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
  );

  return {
    run_id: runId,
    status,
    assessed,
    superseded,
    soft_refreshed: softRefreshed,
    started_at: startedAt,
    completed_at: completedAt,
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
