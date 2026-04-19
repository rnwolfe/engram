/**
 * DDL SQL constants for the .engram file format (SQLite schema).
 * Schema version: 0.2.0
 */

export const CREATE_METADATA = `
CREATE TABLE metadata (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const CREATE_ENTITIES = `
CREATE TABLE entities (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  canonical_name TEXT NOT NULL,
  entity_type    TEXT NOT NULL,
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'active',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  owner_id       TEXT
);
`;

export const CREATE_ENTITIES_INDEXES = `
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_name ON entities(canonical_name);
`;

export const CREATE_ENTITY_ALIASES = `
CREATE TABLE entity_aliases (
  id          TEXT PRIMARY KEY,
  entity_id   TEXT NOT NULL REFERENCES entities(id),
  alias       TEXT NOT NULL,
  valid_from  TEXT,
  valid_until TEXT,
  episode_id  TEXT REFERENCES episodes(id),
  created_at  TEXT NOT NULL
);
`;

export const CREATE_ENTITY_ALIASES_INDEXES = `
CREATE INDEX idx_aliases_entity ON entity_aliases(entity_id);
CREATE INDEX idx_aliases_name ON entity_aliases(alias);
`;

export const CREATE_EDGES = `
CREATE TABLE edges (
  _rowid         INTEGER PRIMARY KEY,
  id             TEXT NOT NULL UNIQUE,
  source_id      TEXT NOT NULL REFERENCES entities(id),
  target_id      TEXT NOT NULL REFERENCES entities(id),
  relation_type  TEXT NOT NULL,
  edge_kind      TEXT NOT NULL,
  fact           TEXT NOT NULL,
  weight         REAL DEFAULT 1.0,
  valid_from     TEXT,
  valid_until    TEXT,
  created_at     TEXT NOT NULL,
  invalidated_at TEXT,
  superseded_by  TEXT REFERENCES edges(id),
  confidence     REAL DEFAULT 1.0,
  owner_id       TEXT
);
`;

export const CREATE_EDGES_INDEXES = `
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(relation_type);
CREATE INDEX idx_edges_kind ON edges(edge_kind);
CREATE INDEX idx_edges_valid ON edges(valid_from, valid_until);
CREATE INDEX idx_edges_active ON edges(invalidated_at) WHERE invalidated_at IS NULL;
`;

export const CREATE_EPISODES = `
CREATE TABLE episodes (
  _rowid            INTEGER PRIMARY KEY,
  id                TEXT NOT NULL UNIQUE,
  source_type       TEXT NOT NULL,
  source_ref        TEXT,
  content           TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  actor             TEXT,
  status            TEXT NOT NULL DEFAULT 'active',
  timestamp         TEXT NOT NULL,
  ingested_at       TEXT NOT NULL,
  owner_id          TEXT,
  extractor_version TEXT NOT NULL,
  metadata          TEXT
);
`;

export const CREATE_EPISODES_INDEXES = `
CREATE UNIQUE INDEX idx_episodes_identity ON episodes(source_type, source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX idx_episodes_source ON episodes(source_type);
CREATE INDEX idx_episodes_time ON episodes(timestamp);
CREATE INDEX idx_episodes_hash ON episodes(content_hash);
`;

export const CREATE_ENTITY_EVIDENCE = `
CREATE TABLE entity_evidence (
  entity_id  TEXT NOT NULL REFERENCES entities(id),
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  extractor  TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (entity_id, episode_id, extractor)
);
`;

export const CREATE_EDGE_EVIDENCE = `
CREATE TABLE edge_evidence (
  edge_id    TEXT NOT NULL REFERENCES edges(id),
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  extractor  TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (edge_id, episode_id, extractor)
);
`;

export const CREATE_EMBEDDINGS = `
CREATE TABLE embeddings (
  id          TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  model       TEXT NOT NULL,
  dimensions  INTEGER NOT NULL,
  vector      BLOB NOT NULL,
  source_text TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(target_type, target_id, model)
);
`;

export const CREATE_EMBEDDINGS_INDEXES = `
CREATE INDEX idx_embeddings_target ON embeddings(target_type, target_id);
`;

export const CREATE_INGESTION_RUNS = `
CREATE TABLE ingestion_runs (
  id                TEXT PRIMARY KEY,
  source_type       TEXT NOT NULL,
  source_scope      TEXT NOT NULL,
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  cursor            TEXT,
  extractor_version TEXT NOT NULL,
  episodes_created  INTEGER DEFAULT 0,
  entities_created  INTEGER DEFAULT 0,
  edges_created     INTEGER DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'running',
  error             TEXT
);
`;

export const CREATE_INGESTION_RUNS_INDEXES = `
CREATE INDEX idx_runs_scope ON ingestion_runs(source_type, source_scope);
`;

export const CREATE_FTS_TABLES = `
CREATE VIRTUAL TABLE entities_fts USING fts5(
  canonical_name, summary,
  content=entities, content_rowid=_rowid
);
CREATE VIRTUAL TABLE edges_fts USING fts5(
  fact,
  content=edges, content_rowid=_rowid
);
CREATE VIRTUAL TABLE episodes_fts USING fts5(
  content,
  content=episodes, content_rowid=_rowid
);
`;

export const CREATE_FTS_TRIGGERS = `
CREATE TRIGGER entities_ai AFTER INSERT ON entities BEGIN
  INSERT INTO entities_fts(rowid, canonical_name, summary) VALUES (new._rowid, new.canonical_name, new.summary);
END;
CREATE TRIGGER entities_ad AFTER DELETE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_name, summary) VALUES ('delete', old._rowid, old.canonical_name, old.summary);
END;
CREATE TRIGGER entities_au AFTER UPDATE ON entities BEGIN
  INSERT INTO entities_fts(entities_fts, rowid, canonical_name, summary) VALUES ('delete', old._rowid, old.canonical_name, old.summary);
  INSERT INTO entities_fts(rowid, canonical_name, summary) VALUES (new._rowid, new.canonical_name, new.summary);
