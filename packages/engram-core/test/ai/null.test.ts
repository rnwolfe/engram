/**
 * null.test.ts — NullProvider unit tests.
 *
 * Synchronous behavior, no mocking needed.
 */

import { describe, expect, test } from "bun:test";
import { NullProvider } from "../../src/ai/null.js";

describe("NullProvider", () => {
  const provider = new NullProvider();

  test("modelName() returns 'null'", () => {
    expect(provider.modelName()).toBe("null");
  });

  test("embed() returns empty array for empty input", async () => {
    const result = await provider.embed([]);
    expect(result).toEqual([]);
  });

  test("embed() returns one empty vector per input text", async () => {
    const result = await provider.embed(["hello world", "foo bar"]);
    expect(result).toEqual([[], []]);
  });

  test("extractEntities() returns empty array", async () => {
    const result = await provider.extractEntities("some commit message");
    expect(result).toEqual([]);
  });

  test("extractEntities() returns empty array for empty string", async () => {
    const result = await provider.extractEntities("");
    expect(result).toEqual([]);
  });

  test("embed() never throws", async () => {
    await expect(provider.embed(["text"])).resolves.toEqual([[]]);
  });

  test("extractEntities() never throws", async () => {
    await expect(provider.extractEntities("text")).resolves.toEqual([]);
  });
});
