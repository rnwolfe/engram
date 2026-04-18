export interface ReachabilityResult {
  ok: boolean;
  message: string;
  hint?: string;
}

export async function checkOllama(
  endpoint: string,
  model: string,
): Promise<ReachabilityResult> {
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Ollama returned HTTP ${response.status}`,
        hint: "Start Ollama with: ollama serve",
      };
    }

    const data = (await response.json()) as { models?: { name: string }[] };
    const models = data.models ?? [];
    const found = models.some(
      (m) => m.name === model || m.name.startsWith(`${model}:`),
    );

    if (!found) {
      return {
        ok: false,
        message: `Ollama is reachable but ${model} is not pulled`,
        hint: `ollama pull ${model}`,
      };
    }

    return { ok: true, message: `reachable, ${model} is pulled` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      msg.includes("timeout") ||
      msg.includes("TimeoutError") ||
      (err instanceof Error && err.name === "TimeoutError");
    return {
      ok: false,
      message: isTimeout
        ? "Ollama request timed out"
        : `Cannot reach Ollama: ${msg}`,
      hint: "Start Ollama with: ollama serve",
    };
  }
}

export async function checkOpenAI(
  apiKey: string | undefined,
): Promise<ReachabilityResult> {
  if (!apiKey) {
    return {
      ok: false,
      message: "OPENAI_API_KEY is not set",
      hint: "export OPENAI_API_KEY=sk-...",
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `OpenAI API returned HTTP ${response.status}`,
        hint:
          response.status === 401
            ? "Check your OPENAI_API_KEY is valid"
            : undefined,
      };
    }

    return { ok: true, message: "OpenAI API is reachable" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Cannot reach OpenAI API: ${msg}`,
    };
  }
}

export async function checkGoogle(
  apiKey: string | undefined,
): Promise<ReachabilityResult> {
  if (!apiKey) {
    return {
      ok: false,
      message: "GEMINI_API_KEY / GOOGLE_API_KEY is not set",
      hint: "export GEMINI_API_KEY=...",
    };
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(5_000) },
    );

    if (!response.ok) {
      return {
        ok: false,
        message: `Google API returned HTTP ${response.status}`,
        hint:
          response.status === 400 || response.status === 403
            ? "Check your GEMINI_API_KEY / GOOGLE_API_KEY is valid"
            : undefined,
      };
    }

    return { ok: true, message: "Google Generative Language API is reachable" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message: `Cannot reach Google API: ${msg}`,
    };
  }
}
