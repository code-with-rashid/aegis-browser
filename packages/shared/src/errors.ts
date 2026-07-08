/**
 * Base class for every typed error in Aegis. Domain packages extend this with a
 * discriminated `code` union (e.g. `StorageError`, `PolicyError`) so callers can
 * exhaustively `switch` on failure modes instead of pattern-matching on messages.
 */
export abstract class AegisError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}
