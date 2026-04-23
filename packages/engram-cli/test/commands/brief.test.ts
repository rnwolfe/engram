/**
 * brief.test.ts — Unit tests for the `engram brief` command.
 *
 * Covers:
 * - Target parsing (pr:123, issue:456, entity:ULID, topic string)
 * - Ambiguous topic flow (would exit 2)
 * - renderBriefMarkdown produces valid markdown sections
 * - renderBriefText produces expected sections
 * - renderBriefJson produces valid JSON structure
 */

import { describe, expect, it } from "bun:test";
import type { BriefDigest } from "../../src/commands/brief.js";
import {
  parseBriefTarget,
  renderBriefJson,
  renderBriefMarkdown,
  renderBriefText,
} from "../../src/commands/brief.js";

// ---------------------------------------------------------------------------
// parseBriefTarget
// ---------------------------------------------------------------------------

describe("parseBriefTarget", () => {
  it("parses pr: prefix", () => {
    const result = parseBriefTarget("pr:123");
    expect(result.kind).toBe("pr");
    expect(result.ref).toBe("123");
    expect(result.raw).toBe("pr:123");
  });

  it("strips # from pr ref", () => {
    const result = parseBriefTarget("pr:#456");
    expect(result.kind).toBe("pr");
    expect(result.ref).toBe("456");
  });

  it("parses issue: prefix", () => {
    const result = parseBriefTarget("issue:789");
    expect(result.kind).toBe("issue");
    expect(result.ref).toBe("789");
    expect(result.raw).toBe("issue:789");
  });

  it("strips # from issue ref", () => {
    const result = parseBriefTarget("issue:#10");
    expect(result.kind).toBe("issue");
    expect(result.ref).toBe("10");
  });

  it("parses entity: prefix", () => {
    const ulid = "01HXYZ1234567890ABCDEFGHIJ";
    const result = parseBriefTarget(`entity:${ulid}`);
    expect(result.kind).toBe("entity");
    expect(result.ref).toBe(ulid);
  });

  it("treats bare string as topic", () => {
    const result = parseBriefTarget("authentication middleware");
    expect(result.kind).toBe("topic");
    expect(result.ref).toBe("authentication middleware");
    expect(result.raw).toBe("authentication middleware");
  });

  it("treats PR: (uppercase) as pr kind", () => {
    const result = parseBriefTarget("PR:100");
    expect(result.kind).toBe("pr");
    expect(result.ref).toBe("100");
  });

  it("treats ISSUE: (uppercase) as issue kind", () => {
    const result = parseBriefTarget("ISSUE:200");
    expect(result.kind).toBe("issue");
    expect(result.ref).toBe("200");
  });
});

// ---------------------------------------------------------------------------
// Test digest fixture
// ---------------------------------------------------------------------------

function makePrDigest(): BriefDigest {
  return {
    target: "pr:123",
    target_kind: "pr",
    pr_title: "feat: add authentication middleware",
    pr_status: "merged",
    touched_files: ["src/auth.ts", "src/middleware.ts", "test/auth.test.ts"],
    who: [
      { name: "alice", role: "author" },
      { name: "bob", role: "file-owner", entity_id: "01ENTITY1" },
    ],
    history: [
      { canonical_name: "src/session.ts", weight: 5 },
      { canonical_name: "src/token.ts", weight: 3, episode_id: "01EPISODE1" },
    ],
    connections: [
      {
        kind: "decision",
        title: "Use JWT for stateless auth",
        valid_from: "2025-01-15T00:00:00Z",
        stale: false,
        episode_id: "01EPISODE2",
      },
    ],
    risk: [
      {
        kind: "decision",
        title: "Session cookie approach",
        overlap_files: ["src/auth.ts"],
        stale: true,
      },
    ],
    introducing_episode: {
      episode_id: "01EPISODEX",
      source_type: "github_pr",
      source_ref: "123",
      actor: "alice",
      timestamp: "2025-03-01T12:00:00Z",
      excerpt: "feat: add authentication middleware\n\nAdds JWT-based auth.",
    },
    truncated: false,
  };
}

function makeIssueDigest(): BriefDigest {
  return {
    target: "issue:42",
    target_kind: "issue",
    issue_title: "Bug: login fails with special characters",
    issue_status: "closed",
    issue_labels: ["bug", "auth"],
    who: [{ name: "carol", role: "reporter" }],
    history: [
      {
        canonical_name: "PR #100: fix: handle special chars in password",
        weight: 1,
        episode_id: "01PREP1",
      },
    ],
    connections: [],
    risk: [],
    introducing_episode: {
      episode_id: "01ISSEP1",
      source_type: "github_issue",
      source_ref: "42",
      actor: "carol",
      timestamp: "2025-02-10T09:00:00Z",
      excerpt:
        "Bug: login fails with special characters\n\nSteps to reproduce...",
    },
    truncated: false,
  };
}

function makeTopicDigest(): BriefDigest {
  return {
    target: "auth module",
    target_kind: "topic",
    who: [],
    history: [],
    connections: [],
    risk: [],
    introducing_episode: null,
    truncated: false,
  };
}

