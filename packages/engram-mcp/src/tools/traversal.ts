/**
 * tools/traversal.ts — graph traversal MCP tools.
 *
 * Three tools that expose engram-core's structural graph operations:
 *   - engram_get_neighbors: BFS subgraph from an anchor entity
 *   - engram_find_edges: filter edges by source/target/relation/time
 *   - engram_get_path: shortest path between two entities
 */

import {
  type Edge,
  type EngramGraph,
  EntityNotFoundError,
  findEdges,
  getNeighbors,
  getPath,
  resolveEntity,
} from "engram-core";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_DEPTH = 5;
const MAX_ENTITIES = 200;
const MAX_EDGES = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve an entity ID from either entity_id or canonical_name.
 * Returns the ID string, or a structured error object.
 */
function resolveId(
  graph: EngramGraph,
  entity_id?: string,
  canonical_name?: string,
): string | { error: "not_found"; message: string } {
  if (entity_id) {
    return entity_id;
  }
  if (canonical_name) {
    const entity = resolveEntity(graph, canonical_name);
    if (!entity) {
      return {
        error: "not_found",
        message: `No entity found with canonical_name: ${canonical_name}`,
      };
    }
    return entity.id;
  }
  return {
    error: "not_found",
    message: "Must provide either entity_id or canonical_name",
  };
}

// ---------------------------------------------------------------------------
// engram_get_neighbors
// ---------------------------------------------------------------------------

export const GET_NEIGHBORS_TOOL = {
  name: "engram_get_neighbors",
  description:
    "Return the subgraph within N hops of an anchor entity. Useful for exploring structural connections without going through text search.",
  inputSchema: {
    type: "object" as const,
    properties: {
      entity_id: {
        type: "string",
        description: "ULID identifier of the anchor entity",
      },
      canonical_name: {
        type: "string",
        description:
          "Canonical name of the anchor entity (alternative to entity_id)",
      },
      depth: {
        type: "number",
        description: `Number of hops to traverse (default 1, max ${MAX_DEPTH})`,
      },
      valid_at: {
        type: "string",
        description:
          "ISO8601 UTC timestamp for temporal snapshot (default: now)",
      },
      direction: {
        type: "string",
        enum: ["outbound", "inbound", "both"],
        description: "Direction of traversal (default: both)",
      },
    },
  },
};

export interface GetNeighborsInput {
  entity_id?: string;
  canonical_name?: string;
  depth?: number;
  valid_at?: string;
  direction?: "outbound" | "inbound" | "both";
}

export function handleGetNeighbors(
  graph: EngramGraph,
  input: GetNeighborsInput,
) {
  const idOrError = resolveId(graph, input.entity_id, input.canonical_name);
  if (typeof idOrError === "object") {
    return idOrError;
  }

  const depth = input.depth ?? 1;
  if (depth < 1 || depth > MAX_DEPTH) {
    return {
      error: "invalid_input",
      message: `depth must be between 1 and ${MAX_DEPTH}, got ${depth}`,
    };
  }

  let subgraph: { entities: unknown[]; edges: Edge[] };
  try {
    subgraph = getNeighbors(graph, idOrError, {
      depth,
      valid_at: input.valid_at,
      direction: input.direction,
    });
  } catch (err) {
    if (err instanceof EntityNotFoundError) {
      return {
        error: "not_found",
        message: `Entity not found: ${idOrError}`,
      };
    }
    throw err;
  }

  const truncated =
    subgraph.entities.length > MAX_ENTITIES ||
    subgraph.edges.length > MAX_EDGES;

  const entities = truncated
    ? subgraph.entities.slice(0, MAX_ENTITIES)
    : subgraph.entities;
  const edges = truncated ? subgraph.edges.slice(0, MAX_EDGES) : subgraph.edges;

  return {
    entities,
    edges,
    truncated,
    total_entities: subgraph.entities.length,
    total_edges: subgraph.edges.length,
  };
}

// ---------------------------------------------------------------------------
// engram_find_edges
// ---------------------------------------------------------------------------

export const FIND_EDGES_TOOL = {
  name: "engram_find_edges",
  description:
    "Filter edges by source entity, target entity, relation type, and/or time. Returns matching edges from the knowledge graph.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_id: {
        type: "string",
        description: "ULID of the source entity",
      },
      source_name: {
        type: "string",
        description:
          "Canonical name of the source entity (alternative to source_id)",
      },
      target_id: {
        type: "string",
        description: "ULID of the target entity",
      },
      target_name: {
        type: "string",
        description:
          "Canonical name of the target entity (alternative to target_id)",
      },
      relation_type: {
        type: "string",
        description: "Filter by edge relation type (e.g. OWNS, DEPENDS_ON)",
      },
      active_only: {
        type: "boolean",
        description: "Only return non-invalidated edges (default true)",
      },
      valid_at: {
        type: "string",
        description:
          "ISO8601 UTC timestamp — only return edges valid at this point in time",
      },
    },
  },
};

