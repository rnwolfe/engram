/**
 * tools/entity.ts — engram_get_entity and engram_add_entity MCP tool implementations.
 */

import {
  addEntity,
  addEpisode,
  type EngramGraph,
  findEdges,
  getEntity,
  getEvidenceForEntity,
} from "engram-core";

// ---------------------------------------------------------------------------
// engram_get_entity
// ---------------------------------------------------------------------------

export const GET_ENTITY_TOOL = {
  name: "engram_get_entity",
  description:
    "Retrieve a single entity by ID including its relationships (edges) and evidence chain.",
  inputSchema: {
    type: "object" as const,
    properties: {
      entity_id: {
        type: "string",
        description: "ULID identifier of the entity",
      },
      include_invalidated_edges: {
        type: "boolean",
        description: "Include superseded/invalidated edges (default false)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["entity_id"],
  },
};

export interface GetEntityInput {
  entity_id: string;
  include_invalidated_edges?: boolean;
  scope?: string;
}

export function handleGetEntity(graph: EngramGraph, input: GetEntityInput) {
  const entity = getEntity(graph, input.entity_id);
  if (!entity) {
    return { error: `Entity not found: ${input.entity_id}` };
  }

  const edges = findEdges(graph, {
    source_id: input.entity_id,
    include_invalidated: input.include_invalidated_edges ?? false,
  });
  const inboundEdges = findEdges(graph, {
    target_id: input.entity_id,
    include_invalidated: input.include_invalidated_edges ?? false,
  });

  const evidence = getEvidenceForEntity(graph, input.entity_id);

  return {
    entity,
    outbound_edges: edges,
    inbound_edges: inboundEdges,
    evidence,
  };
}

// ---------------------------------------------------------------------------
// engram_add_entity
// ---------------------------------------------------------------------------

export const ADD_ENTITY_TOOL = {
  name: "engram_add_entity",
  description:
    "Add a new entity to the knowledge graph with supporting evidence. Creates an episode first, then the entity linked to that episode.",
  inputSchema: {
    type: "object" as const,
    properties: {
      canonical_name: {
        type: "string",
        description: "Canonical name of the entity",
      },
      entity_type: {
        type: "string",
        description: "Type of entity (e.g. person, module, service, decision)",
      },
      summary: {
        type: "string",
        description: "Short descriptive summary of the entity",
      },
      episode_content: {
        type: "string",
        description: "Raw content for the backing evidence episode",
      },
      actor: {
        type: "string",
        description: "Who or what created this knowledge (optional)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["canonical_name", "entity_type", "episode_content"],
  },
};

export interface AddEntityInput {
  canonical_name: string;
  entity_type: string;
  summary?: string;
  episode_content: string;
  actor?: string;
  scope?: string;
}

export function handleAddEntity(graph: EngramGraph, input: AddEntityInput) {
  const now = new Date().toISOString();

  const episode = addEpisode(graph, {
    source_type: "manual",
    content: input.episode_content,
    actor: input.actor,
    timestamp: now,
  });

  const entity = addEntity(
    graph,
    {
      canonical_name: input.canonical_name,
      entity_type: input.entity_type,
      summary: input.summary,
    },
    [
      {
        episode_id: episode.id,
        extractor: "mcp:engram_add_entity",
        confidence: 1.0,
      },
    ],
  );

  return { episode, entity };
}
