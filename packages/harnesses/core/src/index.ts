export { assembleContextPack, emitStalenessBrief } from "./context-assembly.js";
export { getDeadlineMs, withDeadline } from "./deadline.js";
export type { HookResult, PromptContext, SessionContext } from "./events.js";

export async function onSessionStart(
  ctx: import("./events.js").SessionContext,
): Promise<void> {
  const { emitStalenessBrief } = await import("./context-assembly.js");
  const brief = await emitStalenessBrief(ctx.cwd);
  if (brief) {
    process.stderr.write(`\n${brief}\n\n`);
  }
}

export async function onUserPrompt(
  ctx: import("./events.js").PromptContext,
): Promise<string | null> {
  const { assembleContextPack } = await import("./context-assembly.js");
  return assembleContextPack(ctx.cwd, ctx.prompt);
}
