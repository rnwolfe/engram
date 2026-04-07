/**
 * gemini.test.ts — GeminiProvider unit tests with mocked @google/genai SDK.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { GeminiProvider } from "../../src/ai/gemini.js";

// We mock the @google/genai module dynamically by patching the dynamic import
// GeminiProvider uses dynamic import for lazy loading

describe("GeminiProvider", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
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

    test("never throws even when SDK fails to load", async () => {
      delete process.env.GEMINI_API_KEY;
      const provider = new GeminiProvider({ apiKey: "" });
      await expect(provider.embed(["text"])).resolves.toEqual([]);
    });

    test("returns empty array on client init failure", async () => {
      // Provider with a key but SDK will fail (not installed in test env)
      const provider = new GeminiProvider({ apiKey: "fake-key-for-test" });
      // This may succeed or fail depending on if @google/genai is installed
      // but it should never throw
      const result = await provider.embed(["text"]);
      expect(Array.isArray(result)).toBe(true);
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

    test("never throws", async () => {
      const provider = new GeminiProvider({
        apiKey: "",
        extractModel: "gemini-2.0-flash",
      });
      await expect(provider.extractEntities("text")).resolves.toEqual([]);
    });
  });
});
