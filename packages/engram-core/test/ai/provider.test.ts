/**
 * provider.test.ts — createProvider factory tests.
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  createProvider,
  GeminiProvider,
  NullProvider,
  OllamaProvider,
} from "../../src/ai/index.js";

describe("createProvider", () => {
  const originalEnv = process.env.ENGRAM_AI_PROVIDER;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.ENGRAM_AI_PROVIDER;
    } else {
      process.env.ENGRAM_AI_PROVIDER = originalEnv;
    }
  });

  test("returns NullProvider for provider: 'null'", () => {
    const provider = createProvider({ provider: "null" });
    expect(provider).toBeInstanceOf(NullProvider);
  });

  test("returns OllamaProvider for provider: 'ollama'", () => {
    const provider = createProvider({ provider: "ollama" });
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  test("returns GeminiProvider for provider: 'gemini'", () => {
    const provider = createProvider({ provider: "gemini" });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  test("returns NullProvider when no config provided", () => {
    delete process.env.ENGRAM_AI_PROVIDER;
    const provider = createProvider();
    expect(provider).toBeInstanceOf(NullProvider);
  });

  test("reads ENGRAM_AI_PROVIDER=ollama from env", () => {
    process.env.ENGRAM_AI_PROVIDER = "ollama";
    const provider = createProvider();
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  test("reads ENGRAM_AI_PROVIDER=gemini from env", () => {
    process.env.ENGRAM_AI_PROVIDER = "gemini";
    const provider = createProvider();
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  test("config.provider overrides env", () => {
    process.env.ENGRAM_AI_PROVIDER = "ollama";
    const provider = createProvider({ provider: "null" });
    expect(provider).toBeInstanceOf(NullProvider);
  });

  test("unknown provider falls back to NullProvider", () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing fallback
    const provider = createProvider({ provider: "unknown" as any });
    expect(provider).toBeInstanceOf(NullProvider);
  });
});
