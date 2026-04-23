/**
 * sync/validate.ts — config validation for the sync orchestrator.
 *
 * Validates a raw JSON object against the SyncConfig schema.
 * Collects ALL errors before throwing, so the user can fix everything at once.
 */

import { SyncConfigValidationError } from "./errors.js";
import type { SyncConfig } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ALLOWED_AUTH_KINDS = [
  "none",
  "bearer",
  "basic",
  "service_account",
  "oauth2",
] as const;

export const ALLOWED_SOURCE_FIELDS = new Set([
  "name",
  "type",
  "scope",
  "path",
  "root",
  "auth",
]);

export const ALLOWED_AUTH_FIELDS: Record<string, Set<string>> = {
  none: new Set(["kind"]),
  bearer: new Set(["kind", "tokenEnv"]),
  basic: new Set(["kind", "usernameEnv", "secretEnv"]),
  service_account: new Set(["kind", "keyJsonEnv"]),
  oauth2: new Set(["kind", "tokenEnv", "scopesEnv"]),
};

/**
 * Adapter types that require a non-empty `scope` field.
 * Validation will emit an error if scope is missing for these.
 */
const SCOPE_REQUIRED_ADAPTERS = new Set([
  "github",
  "google_workspace",
  "gerrit",
]);

// ---------------------------------------------------------------------------
// Auth validation helper
// ---------------------------------------------------------------------------

