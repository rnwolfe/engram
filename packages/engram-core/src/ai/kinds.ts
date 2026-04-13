/**
 * kinds.ts — KindCatalog loader for the projection layer.
 *
 * Loads projection kind definitions from:
 *   1. Built-in kinds in packages/engram-core/src/ai/kinds/*.yaml
 *   2. User overrides at $XDG_CONFIG_HOME/engram/kinds/*.yaml
 *      (fallback: ~/.config/engram/kinds/*.yaml)
 *
 * Override resolution: XDG file whose `name` matches a built-in replaces it.
 * New kinds in XDG are appended to the catalog.
 *
 * Validation: all required fields must be present and non-empty. Throws
 * KindValidationError on any invalid entry.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Valid anchor type strings for a projection kind.
 * Mirrors the anchor_type column in the projections table.
 */
export type AnchorTypeName =
  | "entity"
  | "edge"
  | "episode"
  | "projection"
  | "none";

/**
 * A single projection kind definition as loaded from a YAML catalog file.
 */
export interface KindEntry {
  /** Canonical kind identifier. Snake_case. Matches projections.kind column. */
  name: string;
  /** One-sentence description of what this kind of projection IS. */
  description: string;
  /**
   * Concrete guidance for the discover prompt: when to propose this kind,
   * what conditions must be present in the substrate.
   */
  when_to_use: string;
  /** Valid anchor_type values for this kind. */
  anchor_types: AnchorTypeName[];
  /**
   * Human-readable list of substrate element types typically in the input set.
   * Guidance for the generator and discover prompt; not enforced at write time.
   */
  expected_inputs: string[];
  /**
   * Pattern for a representative projection title.
   * May contain {placeholder} tokens. Used in discover-phase coverage catalog.
   */
  example_title_pattern: string;
}

/** The full catalog: an ordered array of KindEntry objects. */
export type KindCatalog = KindEntry[];

// ─── Errors ──────────────────────────────────────────────────────────────────

/** Thrown when a kind file fails validation (missing or invalid required fields). */
export class KindValidationError extends Error {
  constructor(
    public readonly kindName: string,
    public readonly missingFields: string[],
    public readonly filePath: string,
  ) {
    super(
      `KindValidationError: kind '${kindName}' in ${filePath} is missing required fields: ${missingFields.join(", ")}`,
    );
    this.name = "KindValidationError";
  }
}

// ─── Valid anchor types ───────────────────────────────────────────────────────

const VALID_ANCHOR_TYPES = new Set<string>([
  "entity",
  "edge",
  "episode",
  "projection",
  "none",
]);

const KIND_NAME_RE = /^[a-z][a-z0-9_]*$/;

// ─── YAML parser ─────────────────────────────────────────────────────────────

/**
 * Minimal YAML parser for the flat kind-definition format.
 *
 * Supported features (sufficient for kind files):
 *   - Scalar string values: `key: value`
 *   - Block scalars: `key: |` or `key: >` (folded/literal multiline strings)
 *   - Block sequences: `key:\n  - item`
 *   - Quoted strings: double-quote only
 *
 * Does NOT support: anchors, aliases, inline objects/arrays, complex types.
 */
function parseKindYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    // Match a top-level key
    const keyMatch = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)/);
    if (!keyMatch) {
      i++;
      continue;
    }

    const key = keyMatch[1];
    const rest = keyMatch[2].trim();

    // Block sequence (key:\n  - item)
    if (rest === "") {
      i++;
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        const itemMatch = lines[i].match(/^\s+-\s+(.*)/);
        if (itemMatch) {
          items.push(stripQuotes(itemMatch[1].trim()));
        }
        i++;
      }
      result[key] = items;
      continue;
    }

    // Block scalar: literal `|` or folded `>`
    if (rest === "|" || rest === ">") {
      const fold = rest === ">";
      i++;
      // Detect indentation from first non-empty line
      let indent = -1;
      const bodyLines: string[] = [];
      while (i < lines.length) {
        const bl = lines[i];
        if (bl.trim() === "") {
          bodyLines.push("");
          i++;
          continue;
        }
        const leadingSpaces = bl.match(/^(\s*)/)?.[1].length ?? 0;
        if (indent === -1) indent = leadingSpaces;
        if (leadingSpaces < indent) break;
        bodyLines.push(bl.slice(indent));
        i++;
      }
      // Remove trailing blank lines
      while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1] === "") {
        bodyLines.pop();
      }
      if (fold) {
        // Folded scalar (`>`): blank lines become paragraph breaks (\n\n),
        // non-blank lines within a paragraph are joined with a space.
        // Per YAML spec, a blank line in the body is preserved as a newline.
        const paragraphs: string[] = [];
        let current: string[] = [];
        for (const bl of bodyLines) {
          if (bl === "") {
            if (current.length > 0) {
              paragraphs.push(current.join(" "));
              current = [];
            }
            paragraphs.push("");
          } else {
            current.push(bl.trim());
          }
        }
        if (current.length > 0) {
          paragraphs.push(current.join(" "));
        }
        result[key] = paragraphs
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      } else {
        result[key] = bodyLines.join("\n");
      }
      continue;
    }

    // Inline value (possibly quoted)
    result[key] = stripQuotes(rest);
    i++;
  }

  return result;
}

