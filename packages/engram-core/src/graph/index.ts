/**
 * graph/index.ts — re-exports for the graph CRUD module.
 */

export type { Alias, AliasInput } from "./aliases.js";
export { addEntityAlias, resolveEntity } from "./aliases.js";
export type { Edge, EdgeInput, FindEdgesQuery } from "./edges.js";
export { addEdge, findEdges, getEdge } from "./edges.js";
export type {
  EmbeddingTargetType,
  FindSimilarOpts,
  SimilarResult,
  StoredEmbedding,
} from "./embeddings.js";
export { cosineSimilarity, findSimilar, storeEmbedding } from "./embeddings.js";
export type {
  Entity,
  EntityInput,
  EvidenceInput,
  FindEntitiesQuery,
} from "./entities.js";
export { addEntity, findEntities, getEntity } from "./entities.js";
export type { Episode, EpisodeInput } from "./episodes.js";
export { addEpisode, getEpisode } from "./episodes.js";
export {
  EdgeNotFoundError,
  EntityNotFoundError,
  EvidenceRequiredError,
} from "./errors.js";
export type { EvidenceLink } from "./evidence.js";
export { getEvidenceForEdge, getEvidenceForEntity } from "./evidence.js";
export type {
  AnchorType,
  GetProjectionResult,
  Projection,
  ProjectionEvidenceRow,
  ProjectionInput,
  ProjectionInputType,
  ProjectionOpts,
} from "./projections.js";
export {
  getProjection,
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
  project,
  supersedeProjection,
} from "./projections.js";
export type { ListProjectionsOpts } from "./projections-list.js";
export {
  computeBatchedStaleness,
  listActiveProjections,
  searchProjections,
} from "./projections-list.js";
