/**
 * _render.ts — citation renderer and format dispatcher for the `why` command.
 *
 * Citation convention:
 *   text:     inline `[E:<ulid>]` after each cited claim
 *   markdown: hyperlink to GitHub URL if source_type='github_pr'/'github_issue',
 *             else `[E:<ulid>]` with an engram show hint
 *   json:     { episode_id, source_type, source_ref?, url? } in citations array
 */

import { EPISODE_SOURCE_TYPES, RELATION_TYPES } from "engram-core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CitedEpisode {
  episode_id: string;
  source_type: string;
  source_ref: string | null;
  actor: string | null;
  timestamp: string;
  excerpt: string;
}

export interface RenameEventEntry {
  old_path: string;
  new_path: string;
  episode: CitedEpisode | null;
}

export interface WhydDigest {
  target: string;
  introducing_episode: CitedEpisode | null;
  /** For path:line queries, the commit that introduced the specific line. */
  blame_episode?: CitedEpisode | null;
  co_change_neighbors: Array<{
    canonical_name: string;
    weight: number;
    episode_id?: string;
  }>;
  ownership: Array<{
    fact: string;
    valid_from: string | null;
    episode_id?: string;
  }>;
  recent_prs: CitedEpisode[];
  rename_chain: RenameEventEntry[];
  projections: Array<{
    kind: string;
    title: string;
    valid_from: string;
    episode_id?: string;
    stale?: boolean;
    stale_reason?: string;
  }>;
  truncated: boolean;
  token_budget_used: number;
}

export type OutputFormat = "text" | "markdown" | "json";

// ---------------------------------------------------------------------------
// Citation rendering
// ---------------------------------------------------------------------------

/**
 * Render an inline citation tag in text format: `[E:<ulid>]`
 */
export function citationText(episodeId: string): string {
  return `[E:${episodeId}]`;
}

/**
 * Render a citation in markdown format.
 * For github_pr / github_issue episodes: extract a URL if source_ref is a number
 * or full URL.
 */
