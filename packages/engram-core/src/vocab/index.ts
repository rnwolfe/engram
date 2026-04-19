/**
 * vocab/index.ts — barrel exports for the vocabulary registry module.
 *
 * All ingestion adapters and graph code should import type values from here
 * rather than inlining string literals for entity_type, source_type, or relation_type.
 */

export type { EntityType } from "./entity-types.js";
export { ENTITY_TYPES } from "./entity-types.js";
export type { RelationType } from "./relation-types.js";
export { RELATION_TYPES } from "./relation-types.js";
export type {
  EpisodeSourceType,
  IngestionSourceType,
} from "./source-types.js";
export {
  EPISODE_SOURCE_TYPES,
  INGESTION_SOURCE_TYPES,
  INGESTION_TO_EPISODE_SOURCES,
} from "./source-types.js";
