/**
 * as-of.test.ts — unit tests for resolveAsOf() and InvalidAsOfError.
 */

import { describe, expect, test } from "bun:test";
import { InvalidAsOfError, resolveAsOf } from "../../src/temporal/as-of.js";

// Fixed reference time: 2026-04-22T12:00:00.000Z
const NOW = new Date("2026-04-22T12:00:00.000Z");

// ---------------------------------------------------------------------------
// ISO8601 datetime
// ---------------------------------------------------------------------------
describe("ISO8601 datetime input", () => {
  test("accepts explicit UTC datetime", () => {
    const result = resolveAsOf("2026-01-15T14:22:00Z", NOW);
    expect(result.iso).toBe("2026-01-15T14:22:00.000Z");
    expect(result.input).toBe("2026-01-15T14:22:00Z");
  });

  test("accepts datetime with milliseconds", () => {
    const result = resolveAsOf("2025-06-01T00:00:00.000Z", NOW);
    expect(result.iso).toBe("2025-06-01T00:00:00.000Z");
  });

  test("accepts datetime with positive offset", () => {
    const result = resolveAsOf("2026-01-15T16:22:00+02:00", NOW);
    // +02:00 → UTC 14:22:00
    expect(result.iso).toBe("2026-01-15T14:22:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Bare date
// ---------------------------------------------------------------------------
describe("bare date input (YYYY-MM-DD)", () => {
  test("resolves to start of UTC day", () => {
    const result = resolveAsOf("2026-01-15", NOW);
    expect(result.iso).toBe("2026-01-15T00:00:00.000Z");
    expect(result.input).toBe("2026-01-15");
  });

  test("resolves yesterday as bare date", () => {
    const result = resolveAsOf("2026-04-21", NOW);
    expect(result.iso).toBe("2026-04-21T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// Named aliases
// ---------------------------------------------------------------------------
describe("named aliases", () => {
  test("yesterday → 24 hours ago", () => {
    const result = resolveAsOf("yesterday", NOW);
    const expected = new Date(NOW.getTime() - 24 * 3_600_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("last week → 7 days ago", () => {
    const result = resolveAsOf("last week", NOW);
    const expected = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("last month → 30 days ago", () => {
    const result = resolveAsOf("last month", NOW);
    const expected = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("last year → 365 days ago", () => {
    const result = resolveAsOf("last year", NOW);
    const expected = new Date(NOW.getTime() - 365 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("whitespace-normalized aliases", () => {
    const result = resolveAsOf("  last  week  ", NOW);
    const expected = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });
});

// ---------------------------------------------------------------------------
// Relative: <N> <unit> ago
// ---------------------------------------------------------------------------
describe("relative: <N> <unit> ago", () => {
  test("2 days ago", () => {
    const result = resolveAsOf("2 days ago", NOW);
    const expected = new Date(NOW.getTime() - 2 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("3 weeks ago", () => {
    const result = resolveAsOf("3 weeks ago", NOW);
    const expected = new Date(NOW.getTime() - 3 * 7 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("6 months ago", () => {
    const result = resolveAsOf("6 months ago", NOW);
    const expected = new Date(NOW.getTime() - 6 * 30 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("1 year ago", () => {
    const result = resolveAsOf("1 year ago", NOW);
    const expected = new Date(NOW.getTime() - 365 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("2 years ago", () => {
    const result = resolveAsOf("2 years ago", NOW);
    const expected = new Date(NOW.getTime() - 2 * 365 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("singular forms: 1 day ago", () => {
    const result = resolveAsOf("1 day ago", NOW);
    const expected = new Date(NOW.getTime() - 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("1 week ago (singular)", () => {
    const result = resolveAsOf("1 week ago", NOW);
    const expected = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("1 month ago (singular)", () => {
    const result = resolveAsOf("1 month ago", NOW);
    const expected = new Date(NOW.getTime() - 30 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("10 hours ago", () => {
    const result = resolveAsOf("10 hours ago", NOW);
    const expected = new Date(NOW.getTime() - 10 * 3_600_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("30 minutes ago", () => {
    const result = resolveAsOf("30 minutes ago", NOW);
    const expected = new Date(NOW.getTime() - 30 * 60_000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("90 seconds ago", () => {
    const result = resolveAsOf("90 seconds ago", NOW);
    const expected = new Date(NOW.getTime() - 90 * 1000);
    expect(result.iso).toBe(expected.toISOString());
  });

  test("preserves raw input in result", () => {
    const result = resolveAsOf("6 months ago", NOW);
    expect(result.input).toBe("6 months ago");
  });

  test("whitespace collapse in relative", () => {
    const result = resolveAsOf("  3   weeks  ago  ", NOW);
    const expected = new Date(NOW.getTime() - 3 * 7 * 86_400_000);
    expect(result.iso).toBe(expected.toISOString());
  });
});

// ---------------------------------------------------------------------------
// Future timestamp rejection
// ---------------------------------------------------------------------------
describe("future timestamps", () => {
  test("future ISO datetime throws", () => {
    expect(() => resolveAsOf("2030-01-01T00:00:00Z", NOW)).toThrow(
      "--as-of cannot be in the future",
    );
  });

  test("future bare date throws", () => {
    expect(() => resolveAsOf("2030-06-15", NOW)).toThrow(
      "--as-of cannot be in the future",
    );
  });
});

// ---------------------------------------------------------------------------
// Invalid inputs
// ---------------------------------------------------------------------------
describe("invalid inputs", () => {
  test("throws InvalidAsOfError for garbage input", () => {
    expect(() => resolveAsOf("next week", NOW)).toThrow(InvalidAsOfError);
  });

  test("error message includes received value", () => {
    try {
      resolveAsOf("whenever", NOW);
      expect(true).toBe(false); // should not reach
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidAsOfError);
      expect((err as Error).message).toContain('"whenever"');
    }
  });

  test("error message includes accepted forms hint", () => {
    try {
      resolveAsOf("tomorrow", NOW);
    } catch (err) {
      expect((err as Error).message).toContain("Accepted forms");
    }
  });

  test("throws for empty string", () => {
    expect(() => resolveAsOf("", NOW)).toThrow(InvalidAsOfError);
  });

  test("throws for whitespace-only string", () => {
    expect(() => resolveAsOf("   ", NOW)).toThrow(InvalidAsOfError);
  });

  test("throws for 0 units ago", () => {
    expect(() => resolveAsOf("0 days ago", NOW)).toThrow(InvalidAsOfError);
  });

  test("throws for fractional N", () => {
    expect(() => resolveAsOf("1.5 days ago", NOW)).toThrow(InvalidAsOfError);
  });

  test("throws for 'next month'", () => {
    expect(() => resolveAsOf("next month", NOW)).toThrow(InvalidAsOfError);
  });
});