export function citationMarkdown(ep: CitedEpisode, repoUrl?: string): string {
  const epId = ep.episode_id;
  if (
    ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_PR ||
    ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_ISSUE
  ) {
    const num = ep.source_ref ? ep.source_ref.replace(/^#/, "") : null;
    const isNumeric = num !== null && /^\d+$/.test(num);
    if (isNumeric && repoUrl) {
      const kind =
        ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_PR ? "pull" : "issues";
      return `[#${num}](${repoUrl}/${kind}/${num})`;
    }
    if (ep.source_ref?.startsWith("http")) {
      return `[${ep.source_ref}](${ep.source_ref})`;
    }
  }
  return `[E:${epId}]`;
}

export interface JsonCitation {
  episode_id: string;
  source_type: string;
  source_ref: string | null;
  url: string | null;
}

export function citationJson(ep: CitedEpisode, repoUrl?: string): JsonCitation {
  let url: string | null = null;
  if (
    ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_PR ||
    ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_ISSUE
  ) {
    const num = ep.source_ref ? ep.source_ref.replace(/^#/, "") : null;
    const isNumeric = num !== null && /^\d+$/.test(num);
    if (isNumeric && repoUrl) {
      const kind =
        ep.source_type === EPISODE_SOURCE_TYPES.GITHUB_PR ? "pull" : "issues";
      url = `${repoUrl}/${kind}/${num}`;
    } else if (ep.source_ref?.startsWith("http")) {
      url = ep.source_ref;
    }
  }
  return {
    episode_id: ep.episode_id,
    source_type: ep.source_type,
    source_ref: ep.source_ref,
    url,
  };
}

// ---------------------------------------------------------------------------
// Text format renderer
// ---------------------------------------------------------------------------

function padRight(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function shortHash(s: string): string {
  return s.slice(0, 7);
}

function shortDate(ts: string): string {
  return ts.slice(0, 10);
}

function shortRef(ref: string | null): string {
  if (!ref) return "";
  if (/^\d+$/.test(ref)) return `PR #${ref}`;
  if (ref.startsWith("#")) return `PR ${ref}`;
  if (/^[0-9a-f]{7,}$/i.test(ref)) return shortHash(ref);
  return ref.slice(0, 40);
}

export function renderText(digest: WhydDigest): string {
  const lines: string[] = [];

  const targetBase = digest.target.split("/").pop() ?? digest.target;
  lines.push(`${targetBase} — ${digest.target}`);
  lines.push("");

  // Introduced
  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const ref = ep.source_ref ? shortRef(ep.source_ref) : "commit";
    const who = ep.actor ? `${ep.actor} · ` : "";
    const when = shortDate(ep.timestamp);
    const cit = citationText(ep.episode_id);
    const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 72);
    lines.push("Introduced");
    lines.push(`  ${ref}  ${firstLine}`);
    lines.push(`  ${who}${when}  ${cit}`);
    lines.push("");
  }

  // Co-change neighbors
  if (digest.co_change_neighbors.length > 0) {
    lines.push("Top co-change neighbors (last 90d)");
    const maxNameLen = Math.max(
      ...digest.co_change_neighbors.map((n) => n.canonical_name.length),
      20,
    );
    for (const n of digest.co_change_neighbors) {
      const cit = n.episode_id ? `  ${citationText(n.episode_id)}` : "";
      lines.push(
        `  ${padRight(n.canonical_name, maxNameLen + 2)}${n.weight}×${cit}`,
      );
    }
    lines.push("");
  }

  // Active ownership
  if (digest.ownership.length > 0) {
    lines.push("Active ownership");
    for (const o of digest.ownership) {
      const since = o.valid_from ? `since ${shortDate(o.valid_from)}` : "";
      const cit = o.episode_id ? `  ${citationText(o.episode_id)}` : "";
      lines.push(`  ${o.fact}${since ? `  ${since}` : ""}${cit}`);
    }
    lines.push("");
  }

  // Anchored projections
  if (digest.projections.length > 0) {
    lines.push("Anchored decisions");
    for (const p of digest.projections) {
      const when = shortDate(p.valid_from);
      const cit = p.episode_id ? `  ${citationText(p.episode_id)}` : "";
      lines.push(
        `  ${padRight(p.kind, 18)} "${p.title.slice(0, 50)}"  ${when}${cit}`,
      );
    }
    lines.push("");
  }

  // Recent PRs
  if (digest.recent_prs.length > 0) {
    lines.push("Recent PRs touching this target");
    for (const ep of digest.recent_prs) {
      const ref = ep.source_ref ? `#${ep.source_ref.replace(/^#/, "")}` : "?";
      const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 60);
      const when = shortDate(ep.timestamp);
      const cit = citationText(ep.episode_id);
      lines.push(
        `  ${padRight(ref, 6)}  ${padRight(firstLine, 62)}  ${when}  ${cit}`,
      );
    }
    lines.push("");
  }

  // Rename chain
  if (digest.rename_chain && digest.rename_chain.length > 0) {
    lines.push("Rename history");
    for (const r of digest.rename_chain) {
      const cit = r.episode ? `  ${citationText(r.episode.episode_id)}` : "";
      const when = r.episode ? `  ${shortDate(r.episode.timestamp)}` : "";
      lines.push(`  Renamed from ${r.old_path}${when}${cit}`);
    }
    lines.push("");
  }

  if (digest.truncated) {
    lines.push(
      `(token budget reached — use --token-budget N for more, or --token-budget 0 for all)`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Markdown format renderer
// ---------------------------------------------------------------------------

export function renderMarkdown(digest: WhydDigest, repoUrl?: string): string {
  const lines: string[] = [];

  lines.push(`## \`${digest.target}\``);
  lines.push("");

  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const ref = ep.source_ref ? shortRef(ep.source_ref) : "commit";
    const who = ep.actor ? ` by **${ep.actor}**` : "";
    const when = shortDate(ep.timestamp);
    const cit = citationMarkdown(ep, repoUrl);
    const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 80);
    lines.push("### Introduced");
    lines.push(`- **${ref}** — ${firstLine}  `);
    lines.push(`  ${when}${who} ${cit}`);
    lines.push("");
  }

  if (digest.co_change_neighbors.length > 0) {
    lines.push("### Top co-change neighbors");
    for (const n of digest.co_change_neighbors) {
      const cit = n.episode_id ? ` [E:${n.episode_id}]` : "";
      lines.push(`- \`${n.canonical_name}\` — **${n.weight}×**${cit}`);
    }
    lines.push("");
  }

  if (digest.ownership.length > 0) {
    lines.push("### Active ownership");
    for (const o of digest.ownership) {
      const since = o.valid_from ? ` since ${shortDate(o.valid_from)}` : "";
      const cit = o.episode_id ? ` [E:${o.episode_id}]` : "";
      lines.push(`- ${o.fact}${since}${cit}`);
    }
    lines.push("");
  }

  if (digest.projections.length > 0) {
    lines.push("### Anchored decisions");
    for (const p of digest.projections) {
      const when = shortDate(p.valid_from);
      const cit = p.episode_id ? ` [E:${p.episode_id}]` : "";
      lines.push(`- **${p.kind}** — _${p.title}_ (${when})${cit}`);
    }
    lines.push("");
  }

  if (digest.recent_prs.length > 0) {
    lines.push("### Recent PRs");
    for (const ep of digest.recent_prs) {
      const cit = citationMarkdown(ep, repoUrl);
      const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 80);
      const when = shortDate(ep.timestamp);
      lines.push(`- ${cit} — ${firstLine} (${when})`);
    }
    lines.push("");
  }

  if (digest.truncated) {
    lines.push(
      "_Token budget reached — use `--token-budget N` for more, or `--token-budget 0` for all._",
    );
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON format renderer
// ---------------------------------------------------------------------------

export interface WhydJson {
  target: string;
  evidence: {
    episodes: Array<{
      episode_id: string;
      source_type: string;
      source_ref: string | null;
      actor: string | null;
      timestamp: string;
      excerpt: string;
      role: string;
    }>;
    edges: Array<{
      fact: string;
      edge_kind: string;
      relation_type?: string;
      weight?: number;
      valid_from: string | null;
    }>;
    projections: Array<{
      kind: string;
      title: string;
      valid_from: string;
      stale: boolean;
    }>;
  };
  citations: JsonCitation[];
  truncated: boolean;
  token_budget_used: number;
  narrative?: string;
}

export function renderJson(
  digest: WhydDigest,
  repoUrl?: string,
  narrative?: string,
): WhydJson {
  const allEpisodes: WhydJson["evidence"]["episodes"] = [];
  const citations: JsonCitation[] = [];

  function addEpisode(ep: CitedEpisode, role: string) {
    allEpisodes.push({
      episode_id: ep.episode_id,
      source_type: ep.source_type,
      source_ref: ep.source_ref,
      actor: ep.actor,
      timestamp: ep.timestamp,
      excerpt: ep.excerpt,
      role,
    });
    citations.push(citationJson(ep, repoUrl));
  }

  if (digest.introducing_episode) {
    addEpisode(digest.introducing_episode, "introducing");
  }
  for (const ep of digest.recent_prs) {
    addEpisode(ep, "pr");
  }

  const edges: WhydJson["evidence"]["edges"] = [
    ...digest.co_change_neighbors.map((n) => ({
      fact: `co_changes_with ${n.canonical_name}`,
      edge_kind: "inferred",
      relation_type: RELATION_TYPES.CO_CHANGES_WITH,
      weight: n.weight,
      valid_from: null,
    })),
    ...digest.ownership.map((o) => ({
      fact: o.fact,
      edge_kind: "observed",
      relation_type: RELATION_TYPES.LIKELY_OWNER_OF,
      valid_from: o.valid_from,
    })),
  ];

  const projections: WhydJson["evidence"]["projections"] =
    digest.projections.map((p) => ({
      kind: p.kind,
      title: p.title,
      valid_from: p.valid_from,
      stale: p.stale ?? false,
    }));

  return {
    target: digest.target,
    evidence: { episodes: allEpisodes, edges, projections },
    citations,
    truncated: digest.truncated,
    token_budget_used: digest.token_budget_used,
    ...(narrative !== undefined && { narrative }),
  };
}

// ---------------------------------------------------------------------------
// Format dispatcher
// ---------------------------------------------------------------------------

export function renderDigest(
  digest: WhydDigest,
  format: OutputFormat,
  opts?: { repoUrl?: string; narrative?: string },
): string {
  switch (format) {
    case "json":
      return JSON.stringify(
        renderJson(digest, opts?.repoUrl, opts?.narrative),
        null,
        2,
      );
    case "markdown":
      return renderMarkdown(digest, opts?.repoUrl);
    default:
      return renderText(digest);
  }
}
