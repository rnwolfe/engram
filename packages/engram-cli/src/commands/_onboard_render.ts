/**
 * _onboard_render.ts — OnboardDigest types and render functions for `engram onboard`.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PersonEntry {
  name: string;
  score: number;
  tenure_from: string;
  tenure_to: string;
  entity_id?: string;
}

export interface DecisionEntry {
  kind: string;
  title: string;
  valid_from: string;
  stale: boolean;
  projection_id?: string;
}

export interface FileEntry {
  canonical_name: string;
  commit_count: number;
}

export interface ReadingItem {
  rank: number;
  label: string;
  kind: string;
  note?: string;
}

export interface OnboardDigest {
  target: string;
  target_kind: "area" | "person";
  people: PersonEntry[];
  decisions: DecisionEntry[];
  hot_files: FileEntry[];
  contradictions: DecisionEntry[];
  reading_order: ReadingItem[];
  // person mode only
  ownership_footprint?: Array<{ canonical_name: string; weight: number }>;
  review_footprint?: Array<{
    title: string;
    timestamp: string;
    episode_id?: string;
  }>;
  collaborators?: PersonEntry[];
  tenure_from?: string;
  tenure_to?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shortDate(ts: string): string {
  if (!ts) return "unknown";
  return ts.slice(0, 10);
}

function banner(title: string): string {
  return `=== ${title} ===`;
}

// ---------------------------------------------------------------------------
// Text renderer
// ---------------------------------------------------------------------------

export function renderOnboardText(digest: OnboardDigest): string {
  const lines: string[] = [];

  if (digest.target_kind === "area") {
    lines.push(banner(`Onboarding: Area — ${digest.target}`));
    lines.push("");

    if (digest.people.length > 0) {
      lines.push("PEOPLE");
      for (const p of digest.people) {
        const tenureStr = `${shortDate(p.tenure_from)} → ${shortDate(p.tenure_to)}`;
        lines.push(
          `  ${p.name.padEnd(30)}  score: ${p.score.toFixed(1)}  tenure: ${tenureStr}`,
        );
      }
      lines.push("");
    }

    if (digest.decisions.length > 0) {
      lines.push("DECISIONS");
      for (const d of digest.decisions) {
        const staleFlag = d.stale ? " [stale]" : "";
        lines.push(
          `  ${d.kind.padEnd(20)} "${d.title.slice(0, 50)}"  ${shortDate(d.valid_from)}${staleFlag}`,
        );
      }
      lines.push("");
    }

    if (digest.hot_files.length > 0) {
      lines.push("HOT FILES (last 90d)");
      for (const f of digest.hot_files) {
        lines.push(
          `  ${f.canonical_name.padEnd(60)}  ${f.commit_count} commits`,
        );
      }
      lines.push("");
    }

    if (digest.contradictions.length > 0) {
      lines.push("CONTRADICTIONS");
      for (const c of digest.contradictions) {
        const staleFlag = c.stale ? " [stale]" : "";
        lines.push(`  "${c.title.slice(0, 60)}"${staleFlag}`);
      }
      lines.push("");
    }
  } else {
    // person mode
    lines.push(banner(`Onboarding: Person — ${digest.target}`));
    lines.push("");

    if (digest.tenure_from || digest.tenure_to) {
      lines.push("TENURE");
      lines.push(
        `  First seen: ${shortDate(digest.tenure_from ?? "")}  Last active: ${shortDate(digest.tenure_to ?? "")}`,
      );
      lines.push("");
    }

    if (digest.ownership_footprint && digest.ownership_footprint.length > 0) {
      lines.push("OWNERSHIP FOOTPRINT");
      for (const o of digest.ownership_footprint) {
        lines.push(
          `  ${o.canonical_name.padEnd(60)}  weight: ${o.weight.toFixed(2)}`,
        );
      }
      lines.push("");
    }

    if (digest.review_footprint && digest.review_footprint.length > 0) {
      lines.push("REVIEW FOOTPRINT (PRs authored)");
      for (const r of digest.review_footprint) {
        lines.push(`  ${shortDate(r.timestamp)}  ${r.title.slice(0, 72)}`);
      }
      lines.push("");
    }

    if (digest.collaborators && digest.collaborators.length > 0) {
      lines.push("COLLABORATORS");
      for (const c of digest.collaborators) {
        lines.push(`  ${c.name.padEnd(30)}  score: ${c.score.toFixed(1)}`);
      }
      lines.push("");
    }
  }

  if (digest.reading_order.length > 0) {
    lines.push("READING ORDER");
    for (const item of digest.reading_order) {
      const note = item.note ? `  (${item.note})` : "";
      lines.push(
        `  ${String(item.rank).padStart(2)}. [${item.kind}] ${item.label}${note}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

export function renderOnboardMarkdown(digest: OnboardDigest): string {
  const lines: string[] = [];

  if (digest.target_kind === "area") {
    lines.push(`## Onboarding: Area — \`${digest.target}\``);
    lines.push("");

    if (digest.people.length > 0) {
      lines.push("### People");
      lines.push("");
      lines.push("| Name | Score | First Active | Last Active |");
      lines.push("|------|-------|-------------|------------|");
      for (const p of digest.people) {
        lines.push(
          `| **${p.name}** | ${p.score.toFixed(1)} | ${shortDate(p.tenure_from)} | ${shortDate(p.tenure_to)} |`,
        );
      }
      lines.push("");
    }

    if (digest.decisions.length > 0) {
      lines.push("### Decisions");
      for (const d of digest.decisions) {
        const staleFlag = d.stale ? " ⚠ stale" : "";
        lines.push(
          `- **${d.kind}** — _${d.title}_ (${shortDate(d.valid_from)})${staleFlag}`,
        );
      }
      lines.push("");
    }

    if (digest.hot_files.length > 0) {
      lines.push("### Hot Files (last 90d)");
      for (const f of digest.hot_files) {
        lines.push(`- \`${f.canonical_name}\` — **${f.commit_count} commits**`);
      }
      lines.push("");
    }

    if (digest.contradictions.length > 0) {
      lines.push("### Contradictions");
      for (const c of digest.contradictions) {
        const staleFlag = c.stale ? " ⚠ stale" : "";
        lines.push(`- _${c.title}_${staleFlag}`);
      }
      lines.push("");
    }
  } else {
    // person mode
    lines.push(`## Onboarding: Person — **${digest.target}**`);
    lines.push("");

    if (digest.tenure_from || digest.tenure_to) {
      lines.push("### Tenure");
      lines.push(`- **First seen:** ${shortDate(digest.tenure_from ?? "")}`);
      lines.push(`- **Last active:** ${shortDate(digest.tenure_to ?? "")}`);
      lines.push("");
    }

    if (digest.ownership_footprint && digest.ownership_footprint.length > 0) {
      lines.push("### Ownership Footprint");
      for (const o of digest.ownership_footprint) {
        lines.push(
          `- \`${o.canonical_name}\` — weight: **${o.weight.toFixed(2)}**`,
        );
      }
      lines.push("");
    }

    if (digest.review_footprint && digest.review_footprint.length > 0) {
      lines.push("### Review Footprint (PRs Authored)");
      for (const r of digest.review_footprint) {
        lines.push(`- ${shortDate(r.timestamp)} — ${r.title}`);
      }
      lines.push("");
    }

    if (digest.collaborators && digest.collaborators.length > 0) {
      lines.push("### Collaborators");
      for (const c of digest.collaborators) {
        lines.push(`- **${c.name}** (score: ${c.score.toFixed(1)})`);
      }
      lines.push("");
    }
  }

  if (digest.reading_order.length > 0) {
    lines.push("### Reading Order");
    for (const item of digest.reading_order) {
      const note = item.note ? ` _(${item.note})_` : "";
      lines.push(`${item.rank}. **[${item.kind}]** ${item.label}${note}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// JSON renderer
// ---------------------------------------------------------------------------

export function renderOnboardJson(digest: OnboardDigest): object {
  return { ...digest };
}

// ---------------------------------------------------------------------------
// Reading list only renderer
// ---------------------------------------------------------------------------

export function renderReadingList(digest: OnboardDigest): string {
  return digest.reading_order.map((item) => item.label).join("\n");
}