export interface FindEdgesInput {
  source_id?: string;
  source_name?: string;
  target_id?: string;
  target_name?: string;
  relation_type?: string;
  active_only?: boolean;
  valid_at?: string;
}

export function handleFindEdges(graph: EngramGraph, input: FindEdgesInput) {
  // Resolve source entity if name provided
  let resolvedSourceId: string | undefined = input.source_id;
  if (!resolvedSourceId && input.source_name) {
    const entity = resolveEntity(graph, input.source_name);
    if (!entity) {
      return {
        error: "not_found",
        message: `No entity found with canonical_name: ${input.source_name}`,
      };
    }
    resolvedSourceId = entity.id;
  }

  // Resolve target entity if name provided
  let resolvedTargetId: string | undefined = input.target_id;
  if (!resolvedTargetId && input.target_name) {
    const entity = resolveEntity(graph, input.target_name);
    if (!entity) {
      return {
        error: "not_found",
        message: `No entity found with canonical_name: ${input.target_name}`,
      };
    }
    resolvedTargetId = entity.id;
  }

  const activeOnly = input.active_only ?? true;

  const edges = findEdges(graph, {
    source_id: resolvedSourceId,
    target_id: resolvedTargetId,
    relation_type: input.relation_type,
    active_only: activeOnly,
    valid_at: input.valid_at,
  });

  const truncated = edges.length > MAX_EDGES;
  const resultEdges = truncated ? edges.slice(0, MAX_EDGES) : edges;

  return {
    edges: resultEdges,
    truncated,
    total_edges: edges.length,
  };
}

// ---------------------------------------------------------------------------
// engram_get_path
// ---------------------------------------------------------------------------

export const GET_PATH_TOOL = {
  name: "engram_get_path",
  description:
    "Find the shortest path between two entities via BFS traversal. Returns the path as alternating entity/edge sequences.",
  inputSchema: {
    type: "object" as const,
    properties: {
      from_id: {
        type: "string",
        description: "ULID of the starting entity",
      },
      from_name: {
        type: "string",
        description:
          "Canonical name of the starting entity (alternative to from_id)",
      },
      to_id: {
        type: "string",
        description: "ULID of the destination entity",
      },
      to_name: {
        type: "string",
        description:
          "Canonical name of the destination entity (alternative to to_id)",
      },
      max_depth: {
        type: "number",
        description: `Maximum path length in hops (default 5, max ${MAX_DEPTH})`,
      },
      valid_at: {
        type: "string",
        description:
          "ISO8601 UTC timestamp for temporal snapshot (default: now)",
      },
    },
  },
};

export interface GetPathInput {
  from_id?: string;
  from_name?: string;
  to_id?: string;
  to_name?: string;
  max_depth?: number;
  valid_at?: string;
}

export function handleGetPath(graph: EngramGraph, input: GetPathInput) {
  const fromIdOrError = resolveId(graph, input.from_id, input.from_name);
  if (typeof fromIdOrError === "object") {
    return { ...fromIdOrError, field: "from" };
  }

  const toIdOrError = resolveId(graph, input.to_id, input.to_name);
  if (typeof toIdOrError === "object") {
    return { ...toIdOrError, field: "to" };
  }

  const maxDepth = input.max_depth ?? MAX_DEPTH;
  if (maxDepth < 1 || maxDepth > MAX_DEPTH) {
    return {
      error: "invalid_input",
      message: `max_depth must be between 1 and ${MAX_DEPTH}, got ${maxDepth}`,
    };
  }

  let result: {
    found: boolean;
    entities: unknown[];
    edges: Edge[];
    length: number;
  };
  try {
    result = getPath(graph, fromIdOrError, toIdOrError, {
      depth: maxDepth,
      valid_at: input.valid_at,
    });
  } catch (err) {
    if (err instanceof EntityNotFoundError) {
      return {
        error: "not_found",
        message: err.message,
      };
    }
    throw err;
  }

  return {
    found: result.found,
    entities: result.entities,
    edges: result.edges,
    length: result.length,
  };
}
