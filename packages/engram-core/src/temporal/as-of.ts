/**
 * as-of.ts — parse and resolve `--as-of` temporal query strings.
 *
 * Accepted forms:
 *   - ISO8601 UTC:   "2026-01-15T14:22:00Z"
 *   - Bare date:     "2026-01-15"  → 2026-01-15T00:00:00.000Z
 *   - Relative:      "6 months ago", "3 weeks ago", "2 days ago"
 *   - Named aliases: "yesterday", "last week", "last month", "last year"
 *
 * Month = 30d, year = 365d (not calendar-aware).
 * Future timestamps are rejected.
 */

export class InvalidAsOfError extends Error {
  constructor(received: string, message?: string) {
    super(
      message ??
        `--as-of: cannot parse "${received}". ` +
          "Accepted forms: ISO8601 UTC (e.g. 2026-01-15T14:22:00Z), " +
          "bare date (2026-01-15), " +
          "or relative string (yesterday, last week, last month, last year, " +
          "<N> seconds|minutes|hours|days|weeks|months|years ago).",
    );
    this.name = "InvalidAsOfError";
  }
}

export interface ResolvedAsOf {
  /** ISO8601 UTC string, e.g. "2026-01-15T00:00:00.000Z" */
  iso: string;
  /** The raw user input, preserved for the pack header. */
  input: string;
}

// Unit → milliseconds (month = 30d, year = 365d)
const UNIT_MS: Record<string, number> = {
  second: 1_000,
  seconds: 1_000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 7 * 86_400_000,
  weeks: 7 * 86_400_000,
  month: 30 * 86_400_000,
  months: 30 * 86_400_000,
  year: 365 * 86_400_000,
  years: 365 * 86_400_000,
};

/**
 * Resolve an `--as-of` input string to a UTC ISO8601 timestamp.
 *
 * @param input  Raw user input string.
 * @param now    Reference time for relative expressions (default: new Date()).
 * @returns      Resolved ISO string + original input.
 * @throws       InvalidAsOfError on unrecognised or future input.
 */
export function resolveAsOf(
  input: string,
  now: Date = new Date(),
): ResolvedAsOf {
  // Normalize: trim, collapse whitespace, lowercase.
  const normalized = input.trim().toLowerCase().replace(/\s+/g, " ");

  // --- Named aliases ---
  const NAMED: Record<string, number> = {
    yesterday: 24 * 3_600_000,
    "last week": 7 * 86_400_000,
    "last month": 30 * 86_400_000,
    "last year": 365 * 86_400_000,
  };

  if (Object.hasOwn(NAMED, normalized)) {
    const offsetMs = NAMED[normalized];
    const resolved = new Date(now.getTime() - offsetMs);
    assertNotFuture(resolved, now, input);
    return { iso: resolved.toISOString(), input };
  }

  // --- Relative: "<N> <unit> ago" ---
  const relMatch = normalized.match(
    /^(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago$/,
  );
  if (relMatch) {
    const n = parseInt(relMatch[1], 10);
    const unit = `${relMatch[2]}s`; // normalise to plural key
    const unitMs = UNIT_MS[unit];
    if (!unitMs || n <= 0) throw new InvalidAsOfError(input);
    const resolved = new Date(now.getTime() - n * unitMs);
    assertNotFuture(resolved, now, input);
    return { iso: resolved.toISOString(), input };
  }

  // --- Bare date: YYYY-MM-DD ---
  const bareDate = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
  if (bareDate) {
    // Parse as start-of-day UTC
    const resolved = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(resolved.getTime())) throw new InvalidAsOfError(input);
    assertNotFuture(resolved, now, input);
    return { iso: resolved.toISOString(), input };
  }

  // --- ISO8601 with explicit time and timezone ---
  // Only accept datetimes with an explicit Z or +/-offset suffix (UTC required).
  // Timezone-naive datetime strings (e.g. "2026-01-15T14:22") are rejected —
  // new Date() would silently interpret them in local time, not UTC.
  const rawTrimmed = input.trim();
  if (/T.*(\+|-|\d{2}Z|Z)/.test(rawTrimmed)) {
    const resolved = new Date(rawTrimmed);
    if (!Number.isNaN(resolved.getTime())) {
      assertNotFuture(resolved, now, input);
      return { iso: resolved.toISOString(), input };
    }
  }

  throw new InvalidAsOfError(input);
}

function assertNotFuture(resolved: Date, now: Date, input: string): void {
  if (resolved.getTime() > now.getTime()) {
    throw new InvalidAsOfError(
      input,
      `--as-of cannot be in the future (received: "${input}")`,
    );
  }
}
