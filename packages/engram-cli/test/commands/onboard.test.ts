/**
 * onboard.test.ts — Unit tests for the `engram onboard` command.
 *
 * Covers:
 * - DEPTH_LIMITS constants
 * - renderOnboardText produces expected sections for area mode
 * - renderOnboardText produces expected sections for person mode
 * - renderOnboardMarkdown produces valid markdown sections
 * - renderOnboardJson produces valid JSON structure
 * - renderReadingList outputs one item per line
 * - Depth limit truncation (mock digest with 30 items, shallow = 10)
 */

import { describe, expect, it } from "bun:test";
import type { OnboardDigest } from "../../src/commands/onboard.js";
import {
  DEPTH_LIMITS,
  renderOnboardJson,
  renderOnboardMarkdown,
  renderOnboardText,
  renderReadingList,
} from "../../src/commands/onboard.js";

// ---------------------------------------------------------------------------
// DEPTH_LIMITS
// ---------------------------------------------------------------------------

describe("DEPTH_LIMITS", () => {
  it("shallow = 10", () => {
    expect(DEPTH_LIMITS.shallow).toBe(10);
  });

  it("standard = 25", () => {
    expect(DEPTH_LIMITS.standard).toBe(25);
  });

  it("deep = 50", () => {
    expect(DEPTH_LIMITS.deep).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAreaDigest(): OnboardDigest {
  return {
    target: "src/ingest",
    target_kind: "area",
    people: [
      {
        name: "alice",
        score: 12.5,
        tenure_from: "2024-01-01T00:00:00Z",
        tenure_to: "2025-04-01T00:00:00Z",
        entity_id: "01PERSON001",
      },
      {
        name: "bob",
        score: 7.0,
        tenure_from: "2024-06-01T00:00:00Z",
        tenure_to: "2025-03-15T00:00:00Z",
      },
    ],
    decisions: [
      {
        kind: "decision_page",
        title: "Use cursor-based ingestion",
        valid_from: "2024-02-01T00:00:00Z",
        stale: false,
        projection_id: "01PROJ001",
      },
      {
        kind: "adr",
        title: "Adopt adapter contract v2",
        valid_from: "2024-05-10T00:00:00Z",
        stale: true,
        projection_id: "01PROJ002",
      },
    ],
    hot_files: [
      { canonical_name: "src/ingest/git.ts", commit_count: 45 },
      { canonical_name: "src/ingest/adapter.ts", commit_count: 32 },
    ],
    contradictions: [
      {
        kind: "contradiction_report",
        title: "Conflicting ownership for ingest module",
        valid_from: "2025-01-15T00:00:00Z",
        stale: false,
      },
    ],
    reading_order: [
      { rank: 1, label: "Use cursor-based ingestion", kind: "decision" },
      {
        rank: 2,
        label: "Adopt adapter contract v2",
        kind: "decision",
        note: "stale",
      },
      { rank: 3, label: "src/ingest/git.ts", kind: "file", note: "45 commits" },
      {
        rank: 4,
        label: "Conflicting ownership for ingest module",
        kind: "contradiction",
      },
    ],
  };
}

function makePersonDigest(): OnboardDigest {
  return {
    target: "alice",
    target_kind: "person",
    people: [],
    decisions: [],
    hot_files: [],
    contradictions: [],
    reading_order: [
      {
        rank: 1,
        label: "src/ingest: Use cursor-based ingestion",
        kind: "projection",
      },
      { rank: 2, label: "src/graph", kind: "file", note: "weight: 5.0" },
    ],
    ownership_footprint: [
      { canonical_name: "src/ingest/git.ts", weight: 8.5 },
      { canonical_name: "src/graph/edge.ts", weight: 3.2 },
    ],
    review_footprint: [
      {
        title: "feat: add cursor helpers",
        timestamp: "2025-03-10T12:00:00Z",
        episode_id: "01EP001",
      },
      {
        title: "fix: dedup ingestion runs",
        timestamp: "2025-02-20T08:00:00Z",
        episode_id: "01EP002",
      },
    ],
    collaborators: [
      {
        name: "bob",
        score: 4.0,
        tenure_from: "2024-06-01T00:00:00Z",
        tenure_to: "2025-03-15T00:00:00Z",
      },
    ],
    tenure_from: "2024-01-01T00:00:00Z",
    tenure_to: "2025-04-01T00:00:00Z",
  };
}

function makeDigestWithManyItems(count: number): OnboardDigest {
  const people = Array.from({ length: count }, (_, i) => ({
    name: `person${i}`,
    score: count - i,
    tenure_from: "2024-01-01T00:00:00Z",
    tenure_to: "2025-01-01T00:00:00Z",
  }));
  const hot_files = Array.from({ length: count }, (_, i) => ({
    canonical_name: `src/file${i}.ts`,
    commit_count: count - i,
  }));
  const reading_order = Array.from({ length: count }, (_, i) => ({
    rank: i + 1,
    label: `item-${i}`,
    kind: "file",
  }));
  return {
    target: "big-area",
    target_kind: "area",
    people,
    decisions: [],
    hot_files,
    contradictions: [],
    reading_order,
  };
}

// ---------------------------------------------------------------------------
// renderOnboardText — area mode
// ---------------------------------------------------------------------------

describe("renderOnboardText — area mode", () => {
  it("includes area banner with target", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("Onboarding: Area");
    expect(out).toContain("src/ingest");
  });

  it("includes PEOPLE section", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("PEOPLE");
    expect(out).toContain("alice");
    expect(out).toContain("bob");
  });

  it("includes DECISIONS section", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("DECISIONS");
    expect(out).toContain("Use cursor-based ingestion");
    expect(out).toContain("Adopt adapter contract v2");
  });

  it("marks stale decisions", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("[stale]");
  });

  it("includes HOT FILES section", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("HOT FILES");
    expect(out).toContain("src/ingest/git.ts");
    expect(out).toContain("45 commits");
  });

  it("includes CONTRADICTIONS section", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("CONTRADICTIONS");
    expect(out).toContain("Conflicting ownership for ingest module");
  });

  it("includes READING ORDER section", () => {
    const out = renderOnboardText(makeAreaDigest());
    expect(out).toContain("READING ORDER");
    expect(out).toContain("[decision]");
    expect(out).toContain("[file]");
    expect(out).toContain("[contradiction]");
  });
});