function stripQuotes(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateEntry(
  raw: Record<string, unknown>,
  filePath: string,
): KindEntry {
  const missing: string[] = [];
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  const description =
    typeof raw.description === "string" ? raw.description.trim() : "";
  const when_to_use =
    typeof raw.when_to_use === "string" ? raw.when_to_use.trim() : "";
  const example_title_pattern =
    typeof raw.example_title_pattern === "string"
      ? raw.example_title_pattern.trim()
      : "";

  if (!name) missing.push("name");
  if (!description) missing.push("description");
  if (!when_to_use) missing.push("when_to_use");
  if (!example_title_pattern) missing.push("example_title_pattern");

  const rawAnchorTypes = raw.anchor_types;
  if (!Array.isArray(rawAnchorTypes) || rawAnchorTypes.length === 0) {
    missing.push("anchor_types");
  }

  const rawExpectedInputs = raw.expected_inputs;
  if (!Array.isArray(rawExpectedInputs) || rawExpectedInputs.length === 0) {
    missing.push("expected_inputs");
  }

  if (missing.length > 0) {
    throw new KindValidationError(name || "(unknown)", missing, filePath);
  }

  // Validate name pattern
  if (!KIND_NAME_RE.test(name)) {
    throw new KindValidationError(
      name,
      [`name must match ${KIND_NAME_RE} (snake_case, no hyphens)`],
      filePath,
    );
  }

  // Validate anchor_types values
  const anchor_types = rawAnchorTypes as string[];
  const invalidAnchors = anchor_types.filter((a) => !VALID_ANCHOR_TYPES.has(a));
  if (invalidAnchors.length > 0) {
    throw new KindValidationError(
      name,
      [`invalid anchor_types: ${invalidAnchors.join(", ")}`],
      filePath,
    );
  }

  return {
    name,
    description,
    when_to_use,
    anchor_types: anchor_types as AnchorTypeName[],
    expected_inputs: (rawExpectedInputs as string[]).map((s) => String(s)),
    example_title_pattern,
  };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

/** Resolve the built-in kinds directory relative to this module. */
function builtInKindsDir(): string {
  // Works both from source (src/ai/kinds.ts → src/ai/kinds/) and compiled
  // (dist/kinds.js → dist/kinds/ won't exist, but src is what ships).
  const thisFile = fileURLToPath(import.meta.url);
  return resolve(thisFile, "..", "kinds");
}

/** Resolve the XDG override directory. */
function xdgKindsDir(): string {
  const xdgHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(xdgHome, "engram", "kinds");
}

/**
 * Load all YAML files from a directory and parse them into KindEntry objects.
 * Returns an empty array if the directory does not exist.
 */
function loadKindsFromDir(dir: string): KindEntry[] {
  if (!existsSync(dir)) return [];

  const entries: KindEntry[] = [];
  let files: string[];

  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
  } catch {
    return [];
  }

  for (const file of files) {
    const filePath = join(dir, file);
    let text: string;
    try {
      text = readFileSync(filePath, "utf-8");
    } catch (err) {
      throw new Error(
        `Failed to read kind file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const raw = parseKindYaml(text);
    const entry = validateEntry(raw, filePath);
    entries.push(entry);
  }

  return entries;
}

/** Module-level cache. Reset in tests via the overrideDir parameter. */
let _cache: KindCatalog | null = null;

/**
 * Load and return the merged kind catalog.
 *
 * Built-in kinds are loaded first. XDG override files whose `name` matches a
 * built-in replace the built-in; unknown names are appended.
 *
 * @param overrideXdgDir - Optional path to use instead of the XDG directory.
 *   Intended for tests only.
 * @param useCache - Whether to return a cached result (default true). Pass
 *   false in tests to force a fresh load.
 */
export function loadKindCatalog(
  overrideXdgDir?: string,
  useCache = true,
): KindCatalog {
  if (useCache && _cache !== null && overrideXdgDir === undefined) {
    return _cache;
  }

  const builtIns = loadKindsFromDir(builtInKindsDir());
  const xdgDir = overrideXdgDir ?? xdgKindsDir();
  const overrides = loadKindsFromDir(xdgDir);

  // Merge: XDG overrides by name match; new names are appended.
  const catalog = new Map<string, KindEntry>();
  for (const entry of builtIns) {
    catalog.set(entry.name, entry);
  }
  for (const entry of overrides) {
    catalog.set(entry.name, entry); // replaces or appends
  }

  const result: KindCatalog = Array.from(catalog.values());

  if (useCache && overrideXdgDir === undefined) {
    _cache = result;
  }

  return result;
}
