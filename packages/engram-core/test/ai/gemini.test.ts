/**
 * gemini.test.ts — GeminiProvider unit tests with mocked @google/genai SDK.
 */

import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { GeminiProvider } from "../../src/ai/gemini.js";

// Mock @google/genai before any imports use it
const mockEmbedContent = mock(async () => ({
  embeddings: [{ values: [0.1, 0.2, 0.3] }],
}));

const mockGenerateContent = mock(async () => ({
  text: '[{"name":"Alice","entity_type":"person","confidence":0.9}]',
}));

beforeAll(() => {
  mock.module("@google/genai", () => ({
    GoogleGenAI: class {
      models = {
        embedContent: mockEmbedContent,
        generateContent: mockGenerateContent,
      };
    },
  }));
});

describe("GeminiProvider", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
    mockEmbedContent.mockClear();
    mockGenerateContent.mockClear();
    if (originalEnv === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = originalEnv;
    }
  });

  describe("constructor", () => {
    test("logs warning when no API key", () => {
      delete process.env.GEMINI_API_KEY;
      // Should not throw — just warn
      const provider = new GeminiProvider({ apiKey: "" });
      expect(provider).toBeDefined();
    });

    test("reads GEMINI_API_KEY from env", () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider();
      expect(provider).toBeDefined();
    });

    test("accepts embedModel override", () => {
      const provider = new GeminiProvider({
        apiKey: "key",
        embedModel: "custom-embed-model",
      });
      expect(provider).toBeDefined();
    });
  });

  describe("embed()", () => {
    test("returns empty array when API key is missing", async () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider({ apiKey: "" });
      const result = await provider.embed(["text"]);
      expect(result).toEqual([]);
    });

    test("returns empty array for empty input", async () => {
      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.embed([]);
      expect(result).toEqual([]);
    });

    test("never throws even when API key is missing", async () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider({ apiKey: "" });
      await expect(provider.embed(["text"])).resolves.toEqual([]);
    });

    test("calls embedContent and returns embedding vectors", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.embed(["hello world"]);
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0]).toEqual([0.1, 0.2, 0.3]);
      expect(mockEmbedContent).toHaveBeenCalledTimes(1);
    });

    test("returns one embedding per input text", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.embed(["text one", "text two"]);
      expect(result.length).toBe(2);
      expect(mockEmbedContent).toHaveBeenCalledTimes(2);
    });
  });

  describe("extractEntities()", () => {
    test("returns empty array when no extractModel configured", async () => {
      const provider = new GeminiProvider({ apiKey: "test-key" });
      const result = await provider.extractEntities("some text");
      expect(result).toEqual([]);
    });

    test("returns empty array when API key is missing", async () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider({
        apiKey: "",
        extractModel: "gemini-2.0-flash",
      });
      const result = await provider.extractEntities(
        "Alice deployed auth-service",
      );
      expect(result).toEqual([]);
    });

    test("returns empty array for empty text", async () => {
      const provider = new GeminiProvider({
        apiKey: "test-key",
        extractModel: "gemini-2.0-flash",
      });
      const result = await provider.extractEntities("");
      expect(result).toEqual([]);
    });

    test("calls generateContent and parses entity hints", async () => {
      process.env.GEMINI_API_KEY = "test-key";
      const provider = new GeminiProvider({
        apiKey: "test-key",
        extractModel: "gemini-2.0-flash",
      });
      const result = await provider.extractEntities(
        "Alice deployed auth-service",
      );
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
      expect(result[0].name).toBe("Alice");
      expect(result[0].entity_type).toBe("person");
      expect(result[0].confidence).toBe(0.9);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    });

    test("never throws", async () => {
      const provider = new GeminiProvider({
        apiKey: "",
        extractModel: "gemini-2.0-flash",
      });
      await expect(provider.extractEntities("text")).resolves.toEqual([]);
    });
  });
});
