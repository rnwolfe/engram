/**
 * js-module.ts — in-process transport: dynamically imports the plugin entry module.
 */

import * as path from "node:path";
import type { EnrichmentAdapter } from "../../ingest/adapter.js";
import type { PluginManifest } from "../manifest.js";

export class JsModuleTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JsModuleTransportError";
  }
}

/**
 * Loads a js-module plugin by dynamically importing its entry file.
 * Validates that the default export has the required EnrichmentAdapter shape.
 */
export async function loadJsModulePlugin(
  pluginDir: string,
  manifest: PluginManifest,
): Promise<EnrichmentAdapter> {
  const entryPath = path.join(pluginDir, manifest.entry);

  let mod: unknown;
  try {
    mod = await import(entryPath);
  } catch (err) {
    throw new JsModuleTransportError(
      `Failed to import plugin '${manifest.name}' from '${entryPath}': ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const exported =
    mod != null && typeof mod === "object" && "default" in (mod as object)
      ? (mod as Record<string, unknown>).default
      : mod;

  if (typeof exported !== "object" || exported === null) {
    throw new JsModuleTransportError(
      `Plugin '${manifest.name}': default export must be an object`,
    );
  }

  const obj = exported as Record<string, unknown>;

  for (const field of ["enrich", "supportedAuth", "scopeSchema"]) {
    if (!(field in obj)) {
      throw new JsModuleTransportError(
        `Plugin '${manifest.name}': default export missing required field '${field}'`,
      );
    }
  }

  if (typeof obj.enrich !== "function") {
    throw new JsModuleTransportError(
      `Plugin '${manifest.name}': 'enrich' must be a function`,
    );
  }

  // Return an EnrichmentAdapter-shaped object wrapping the plugin export
  const adapter: EnrichmentAdapter = {
    name: manifest.name,
    kind: "enrichment",
    supportsAuth: Array.isArray(obj.supportedAuth)
      ? (obj.supportedAuth as string[])
      : [],
    supportsCursor: manifest.capabilities.supports_cursor,
    enrich: (graph, opts) =>
      (
        obj.enrich as (
          g: unknown,
          o: unknown,
        ) => ReturnType<EnrichmentAdapter["enrich"]>
      )(graph, opts),
  };

  return adapter;
}