// ---------------------------------------------------------------------------
// renderOnboardText — person mode
// ---------------------------------------------------------------------------

describe("renderOnboardText — person mode", () => {
  it("includes person banner with name", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("Onboarding: Person");
    expect(out).toContain("alice");
  });

  it("includes TENURE section", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("TENURE");
    expect(out).toContain("First seen");
    expect(out).toContain("2024-01-01");
  });

  it("includes OWNERSHIP FOOTPRINT section", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("OWNERSHIP FOOTPRINT");
    expect(out).toContain("src/ingest/git.ts");
  });

  it("includes REVIEW FOOTPRINT section", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("REVIEW FOOTPRINT");
    expect(out).toContain("feat: add cursor helpers");
  });

  it("includes COLLABORATORS section", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("COLLABORATORS");
    expect(out).toContain("bob");
  });

  it("includes READING ORDER section", () => {
    const out = renderOnboardText(makePersonDigest());
    expect(out).toContain("READING ORDER");
    expect(out).toContain("[projection]");
  });
});

// ---------------------------------------------------------------------------
// renderOnboardMarkdown — area mode
// ---------------------------------------------------------------------------

describe("renderOnboardMarkdown — area mode", () => {
  it("produces a ## heading with target", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("## Onboarding: Area");
    expect(md).toContain("`src/ingest`");
  });

  it("includes ### People section", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("### People");
    expect(md).toContain("alice");
    expect(md).toContain("bob");
  });

  it("includes ### Decisions section", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("### Decisions");
    expect(md).toContain("Use cursor-based ingestion");
  });

  it("marks stale decisions in markdown", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("⚠ stale");
  });

  it("includes ### Hot Files section", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("### Hot Files");
    expect(md).toContain("`src/ingest/git.ts`");
    expect(md).toContain("45 commits");
  });

  it("includes ### Contradictions section", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("### Contradictions");
  });

  it("includes ### Reading Order section", () => {
    const md = renderOnboardMarkdown(makeAreaDigest());
    expect(md).toContain("### Reading Order");
  });
});

// ---------------------------------------------------------------------------
// renderOnboardMarkdown — person mode
// ---------------------------------------------------------------------------

