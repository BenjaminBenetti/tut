import type { IdGenerator, IdGeneratorState } from "../model/id-generator";

// ===========================================
// SequentialIdGenerator
// ===========================================

/**
 * Deterministic id generator that counts per prefix. Ids look like
 * `"mech-3"`. Counters are plain data and round-trip through saves.
 */
export class SequentialIdGenerator implements IdGenerator {
  // ===========================================
  // Fields
  // ===========================================

  private readonly counters: Map<string, number>;

  // ===========================================
  // Construction
  // ===========================================

  /** Creates a generator, optionally continuing from a saved snapshot. */
  constructor(state?: IdGeneratorState) {
    this.counters = new Map(Object.entries(state?.counters ?? {}));
  }

  // ===========================================
  // IdGenerator
  // ===========================================

  /** Returns the next id for the prefix and advances its counter. */
  nextId(prefix: string): string {
    if (prefix.length === 0 || prefix.includes("-")) {
      throw new Error(
        `Invalid id prefix "${prefix}": must be non-empty and contain no "-"`,
      );
    }
    const next = this.counters.get(prefix) ?? 1;
    this.counters.set(prefix, next + 1);
    return `${prefix}-${next}`;
  }

  /** Captures the counters as plain data. */
  getState(): IdGeneratorState {
    return { counters: Object.fromEntries(this.counters) };
  }
}
