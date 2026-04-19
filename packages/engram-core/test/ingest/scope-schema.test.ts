/**
 * scope-schema.test.ts — GitHub adapter scopeSchema: valid inputs pass, invalid inputs throw.
 */

import { describe, expect, test } from "bun:test";
import { githubScopeSchema } from "../../src/ingest/adapters/github.js";

describe("githubScopeSchema", () => {
  test("has a non-empty description", () => {
    expect(typeof githubScopeSchema.description).toBe("string");
    expect(githubScopeSchema.description.length).toBeGreaterThan(0);
  });

  describe("validate — valid inputs pass", () => {
    const validScopes = [
      "owner/repo",
      "my-org/my-repo",
      "user123/project.name",
      "A/B",
      "engram-dev/engram",
      "foo.bar/baz_qux",
    ];

    for (const scope of validScopes) {
      test(`valid: ${scope}`, () => {
        expect(() => githubScopeSchema.validate(scope)).not.toThrow();
      });
    }
  });

  describe("validate — invalid inputs throw with message", () => {
    const invalidScopes = [
      ["", "empty string"],
      ["noslash", "missing slash"],
      ["/repo", "empty owner"],
      ["owner/", "empty repo"],
      ["owner/repo/extra", "too many segments"],
      ["owner repo", "contains space"],
    ];

    for (const [scope, label] of invalidScopes) {
      test(`invalid (${label}): ${JSON.stringify(scope)}`, () => {
        expect(() => githubScopeSchema.validate(scope as string)).toThrow();
      });
    }

    test("throws an Error (not a string or other type)", () => {
      let thrown: unknown;
      try {
        githubScopeSchema.validate("no-slash");
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(Error);
    });

    test("error message contains the invalid scope", () => {
      let message = "";
      try {
        githubScopeSchema.validate("bad input");
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).toContain("bad input");
    });
  });
});
