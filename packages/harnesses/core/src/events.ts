export interface SessionContext {
  cwd: string;
  sessionId?: string;
}

export interface PromptContext extends SessionContext {
  prompt: string;
}

export type HookResult = { ok: true } | { ok: false; error: string };
