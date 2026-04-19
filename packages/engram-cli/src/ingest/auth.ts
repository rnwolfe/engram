/**
 * auth.ts — Build an AuthCredential from CLI flags and environment variables.
 *
 * Given an adapter's `supportedAuth` set and the parsed CLI option object,
 * determines which auth kind to use and constructs the appropriate credential.
 *
 * Priority:
 *   1. Match explicit flags against the adapter's supported kinds.
 *   2. Fall back to env vars when flags are absent.
 *   3. If the adapter supports `none` and no credential flags/env are present,
 *      use `{ kind: 'none' }`.
 *   4. If nothing matches, throw with a descriptive error listing supported kinds.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AuthCredential } from "engram-core";

export interface AuthFlags {
  /** --token <t> */
  token?: string;
  /** --username <u> */
  username?: string;
  /** --password <p> */
  password?: string;
  /** --service-account <path> */
  serviceAccount?: string;
  /** --oauth-token <t> */
  oauthToken?: string;
  /** --oauth-scopes <csv> */
  oauthScopes?: string;
}

/**
 * Build an AuthCredential from CLI flags and environment variables.
 *
 * @param flags - Parsed CLI option values
 * @param adapterName - Adapter name used for env-var prefix (uppercased)
 * @param supportedAuth - Auth kinds declared by the adapter
 * @returns AuthCredential appropriate for the adapter
 * @throws Error when no supported auth kind can be satisfied
 */
export function buildAuthCredential(
  flags: AuthFlags,
  adapterName: string,
  supportedAuth: AuthCredential["kind"][],
): AuthCredential {
  const prefix = adapterName.toUpperCase();

  // --- bearer ---
  if (supportedAuth.includes("bearer")) {
    const token = flags.token ?? process.env[`${prefix}_TOKEN`];
    if (token) {
      return { kind: "bearer", token };
    }
  }

  // --- oauth2 ---
  if (supportedAuth.includes("oauth2")) {
    const oauthToken = flags.oauthToken ?? process.env[`${prefix}_OAUTH_TOKEN`];
    const rawScopes =
      flags.oauthScopes ?? process.env[`${prefix}_OAUTH_SCOPES`];
    if (oauthToken) {
      const scopes = rawScopes ? rawScopes.split(",").map((s) => s.trim()) : [];
      return { kind: "oauth2", token: oauthToken, scopes };
    }
  }

  // --- basic ---
  if (supportedAuth.includes("basic")) {
    const username = flags.username ?? process.env[`${prefix}_USERNAME`];
    const secret = flags.password ?? process.env[`${prefix}_PASSWORD`];
    if (username && secret) {
      return { kind: "basic", username, secret };
    }
  }

  // --- service_account ---
  if (supportedAuth.includes("service_account")) {
    const saPath =
      flags.serviceAccount ?? process.env[`${prefix}_SERVICE_ACCOUNT_JSON`];
    if (saPath) {
      const resolvedPath = path.resolve(saPath);
      if (!resolvedPath.endsWith(".json")) {
        throw new Error(
          `service account file must be a .json file: ${resolvedPath}`,
        );
      }
      let keyJson: string;
      try {
        keyJson = fs.readFileSync(resolvedPath, "utf8");
      } catch (err) {
        throw new Error(
          `Failed to read service account file '${resolvedPath}': ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return { kind: "service_account", keyJson };
    }
  }

  // --- none (fallback when adapter supports it and no other creds provided) ---
  if (supportedAuth.includes("none")) {
    return { kind: "none" };
  }

  // Nothing matched — tell the user what the adapter actually supports
  throw new Error(
    `adapter '${adapterName}' supports auth: ${supportedAuth.join(", ")}. ` +
      `Provide matching flags or env vars.`,
  );
}
