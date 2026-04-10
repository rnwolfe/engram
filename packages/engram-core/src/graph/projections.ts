/**
 * projections.ts — project() operation and Projection CRUD.
 *
 * Implements the explicit projection authoring primitive described in
 * docs/internal/specs/projections.md. A projection is an AI-authored synthesis
 * of substrate elements (episodes, entities, edges, or other projections).
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type {
  ProjectionGenerator,
  ResolvedInput,
} from "../ai/projection-generator.js";
import type { EngramGraph } from "../format/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type AnchorType = "entity" | "edge" | "episode" | "projection" | "none";

export type ProjectionInputType = "episode" | "entity" | "edge" | "projection";

export interface ProjectionInput {
  type: ProjectionInputType;
  id: string;
}

export interface Projection {
  id: string;
  kind: string;
  anchor_type: AnchorType;
  anchor_id: string | null;
  title: string;
  body: string;
  body_format: string;
  model: string;
  prompt_template_id: string | null;
  prompt_hash: string | null;
  input_fingerprint: string;
  confidence: number;
  valid_from: string;
  valid_until: string | null;
  last_assessed_at: string | null;
  invalidated_at: string | null;
  superseded_by: string | null;
  created_at: string;
  owner_id: string | null;
}

export interface ProjectionEvidenceRow {
  projection_id: string;
  target_type: string;
  target_id: string;
  role: string;
  content_hash: string | null;
}

export interface ProjectionOpts {
  kind: string;
  anchor: { type: AnchorType; id?: string };
  inputs: ProjectionInput[];
  generator: ProjectionGenerator;
  owner_id?: string;
}

export interface GetProjectionResult {
  projection: Projection;
  stale: boolean;
  stale_reason?: "input_content_changed" | "input_deleted";
  last_assessed_at: string | null;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export class ProjectionCycleError extends Error {
  constructor(inputId: string) {
    super(
      `project(): cycle detected — projection input ${inputId} would create a circular dependency`,
    );
    this.name = "ProjectionCycleError";
  }
}

export class ProjectionInputMissingError extends Error {
  constructor(type: string, id: string) {
    super(`project(): input ${type}:${id} not found or is redacted`);
    this.name = "ProjectionInputMissingError";
  }
}

export class ProjectionFrontmatterError extends Error {
  constructor(message: string) {
    super(`project(): invalid frontmatter — ${message}`);
    this.name = "ProjectionFrontmatterError";
  }
}

// ─── Required frontmatter keys ───────────────────────────────────────────────

const REQUIRED_FRONTMATTER_KEYS = [
  "id",
  "kind",
  "anchor",
  "title",
  "model",
  "input_fingerprint",
  "valid_from",
  "inputs",
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolves input rows from the substrate. Returns ResolvedInput[] or throws
 * ProjectionInputMissingError if any input is missing or redacted.
 */
function resolveInputs(
  graph: EngramGraph,
  inputs: ProjectionInput[],
): ResolvedInput[] {
  const resolved: ResolvedInput[] = [];

  for (const input of inputs) {
    let content: string | null = null;
    let content_hash: string | null = null;

    switch (input.type) {
      case "episode": {
        const row = graph.db
          .query<
            {
              id: string;
              content: string;
              content_hash: string;
              status: string;
            },
            [string]
          >(
            "SELECT id, content, content_hash, status FROM episodes WHERE id = ?",
          )
          .get(input.id);
        if (!row || row.status === "redacted") {
          throw new ProjectionInputMissingError(input.type, input.id);
        }
        content = row.content;
        content_hash = row.content_hash;
        break;
      }
      case "entity": {
        const row = graph.db
          .query<
            {
              id: string;
              canonical_name: string;
              summary: string | null;
              status: string;
            },
            [string]
          >(
            "SELECT id, canonical_name, summary, status FROM entities WHERE id = ?",
          )
          .get(input.id);
        if (!row || row.status === "archived") {
          throw new ProjectionInputMissingError(input.type, input.id);
        }
        content = `${row.canonical_name}${row.summary ? `: ${row.summary}` : ""}`;
        content_hash = createHash("sha256").update(content).digest("hex");
        break;
      }
      case "edge": {
        const row = graph.db
          .query<
            { id: string; fact: string; invalidated_at: string | null },
            [string]
          >("SELECT id, fact, invalidated_at FROM edges WHERE id = ?")
          .get(input.id);
        if (!row) {
          throw new ProjectionInputMissingError(input.type, input.id);
        }
        content = row.fact;
        content_hash = createHash("sha256").update(content).digest("hex");
        break;
      }
      case "projection": {
        const row = graph.db
          .query<
            { id: string; body: string; invalidated_at: string | null },
            [string]
          >("SELECT id, body, invalidated_at FROM projections WHERE id = ?")
          .get(input.id);
        if (!row || row.invalidated_at !== null) {
          throw new ProjectionInputMissingError(input.type, input.id);
        }
        content = row.body;
        content_hash = createHash("sha256").update(content).digest("hex");
        break;
      }
      default: {
        throw new ProjectionInputMissingError(input.type, input.id);
      }
    }

    resolved.push({ type: input.type, id: input.id, content, content_hash });
  }

  return resolved;
}

