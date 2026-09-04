// ===========================================
// Registry
// ===========================================

/** Anything with a string id, the key every registry uses. */
export interface Identified {
  readonly id: string;
}

/**
 * Read-only lookup of data definitions by id. Registries are the
 * Open/Closed seam every catalogue in the game is built on: a new biome,
 * surface, prop, hook kind, squad type, part, deployable or event type is
 * a new entry in a data module, never an edit to the code that reads it.
 *
 * Introduced for map generation (ADR 0004 §7.4) and promoted here once
 * the roster and overworld catalogues turned out to be the same thing
 * (#108); it belongs beside `Result` and the id generator rather than in
 * any one domain.
 */
export interface Registry<T extends Identified> {
  /** Ids in registration order. */
  readonly ids: readonly string[];
  /** Definitions in registration order. */
  readonly values: readonly T[];

  /**
   * Returns the definition with the id. Throws, naming the registry, when
   * the id is unknown so a typo in data fails loudly.
   */
  get(id: string): T;

  /**
   * Returns the definition with the id, or `undefined`.
   */
  find(id: string): T | undefined;

  /**
   * Returns true when the id is registered.
   */
  has(id: string): boolean;
}
