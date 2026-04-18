import { describe, expect, it } from "bun:test";
import { Command } from "commander";
import { registerVisualize } from "../../src/commands/visualize.js";

function makeProgram(): Command {
  const program = new Command().exitOverride();
  registerVisualize(program);
  return program;
}

async function runVisualize(args: string[]): Promise<{
  exitCode: number | undefined;
  errors: string[];
}> {
  const program = makeProgram();
  const errors: string[] = [];
  const origErr = console.error;
  console.error = (...a: unknown[]) => errors.push(a.join(" "));
  let exitCode: number | undefined;
  const origExit = process.exit;
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (process as any).exit = (code?: number) => {
    if (exitCode === undefined) exitCode = code;
    throw new Error(`process.exit(${code})`);
  };
  try {
    await program.parseAsync(["node", "engram", "visualize", ...args]);
  } catch {
    // expected — process.exit throws
  } finally {
    console.error = origErr;
    process.exit = origExit;
  }
  return { exitCode, errors };
}

describe("engram visualize --port validation", () => {
  it("exits 1 with message for non-numeric --port", async () => {
    const { exitCode, errors } = await runVisualize(["--port", "abc"]);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Error: --port must be an integer between 1 and 65535",
    );
  });

  it("exits 1 with message for --port 0", async () => {
    const { exitCode, errors } = await runVisualize(["--port", "0"]);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Error: --port must be an integer between 1 and 65535",
    );
  });

  it("exits 1 with message for --port 99999", async () => {
    const { exitCode, errors } = await runVisualize(["--port", "99999"]);
    expect(exitCode).toBe(1);
    expect(errors.join("\n")).toContain(
      "Error: --port must be an integer between 1 and 65535",
    );
  });
});
