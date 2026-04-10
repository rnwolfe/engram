/**
 * tools/projections.ts — MCP tool implementations for projection read operations.
 *
 * Read tools (always available):
 *   engram_get_projection   — wraps getProjection()
 *   engram_search_projections — wraps searchProjections() with optional filters
 *   engram_list_projections  — wraps listActiveProjections() with optional filters
 *
 * Authoring tools (gated by enableProjectionAuthoring config flag):
 *   engram_project    — wraps project()
 *   engram_reconcile  — wraps reconcile()
 */

import {
  AnthropicGenerator,
  type EngramGraph,
  type GetProjectionResult,
  getProjection,
  type ListProjectionsOpts,
  listActiveProjections,
  project,
  type ReconciliationRunResult,
  reconcile,
  searchProjections,
} from "engram-core";

// ---------------------------------------------------------------------------
// engram_get_projection
// ---------------------------------------------------------------------------

export const GET_PROJECTION_TOOL = {
  name: "engram_get_projection",
  description:
    "Retrieve a single projection by ID. Returns the projection row, body, and read-time staleness flag with reason.",
  inputSchema: {
    type: "object" as const,
    properties: {
      id: {
        type: "string",
        description: "ULID identifier of the projection",
      },
    },
    required: ["id"],
  },
};

export interface GetProjectionInput {
  id: string;
}

export function handleGetProjection(
  graph: EngramGraph,
  input: GetProjectionInput,
): GetProjectionResult | { error: string } {
  const result = getProjection(graph, input.id);
  if (!result) {
    return { error: `Projection not found: ${input.id}` };
  }
  return result;
}

// ---------------------------------------------------------------------------
// engram_search_projections
// ---------------------------------------------------------------------------

export const SEARCH_PROJECTIONS_TOOL = {
  name: "engram_search_projections",
  description:
    "Search projections using full-text search. Returns ranked results with staleness flag per row.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Full-text search query string",
      },
      kind: {
        type: "string",
        description: "Filter results to projections of this kind",
      },
      anchor: {
        type: "string",
        description:
          "Filter by anchor as 'type:id' (e.g. 'entity:01ABC'). Type alone (e.g. 'entity') filters by anchor_type only.",
      },
      include_superseded: {
        type: "boolean",
        description:
          "Include superseded (invalidated) projections in results (default false)",
      },
    },
    required: ["query"],
  },
};

export interface SearchProjectionsInput {
  query: string;
  kind?: string;
  anchor?: string;
  include_superseded?: boolean;
}

export function handleSearchProjections(
  graph: EngramGraph,
  input: SearchProjectionsInput,
): GetProjectionResult[] {
  const opts: ListProjectionsOpts = {};

  if (input.kind !== undefined) {
    opts.kind = input.kind;
  }

  if (input.anchor !== undefined) {
    const colonIdx = input.anchor.indexOf(":");
    if (colonIdx !== -1) {
      opts.anchor_type = input.anchor.slice(
        0,
        colonIdx,
      ) as ListProjectionsOpts["anchor_type"];
      opts.anchor_id = input.anchor.slice(colonIdx + 1);
    } else {
      opts.anchor_type = input.anchor as ListProjectionsOpts["anchor_type"];
    }
  }

  if (input.include_superseded !== undefined) {
    opts.include_superseded = input.include_superseded;
  }

  return searchProjections(graph, input.query, opts);
}

// ---------------------------------------------------------------------------
// engram_list_projections
// ---------------------------------------------------------------------------

export const LIST_PROJECTIONS_TOOL = {
  name: "engram_list_projections",
  description:
    "List active projections with optional filters. Returns id, kind, title, anchor, last_assessed_at, and staleness flag per row.",
  inputSchema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        description: "Filter projections by kind",
      },
      anchor_type: {
        type: "string",
        description: "Filter projections by anchor type (e.g. entity, edge)",
      },
      anchor_id: {
        type: "string",
        description: "Filter projections by anchor entity/edge/episode ID",
      },
      include_superseded: {
        type: "boolean",
        description:
          "Include superseded (invalidated) projections (default false)",
      },
    },
    required: [],
  },
};

export interface ListProjectionsInput {
  kind?: string;
  anchor_type?: string;
  anchor_id?: string;
  include_superseded?: boolean;
}

export interface ListProjectionRow {
  id: string;
  kind: string;
  title: string;
  anchor_type: string;
  anchor_id: string | null;
  last_assessed_at: string | null;
  stale: boolean;
  stale_reason?: "input_content_changed" | "input_deleted";
}

export function handleListProjections(
  graph: EngramGraph,
  input: ListProjectionsInput,
): ListProjectionRow[] {
  const opts: ListProjectionsOpts = {};

  if (input.kind !== undefined) {
    opts.kind = input.kind;
  }
  if (input.anchor_type !== undefined) {
    opts.anchor_type = input.anchor_type as ListProjectionsOpts["anchor_type"];
  }
  if (input.anchor_id !== undefined) {
    opts.anchor_id = input.anchor_id;
  }

  if (input.include_superseded !== undefined) {
    opts.include_superseded = input.include_superseded;
  }

  const results = listActiveProjections(graph, opts);

  return results.map((r) => ({
    id: r.projection.id,
    kind: r.projection.kind,
    title: r.projection.title,
    anchor_type: r.projection.anchor_type,
    anchor_id: r.projection.anchor_id,
    last_assessed_at: r.last_assessed_at,
    stale: r.stale,
    stale_reason: r.stale_reason,
  }));
}

