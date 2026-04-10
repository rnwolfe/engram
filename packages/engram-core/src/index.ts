/**
 * engram-core — Temporal knowledge graph engine for developer memory.
 *
 * Public API surface. All consumer-facing types and functions are re-exported from here.
 */

export {
  ENGINE_VERSION,
  FORMAT_VERSION,
  MIN_READABLE_VERSION,
  MIN_WRITABLE_VERSION,
} from "./format/version.js";

export type { AIConfig, AIProvider, EntityHint } from "./ai/index.js";
export {
  createProvider,
  GeminiProvider,
  NullProvider,
  OllamaProvider,
} from "./ai/index.js";
export type {
  CreateOpts,
  EngramGraph,
  VerifyResult,
  Violation,
  ViolationSeverity,
} from "./format/index.js";
export {
  closeGraph,
  createGraph,
  EngramFormatError,
  migrate_0_1_0_to_0_2_0,
  openGraph,
  SCHEMA_DDL,
  verifyGraph,
} from "./format/index.js";
export type {
  Alias,
  AliasInput,
  Edge,
  EdgeInput,
  EmbeddingTargetType,
  Entity,
  EntityInput,
  Episode,
  EpisodeInput,
  EvidenceInput,
  EvidenceLink,
  FindEdgesQuery,
  FindEntitiesQuery,
  FindSimilarOpts,
  SimilarResult,
  StoredEmbedding,
} from "./graph/index.js";
export {
  addEdge,
  addEntity,
  addEntityAlias,
  addEpisode,
  cosineSimilarity,
  EdgeNotFoundError,
  EntityNotFoundError,
  EvidenceRequiredError,
  findEdges,
  findEntities,
  findSimilar,
  getEdge,
  getEntity,
  getEpisode,
  getEvidenceForEdge,
  getEvidenceForEntity,
  resolveEntity,
  storeEmbedding,
} from "./graph/index.js";
export type { EnrichmentAdapter, EnrichOpts } from "./ingest/adapter.js";
export { GitHubAdapter } from "./ingest/adapters/github.js";
export type { GitIngestOpts, IngestResult } from "./ingest/git.js";
export { ingestGitRepo } from "./ingest/git.js";
export type { MarkdownIngestOpts } from "./ingest/markdown.js";
export { ingestMarkdown } from "./ingest/markdown.js";
export type { TextIngestOpts } from "./ingest/text.js";
export { ingestText } from "./ingest/text.js";
export type {
  DecayCategory,
  DecayItem,
  DecayOpts,
  DecayReport,
  DecaySeverity,
  GraphSearchOpts,
  OwnershipReport,
  OwnershipReportOpts,
  OwnershipRiskEntry,
  OwnershipRiskLevel,
  PathResult,
  ScoreComponents,
  SearchOpts,
  SearchResult,
  SubGraph,
  TraversalOpts,
  TraversedEntity,
} from "./retrieval/index.js";
export {
  getDecayReport,
  getNeighbors,
  getOwnershipReport,
  getPath,
  graphSearch,
  search,
} from "./retrieval/index.js";
export type { TemporalSnapshot } from "./temporal/index.js";
export {
  checkActiveEdgeConflict,
  getFactHistory,
  getSnapshot,
  supersedeEdge,
} from "./temporal/index.js";