/**
 * Computes the input_fingerprint as sha256 over sorted "type:id:content_hash" entries.
 */
function computeFingerprint(resolved: ResolvedInput[]): string {
  const entries = resolved
    .map((r) => `${r.type}:${r.id}:${r.content_hash ?? ""}`)
    .sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

/**
 * Recomputes the current fingerprint for an existing projection by reading
 * current content hashes from the substrate.
 */
function recomputeFingerprint(
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
          const content = `${ent.canonical_name}${ent.summary ? `: ${ent.summary}` : ""}`;
          currentHash = createHash("sha256").update(content).digest("hex");
        }
        break;
      }
      case "edge": {
        const edge = graph.db
          .query<{ fact: string }, [string]>(
            "SELECT fact FROM edges WHERE id = ?",
          )
          .get(row.target_id);
        if (edge) {
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

/**
 * Detects if adding a dependency on any of `inputIds` would create a cycle in the
 * projection dependency graph.
 *
 * A cycle would occur if any projection in the transitive dependency set of the
 * candidate inputs is the same as `targetProjectionId` (the existing projection
 * that is about to be superseded, which the new projection would conceptually replace).
 *
 * Uses a recursive CTE to walk DOWNWARD from each projection input (following
 * their evidence targets where target_type='projection'), checking whether
 * `targetProjectionId` is reachable.
 */
function detectProjectionCycle(
  graph: EngramGraph,
  targetProjectionId: string,
  inputIds: string[],
): string | null {
  if (inputIds.length === 0) return null;

  // Walk the dependency tree downward from each projection input.
  // If we reach targetProjectionId, adding this dependency would form a cycle.
  for (const inputId of inputIds) {
    const cycleRow = graph.db
      .query<{ id: string }, [string, string]>(
        `WITH RECURSIVE deps(id) AS (
           SELECT ? AS id
           UNION ALL
           SELECT pe.target_id
             FROM projection_evidence pe
             JOIN deps ON pe.projection_id = deps.id
            WHERE pe.target_type = 'projection'
              AND pe.role = 'input'
         )
         SELECT id FROM deps WHERE id = ? LIMIT 1`,
      )
      .get(inputId, targetProjectionId);

    if (cycleRow) {
      return inputId;
    }
  }

  return null;
}

/**
 * Validates that the body frontmatter contains all required keys.
 * This is a simple YAML frontmatter check — not a full YAML parser.
 */
function validateFrontmatter(body: string): void {
  if (!body.startsWith("---\n")) {
    throw new ProjectionFrontmatterError(
      "body must begin with YAML frontmatter block (---)",
    );
  }

  const endIdx = body.indexOf("\n---", 4);
  if (endIdx === -1) {
    throw new ProjectionFrontmatterError("frontmatter block is not closed");
  }

  const frontmatter = body.slice(4, endIdx);

  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    // Accept "key:" or "key: " patterns
    if (!frontmatter.includes(`${key}:`)) {
      throw new ProjectionFrontmatterError(`missing required key: ${key}`);
    }
  }
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * Supersedes an existing projection with a new one atomically.
 *
 * In one transaction:
 * 1. UPDATE old projection: set invalidated_at, valid_until, superseded_by
 * 2. INSERT new projection row + evidence rows
 *
 * Returns the new projection.
 */
export function supersedeProjection(
  graph: EngramGraph,
  oldProjectionId: string,
  newData: {
    kind: string;
    anchor_type: AnchorType;
    anchor_id: string | null;
    title: string;
    body: string;
    model: string;
    prompt_template_id: string | null;
    prompt_hash: string | null;
    input_fingerprint: string;
    confidence: number;
    owner_id: string | null;
  },
  resolvedInputs: ResolvedInput[],
): Projection {
  const newId = ulid();
  const now = new Date().toISOString();
  const result: { projection: Projection | null } = { projection: null };

  graph.db.transaction(() => {
    const oldRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(oldProjectionId);

    if (!oldRow) {
      throw new Error(
        `supersedeProjection: projection ${oldProjectionId} not found`,
      );
    }

    if (oldRow.invalidated_at !== null) {
      throw new Error(
        `supersedeProjection: projection ${oldProjectionId} is already invalidated`,
      );
    }

    // Invalidate old projection FIRST so the unique constraint clears before insert.
    // The unique index is partial: WHERE invalidated_at IS NULL.
    graph.db
      .prepare(
        `UPDATE projections
           SET invalidated_at = ?,
               valid_until    = ?
         WHERE id = ? AND invalidated_at IS NULL`,
      )
      .run(now, now, oldProjectionId);

    const verifyRow = graph.db
      .query<{ invalidated_at: string | null }, [string]>(
        "SELECT invalidated_at FROM projections WHERE id = ?",
      )
      .get(oldProjectionId);

    if (!verifyRow || verifyRow.invalidated_at === null) {
      throw new Error(
        `supersedeProjection: failed to invalidate projection ${oldProjectionId}`,
      );
    }

    // Insert new projection (unique constraint is now clear)
    graph.db
      .prepare(
        `INSERT INTO projections
           (id, kind, anchor_type, anchor_id, title, body, body_format,
            model, prompt_template_id, prompt_hash, input_fingerprint,
            confidence, valid_from, valid_until, last_assessed_at,
            invalidated_at, superseded_by, created_at, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, 'markdown', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        newId,
        newData.kind,
        newData.anchor_type,
        newData.anchor_id,
        newData.title,
        newData.body,
        newData.model,
        newData.prompt_template_id,
        newData.prompt_hash,
        newData.input_fingerprint,
        newData.confidence,
        now,
        now,
        newData.owner_id,
      );

    // Point old projection to new one
    graph.db
      .prepare(`UPDATE projections SET superseded_by = ? WHERE id = ?`)
      .run(newId, oldProjectionId);

    // Insert evidence rows for new projection
    const insertEvidence = graph.db.prepare(
      `INSERT INTO projection_evidence
         (projection_id, target_type, target_id, role, content_hash)
       VALUES (?, ?, ?, 'input', ?)`,
    );
    for (const inp of resolvedInputs) {
      insertEvidence.run(newId, inp.type, inp.id, inp.content_hash);
    }

    const newRow = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(newId);

    if (!newRow) {
      throw new Error(
        `supersedeProjection: failed to retrieve new projection ${newId}`,
      );
    }

    result.projection = newRow;
  })();

  if (!result.projection) {
    throw new Error("supersedeProjection: transaction produced no result");
  }

  return result.projection;
}

/**
 * Authors a new projection (or returns an existing idempotent match).
 *
 * Steps:
 * 1. Resolve input set from substrate — reject if any missing or redacted.
 * 2. Compute input_fingerprint.
 * 3. Cycle check: if any input is type='projection', detect would-be cycles.
 * 4. Check whether active projection exists for (anchor, kind):
 *    - If yes and fingerprint matches → return existing (idempotent no-op).
 *    - If yes with different fingerprint → supersede after generation.
 * 5. Call generator.generate(inputs) → body with frontmatter.
 * 6. Validate frontmatter.
 * 7. Insert projections row + projection_evidence rows in a single transaction.
 */
export async function project(
  graph: EngramGraph,
  opts: ProjectionOpts,
): Promise<Projection> {
  const { kind, anchor, inputs, generator, owner_id } = opts;
  const anchor_id = anchor.id ?? null;
  const anchor_type = anchor.type;

  // Step 1: Resolve inputs
  const resolved = resolveInputs(graph, inputs);

  // Step 2: Compute fingerprint
  const fingerprint = computeFingerprint(resolved);

  // Step 3: Cycle check for projection inputs
  const projectionInputIds = inputs
    .filter((i) => i.type === "projection")
    .map((i) => i.id);

  if (projectionInputIds.length > 0) {
    // We need an ID for the would-be new projection to check cycles.
    // Use a temporary placeholder for cycle detection — we check if any
    // existing projection in the candidate input set can reach itself.
    // Actually, since the new projection doesn't exist yet, we check if
    // the anchor's existing active projection (if any) would be in the cycle.
    const existingActive = graph.db
      .query<{ id: string }, [string, string | null, string]>(
        `SELECT id FROM projections
          WHERE anchor_type = ? AND anchor_id IS ? AND kind = ?
            AND invalidated_at IS NULL
          LIMIT 1`,
      )
      .get(anchor_type, anchor_id, kind);

    if (existingActive) {
      const cycleInputId = detectProjectionCycle(
        graph,
        existingActive.id,
        projectionInputIds,
      );
      if (cycleInputId) {
        throw new ProjectionCycleError(cycleInputId);
      }
    }
  }

  // Step 4: Check for existing active projection
  const existingProjection = graph.db
    .query<Projection, [string, string | null, string]>(
      `SELECT * FROM projections
        WHERE anchor_type = ? AND anchor_id IS ? AND kind = ?
          AND invalidated_at IS NULL
        LIMIT 1`,
    )
    .get(anchor_type, anchor_id, kind);

  if (
    existingProjection &&
    existingProjection.input_fingerprint === fingerprint
  ) {
    // Idempotent no-op: same inputs, same projection
    return existingProjection;
  }

  // Step 5: Generate body
  const generated = await generator.generate(resolved);

  // Step 6: Validate frontmatter
  validateFrontmatter(generated.body);

  // Extract title and model from frontmatter (simple string extraction)
  const title = extractFrontmatterValue(generated.body, "title") ?? kind;
  const model = extractFrontmatterValue(generated.body, "model") ?? "unknown";
  const prompt_template_id =
    extractFrontmatterValue(generated.body, "prompt_template_id") ?? null;
  const prompt_hash =
    extractFrontmatterValue(generated.body, "prompt_hash") ?? null;

  const newData = {
    kind,
    anchor_type,
    anchor_id,
    title,
    body: generated.body,
    model,
    prompt_template_id,
    prompt_hash,
    input_fingerprint: fingerprint,
    confidence: generated.confidence,
    owner_id: owner_id ?? null,
  };

  // Step 7: Insert or supersede
  if (existingProjection) {
    // Fingerprint differs — supersede
    return supersedeProjection(graph, existingProjection.id, newData, resolved);
  }

  // No existing projection — insert fresh
  const newId = ulid();
  const now = new Date().toISOString();
  const result: { projection: Projection | null } = { projection: null };

  graph.db.transaction(() => {
    graph.db
      .prepare(
        `INSERT INTO projections
           (id, kind, anchor_type, anchor_id, title, body, body_format,
            model, prompt_template_id, prompt_hash, input_fingerprint,
            confidence, valid_from, valid_until, last_assessed_at,
            invalidated_at, superseded_by, created_at, owner_id)
         VALUES (?, ?, ?, ?, ?, ?, 'markdown', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        newId,
        kind,
        anchor_type,
        anchor_id,
        title,
        generated.body,
        model,
        prompt_template_id,
        prompt_hash,
        fingerprint,
        generated.confidence,
        now,
        now,
        owner_id ?? null,
      );

    const insertEvidence = graph.db.prepare(
      `INSERT INTO projection_evidence
         (projection_id, target_type, target_id, role, content_hash)
       VALUES (?, ?, ?, 'input', ?)`,
    );
    for (const inp of resolved) {
      insertEvidence.run(newId, inp.type, inp.id, inp.content_hash);
    }

    const row = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(newId);

    if (!row) {
      throw new Error(
        `project: failed to retrieve inserted projection ${newId}`,
      );
    }

    result.projection = row;
  })();

  if (!result.projection) {
    throw new Error("project: transaction produced no result");
  }

  return result.projection;
}

/**
 * Reads a projection by ID, computing the stale flag at read time.
 */
export function getProjection(
  graph: EngramGraph,
  id: string,
): GetProjectionResult | null {
  const projection = graph.db
    .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
    .get(id);

  if (!projection) return null;

  // Compute current fingerprint and compare
  const currentFingerprint = recomputeFingerprint(graph, id);
  const stale = currentFingerprint !== projection.input_fingerprint;

  let stale_reason: GetProjectionResult["stale_reason"];
  if (stale) {
    // Check if any input is missing (deleted/redacted)
    const evidenceRows = graph.db
      .query<ProjectionEvidenceRow, [string]>(
        "SELECT * FROM projection_evidence WHERE projection_id = ? AND role = 'input'",
      )
      .all(id);

    let hasDeleted = false;
    for (const row of evidenceRows) {
      switch (row.target_type) {
        case "episode": {
          const ep = graph.db
            .query<{ status: string }, [string]>(
              "SELECT status FROM episodes WHERE id = ?",
            )
            .get(row.target_id);
          if (!ep || ep.status === "redacted") hasDeleted = true;
          break;
        }
        case "projection": {
          const proj = graph.db
            .query<{ invalidated_at: string | null }, [string]>(
              "SELECT invalidated_at FROM projections WHERE id = ?",
            )
            .get(row.target_id);
          if (!proj || proj.invalidated_at !== null) hasDeleted = true;
          break;
        }
      }
    }

    stale_reason = hasDeleted ? "input_deleted" : "input_content_changed";
  }

  return {
    projection,
    stale,
    stale_reason,
    last_assessed_at: projection.last_assessed_at,
  };
}

/**
 * Extracts a scalar value from a YAML frontmatter block.
 * Handles: key: value and key: "value" and key: 'value'
 */
function extractFrontmatterValue(body: string, key: string): string | null {
  const endIdx = body.indexOf("\n---", 4);
  if (endIdx === -1) return null;
  const frontmatter = body.slice(4, endIdx);

  const regex = new RegExp(`^${key}:\\s*['"']?([^'"'\\n]+)['"']?\\s*$`, "m");
  const match = frontmatter.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}
