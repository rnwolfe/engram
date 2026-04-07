/**
 * ollama.test.ts — OllamaProvider unit tests with mocked fetch.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { OllamaProvider } from "../../src/ai/ollama.js";

// Store original fetch
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

describe("OllamaProvider", () => {
  describe("embed()", () => {
    test("returns embeddings from /api/embed response", async () => {
      mockFetch({
        embeddings: [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ],
      });

      const provider = new OllamaProvider();
      const result = await provider.embed(["text one", "text two"]);

      expect(result).toEqual([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]);
    });

    test("returns empty array for empty input", async () => {
      const provider = new OllamaProvider();
      const result = await provider.embed([]);
      expect(result).toEqual([]);
    });

    test("handles single embedding field (older Ollama API)", async () => {
      mockFetch({ embedding: [0.1, 0.2, 0.3] });

      const provider = new OllamaProvider();
      const result = await provider.embed(["text"]);

      expect(result).toEqual([[0.1, 0.2, 0.3]]);
    });

    test("returns empty array on connection refused (ECONNREFUSED)", async () => {
      const err = new Error(
        "ECONNREFUSED connect ECONNREFUSED 127.0.0.1:11434",
      );
      mockFetchError(err);

      const provider = new OllamaProvider();
      const result = await provider.embed(["text"]);

      expect(result).toEqual([]);
    });

    test("returns empty array on HTTP error", async () => {
      mockFetch({ error: "model not found" }, 404);

      const provider = new OllamaProvider();
      const result = await provider.embed(["text"]);

      expect(result).toEqual([]);
    });

    test("returns empty array on API error field", async () => {
      mockFetch({ error: "something went wrong" });

      const provider = new OllamaProvider();
      const result = await provider.embed(["text"]);

      expect(result).toEqual([]);
    });

    test("returns empty array on network timeout", async () => {
      const err = new Error("fetch timeout");
      err.name = "TimeoutError";
      mockFetchError(err);

      const provider = new OllamaProvider();
      const result = await provider.embed(["text"]);

      expect(result).toEqual([]);
    });

    test("never throws on any error", async () => {
      mockFetchError(new Error("unexpected error"));

      const provider = new OllamaProvider();
      await expect(provider.embed(["text"])).resolves.toEqual([]);
    });

    test("uses configured model and baseUrl", async () => {
      let capturedUrl: string | undefined;
      let capturedBody: unknown;

      globalThis.fetch = mock((url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ embeddings: [[0.1]] }),
        } as Response);
      });

      const provider = new OllamaProvider({
        baseUrl: "http://custom-host:11434",
        embedModel: "mxbai-embed-large",
      });

      await provider.embed(["test"]);

      expect(capturedUrl).toBe("http://custom-host:11434/api/embed");
      expect((capturedBody as { model: string }).model).toBe(
        "mxbai-embed-large",
      );
    });
  });

  describe("extractEntities()", () => {
    test("returns empty array when no extractModel configured", async () => {
      const provider = new OllamaProvider();
      const result = await provider.extractEntities("some text");
      expect(result).toEqual([]);
    });

    test("parses entity hints from LLM response", async () => {
      mockFetch({
        response: JSON.stringify([
          { name: "Alice", entity_type: "person", confidence: 0.9 },
          { name: "auth-service", entity_type: "service", confidence: 0.8 },
        ]),
      });

      const provider = new OllamaProvider({ extractModel: "llama3" });
      const result = await provider.extractEntities(
        "Alice deployed auth-service",
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Alice");
      expect(result[0].entity_type).toBe("person");
      expect(result[1].name).toBe("auth-service");
    });

    test("returns empty array on connection error", async () => {
      mockFetchError(new Error("ECONNREFUSED"));

      const provider = new OllamaProvider({ extractModel: "llama3" });
      const result = await provider.extractEntities("text");
      expect(result).toEqual([]);
    });

    test("returns empty array for empty text", async () => {
      const provider = new OllamaProvider({ extractModel: "llama3" });
      const result = await provider.extractEntities("");
      expect(result).toEqual([]);
    });
  });
});