END;
CREATE TRIGGER edges_ai AFTER INSERT ON edges BEGIN
  INSERT INTO edges_fts(rowid, fact) VALUES (new._rowid, new.fact);
END;
CREATE TRIGGER edges_ad AFTER DELETE ON edges BEGIN
  INSERT INTO edges_fts(edges_fts, rowid, fact) VALUES ('delete', old._rowid, old.fact);
END;
CREATE TRIGGER edges_au AFTER UPDATE ON edges BEGIN
  INSERT INTO edges_fts(edges_fts, rowid, fact) VALUES ('delete', old._rowid, old.fact);
  INSERT INTO edges_fts(rowid, fact) VALUES (new._rowid, new.fact);
END;
CREATE TRIGGER episodes_ai AFTER INSERT ON episodes BEGIN
  INSERT INTO episodes_fts(rowid, content) VALUES (new._rowid, new.content);
END;
CREATE TRIGGER episodes_ad AFTER DELETE ON episodes BEGIN
  INSERT INTO episodes_fts(episodes_fts, rowid, content) VALUES ('delete', old._rowid, old.content);
END;
CREATE TRIGGER episodes_au AFTER UPDATE ON episodes BEGIN
  INSERT INTO episodes_fts(episodes_fts, rowid, content) VALUES ('delete', old._rowid, old.content);
  INSERT INTO episodes_fts(rowid, content) VALUES (new._rowid, new.content);
END;
`;

// ─── v0.2 additions: projection layer ────────────────────────────────────────

export const CREATE_PROJECTIONS = `
CREATE TABLE projections (
  _rowid             INTEGER PRIMARY KEY,
  id                 TEXT NOT NULL UNIQUE,
  kind               TEXT NOT NULL,
  anchor_type        TEXT NOT NULL,
  anchor_id          TEXT,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  body_format        TEXT NOT NULL DEFAULT 'markdown',
  model              TEXT NOT NULL,
  prompt_template_id TEXT,
  prompt_hash        TEXT,
  input_fingerprint  TEXT NOT NULL,
  confidence         REAL NOT NULL DEFAULT 1.0,
  valid_from         TEXT NOT NULL,
  valid_until        TEXT,
  last_assessed_at   TEXT,
  invalidated_at     TEXT,
  superseded_by      TEXT REFERENCES projections(id),
  created_at         TEXT NOT NULL,
  owner_id           TEXT
);
`;

export const CREATE_PROJECTIONS_INDEXES = `
CREATE INDEX idx_projections_anchor ON projections(anchor_type, anchor_id);
CREATE INDEX idx_projections_kind   ON projections(kind);
CREATE INDEX idx_projections_valid  ON projections(valid_from, valid_until);
CREATE INDEX idx_projections_active ON projections(invalidated_at) WHERE invalidated_at IS NULL;
CREATE UNIQUE INDEX idx_projections_active_unique
  ON projections(anchor_type, anchor_id, kind)
  WHERE invalidated_at IS NULL;
