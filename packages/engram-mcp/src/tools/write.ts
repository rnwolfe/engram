/**
 * tools/write.ts — engram_add_episode and engram_add_edge MCP tool implementations.
 */

import {
  addEdge,
  addEpisode,
  type Edge,
  type EngramGraph,
  type Episode,
} from "engram-core";

// ---------------------------------------------------------------------------
// engram_add_episode
// ---------------------------------------------------------------------------

export const ADD_EPISODE_TOOL = {
  name: "engram_add_episode",
  description:
    "Add a new raw evidence episode to the knowledge graph. Episodes are the immutable provenance layer backing all entities and edges.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_type: {
        type: "string",
        description:
          "Source type (e.g. manual, git_commit, pr_comment, markdown)",
      },
      content: {
        type: "string",
        description: "Raw content of the episode",
      },
      source_ref: {
        type: "string",
        description:
          "Unique reference for deduplication (e.g. commit SHA, PR URL)",
      },
      actor: {
        type: "string",
        description: "Who or what created this episode",
      },
      timestamp: {
        type: "string",
        description: "ISO8601 UTC timestamp for the episode (default: now)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["source_type", "content"],
  },
};

export interface AddEpisodeInput {
  source_type: string;
  content: string;
  source_ref?: string;
  actor?: string;
  timestamp?: string;
  scope?: string;
}

export function handleAddEpisode(
  graph: EngramGraph,
  input: AddEpisodeInput,
): Episode {
  const timestamp = input.timestamp ?? new Date().toISOString();
  return addEpisode(graph, {
    source_type: input.source_type,
    content: input.content,
    source_ref: input.source_ref,
    actor: input.actor,
    timestamp,
  });
}

// ---------------------------------------------------------------------------
// engram_add_edge
// ---------------------------------------------------------------------------

export const ADD_EDGE_TOOL = {
  name: "engram_add_edge",
  description:
    "Add a new temporal fact (edge) between two entities, backed by evidence. Creates a supporting episode first.",
  inputSchema: {
    type: "object" as const,
    properties: {
      source_id: {
        type: "string",
        description: "ULID of the source entity",
      },
      target_id: {
        type: "string",
        description: "ULID of the target entity",
      },
      relation_type: {
        type: "string",
        description:
          "Relationship type label (e.g. OWNS, DEPENDS_ON, AUTHORED)",
      },
      edge_kind: {
        type: "string",
        enum: ["observed", "inferred", "asserted"],
        description:
          "Kind of edge: observed (extracted from source), inferred (heuristic), asserted (human stated)",
      },
      fact: {
        type: "string",
        description:
          "Human-readable statement of the fact this edge represents",
      },
      episode_content: {
        type: "string",
        description: "Content for the backing evidence episode",
      },
      valid_from: {
        type: "string",
        description: "ISO8601 UTC start of validity (null = unknown start)",
      },
      valid_until: {
        type: "string",
        description: "ISO8601 UTC end of validity (null = still current)",
      },
      confidence: {
        type: "number",
        description: "Confidence score 0.0–1.0 (default 1.0)",
      },
      actor: {
        type: "string",
        description: "Who or what asserted this fact",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: [
      "source_id",
      "target_id",
      "relation_type",
      "edge_kind",
      "fact",
      "episode_content",
    ],
  },
};

export interface AddEdgeInput {
  source_id: string;
  target_id: string;
  relation_type: string;
  edge_kind: string;
  fact: string;
  episode_content: string;
  valid_from?: string;
  valid_until?: string;
  confidence?: number;
  actor?: string;
  scope?: string;
}

export interface AddEdgeResult {
  episode: Episode;
  edge: Edge;
}

export function handleAddEdge(
  graph: EngramGraph,
  input: AddEdgeInput,
): AddEdgeResult {
  const now = new Date().toISOString();

  const episode = addEpisode(graph, {
    source_type: "manual",
    content: input.episode_content,
    actor: input.actor,
    timestamp: now,
  });

  const edge = addEdge(
    graph,
    {
      source_id: input.source_id,
      target_id: input.target_id,
      relation_type: input.relation_type,
      edge_kind: input.edge_kind,
      fact: input.fact,
      valid_from: input.valid_from,
      valid_until: input.valid_until,
      confidence: input.confidence,
    },
    [
      {
        episode_id: episode.id,
        extractor: "mcp:engram_add_edge",
        confidence: input.confidence ?? 1.0,
      },
    ],
  );

  return { episode, edge };
}