// ---------------------------------------------------------------------------
// renderBriefMarkdown
// ---------------------------------------------------------------------------

describe("renderBriefMarkdown", () => {
  it("produces a heading with the target", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("## Brief:");
    expect(md).toContain("`pr:123`");
  });

  it("includes ### What section", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("### What");
  });

  it("includes PR title and status", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("feat: add authentication middleware");
    expect(md).toContain("merged");
  });

  it("includes touched files", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("`src/auth.ts`");
    expect(md).toContain("`src/middleware.ts`");
  });

  it("includes ### Who section", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("### Who");
    expect(md).toContain("alice");
    expect(md).toContain("author");
  });

  it("includes ### History section", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("### History");
    expect(md).toContain("`src/session.ts`");
    expect(md).toContain("5×");
  });

  it("includes ### Connections section", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("### Connections");
    expect(md).toContain("Use JWT for stateless auth");
  });

  it("includes ### Risk section", () => {
    const md = renderBriefMarkdown(makePrDigest());
    expect(md).toContain("### Risk");
    expect(md).toContain("Session cookie approach");
  });

  it("marks stale connections with warning", () => {
    const digest = makePrDigest();
    digest.connections[0].stale = true;
    const md = renderBriefMarkdown(digest);
    expect(md).toContain("stale");
  });

  it("renders issue digest correctly", () => {
    const md = renderBriefMarkdown(makeIssueDigest());
    expect(md).toContain("Bug: login fails with special characters");
    expect(md).toContain("closed");
    expect(md).toContain("`bug`");
    expect(md).toContain("`auth`");
    expect(md).toContain("carol");
  });

  it("omits Risk section for issue digest", () => {
    const md = renderBriefMarkdown(makeIssueDigest());
    expect(md).not.toContain("### Risk");
  });

  it("handles empty digest gracefully", () => {
    const md = renderBriefMarkdown(makeTopicDigest());
    expect(md).toContain("## Brief:");
    expect(md).toContain("### What");
  });

  it("uses repoUrl for github PR citation", () => {
    const md = renderBriefMarkdown(
      makePrDigest(),
      "https://github.com/org/repo",
    );
    expect(md).toContain("https://github.com/org/repo");
  });
});

// ---------------------------------------------------------------------------
// renderBriefText
// ---------------------------------------------------------------------------

describe("renderBriefText", () => {
  it("includes WHAT section", () => {
    const text = renderBriefText(makePrDigest());
    expect(text).toContain("WHAT");
    expect(text).toContain("feat: add authentication middleware");
  });

  it("includes WHO section", () => {
    const text = renderBriefText(makePrDigest());
    expect(text).toContain("WHO");
    expect(text).toContain("alice");
  });

  it("includes HISTORY section", () => {
    const text = renderBriefText(makePrDigest());
    expect(text).toContain("HISTORY");
    expect(text).toContain("src/session.ts");
  });

  it("includes CONNECTIONS section", () => {
    const text = renderBriefText(makePrDigest());
    expect(text).toContain("CONNECTIONS");
  });

  it("includes RISK section", () => {
    const text = renderBriefText(makePrDigest());
    expect(text).toContain("RISK");
    expect(text).toContain("Session cookie approach");
  });

  it("omits Risk section for issue digest", () => {
    const text = renderBriefText(makeIssueDigest());
    expect(text).not.toContain("RISK");
  });
});

// ---------------------------------------------------------------------------
// renderBriefJson
// ---------------------------------------------------------------------------

describe("renderBriefJson", () => {
  it("returns object with correct shape", () => {
    const json = renderBriefJson(makePrDigest());
    expect(json.target).toBe("pr:123");
    expect(json.target_kind).toBe("pr");
    expect(json.pr_title).toBe("feat: add authentication middleware");
    expect(json.pr_status).toBe("merged");
    expect(json.touched_files).toEqual([
      "src/auth.ts",
      "src/middleware.ts",
      "test/auth.test.ts",
    ]);
    expect(Array.isArray(json.who)).toBe(true);
    expect(Array.isArray(json.history)).toBe(true);
    expect(Array.isArray(json.connections)).toBe(true);
    expect(Array.isArray(json.risk)).toBe(true);
    expect(json.truncated).toBe(false);
  });

  it("is JSON serializable", () => {
    const json = renderBriefJson(makePrDigest());
    expect(() => JSON.stringify(json)).not.toThrow();
  });

  it("serializes issue fields correctly", () => {
    const json = renderBriefJson(makeIssueDigest());
    expect(json.target_kind).toBe("issue");
    expect(json.issue_title).toBe("Bug: login fails with special characters");
    expect(json.issue_status).toBe("closed");
    expect(json.issue_labels).toEqual(["bug", "auth"]);
    expect(json.risk).toEqual([]);
  });

  it("includes introducing_episode when present", () => {
    const json = renderBriefJson(makePrDigest());
    expect(json.introducing_episode).not.toBeNull();
    expect(json.introducing_episode?.episode_id).toBe("01EPISODEX");
  });

  it("sets introducing_episode to null when absent", () => {
    const json = renderBriefJson(makeTopicDigest());
    expect(json.introducing_episode).toBeNull();
  });
});
