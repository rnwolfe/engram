/**
 * fts.ts — shared SQLite FTS5 helpers.
 *
 * Lives in graph/ (the low layer) so both the retrieval layer (entity/edge/
 * episode search) and graph-level projection search can depend on it downward,
 * without retrieval and graph importing each other.
 */

/**
 * Escape a query string for FTS5 MATCH.
 * Wraps each token in double quotes to avoid syntax errors with special chars.
 *
 * Every FTS5 MATCH path MUST route user input through this. Passing a raw
 * string to MATCH throws on FTS5 syntax — e.g. `foo-no-bar` parses `no` as a
 * column filter and errors with "no such column: no"; quoting each token makes
 * arbitrary input safe.
 */
export function escapeFtsQuery(query: string): string {
  return query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(" ");
}
