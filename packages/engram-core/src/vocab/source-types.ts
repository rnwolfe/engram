/**
 * source-types.ts — canonical source_type vocabulary for two distinct columns:
 *
 * - `ingestion_runs.source_type` identifies the ingestion pass (e.g. "git", "github").
 * - `episodes.source_type` identifies the episode kind (e.g. "git_commit", "github_pr").
 *
 * One ingestion pass can emit multiple episode kinds (INGESTION_TO_EPISODE_SOURCES).
 * Both columns are TEXT in SQLite; the registries enforce correctness at the type level.
 */

/** Values used in ingestion_runs.source_type — identifies the ingestion pass. */
export const INGESTION_SOURCE_TYPES = {
  GIT: "git",
  GERRIT: "gerrit",
  GITHUB: "github",
  SOURCE: "source",
  MARKDOWN: "markdown",
  TEXT: "text",
  /** Google Workspace ingestion (Docs, etc.). */
  GOOGLE_WORKSPACE: "google_workspace",
} as const;

export type IngestionSourceType =
  (typeof INGESTION_SOURCE_TYPES)[keyof typeof INGESTION_SOURCE_TYPES];

/** Values used in episodes.source_type — identifies the episode kind. */
export const EPISODE_SOURCE_TYPES = {
  GIT_COMMIT: "git_commit",
  GERRIT_CHANGE: "gerrit_change",
  GITHUB_PR: "github_pr",
  GITHUB_ISSUE: "github_issue",
  MANUAL: "manual",
  DOCUMENT: "document",
  SOURCE_FILE: "source",
  /** A Google Doc revision episode. */
  GOOGLE_DOC: "google_doc",
} as const;

export type EpisodeSourceType =
  (typeof EPISODE_SOURCE_TYPES)[keyof typeof EPISODE_SOURCE_TYPES];

/**
 * Maps each ingestion source type to the episode kinds it emits.
 * Machine-readable documentation of the source_type asymmetry.
 */
export const INGESTION_TO_EPISODE_SOURCES = {
  [INGESTION_SOURCE_TYPES.GIT]: [EPISODE_SOURCE_TYPES.GIT_COMMIT],
  [INGESTION_SOURCE_TYPES.GERRIT]: [EPISODE_SOURCE_TYPES.GERRIT_CHANGE],
  [INGESTION_SOURCE_TYPES.GITHUB]: [
    EPISODE_SOURCE_TYPES.GITHUB_PR,
    EPISODE_SOURCE_TYPES.GITHUB_ISSUE,
  ],
  [INGESTION_SOURCE_TYPES.SOURCE]: [EPISODE_SOURCE_TYPES.SOURCE_FILE],
  [INGESTION_SOURCE_TYPES.MARKDOWN]: [EPISODE_SOURCE_TYPES.DOCUMENT],
  [INGESTION_SOURCE_TYPES.TEXT]: [EPISODE_SOURCE_TYPES.MANUAL],
  [INGESTION_SOURCE_TYPES.GOOGLE_WORKSPACE]: [EPISODE_SOURCE_TYPES.GOOGLE_DOC],
} as const;
