/**
 * tools/context.ts — engram_get_context MCP tool implementation.
 *
 * The 95% tool: hybrid search -> fan-out traversal -> rank -> budget-aware truncation.
 */

import {
  type Edge,
  type EngramGraph,
  type Entity,
  EntityNotFoundError,
  type Episode,
  getEdge,
  getEntity,
  getEpisode,
  getNeighbors,
  type SearchResult,
  search,
} from "engram-core";

export const GET_CONTEXT_TOOL = {
  name: "engram_get_context",
  description:
    "Retrieve rich context for a query: hybrid search followed by 1-hop graph fan-out, ranked and budget-truncated. This is the primary tool for answering questions about the codebase.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Query to retrieve context for",
      },
      max_tokens: {
        type: "number",
        description: "Token budget for returned context (default 4000)",
      },
      valid_at: {
        type: "string",
        description:
          "ISO8601 UTC timestamp for temporal filtering (default: now)",
      },
      scope: {
        type: "string",
        description: "Scope filter (no-op in v0.1)",
      },
    },
    required: ["query"],
  },
};

export interface GetContextInput {
  query: string;
  max_tokens?: number;
  valid_at?: string;
  scope?: string;
}

interface ScoredEntity {
  entity: Entity;
  score: number;
}

interface ScoredEdge {
  edge: Edge;
  score: number;
}

export interface ContextResult {
  entities: Entity[];
  edges: Edge[];
  episodes: Episode[];
  truncated: boolean;
  total_relevant: number;
  context_tokens: number;
}

function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 4);
}

export function handleGetContext(
  graph: EngramGraph,
  input: GetContextInput,
): ContextResult {
  const maxTokens = input.max_tokens ?? 4000;

  // Step 1: Hybrid search top 10
  const searchResults: SearchResult[] = search(graph, input.query, {
    mode: "hybrid",
    limit: 10,
    valid_at: input.valid_at,
  });

  // Step 2: Extract top-3 entity IDs for fan-out traversal
  const entitySearchResults = searchResults.filter((r) => r.type === "entity");
  const top3EntityIds = entitySearchResults.slice(0, 3).map((r) => r.id);

  // Maps to track deduped scored entities and edges
  const entityScores = new Map<string, number>();
  const edgeScores = new Map<string, number>();
  const episodeIdSet = new Set<string>();

  // Seed from search results
  for (const result of searchResults) {
    if (result.type === "entity") {
      if (!entityScores.has(result.id)) {
        entityScores.set(result.id, result.score);
      }
      for (const pid of result.provenance) episodeIdSet.add(pid);
    } else if (result.type === "edge") {
      if (!edgeScores.has(result.id)) {
        edgeScores.set(result.id, result.score);
      }
      for (const pid of result.provenance) episodeIdSet.add(pid);
    } else if (result.type === "episode") {
      episodeIdSet.add(result.id);
    }
  }

  const MAX_FANOUT = 50;

  // Step 3: Fan-out 1-hop traversal from top 3 entity search results
  for (const entityId of top3EntityIds) {
    try {
      const subgraph = getNeighbors(graph, entityId, {
        depth: 1,
        valid_at: input.valid_at,
      });

      let fanoutCount = 0;
      for (const entity of subgraph.entities) {
        if (fanoutCount >= MAX_FANOUT) break;
        if (!entityScores.has(entity.id)) {
          entityScores.set(entity.id, 0.3);
          fanoutCount++;
        }
      }

      for (const edge of subgraph.edges) {
        if (!edgeScores.has(edge.id)) {
          edgeScores.set(edge.id, 0.3);
        }
      }
    } catch (err) {
      if (err instanceof EntityNotFoundError) {
        // Entity may not exist — skip
        continue;
      }
      throw err;
    }
  }

  // Step 4: Resolve entities and edges from graph
  const scoredEntities: ScoredEntity[] = [];
  for (const [id, score] of entityScores) {
    const entity = getEntity(graph, id);
    if (entity) {
      scoredEntities.push({ entity, score });
    }
  }

  const scoredEdges: ScoredEdge[] = [];
  for (const [id, score] of edgeScores) {
    const edge = getEdge(graph, id);
    if (edge) {
      scoredEdges.push({ edge, score });
    }
  }

  // Step 5: Sort by score descending
  scoredEntities.sort((a, b) => b.score - a.score);
  scoredEdges.sort((a, b) => b.score - a.score);

  const total_relevant =
    scoredEntities.length + scoredEdges.length + episodeIdSet.size;

  // Step 6: Budget-aware truncation
  const selectedEntities: Entity[] = [];
  const selectedEdges: Edge[] = [];
  const selectedEpisodes: Episode[] = [];
  let usedTokens = 0;
  let truncated = false;

  for (const { entity } of scoredEntities) {
    const tokens = estimateTokens(entity);
    if (usedTokens + tokens > maxTokens) {
      truncated = true;
      break;
    }
    selectedEntities.push(entity);
    usedTokens += tokens;
  }

  if (!truncated) {
    for (const { edge } of scoredEdges) {
      const tokens = estimateTokens(edge);
      if (usedTokens + tokens > maxTokens) {
        truncated = true;
        break;
      }
      selectedEdges.push(edge);
      usedTokens += tokens;
    }
  }

  if (!truncated) {
    for (const episodeId of episodeIdSet) {
      const episode = getEpisode(graph, episodeId);
      if (!episode) continue;
      const tokens = estimateTokens(episode);
      if (usedTokens + tokens > maxTokens) {
        truncated = true;
        break;
      }
      selectedEpisodes.push(episode);
      usedTokens += tokens;
    }
  }

  return {
    entities: selectedEntities,
    edges: selectedEdges,
    episodes: selectedEpisodes,
    truncated,
    total_relevant,
    context_tokens: usedTokens,
  };
}