// ---------------------------------------------------------------------------
// engram_project (authoring — gated by enableProjectionAuthoring)
// ---------------------------------------------------------------------------

export const PROJECT_TOOL = {
  name: "engram_project",
  description:
    "⚠️ This tool calls the LLM and consumes budget. Enable with enableProjectionAuthoring: true in server config.\n\nAuthor a new projection by synthesizing inputs with an AI generator. Wraps project() from engram-core.",
  inputSchema: {
    type: "object" as const,
    properties: {
      kind: {
        type: "string",
        description:
          "Projection kind label (e.g. entity_summary, decision_record)",
      },
      anchor: {
        type: "string",
        description:
          "Anchor as 'type:id' string (e.g. 'entity:01ABC') or 'none' for unanchored projections",
      },
      inputs: {
        type: "array",
        items: { type: "string" },
        description:
          "Input substrate references as 'type:id' strings (e.g. ['episode:01ABC', 'entity:01DEF'])",
      },
      prompt_template_id: {
        type: "string",
        description: "Optional prompt template ID to use for generation",
      },
    },
    required: ["kind", "anchor", "inputs"],
  },
};

export interface ProjectInput {
  kind: string;
  anchor: string;
  inputs: string[];
  prompt_template_id?: string;
}

export async function handleProject(
  graph: EngramGraph,
  input: ProjectInput,
  enableProjectionAuthoring: boolean,
) {
  if (!enableProjectionAuthoring) {
    return {
      error:
        "Projection authoring is disabled. Enable with enableProjectionAuthoring: true in server config.",
    };
  }

  // Parse anchor string 'type:id' or 'none'
  let anchorType: import("engram-core").AnchorType;
  let anchorId: string | undefined;

  if (input.anchor === "none") {
    anchorType = "none";
    anchorId = undefined;
  } else {
    const colonIdx = input.anchor.indexOf(":");
    if (colonIdx === -1) {
      return {
        error: `Invalid anchor format: '${input.anchor}'. Expected 'type:id' or 'none'.`,
      };
    }
    anchorType = input.anchor.slice(
      0,
      colonIdx,
    ) as import("engram-core").AnchorType;
    anchorId = input.anchor.slice(colonIdx + 1);
  }

  // Parse input references 'type:id'
  const parsedInputs: import("engram-core").ProjectionInput[] = [];
  for (const ref of input.inputs) {
    const colonIdx = ref.indexOf(":");
    if (colonIdx === -1) {
      return {
        error: `Invalid input format: '${ref}'. Expected 'type:id' (e.g. 'episode:01ABC').`,
      };
    }
    const type = ref.slice(
      0,
      colonIdx,
    ) as import("engram-core").ProjectionInputType;
    const id = ref.slice(colonIdx + 1);
    parsedInputs.push({ type, id });
  }

  const generator = new AnthropicGenerator({
    promptTemplateId: input.prompt_template_id,
  });

  try {
    const projection = await project(graph, {
      kind: input.kind,
      anchor: { type: anchorType, id: anchorId },
      inputs: parsedInputs,
      generator,
    });
    return { projection };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}

// ---------------------------------------------------------------------------
// engram_reconcile (authoring — gated by enableProjectionAuthoring)
// ---------------------------------------------------------------------------

export const RECONCILE_TOOL = {
  name: "engram_reconcile",
  description:
    "⚠️ This tool calls the LLM and consumes budget. Enable with enableProjectionAuthoring: true in server config.\n\nRun the reconcile loop to reassess and refresh stale projections. Returns a run summary with run ID.",
  inputSchema: {
    type: "object" as const,
    properties: {
      phase: {
        type: "string",
        enum: ["assess", "discover", "both"],
        description:
          "Which phase(s) to run: assess (check stale projections), discover (find new candidates), or both (default: both)",
      },
      scope: {
        type: "string",
        description:
          "Optional scope filter (e.g. 'kind:entity_summary' or 'anchor:entity')",
      },
      max_cost: {
        type: "number",
        minimum: 0,
        description: "Maximum token budget for LLM calls (required)",
      },
      dry_run: {
        type: "boolean",
        description:
          "If true, assess but do not write any changes to the database (default false)",
      },
    },
    required: ["max_cost"],
  },
};

export interface ReconcileInput {
  phase?: "assess" | "discover" | "both";
  scope?: string;
  max_cost: number;
  dry_run?: boolean;
}

export async function handleReconcile(
  graph: EngramGraph,
  input: ReconcileInput,
  enableProjectionAuthoring: boolean,
): Promise<ReconciliationRunResult | { error: string }> {
  if (!enableProjectionAuthoring) {
    return {
      error:
        "Projection authoring is disabled. Enable with enableProjectionAuthoring: true in server config.",
    };
  }

  const phase = input.phase ?? "both";
  const phases: ("assess" | "discover")[] =
    phase === "both"
      ? ["assess", "discover"]
      : phase === "assess"
        ? ["assess"]
        : ["discover"];

  const generator = new AnthropicGenerator();

  return reconcile(graph, generator, {
    phases,
    scope: input.scope,
    maxCost: input.max_cost,
    dryRun: input.dry_run ?? false,
  });
}
