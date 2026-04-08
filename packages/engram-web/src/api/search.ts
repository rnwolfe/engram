/**
 * search.ts — GET /api/search handler.
 *
 * Wraps engram-core search() for entity lookup.
 * Returns top 10 results with id, canonical_name, entity_type, score.
 */

import type { EngramGraph } from "engram-core";
import { getEntity, search } from "engram-core";

export interface SearchResultItem {
  id: string;
  canonical_name: string;
  entity_type: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResultItem[];
}

export async function handleSearch(
  graph: EngramGraph,
  query: string,
): Promise<SearchResponse> {
  if (!query || query.trim().length === 0) {
    return { results: [] };
  }

  const raw = await search(graph, query.trim(), {
    limit: 10,
    entity_types: undefined,
  });

  const entityResults = raw.filter((r) => r.type === "entity").slice(0, 10);

  const results: SearchResultItem[] = [];
  for (const r of entityResults) {
    const entity = getEntity(graph, r.id);
    if (entity) {
      results.push({
        id: r.id,
        canonical_name: entity.canonical_name,
        entity_type: entity.entity_type,
        score: r.score,
      });
    } else {
      results.push({
        id: r.id,
        canonical_name: r.content,
        entity_type: "",
        score: r.score,
      });
    }
  }

  return { results };
}