`;

export const CREATE_PROJECTION_EVIDENCE = `
CREATE TABLE projection_evidence (
  projection_id TEXT NOT NULL REFERENCES projections(id),
  target_type   TEXT NOT NULL,
  target_id     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'input',
  content_hash  TEXT,
  PRIMARY KEY (projection_id, target_type, target_id, role)
);
`;

export const CREATE_PROJECTION_EVIDENCE_INDEXES = `
CREATE INDEX idx_projection_evidence_target ON projection_evidence(target_type, target_id);
`;

export const CREATE_RECONCILIATION_RUNS = `
CREATE TABLE reconciliation_runs (
  id                     TEXT PRIMARY KEY,
  started_at             TEXT NOT NULL,
  completed_at           TEXT,
  scope                  TEXT,
  phases                 TEXT NOT NULL DEFAULT 'assess,discover',
  projections_checked    INTEGER DEFAULT 0,
  projections_refreshed  INTEGER DEFAULT 0,
  projections_superseded INTEGER DEFAULT 0,
  projections_discovered INTEGER DEFAULT 0,
  dry_run                INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'running',
  error                  TEXT
);
`;

export const CREATE_PROJECTIONS_FTS = `
CREATE VIRTUAL TABLE projections_fts USING fts5(
  title, body,
  content=projections, content_rowid=_rowid
);
`;

export const CREATE_PROJECTIONS_FTS_TRIGGERS = `
CREATE TRIGGER projections_ai AFTER INSERT ON projections BEGIN
  INSERT INTO projections_fts(rowid, title, body) VALUES (new._rowid, new.title, new.body);
END;
CREATE TRIGGER projections_ad AFTER DELETE ON projections BEGIN
  INSERT INTO projections_fts(projections_fts, rowid, title, body) VALUES ('delete', old._rowid, old.title, old.body);
END;
CREATE TRIGGER projections_au AFTER UPDATE ON projections BEGIN
  INSERT INTO projections_fts(projections_fts, rowid, title, body) VALUES ('delete', old._rowid, old.title, old.body);
  INSERT INTO projections_fts(rowid, title, body) VALUES (new._rowid, new.title, new.body);
END;
`;

// ─── Additive DDL ────────────────────────────────────────────────────────────
// These use IF NOT EXISTS so they are safe to run against both new and existing
// databases. Applied by both createGraph (via SCHEMA_DDL) and openGraph.

export const CREATE_UNRESOLVED_REFS = `
CREATE TABLE IF NOT EXISTS unresolved_refs (
  id                 TEXT PRIMARY KEY,
  source_episode_id  TEXT NOT NULL REFERENCES episodes(id),
  target_source_type TEXT NOT NULL,
  target_ref         TEXT NOT NULL,
  detected_at        TEXT NOT NULL,
  resolved_at        TEXT
);
`;

export const CREATE_UNRESOLVED_REFS_INDEX = `
CREATE INDEX IF NOT EXISTS idx_unresolved_refs_target
  ON unresolved_refs(target_source_type, target_ref)
  WHERE resolved_at IS NULL;
`;

/** DDL that is safe to apply on every open (idempotent IF NOT EXISTS). */
export const ADDITIVE_DDL: string[] = [
  CREATE_UNRESOLVED_REFS,
  CREATE_UNRESOLVED_REFS_INDEX,
];

/**
 * All DDL statements in the order they must be applied.
 * Tables with foreign key dependencies come after their referenced tables.
 */
export const SCHEMA_DDL: string[] = [
  CREATE_METADATA,
  CREATE_ENTITIES,
  CREATE_ENTITIES_INDEXES,
  // episodes must come before entity_aliases (which references episodes)
  CREATE_EPISODES,
  CREATE_EPISODES_INDEXES,
  CREATE_ENTITY_ALIASES,
  CREATE_ENTITY_ALIASES_INDEXES,
  CREATE_EDGES,
  CREATE_EDGES_INDEXES,
  CREATE_ENTITY_EVIDENCE,
  CREATE_EDGE_EVIDENCE,
  CREATE_EMBEDDINGS,
  CREATE_EMBEDDINGS_INDEXES,
  CREATE_INGESTION_RUNS,
  CREATE_INGESTION_RUNS_INDEXES,
  CREATE_FTS_TABLES,
  CREATE_FTS_TRIGGERS,
  // v0.2: projection layer
  CREATE_PROJECTIONS,
  CREATE_PROJECTIONS_INDEXES,
  CREATE_PROJECTION_EVIDENCE,
  CREATE_PROJECTION_EVIDENCE_INDEXES,
  CREATE_RECONCILIATION_RUNS,
  CREATE_PROJECTIONS_FTS,
  CREATE_PROJECTIONS_FTS_TRIGGERS,
  // Additive (IF NOT EXISTS — safe to re-run)
  ...ADDITIVE_DDL,
];
