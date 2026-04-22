/**
 * manifest.ts — parse and validate plugin manifest.json.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export const CURRENT_CONTRACT_VERSION = 1;
const ALLOWED_TRANSPORTS = ["js-module", "executable"] as const;

export type PluginTransport = (typeof ALLOWED_TRANSPORTS)[number];

export interface PluginCapabilities {
  supported_auth: string[];
  supports_cursor: boolean;
  scope_schema: { description: string; pattern: string };
}

export interface PluginVocabExtensions {
  entity_types?: string[];
  source_types?: { ingestion?: string[]; episode?: string[] };
  relation_types?: string[];
}

export interface PluginDocs {
  /** 2–4 sentence overview shown by `engram plugin info`. */
  summary?: string;
  /** What the user must do before first use (auth setup, credentials, etc.). */
  auth_setup?: string;
  /** 3–6 representative scope examples. */
  scope_examples?: Array<{ scope: string; description: string }>;
}

export interface PluginManifest {
  name: string;
  version: string;
  contract_version: number;
  transport: PluginTransport;
  entry: string;
  capabilities: PluginCapabilities;
  vocab_extensions?: PluginVocabExtensions;
  /** One-line description shown in `plugin list` output. */
  description?: string;
  /** Extended documentation surfaced by `plugin info` and at install time. */
  docs?: PluginDocs;
}

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

function isAllowedTransport(t: unknown): t is PluginTransport {
  return ALLOWED_TRANSPORTS.includes(t as PluginTransport);
}

/**
 * Reads and validates manifest.json from a plugin directory.
 * Throws ManifestValidationError on any constraint violation.
 */
export function loadManifest(pluginDir: string): PluginManifest {
  const manifestPath = path.join(pluginDir, "manifest.json");

  let raw: string;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    throw new ManifestValidationError(
      `Cannot read manifest.json in '${pluginDir}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}' is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}' must be a JSON object`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  for (const field of [
    "name",
    "version",
    "contract_version",
    "transport",
    "entry",
    "capabilities",
  ]) {
    if (!(field in obj)) {
      throw new ManifestValidationError(
        `manifest.json in '${pluginDir}' missing required field '${field}'`,
      );
    }
  }

  if (typeof obj.name !== "string" || !obj.name) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'name' must be a non-empty string`,
    );
  }
  if (typeof obj.version !== "string" || !obj.version) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'version' must be a non-empty string`,
    );
  }
  if (typeof obj.contract_version !== "number") {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'contract_version' must be a number`,
    );
  }

  const majorContractVersion = Math.floor(obj.contract_version);
  if (majorContractVersion !== CURRENT_CONTRACT_VERSION) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': contract_version major '${majorContractVersion}' does not match engram's supported version '${CURRENT_CONTRACT_VERSION}'`,
    );
  }

  if (!isAllowedTransport(obj.transport)) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'transport' must be one of [${ALLOWED_TRANSPORTS.join(", ")}], got '${obj.transport}'`,
    );
  }

  if (typeof obj.entry !== "string" || !obj.entry) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'entry' must be a non-empty string`,
    );
  }

  // Path traversal check: resolved entry must be inside pluginDir
  const resolvedEntry = path.resolve(pluginDir, obj.entry);
  const resolvedPlugin = path.resolve(pluginDir);
  if (
    !resolvedEntry.startsWith(resolvedPlugin + path.sep) &&
    resolvedEntry !== resolvedPlugin
  ) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'entry' path '${obj.entry}' is outside the plugin directory (path traversal rejected)`,
    );
  }

  const caps = obj.capabilities;
  if (typeof caps !== "object" || caps === null || Array.isArray(caps)) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'capabilities' must be an object`,
    );
  }
  const capsObj = caps as Record<string, unknown>;

  if (!Array.isArray(capsObj.supported_auth)) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'capabilities.supported_auth' must be an array`,
    );
  }
  if (typeof capsObj.supports_cursor !== "boolean") {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'capabilities.supports_cursor' must be a boolean`,
    );
  }
  if (
    typeof capsObj.scope_schema !== "object" ||
    capsObj.scope_schema === null
  ) {
    throw new ManifestValidationError(
      `manifest.json in '${pluginDir}': 'capabilities.scope_schema' must be an object`,
    );
  }

  return {
    name: obj.name as string,
    version: obj.version as string,
    contract_version: obj.contract_version as number,
    transport: obj.transport as PluginTransport,
    entry: obj.entry as string,
    capabilities: {
      supported_auth: (capsObj.supported_auth as unknown[]).map(String),
      supports_cursor: capsObj.supports_cursor as boolean,
      scope_schema: capsObj.scope_schema as {
        description: string;
        pattern: string;
      },
    },
    vocab_extensions:
      "vocab_extensions" in obj
        ? (obj.vocab_extensions as PluginVocabExtensions)
        : undefined,
    description:
      typeof obj.description === "string" ? obj.description : undefined,
    docs: (() => {
      if (
        typeof obj.docs !== "object" ||
        obj.docs === null ||
        Array.isArray(obj.docs)
      ) {
        return undefined;
      }
      const docsObj = obj.docs as Record<string, unknown>;
      if (
        "scope_examples" in docsObj &&
        !Array.isArray(docsObj.scope_examples)
      ) {
        throw new ManifestValidationError(
          `manifest.json in '${pluginDir}': 'docs.scope_examples' must be an array`,
        );
      }
      return docsObj as PluginDocs;
    })(),
  };
}
