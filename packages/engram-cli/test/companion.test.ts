/**
 * companion.test.ts — Tests for `engram companion` command.
 *
 * Verifies that each harness variant produces valid Markdown output with no
 * template markers and that appending it to an agent instruction file is
 * a lossless, idempotent operation.
 */

import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import {
  companionSentinel,
  registerCompanion,
} from "../src/commands/companion.js";
import { BASE_COMPANION } from "../src/templates/companion/base.js";
import { HARNESS_OVERRIDES } from "../src/templates/companion/overrides.js";

function makeProgram(): Command {
  return new Command().exitOverride();
}

/**
 * Capture stdout written via process.stdout.write during an async action.
 */
async function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: string | Uint8Array, ...args: unknown[]) => {
    chunks.push(
      typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
    );
    return orig(
      chunk,
      ...(args as Parameters<typeof process.stdout.write>).slice(1),
    );
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return chunks.join("");
}

function tmpFile(content?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "engram-companion-"));
  const path = join(dir, "CLAUDE.md");
  if (content !== undefined) {
    writeFileSync(path, content, "utf8");
  }
  return path;
}

describe("engram companion — base template", () => {
  it("base template contains all four required sections", () => {
    expect(BASE_COMPANION).toContain("When to call");
    expect(BASE_COMPANION).toContain("How to interpret pack sections");
    expect(BASE_COMPANION).toContain("low-confidence or empty sections");
    expect(BASE_COMPANION).toContain("prefer pack signal over current code");
  });

  it("base template is valid Markdown — no unfilled template markers", () => {
    // Reject common template placeholder patterns
    expect(BASE_COMPANION).not.toMatch(/\{\{[^}]+\}\}/); // {{foo}}
    expect(BASE_COMPANION).not.toMatch(/<PLACEHOLDER>/i);
    expect(BASE_COMPANION).not.toMatch(/TODO:/i);
  });
});

describe("engram companion — harness overrides", () => {
  const harnesses = ["generic", "claude-code", "cursor", "gemini"] as const;

  for (const harness of harnesses) {
    it(`${harness} override exists and contains invocation example`, () => {
      const override = HARNESS_OVERRIDES[harness];
      expect(override).toBeTruthy();
      expect(override).toContain("engram context");
    });

    it(`${harness} override is valid Markdown — no unfilled markers`, () => {
      const override = HARNESS_OVERRIDES[harness];
      expect(override).not.toMatch(/\{\{[^}]+\}\}/);
      expect(override).not.toMatch(/<PLACEHOLDER>/i);
    });
  }

  it("claude-code override references CLAUDE.md", () => {
    expect(HARNESS_OVERRIDES["claude-code"]).toContain("CLAUDE.md");
  });

  it("cursor override references .cursor/rules/", () => {
    expect(HARNESS_OVERRIDES.cursor).toContain(".cursor/rules/");
  });

  it("gemini override references GEMINI.md", () => {
    expect(HARNESS_OVERRIDES.gemini).toContain("GEMINI.md");
  });
});

describe("engram companion — sentinel", () => {
  it("sentinel is harness-specific", () => {
    expect(companionSentinel("claude-code")).toBe(
      "<!-- engram-companion:claude-code -->",
    );
    expect(companionSentinel("cursor")).toBe(
      "<!-- engram-companion:cursor -->",
    );
    expect(companionSentinel("generic")).toBe(
      "<!-- engram-companion:generic -->",
    );
  });
});

