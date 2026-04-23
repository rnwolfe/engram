/**
 * _brief_render.ts — BriefDigest types and render functions for `engram brief`.
 */

import type { CitedEpisode } from "./_render.js";
import { citationMarkdown, citationText } from "./_render.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BriefDigest {
  target: string;
  target_kind: "pr" | "issue" | "entity" | "topic";
  pr_title?: string;
  pr_status?: "open" | "merged" | "closed";
  touched_files?: string[];
  issue_title?: string;
  issue_status?: string;
  issue_labels?: string[];
  who: Array<{ name: string; role: string; entity_id?: string }>;
  history: Array<{
    canonical_name: string;
    weight: number;
    episode_id?: string;
  }>;
  connections: Array<{
    kind: string;
    title: string;
    valid_from: string;
    stale: boolean;
    episode_id?: string;
  }>;
  risk: Array<{
    kind: string;
    title: string;
    overlap_files: string[];
    stale?: boolean;
  }>;
  introducing_episode: CitedEpisode | null;
  truncated: boolean;
}

export interface BriefJson {
  target: string;
  target_kind: string;
  pr_title?: string;
  pr_status?: string;
  touched_files?: string[];
  issue_title?: string;
  issue_status?: string;
  issue_labels?: string[];
  who: BriefDigest["who"];
  history: BriefDigest["history"];
  connections: BriefDigest["connections"];
  risk: BriefDigest["risk"];
  introducing_episode: CitedEpisode | null;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortDate(ts: string): string {
  return ts.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Render functions
// ---------------------------------------------------------------------------

export function renderBriefText(digest: BriefDigest): string {
  const lines: string[] = [];
  lines.push(`=== Brief: ${digest.target} ===`);
  lines.push("");

  lines.push("WHAT");
  if (digest.target_kind === "pr") {
    if (digest.pr_title) lines.push(`  Title:  ${digest.pr_title}`);
    if (digest.pr_status) lines.push(`  Status: ${digest.pr_status}`);
    if (digest.touched_files && digest.touched_files.length > 0) {
      const shown = digest.touched_files.slice(0, 5);
      const extra = digest.touched_files.length - shown.length;
      lines.push(
        `  Files:  ${shown.join(", ")}${extra > 0 ? ` (+${extra} more)` : ""}`,
      );
    }
  } else if (digest.target_kind === "issue") {
    if (digest.issue_title) lines.push(`  Title:  ${digest.issue_title}`);
    if (digest.issue_status) lines.push(`  Status: ${digest.issue_status}`);
    if (digest.issue_labels && digest.issue_labels.length > 0)
      lines.push(`  Labels: ${digest.issue_labels.join(", ")}`);
  } else {
    lines.push(`  Entity: ${digest.target}`);
  }
  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const cit = citationText(ep.episode_id);
    lines.push(`  Source: ${ep.excerpt.split("\n")[0].slice(0, 72)}  ${cit}`);
  }
  lines.push("");

  if (digest.who.length > 0) {
    lines.push("WHO");
    for (const w of digest.who) lines.push(`  ${w.name} (${w.role})`);
    lines.push("");
  }

  if (digest.history.length > 0) {
    lines.push("HISTORY");
    for (const h of digest.history) {
      const cit = h.episode_id ? `  ${citationText(h.episode_id)}` : "";
      lines.push(`  ${h.canonical_name.slice(0, 60)}  ${h.weight}×${cit}`);
    }
    lines.push("");
  }

  if (digest.connections.length > 0) {
    lines.push("CONNECTIONS");
    for (const c of digest.connections) {
      const staleFlag = c.stale ? " [stale]" : "";
      lines.push(
        `  ${c.kind.padEnd(16)} "${c.title.slice(0, 50)}"  ${shortDate(c.valid_from)}${staleFlag}`,
      );
    }
    lines.push("");
  }

  if (digest.risk.length > 0) {
    lines.push("RISK");
    for (const r of digest.risk) {
      const staleFlag = r.stale ? " [stale]" : "";
      lines.push(
        `  ${r.kind.padEnd(16)} "${r.title.slice(0, 50)}"${staleFlag}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderBriefMarkdown(
  digest: BriefDigest,
  repoUrl?: string,
): string {
  const lines: string[] = [];
  lines.push(`## Brief: \`${digest.target}\``);
  lines.push("");

  lines.push("### What");
  if (digest.target_kind === "pr") {
    if (digest.pr_title) lines.push(`**Title:** ${digest.pr_title}`);
    if (digest.pr_status) lines.push(`**Status:** ${digest.pr_status}`);
    if (digest.touched_files && digest.touched_files.length > 0) {
      const shown = digest.touched_files.slice(0, 8);
      const extra = digest.touched_files.length - shown.length;
      lines.push("**Touched files:**");
      for (const f of shown) lines.push(`- \`${f}\``);
      if (extra > 0) lines.push(`- _…and ${extra} more_`);
    }
  } else if (digest.target_kind === "issue") {
    if (digest.issue_title) lines.push(`**Title:** ${digest.issue_title}`);
    if (digest.issue_status) lines.push(`**Status:** ${digest.issue_status}`);
    if (digest.issue_labels && digest.issue_labels.length > 0)
      lines.push(
        `**Labels:** ${digest.issue_labels.map((l) => `\`${l}\``).join(", ")}`,
      );
  } else {
    lines.push(`**Entity:** \`${digest.target}\``);
  }
  if (digest.introducing_episode) {
    const ep = digest.introducing_episode;
    const cit = citationMarkdown(ep, repoUrl);
    const firstLine = ep.excerpt.split("\n")[0].trim().slice(0, 80);
    lines.push(`**Source:** ${firstLine} ${cit}`);
  }
  lines.push("");

  if (digest.who.length > 0) {
    lines.push("### Who");
    for (const w of digest.who) lines.push(`- **${w.name}** (${w.role})`);
    lines.push("");
  }

  if (digest.history.length > 0) {
    lines.push("### History");
    for (const h of digest.history) {
      const cit = h.episode_id ? ` [E:${h.episode_id}]` : "";
      lines.push(`- \`${h.canonical_name}\` — **${h.weight}×**${cit}`);
    }
    lines.push("");
  }

  if (digest.connections.length > 0) {
    lines.push("### Connections");
    for (const c of digest.connections) {
      const staleFlag = c.stale ? " ⚠ stale" : "";
      const cit = c.episode_id ? ` [E:${c.episode_id}]` : "";
      lines.push(
        `- **${c.kind}** — _${c.title}_ (${shortDate(c.valid_from)})${staleFlag}${cit}`,
      );
    }
    lines.push("");
  }

  if (digest.risk.length > 0) {
    lines.push("### Risk");
    for (const r of digest.risk) {
      const staleFlag = r.stale ? " ⚠ stale" : "";
      const files =
        r.overlap_files.length > 0
          ? ` — overlaps: ${r.overlap_files
              .slice(0, 3)
              .map((f) => `\`${f}\``)
              .join(", ")}`
          : "";
      lines.push(`- **${r.kind}** — _${r.title}_${files}${staleFlag}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderBriefJson(
  digest: BriefDigest,
  _repoUrl?: string,
): BriefJson {
  return {
    target: digest.target,
    target_kind: digest.target_kind,
    ...(digest.pr_title !== undefined && { pr_title: digest.pr_title }),
    ...(digest.pr_status !== undefined && { pr_status: digest.pr_status }),
    ...(digest.touched_files !== undefined && {
      touched_files: digest.touched_files,
    }),
    ...(digest.issue_title !== undefined && {
      issue_title: digest.issue_title,
    }),
    ...(digest.issue_status !== undefined && {
      issue_status: digest.issue_status,
    }),
    ...(digest.issue_labels !== undefined && {
      issue_labels: digest.issue_labels,
    }),
    who: digest.who,
    history: digest.history,
    connections: digest.connections,
    risk: digest.risk,
    introducing_episode: digest.introducing_episode,
    truncated: digest.truncated,
  };
}
