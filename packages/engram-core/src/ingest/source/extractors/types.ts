import type { EntityType, RelationType } from "../../../vocab/index.js";

/** A top-level symbol found in a source file. */
export interface ExtractedSymbol {
  name: string;
  kind:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "enum"
    | "const"
    | "default";
  exported: boolean;
  startByte: number;
  endByte: number;
}

/**
 * A domain-specific entity emitted by an extractor that the orchestrator
 * should upsert independently of the standard file/symbol/module hierarchy.
 */
export interface ExtractedEntity {
  canonicalName: string;
  /** Must be a value from the vocab registry — never an inline string literal. */
  entityType: EntityType;
}

/**
 * A reference to an entity within the context of the file being ingested.
 *
 * Resolution semantics:
 * - `{ kind: "file" }` — resolves to the ULID of the current file entity.
 * - `{ kind: "symbol"; name: string }` — resolves to the ULID of a symbol in
 *   this file by its bare name (i.e. `name` without the `relPath::` prefix).
 *   Throws if no matching symbol was extracted from this file.
 * - `{ kind: "canonical"; canonicalName: string; entityType: EntityType }` —
 *   looks up an entity by (canonicalName, entityType). If none exists, a new
 *   entity is upserted using the same evidence chain as the file's symbols.
 */
export type EntityRef =
  | { kind: "file" }
  | { kind: "symbol"; name: string }
  | { kind: "canonical"; canonicalName: string; entityType: EntityType };

/**
 * A domain-specific directed edge emitted by an extractor that the orchestrator
 * should materialize after the standard symbol/import passes.
 */
export interface ExtractedEdge {
  source: EntityRef;
  target: EntityRef;
  /** Must be a value from the vocab registry — never an inline string literal. */
  relationType: RelationType;
  edgeKind: "observed" | "inferred" | "asserted";
  fact: string;
}

/** The result of extracting symbols and imports from a single file. */
export interface ExtractedFile {
  symbols: ExtractedSymbol[];
  /** Raw import specifier strings. Format is language-specific. */
  rawImports: string[];
  /** Additional entities to upsert beyond the standard file/symbol hierarchy. */
  extraEntities?: ExtractedEntity[];
  /** Additional edges to materialize after the standard symbol and import passes. */
  extraEdges?: ExtractedEdge[];
}
