/**
 * projections.ts — project() operation and Projection CRUD.
 *
 * Implements the explicit projection authoring primitive described in
 * docs/internal/specs/projections.md. A projection is an AI-authored synthesis
 * of substrate elements (episodes, entities, edges, or other projections).
 *
 * Types and error classes live in projections-types.ts.
 */

import { createHash } from "node:crypto";
import { ulid } from "ulid";
import type { ResolvedInput } from "../ai/projection-generator.js";
import type { EngramGraph } from "../format/index.js";
import type {
  AnchorType,
  GetProjectionResult,
  Projection,
  ProjectionEvidenceRow,
  ProjectionInput,
  ProjectionOpts,
} from "./projections-types.js";
import {
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
} from "./projections-types.js";

export type {
  AnchorType,
  GetProjectionResult,
  Projection,
  ProjectionEvidenceRow,
  ProjectionInput,
  ProjectionInputType,
  ProjectionOpts,
} from "./projections-types.js";
export {
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
} from "./projections-types.js";

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

// ─── Internal helpers ─────────────────────────────────────────────────────────

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
        if (!row || row.invalidated_at !== null) {
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

function computeFingerprint(resolved: ResolvedInput[]): string {
  const entries = resolved
    .map((r) => `${r.type}:${r.id}:${r.content_hash ?? ""}`)
    .sort();
  return createHash("sha256").update(entries.join("\n")).digest("hex");
}

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
        if (edge && edge.invalidated_at === null)
          currentHash = createHash("sha256").update(edge.fact).digest("hex");
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

function detectProjectionCycle(
  graph: EngramGraph,
  targetProjectionId: string,
  inputIds: string[],
): string | null {
  if (inputIds.length === 0) return null;

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

    if (cycleRow) return inputId;
  }

  return null;
}

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
    if (!frontmatter.includes(`${key}:`)) {
      throw new ProjectionFrontmatterError(`missing required key: ${key}`);
    }
  }
}

function extractFrontmatterValue(body: string, key: string): string | null {
  const endIdx = body.indexOf("\n---", 4);
  if (endIdx === -1) return null;
  const frontmatter = body.slice(4, endIdx);
  const safeKey = key.replace(/[^a-zA-Z0-9_]/g, "");
  const regex = new RegExp(`^${safeKey}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m");
  const match = frontmatter.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

// ─── Core operations ─────────────────────────────────────────────────────────

/**
 * Supersedes an existing projection with a new one atomically.
 * Invalidates the old row and inserts the new one in a single transaction.
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

    // Invalidate old FIRST so the partial unique index clears before INSERT.
    graph.db
      .prepare(
        `UPDATE projections
           SET invalidated_at = ?, valid_until = ?
         WHERE id = ? AND invalidated_at IS NULL`,
      )
      .run(now, now, oldProjectionId);

    // Insert new projection
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

    // Point old → new
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

    result.projection = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(newId);
  })();

  if (!result.projection)
    throw new Error("supersedeProjection: transaction produced no result");
  return result.projection;
}

/**
 * Authors a new projection (or returns an existing idempotent match).
 */
export async function project(
  graph: EngramGraph,
  opts: ProjectionOpts,
): Promise<Projection> {
  const { kind, anchor, inputs, generator, owner_id } = opts;
  const anchor_id = anchor.id ?? null;
  const anchor_type = anchor.type;

  const resolved = resolveInputs(graph, inputs);
  const fingerprint = computeFingerprint(resolved);

  // Cycle check for projection inputs
  const projectionInputIds = inputs
    .filter((i) => i.type === "projection")
    .map((i) => i.id);

  if (projectionInputIds.length > 0) {
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
      if (cycleInputId) throw new ProjectionCycleError(cycleInputId);
    }
  }

  // Check for existing active projection
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
    return existingProjection; // idempotent no-op
  }

  const generated = await generator.generate(resolved);
  validateFrontmatter(generated.body);

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

  if (existingProjection) {
    return supersedeProjection(graph, existingProjection.id, newData, resolved);
  }

  // Insert fresh projection
  const newId = ulid();
  const now = new Date().toISOString();
  const result: { projection: Projection | null } = { projection: null };

  graph.db.transaction(() => {
    // Application-level uniqueness guard: SQLite's partial UNIQUE index does not
    // enforce uniqueness when anchor_id IS NULL (each NULL is treated as distinct).
    const duplicate = graph.db
      .query<{ id: string }, [string, string | null, string]>(
        `SELECT id FROM projections
          WHERE anchor_type = ? AND anchor_id IS ? AND kind = ?
            AND invalidated_at IS NULL
          LIMIT 1`,
      )
      .get(anchor_type, anchor_id, kind);
    if (duplicate) {
      throw new Error(
        `project: active projection already exists for (${anchor_type}, ${anchor_id ?? "null"}, ${kind})`,
      );
    }

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

    result.projection = graph.db
      .query<Projection, [string]>("SELECT * FROM projections WHERE id = ?")
      .get(newId);
  })();

  if (!result.projection)
    throw new Error("project: transaction produced no result");
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

  const currentFingerprint = recomputeFingerprint(graph, id);
  const stale = currentFingerprint !== projection.input_fingerprint;

  let stale_reason: GetProjectionResult["stale_reason"];
  if (stale) {
    const evidenceRows = graph.db
      .query<ProjectionEvidenceRow, [string]>(
        "SELECT * FROM projection_evidence WHERE projection_id = ? AND role = 'input'",
      )
      .all(id);

    let hasDeleted = false;
    for (const row of evidenceRows) {
      if (row.target_type === "episode") {
        const ep = graph.db
          .query<{ status: string }, [string]>(
            "SELECT status FROM episodes WHERE id = ?",
          )
          .get(row.target_id);
        if (!ep || ep.status === "redacted") hasDeleted = true;
      } else if (row.target_type === "edge") {
        const edge = graph.db
          .query<{ invalidated_at: string | null }, [string]>(
            "SELECT invalidated_at FROM edges WHERE id = ?",
          )
          .get(row.target_id);
        if (!edge || edge.invalidated_at !== null) hasDeleted = true;
      } else if (row.target_type === "projection") {
        const proj = graph.db
          .query<{ invalidated_at: string | null }, [string]>(
            "SELECT invalidated_at FROM projections WHERE id = ?",
          )
          .get(row.target_id);
        if (!proj || proj.invalidated_at !== null) hasDeleted = true;
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
