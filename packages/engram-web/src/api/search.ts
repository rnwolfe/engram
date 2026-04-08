/**
 * search.ts — GET /api/search handler.
 *
 * Wraps engram-core search() for entity lookup.
 * Returns top 10 results with id, canonical_name, entity_type, score.
 */

import type { EngramGraph } from "engram-core";
import { search } from "engram-core";

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

  const results: SearchResultItem[] = raw
    .filter((r) => r.type === "entity")
    .slice(0, 10)
    .map((r) => ({
      id: r.id,
      canonical_name: r.content,
      entity_type: "",
      score: r.score,
    }));

  // Enrich entity_type by querying entities table directly
  if (results.length > 0) {
    const ids = results.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(", ");
    const rows = graph.db
      .query<
        { id: string; canonical_name: string; entity_type: string },
        string[]
      >(
        `SELECT id, canonical_name, entity_type FROM entities WHERE id IN (${placeholders})`,
      )
      .all(...ids);

    const entityMap = new Map(rows.map((row) => [row.id, row]));
    for (const result of results) {
      const entity = entityMap.get(result.id);
      if (entity) {
        result.canonical_name = entity.canonical_name;
        result.entity_type = entity.entity_type;
      }
    }
  }

  return { results };
}
