/**
 * projections-types.ts — types and error classes for the projection layer.
 *
 * Split from projections.ts to keep that file under the 500-line limit.
 */

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
  generator: import("../ai/projection-generator.js").ProjectionGenerator;
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
