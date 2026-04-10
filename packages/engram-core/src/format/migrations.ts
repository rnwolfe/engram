/**
 * migrations.ts — schema migration steps for the .engram format.
 *
 * Each migration function accepts a Database, applies the DDL for the new
 * version, and updates schema_version (stored as 'format_version' in metadata).
 */

import type { Database } from "bun:sqlite";
import {
  CREATE_PROJECTION_EVIDENCE,
  CREATE_PROJECTION_EVIDENCE_INDEXES,
  CREATE_PROJECTIONS,
  CREATE_PROJECTIONS_FTS,
  CREATE_PROJECTIONS_FTS_TRIGGERS,
  CREATE_PROJECTIONS_INDEXES,
  CREATE_RECONCILIATION_RUNS,
} from "./schema.js";

/**
 * Migrates a v0.1.0 database to v0.2.0.
 *
 * This migration is purely additive: it appends the projection-layer tables,
 * indexes, FTS virtual table, and triggers. No existing tables are altered and
 * no data is backfilled.
 *
 * DDL application order matches the spec (format-v0.2.md § DDL application order):
 *  1. CREATE TABLE projections
 *  2. Five projections indexes (including partial unique)
 *  3. CREATE TABLE projection_evidence
 *  4. idx_projection_evidence_target index
 *  5. CREATE TABLE reconciliation_runs
 *  6. CREATE VIRTUAL TABLE projections_fts
 *  7. CREATE TRIGGER projections_ai / ad / au
 *  8. UPDATE metadata schema_version to '0.2.0'
 */
export function migrate_0_1_0_to_0_2_0(db: Database): void {
  const steps = [
    CREATE_PROJECTIONS,
    CREATE_PROJECTIONS_INDEXES,
    CREATE_PROJECTION_EVIDENCE,
    CREATE_PROJECTION_EVIDENCE_INDEXES,
    CREATE_RECONCILIATION_RUNS,
    CREATE_PROJECTIONS_FTS,
    CREATE_PROJECTIONS_FTS_TRIGGERS,
  ];

  db.transaction(() => {
    for (const ddl of steps) {
      db.exec(ddl);
    }
    db.run("UPDATE metadata SET value = '0.2.0' WHERE key = 'format_version'");
  })();
}
