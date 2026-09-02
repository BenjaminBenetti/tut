// ===========================================
// Registry
// ===========================================

/** Anything with a string id, the key every registry uses. */
export interface Identified {
  readonly id: string;
}

/**
 * Read-only lookup of data definitions by id (ADR 0004 §7.4). Registries
 * are the Open/Closed seam: a new biome, surface, prop or hook kind is a
 * new entry, never an edit to a pass.
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
