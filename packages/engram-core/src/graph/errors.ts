/**
 * errors.ts — typed error classes for graph CRUD operations.
 */

export class EvidenceRequiredError extends Error {
  constructor(operation: string) {
    super(
      `${operation}: evidence is required — every entity and edge must have at least one evidence link`,
    );
    this.name = "EvidenceRequiredError";
  }
}

export class EntityNotFoundError extends Error {
  constructor(id: string) {
    super(`entity not found: ${id}`);
    this.name = "EntityNotFoundError";
  }
}

export class EdgeNotFoundError extends Error {
  constructor(id: string) {
    super(`edge not found: ${id}`);
    this.name = "EdgeNotFoundError";
  }
}