describe("engram companion — CLI command output", () => {
  it("default (generic) output contains base content and invocation example", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync(["node", "engram", "companion"]),
    );
    expect(output).toContain("When to call");
    expect(output).toContain("engram context");
    expect(output).toContain("Possibly relevant discussions");
    expect(output).toContain("Structural signals");
  });

  it("output includes harness-specific sentinel", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "claude-code",
      ]),
    );
    expect(output).toContain("<!-- engram-companion:claude-code -->");
  });

  it("--harness claude-code output references CLAUDE.md", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "claude-code",
      ]),
    );
    expect(output).toContain("CLAUDE.md");
    expect(output).toContain("Bash tool");
  });

  it("--harness cursor output references .cursor/rules/", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "cursor",
      ]),
    );
    expect(output).toContain(".cursor/rules/");
  });

  it("--harness gemini output references GEMINI.md", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "gemini",
      ]),
    );
    expect(output).toContain("GEMINI.md");
  });

  it("invalid --harness exits with error", async () => {
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    try {
      await program.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "unknown-harness",
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
      console.error = origError;
    }
    expect(exitCode).toBe(1);
    expect(errors.join(" ")).toContain("--harness must be one of");
  });

  it("output is append-safe — ends with a newline", async () => {
    const program = makeProgram();
    registerCompanion(program);
    const output = await captureStdout(() =>
      program.parseAsync(["node", "engram", "companion"]),
    );
    expect(output.at(-1)).toBe("\n");
  });
});

describe("engram companion — --check flag", () => {
  it("--check without --file exits 1 with error message", async () => {
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(" "));
    try {
      await program.parseAsync(["node", "engram", "companion", "--check"]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
      console.error = origError;
    }
    expect(exitCode).toBe(1);
    expect(errors.join(" ")).toContain("--check requires --file");
  });

  it("--check exits 1 when file does not exist", async () => {
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await program.parseAsync([
        "node",
        "engram",
        "companion",
        "--check",
        "--file",
        "/nonexistent/path/CLAUDE.md",
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });

  it("--check exits 1 when sentinel is absent from file", async () => {
    const file = tmpFile("# Some content\nno sentinel here\n");
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await program.parseAsync([
        "node",
        "engram",
        "companion",
        "--check",
        "--file",
        file,
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });

  it("--check exits 0 when sentinel is present in file", async () => {
    const sentinel = companionSentinel("generic");
    const file = tmpFile(`# CLAUDE.md\n${sentinel}\nsome content\n`);
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await program.parseAsync([
        "node",
        "engram",
        "companion",
        "--check",
        "--file",
        file,
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(0);
  });

  it("--check is harness-specific — cursor sentinel not detected as claude-code", async () => {
    const cursorSentinel = companionSentinel("cursor");
    const file = tmpFile(`# rules\n${cursorSentinel}\nsome content\n`);
    const program = makeProgram();
    registerCompanion(program);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await program.parseAsync([
        "node",
        "engram",
        "companion",
        "--check",
        "--harness",
        "claude-code",
        "--file",
        file,
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });

  it("--check produces no stdout output", async () => {
    const sentinel = companionSentinel("claude-code");
    const file = tmpFile(`${sentinel}\n`);
    const program = makeProgram();
    registerCompanion(program);
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as typeof process.exit;
    let stdout = "";
    try {
      stdout = await captureStdout(() =>
        program.parseAsync([
          "node",
          "engram",
          "companion",
          "--check",
          "--harness",
          "claude-code",
          "--file",
          file,
        ]),
      );
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(stdout).toBe("");
  });

  it("appending twice then --check exits 0 (idempotent)", async () => {
    const program1 = makeProgram();
    registerCompanion(program1);
    const output = await captureStdout(() =>
      program1.parseAsync([
        "node",
        "engram",
        "companion",
        "--harness",
        "claude-code",
      ]),
    );
    const file = tmpFile(output + output);

    const program2 = makeProgram();
    registerCompanion(program2);
    let exitCode: number | undefined;
    const origExit = process.exit.bind(process);
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error("exit");
    }) as typeof process.exit;
    try {
      await program2.parseAsync([
        "node",
        "engram",
        "companion",
        "--check",
        "--harness",
        "claude-code",
        "--file",
        file,
      ]);
    } catch {
      // expected exit throw
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(0);
  });
});