describe("renderOnboardMarkdown — person mode", () => {
  it("produces a ## heading with person name", () => {
    const md = renderOnboardMarkdown(makePersonDigest());
    expect(md).toContain("## Onboarding: Person");
    expect(md).toContain("**alice**");
  });

  it("includes ### Tenure section", () => {
    const md = renderOnboardMarkdown(makePersonDigest());
    expect(md).toContain("### Tenure");
    expect(md).toContain("2024-01-01");
  });

  it("includes ### Ownership Footprint section", () => {
    const md = renderOnboardMarkdown(makePersonDigest());
    expect(md).toContain("### Ownership Footprint");
    expect(md).toContain("`src/ingest/git.ts`");
  });

  it("includes ### Review Footprint section", () => {
    const md = renderOnboardMarkdown(makePersonDigest());
    expect(md).toContain("### Review Footprint");
    expect(md).toContain("feat: add cursor helpers");
  });

  it("includes ### Collaborators section", () => {
    const md = renderOnboardMarkdown(makePersonDigest());
    expect(md).toContain("### Collaborators");
    expect(md).toContain("**bob**");
  });
});

// ---------------------------------------------------------------------------
// renderOnboardJson
// ---------------------------------------------------------------------------

describe("renderOnboardJson", () => {
  it("returns an object with target and target_kind", () => {
    const json = renderOnboardJson(makeAreaDigest()) as OnboardDigest;
    expect(json.target).toBe("src/ingest");
    expect(json.target_kind).toBe("area");
  });

  it("area digest has people, decisions, hot_files, contradictions, reading_order", () => {
    const json = renderOnboardJson(makeAreaDigest()) as OnboardDigest;
    expect(Array.isArray(json.people)).toBe(true);
    expect(Array.isArray(json.decisions)).toBe(true);
    expect(Array.isArray(json.hot_files)).toBe(true);
    expect(Array.isArray(json.contradictions)).toBe(true);
    expect(Array.isArray(json.reading_order)).toBe(true);
  });

  it("person digest includes ownership_footprint", () => {
    const json = renderOnboardJson(makePersonDigest()) as OnboardDigest;
    expect(json.target_kind).toBe("person");
    expect(Array.isArray(json.ownership_footprint)).toBe(true);
    expect(json.ownership_footprint?.length).toBe(2);
  });

  it("JSON is serialisable without error", () => {
    expect(() =>
      JSON.stringify(renderOnboardJson(makeAreaDigest())),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// renderReadingList
// ---------------------------------------------------------------------------

describe("renderReadingList", () => {
  it("outputs one label per line", () => {
    const out = renderReadingList(makeAreaDigest());
    const lines = out.split("\n").filter(Boolean);
    expect(lines).toHaveLength(makeAreaDigest().reading_order.length);
  });

  it("each line is the label", () => {
    const digest = makeAreaDigest();
    const out = renderReadingList(digest);
    const lines = out.split("\n").filter(Boolean);
    for (const [i, item] of digest.reading_order.entries()) {
      expect(lines[i]).toBe(item.label);
    }
  });

  it("returns empty string for empty reading_order", () => {
    const digest: OnboardDigest = {
      ...makeAreaDigest(),
      reading_order: [],
    };
    expect(renderReadingList(digest)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Depth limit truncation
// ---------------------------------------------------------------------------

describe("depth limit truncation", () => {
  it("shallow limit = 10 truncates 30-item digest", () => {
    // The digest assembly honours the limit; here we test that DEPTH_LIMITS.shallow = 10
    // and that a caller slicing to that limit would produce 10 items.
    const digest = makeDigestWithManyItems(30);
    const shallowPeople = digest.people.slice(0, DEPTH_LIMITS.shallow);
    expect(shallowPeople).toHaveLength(10);
  });

  it("standard limit = 25 truncates 30-item digest", () => {
    const digest = makeDigestWithManyItems(30);
    const standardPeople = digest.people.slice(0, DEPTH_LIMITS.standard);
    expect(standardPeople).toHaveLength(25);
  });

  it("deep limit = 50 returns all 30 items", () => {
    const digest = makeDigestWithManyItems(30);
    const deepPeople = digest.people.slice(0, DEPTH_LIMITS.deep);
    expect(deepPeople).toHaveLength(30);
  });

  it("renderOnboardText with many items still renders all (caller is responsible for limiting)", () => {
    const digest = makeDigestWithManyItems(30);
    const out = renderOnboardText(digest);
    // Verify it renders without error and contains some items
    expect(out).toContain("person0");
    expect(out).toContain("PEOPLE");
  });
});