export function validateAuthConfig(
  auth: unknown,
  fieldPrefix: string,
): Array<{ field: string; reason: string }> {
  const failures: Array<{ field: string; reason: string }> = [];

  if (typeof auth !== "object" || auth === null || Array.isArray(auth)) {
    failures.push({ field: fieldPrefix, reason: "must be an object" });
    return failures;
  }

  const authObj = auth as Record<string, unknown>;

  if (!("kind" in authObj)) {
    failures.push({ field: `${fieldPrefix}.kind`, reason: "required" });
    return failures;
  }

  const kind = authObj.kind;
  if (
    !ALLOWED_AUTH_KINDS.includes(kind as (typeof ALLOWED_AUTH_KINDS)[number])
  ) {
    failures.push({
      field: `${fieldPrefix}.kind`,
      reason: `must be one of [${ALLOWED_AUTH_KINDS.join(", ")}], got ${JSON.stringify(kind)}`,
    });
    return failures;
  }

  const kindStr = kind as string;
  const allowedFields = ALLOWED_AUTH_FIELDS[kindStr];
  if (allowedFields) {
    for (const key of Object.keys(authObj)) {
      if (!allowedFields.has(key)) {
        failures.push({
          field: `${fieldPrefix}.${key}`,
          reason: `unknown field for auth kind '${kindStr}' (allowed: ${Array.from(allowedFields).join(", ")})`,
        });
      }
    }
  }

  // Kind-specific required fields
  switch (kindStr) {
    case "bearer":
      if (typeof authObj.tokenEnv !== "string" || !authObj.tokenEnv) {
        failures.push({
          field: `${fieldPrefix}.tokenEnv`,
          reason:
            "required for bearer auth — name of the env var holding the token",
        });
      }
      break;
    case "basic":
      if (typeof authObj.usernameEnv !== "string" || !authObj.usernameEnv) {
        failures.push({
          field: `${fieldPrefix}.usernameEnv`,
          reason: "required for basic auth",
        });
      }
      if (typeof authObj.secretEnv !== "string" || !authObj.secretEnv) {
        failures.push({
          field: `${fieldPrefix}.secretEnv`,
          reason: "required for basic auth",
        });
      }
      break;
    case "service_account":
      if (typeof authObj.keyJsonEnv !== "string" || !authObj.keyJsonEnv) {
        failures.push({
          field: `${fieldPrefix}.keyJsonEnv`,
          reason: "required for service_account auth",
        });
      }
      break;
    case "oauth2":
      if (typeof authObj.tokenEnv !== "string" || !authObj.tokenEnv) {
        failures.push({
          field: `${fieldPrefix}.tokenEnv`,
          reason: "required for oauth2 auth",
        });
      }
      break;
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Top-level config validation
// ---------------------------------------------------------------------------

/**
 * Validate a raw JSON object against the SyncConfig schema.
 * Collects ALL errors before throwing, so the user can fix everything at once.
 *
 * Rules (fail-closed):
 * - `version: 1` required
 * - Every source: `name` (unique), `type` — no unknown fields
 * - Auth uses `SyncAuthConfig` union — no unknown fields per kind
 * - Known adapters that require scope (github, google_workspace, gerrit) must
 *   have a non-empty `scope` field
 */
export function validateSyncConfig(raw: unknown): SyncConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SyncConfigValidationError([
      { field: "(root)", reason: "must be a JSON object" },
    ]);
  }

  const obj = raw as Record<string, unknown>;
  const failures: Array<{ field: string; reason: string }> = [];

  // Check for unknown top-level fields
  const ALLOWED_TOP_FIELDS = new Set(["version", "sources"]);
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_TOP_FIELDS.has(key)) {
      failures.push({
        field: key,
        reason: `unknown top-level field (allowed: ${Array.from(ALLOWED_TOP_FIELDS).join(", ")})`,
      });
    }
  }

  // Validate version
  if (!("version" in obj)) {
    failures.push({ field: "version", reason: "required field missing" });
  } else if (obj.version !== 1) {
    failures.push({
      field: "version",
      reason: `must be 1 (got ${JSON.stringify(obj.version)}). If you have a newer config format, upgrade engram to the matching version.`,
    });
  }

  // Validate sources
  if (!("sources" in obj)) {
    failures.push({ field: "sources", reason: "required field missing" });
  } else if (!Array.isArray(obj.sources)) {
    failures.push({ field: "sources", reason: "must be an array" });
  } else {
    const seenNames = new Set<string>();

    for (let i = 0; i < obj.sources.length; i++) {
      const src = obj.sources[i];
      const prefix = `sources[${i}]`;

      if (typeof src !== "object" || src === null || Array.isArray(src)) {
        failures.push({ field: prefix, reason: "must be an object" });
        continue;
      }

      const srcObj = src as Record<string, unknown>;

      // Check for unknown source fields
      for (const key of Object.keys(srcObj)) {
        if (!ALLOWED_SOURCE_FIELDS.has(key)) {
          failures.push({
            field: `${prefix}.${key}`,
            reason: `unknown field (allowed: ${Array.from(ALLOWED_SOURCE_FIELDS).join(", ")})`,
          });
        }
      }

      // name
      if (!("name" in srcObj)) {
        failures.push({ field: `${prefix}.name`, reason: "required" });
      } else if (typeof srcObj.name !== "string" || !srcObj.name) {
        failures.push({
          field: `${prefix}.name`,
          reason: "must be a non-empty string",
        });
      } else if (seenNames.has(srcObj.name)) {
        failures.push({
          field: `${prefix}.name`,
          reason: `duplicate source name '${srcObj.name}' — names must be unique`,
        });
      } else {
        seenNames.add(srcObj.name as string);
      }

      // type
      let srcType: string | undefined;
      if (!("type" in srcObj)) {
        failures.push({ field: `${prefix}.type`, reason: "required" });
      } else if (typeof srcObj.type !== "string" || !srcObj.type) {
        failures.push({
          field: `${prefix}.type`,
          reason: "must be a non-empty string",
        });
      } else {
        srcType = srcObj.type;
      }

      // scope (optional string)
      if ("scope" in srcObj && typeof srcObj.scope !== "string") {
        failures.push({ field: `${prefix}.scope`, reason: "must be a string" });
      }

      // N2: scope required for known adapters that need it
      if (
        srcType !== undefined &&
        SCOPE_REQUIRED_ADAPTERS.has(srcType) &&
        (!("scope" in srcObj) ||
          !srcObj.scope ||
          typeof srcObj.scope !== "string")
      ) {
        failures.push({
          field: `${prefix}.scope`,
          reason: `required for '${srcType}' adapter (e.g. 'owner/repo' for github, 'domain.com' for google_workspace)`,
        });
      }

      // path (optional string)
      if ("path" in srcObj && typeof srcObj.path !== "string") {
        failures.push({ field: `${prefix}.path`, reason: "must be a string" });
      }

      // root (optional string)
      if ("root" in srcObj && typeof srcObj.root !== "string") {
        failures.push({ field: `${prefix}.root`, reason: "must be a string" });
      }

      // auth (optional)
      if ("auth" in srcObj) {
        const authFailures = validateAuthConfig(srcObj.auth, `${prefix}.auth`);
        failures.push(...authFailures);
      }
    }
  }

  if (failures.length > 0) {
    throw new SyncConfigValidationError(failures);
  }

  return obj as unknown as SyncConfig;
}
