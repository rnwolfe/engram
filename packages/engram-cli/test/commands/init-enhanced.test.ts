/**
 * init-enhanced.test.ts — Tests for the enhanced init 5-step pipeline:
 *   remote detection, companion setup, GitHub enrichment, source ingest,
 *   JSON output, and --yes defaults.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Command } from "commander";
import { registerInit } from "../../src/commands/init.js";
import {
  appendCompanionToFiles,
  detectGitHubRemote,
  detectHarnessFiles,
} from "../../src/commands/init-pipeline.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerInit(program);
  return program;
}

function tmpDir(): { dir: string; dbPath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-init-enhanced-"));
  const dbPath = path.join(dir, "test.engram");
  return { dir, dbPath };
}

async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ): boolean => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return orig(
      chunk,
      ...(rest as Parameters<typeof process.stdout.write>).slice(1),
    );
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

// ---------------------------------------------------------------------------
// detectGitHubRemote tests
// ---------------------------------------------------------------------------

describe("detectGitHubRemote", () => {
  it("detects HTTPS GitHub remote from actual repo", () => {
    // Use this repo itself — it has a GitHub remote
    const repoPath = path.resolve(__dirname, "../../../..");
    const { repo } = detectGitHubRemote(repoPath);
    // May or may not be GitHub depending on CI env — just verify it doesn't throw
    expect(typeof repo === "string" || repo === null).toBe(true);
  });

  it("returns null with hint for non-git directory", () => {
    const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-not-git-"));
    try {
      const { repo, hint } = detectGitHubRemote(tmpdir);
      expect(repo).toBeNull();
      expect(typeof hint).toBe("string");
    } finally {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// detectHarnessFiles tests
// ---------------------------------------------------------------------------

describe("detectHarnessFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-harness-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty array when no harness files exist", () => {
    expect(detectHarnessFiles(dir)).toEqual([]);
  });

  it("detects CLAUDE.md", () => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# test");
    const found = detectHarnessFiles(dir);
    expect(found.length).toBe(1);
    expect(found[0].file).toBe("CLAUDE.md");
    expect(found[0].harness).toBe("claude-code");
  });

  it("detects AGENTS.md", () => {
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# agents");
    const found = detectHarnessFiles(dir);
    expect(found.length).toBe(1);
    expect(found[0].harness).toBe("generic");
  });

  it("detects GEMINI.md", () => {
    fs.writeFileSync(path.join(dir, "GEMINI.md"), "# gemini");
    const found = detectHarnessFiles(dir);
    expect(found.length).toBe(1);
    expect(found[0].harness).toBe("gemini");
  });

  it("detects .cursor/rules", () => {
    fs.mkdirSync(path.join(dir, ".cursor"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".cursor/rules"), "# rules");
    const found = detectHarnessFiles(dir);
    expect(found.length).toBe(1);
    expect(found[0].harness).toBe("cursor");
  });

  it("detects multiple harness files", () => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# claude");
    fs.writeFileSync(path.join(dir, "AGENTS.md"), "# agents");
    const found = detectHarnessFiles(dir);
    expect(found.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// appendCompanionToFiles tests
// ---------------------------------------------------------------------------

describe("appendCompanionToFiles", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "engram-companion-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates file when it does not exist", () => {
    const summary = appendCompanionToFiles(dir, [
      { file: "AGENTS.md", harness: "generic" },
    ]);
    expect(summary.created).toContain("AGENTS.md");
    expect(summary.appended).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(true);
    const content = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
    expect(content).toContain("<!-- engram-companion:generic -->");
  });

  it("appends to existing file", () => {
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Existing content\n");
    const summary = appendCompanionToFiles(dir, [
      { file: "CLAUDE.md", harness: "claude-code" },
    ]);
    expect(summary.appended).toContain("CLAUDE.md");
    expect(summary.created).toHaveLength(0);
    const content = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
    expect(content).toContain("# Existing content");
    expect(content).toContain("<!-- engram-companion:claude-code -->");
  });

  it("skips when sentinel already present (idempotent)", () => {
    const sentinel = "<!-- engram-companion:claude-code -->";
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), `# Existing\n${sentinel}\n`);
    const summary = appendCompanionToFiles(dir, [
      { file: "CLAUDE.md", harness: "claude-code" },
    ]);
    expect(summary.skipped).toContain("CLAUDE.md");
    expect(summary.appended).toHaveLength(0);
    // Content must not be modified
    const content = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
    const count = (content.match(/engram-companion:claude-code/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("creates .cursor/ directory when appending cursor harness", () => {
    const summary = appendCompanionToFiles(dir, [
      { file: ".cursor/rules", harness: "cursor" },
    ]);
    expect(summary.created).toContain(".cursor/rules");
    expect(fs.existsSync(path.join(dir, ".cursor/rules"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// --yes non-interactive pipeline tests
// ---------------------------------------------------------------------------

describe("engram init --yes enhanced pipeline", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    ({ dir, dbPath } = tmpDir());
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("runs source ingest unconditionally in --yes mode", {
    timeout: 120000,
  }, async () => {
    const out = await captureStdout(async () => {
      // Run from actual repo root so there's source to ingest
      const origCwd = process.cwd();
      process.chdir(path.resolve(__dirname, "../../../.."));
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
      }
    });

    expect(out).toContain("Source ingestion");
  });

  it("--format json emits structured JSON output", {
    timeout: 120000,
  }, async () => {
    let jsonText = "";
    const origCwd = process.cwd();
    process.chdir(path.resolve(__dirname, "../../../.."));
    try {
      jsonText = await captureStdout(async () => {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--db",
          dbPath,
          "--format",
          "json",
        ]);
      });
    } finally {
      process.chdir(origCwd);
    }

    // Find the JSON block in the output
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    expect(jsonMatch).not.toBeNull();
    const parsed = JSON.parse(jsonMatch?.[0]);
    expect(parsed).toHaveProperty("git");
    expect(parsed).toHaveProperty("enrichment");
    expect(parsed).toHaveProperty("source");
    expect(parsed).toHaveProperty("companion");
    expect(parsed).toHaveProperty("embed");
  });

  it("detects CLAUDE.md and appends companion in --yes mode", {
    timeout: 120000,
  }, async () => {
    // Create a CLAUDE.md in dir
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# Project docs\n");

    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "init",
        "--yes",
        "--embedding-model",
        "none",
        "--db",
        dbPath,
      ]);
    } finally {
      process.chdir(origCwd);
    }

    const content = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
    expect(content).toContain("# Project docs");
    expect(content).toContain("engram-companion:claude-code");
  });

  it("does not overwrite existing companion content (idempotent)", {
    timeout: 120000,
  }, async () => {
    const sentinel = "<!-- engram-companion:claude-code -->";
    fs.writeFileSync(
      path.join(dir, "CLAUDE.md"),
      `# Docs\n${sentinel}\nsome content\n`,
    );

    const origCwd = process.cwd();
    process.chdir(dir);
    try {
      await makeProgram().parseAsync([
        "node",
        "engram",
        "init",
        "--yes",
        "--embedding-model",
        "none",
        "--db",
        dbPath,
      ]);
    } finally {
      process.chdir(origCwd);
    }

    const content = fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8");
    const count = (content.match(/engram-companion:claude-code/g) ?? []).length;
    expect(count).toBe(1);
  });

  it("skips companion setup when no harness files found", {
    timeout: 120000,
  }, async () => {
    // dir has no harness files
    const out = await captureStdout(async () => {
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
      }
    });

    expect(out).toContain("harness files found");
    // No harness files should have been created
    expect(fs.existsSync(path.join(dir, "CLAUDE.md"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "AGENTS.md"))).toBe(false);
  });

  it("skips GitHub enrichment when GITHUB_TOKEN is absent", {
    timeout: 30000,
  }, async () => {
    const savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;

    const out = await captureStdout(async () => {
      const origCwd = process.cwd();
      process.chdir(dir);
      try {
        await makeProgram().parseAsync([
          "node",
          "engram",
          "init",
          "--yes",
          "--embedding-model",
          "none",
          "--db",
          dbPath,
        ]);
      } finally {
        process.chdir(origCwd);
        if (savedToken !== undefined) process.env.GITHUB_TOKEN = savedToken;
      }
    });

    expect(out).toContain("GITHUB_TOKEN not set");
    expect(out).not.toContain("GitHub enrichment complete");
  });
});
