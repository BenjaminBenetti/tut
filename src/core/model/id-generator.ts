/**
 * Serializable snapshot of an id generator, stored with the game state so
 * ids stay unique across save and load.
 */
export interface IdGeneratorState {
  /** Next counter value per prefix. */
  readonly counters: Readonly<Record<string, number>>;
}

/**
 * Produces unique, deterministic entity ids. Simulation never generates
 * ids from time or randomness; a save/load round trip must continue the
 * same sequence.
 */
export interface IdGenerator {
  /** Returns the next id for the given prefix, e.g. `nextId("city")` → `"city-7"`. */
  nextId(prefix: string): string;

  /** Captures the current counters for serialization. */
  getState(): IdGeneratorState;
}
