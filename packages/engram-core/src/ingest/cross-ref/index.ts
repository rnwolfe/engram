export type { PluginReferencePattern, ReferencePattern } from "./patterns.js";
export { BUILT_IN_PATTERNS, compilePluginPattern } from "./patterns.js";
export type { ResolveResult } from "./resolver.js";
export { drainUnresolved, resolveReferences } from "./resolver.js";
export { ensureUnresolvedRefsTable } from "./schema.js";
