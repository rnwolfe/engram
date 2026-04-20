/**
 * plugins/index.ts — barrel export for the plugin loader module.
 */

export type { PluginDirectory, PluginSource } from "./discover.js";
export {
  bundledPluginsRoot,
  discoverPlugins,
  listBundledPlugins,
  projectPluginsRoot,
  userPluginsRoot,
  xdgDataHome,
} from "./discover.js";
export type {
  PluginCapabilities,
  PluginManifest,
  PluginTransport,
  PluginVocabExtensions,
} from "./manifest.js";
export {
  CURRENT_CONTRACT_VERSION,
  loadManifest,
  ManifestValidationError,
} from "./manifest.js";
export { loadExecutablePlugin } from "./transport/executable.js";
export {
  JsModuleTransportError,
  loadJsModulePlugin,
} from "./transport/js-module.js";
export { mergePluginVocab, VocabCollisionError } from "./vocab.js";
