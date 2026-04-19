/**
 * engram-core — Temporal knowledge graph engine for developer memory.
 *
 * Public API surface. All consumer-facing types and functions are re-exported from here.
 */

export { Budget } from "./ai/budget.js";
export type {
  AIConfig,
  AIProvider,
  EntityHint,
  ReachabilityResult,
  ReindexProgress,
} from "./ai/index.js";
export {
  checkGoogle,
  checkOllama,
  checkOpenAI,
  countEmbeddings,
  createGenerator,
  createProvider,
  GeminiGenerator,
  GeminiProvider,
  generateEntityEmbeddings,
  generateEpisodeEmbeddings,
  NullProvider,
  OllamaProvider,
  OpenAIGenerator,
  reindexEmbeddings,
} from "./ai/index.js";
export type { AnchorTypeName, KindCatalog, KindEntry } from "./ai/kinds.js";
export {
  KindValidationError,
  loadKindCatalog,
} from "./ai/kinds.js";
export type {
  ActiveProjectionSummary,
  AssessVerdict,
  ProjectionGenerator,
  ProjectionProposal,
  ResolvedInput,
  SubstrateDelta,
  SubstrateDeltaItem,
} from "./ai/projection-generator.js";
export {
  AnthropicGenerator,
  NullGenerator,
} from "./ai/projection-generator.js";
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
  resolveDbPath,
  SCHEMA_DDL,
  verifyGraph,
} from "./format/index.js";
export {
  ENGINE_VERSION,
  FORMAT_VERSION,
  MIN_READABLE_VERSION,
  MIN_WRITABLE_VERSION,
} from "./format/version.js";
export type {
  Alias,
  AliasInput,
  AnchorType,
  Edge,
  EdgeInput,
  EmbeddingModelConfig,
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
  GetProjectionResult,
  ListProjectionsOpts,
  Projection,
  ProjectionEvidenceRow,
  ProjectionInput,
  ProjectionInputType,
  ProjectionOpts,
  ReconcileOpts,
  ReconcileProgressEvent,
  ReconciliationRunResult,
  SimilarResult,
  StoredEmbedding,
} from "./graph/index.js";
export {
  addEdge,
  addEntity,
  addEntityAlias,
  addEpisode,
  assertEmbeddingModelForWrite,
  checkEmbeddingModelForRead,
  computeBatchedStaleness,
  cosineSimilarity,
  currentInputState,
  EdgeNotFoundError,
  EmbeddingModelMismatchError,
  EntityNotFoundError,
  EvidenceRequiredError,
  findEdges,
  findEntities,
  findSimilar,
  getEdge,
  getEmbeddingModel,
  getEntity,
  getEpisode,
  getEvidenceForEdge,
  getEvidenceForEntity,
  getProjection,
  listActiveProjections,
  ProjectionCycleError,
  ProjectionFrontmatterError,
  ProjectionInputMissingError,
  project,
  reconcile,
  resolveEntity,
  searchProjections,
  setEmbeddingModel,
  softRefresh,
  storeEmbedding,
  supersedeProjection,
} from "./graph/index.js";
export type {
  EnrichmentAdapter,
  EnrichOpts,
  EnrichProgress,
} from "./ingest/adapter.js";
export { EnrichmentAdapterError } from "./ingest/adapter.js";
export { GerritAdapter } from "./ingest/adapters/gerrit.js";
export { GitHubAdapter, GitHubAuthError } from "./ingest/adapters/github.js";
export type {
  PluginReferencePattern,
  ReferencePattern,
  ResolveResult,
} from "./ingest/cross-ref/index.js";
export {
  BUILT_IN_PATTERNS,
  compilePluginPattern,
  drainUnresolved,
  resolveReferences,
} from "./ingest/cross-ref/index.js";
export type { GitIngestOpts, IngestResult } from "./ingest/git.js";
export { ingestGitRepo } from "./ingest/git.js";
export type { MarkdownIngestOpts } from "./ingest/markdown.js";
export { ingestMarkdown } from "./ingest/markdown.js";
export type {
  ProgressEvent as SourceProgressEvent,
  SourceIngestOptions,
  SourceIngestResult,
} from "./ingest/source/index.js";
export { ingestSource } from "./ingest/source/index.js";
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
export type { RelationType } from "./vocab/relation-types.js";
export { RELATION_TYPES } from "./vocab/relation-types.js";
