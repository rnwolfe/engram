import { afterEach, describe, expect, mock, test } from "bun:test";
import {
  checkGoogle,
  checkOllama,
  checkOpenAI,
} from "../../src/ai/reachability.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: unknown, status = 200) {
  globalThis.fetch = mock(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(response),
    } as Response),
  );
}

function mockFetchError(error: Error) {
  globalThis.fetch = mock(() => Promise.reject(error));
}

describe("checkOllama", () => {
  test("returns ok:false when endpoint is unreachable", async () => {
    const result = await checkOllama("http://localhost:1", "nomic-embed-text");
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("ollama serve");
  });

  test("returns ok:false with pull hint when model is not present", async () => {
    mockFetch({ models: [{ name: "llama3:latest" }] });
    const result = await checkOllama(
      "http://localhost:11434",
      "nomic-embed-text",
    );
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("ollama pull nomic-embed-text");
  });

  test("returns ok:true when model is present", async () => {
    mockFetch({
      models: [{ name: "nomic-embed-text:latest" }, { name: "llama3:latest" }],
    });
    const result = await checkOllama(
      "http://localhost:11434",
      "nomic-embed-text",
    );
    expect(result.ok).toBe(true);
    expect(result.message).toContain("nomic-embed-text");
  });

  test("returns ok:false on non-200 response", async () => {
    mockFetch({}, 503);
    const result = await checkOllama(
      "http://localhost:11434",
      "nomic-embed-text",
    );
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("ollama serve");
  });

  test("returns ok:false on fetch rejection", async () => {
    mockFetchError(new Error("ECONNREFUSED"));
    const result = await checkOllama(
      "http://localhost:11434",
      "nomic-embed-text",
    );
    expect(result.ok).toBe(false);
  });

  test("result has required shape", async () => {
    const result = await checkOllama("http://localhost:1", "nomic-embed-text");
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});

describe("checkOpenAI", () => {
  test("returns ok:false with hint when no API key provided", async () => {
    const result = await checkOpenAI(undefined);
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("OPENAI_API_KEY");
  });

  test("returns ok:false for empty string key", async () => {
    const result = await checkOpenAI("");
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("OPENAI_API_KEY");
  });

  test("returns ok:true when API responds successfully", async () => {
    mockFetch({ data: [] });
    const result = await checkOpenAI("sk-test-key");
    expect(result.ok).toBe(true);
  });

  test("returns ok:false on 401 unauthorized", async () => {
    mockFetch({ error: "Unauthorized" }, 401);
    const result = await checkOpenAI("sk-bad-key");
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("OPENAI_API_KEY");
  });

  test("result has required shape", async () => {
    const result = await checkOpenAI(undefined);
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});

describe("checkGoogle", () => {
  test("returns ok:false with hint when no API key provided", async () => {
    const result = await checkGoogle(undefined);
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("GOOGLE_API_KEY");
  });

  test("returns ok:false for empty string key", async () => {
    const result = await checkGoogle("");
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("GOOGLE_API_KEY");
  });

  test("returns ok:true when API responds successfully", async () => {
    mockFetch({ models: [] });
    const result = await checkGoogle("test-api-key");
    expect(result.ok).toBe(true);
  });

  test("returns ok:false on 403 forbidden", async () => {
    mockFetch({ error: "Forbidden" }, 403);
    const result = await checkGoogle("bad-key");
    expect(result.ok).toBe(false);
    expect(result.hint).toContain("GOOGLE_API_KEY");
  });

  test("result has required shape", async () => {
    const result = await checkGoogle(undefined);
    expect(typeof result.ok).toBe("boolean");
    expect(typeof result.message).toBe("string");
  });
});
