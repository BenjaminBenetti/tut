import type { Rng, RngState } from "../model/rng";

// ===========================================
// Constants
// ===========================================

const ALGORITHM = "mulberry32";
const TWO_POW_32 = 4294967296;

// ===========================================
// Mulberry32Rng
// ===========================================

/**
 * Seeded generator using the mulberry32 algorithm: a single 32-bit word of
 * state, a full 2^32 period, and good statistical quality for game logic.
 * Not suitable for cryptography, which the game never needs.
 */
export class Mulberry32Rng implements Rng {
  // ===========================================
  // Fields
  // ===========================================

  private state: number;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Creates a generator from a numeric seed. Any finite number is
   * accepted and truncated to an unsigned 32-bit integer.
   */
  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /**
   * Restores a generator from a serialized snapshot produced by
   * `getState()`. Throws if the snapshot belongs to another algorithm.
   */
  static fromState(snapshot: RngState): Mulberry32Rng {
    if (snapshot.algorithm !== ALGORITHM) {
      throw new Error(
        `Cannot restore ${ALGORITHM} from state of algorithm "${snapshot.algorithm}"`,
      );
    }
    return new Mulberry32Rng(snapshot.state);
  }

  // ===========================================
  // Rng
  // ===========================================

  /** Returns the next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32;
  }

  /** Returns an integer in the inclusive range [min, max]. Throws if min > max. */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`nextInt bounds must be integers, got ${min}..${max}`);
    }
    if (min > max) {
      throw new Error(`nextInt requires min <= max, got ${min}..${max}`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Returns a uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list");
    }
    const index = this.nextInt(0, items.length - 1);
    return items[index] as T;
  }

  /** Returns true with the given probability; 0 is never true, 1 is always true. */
  chance(probability: number): boolean {
    if (probability <= 0) {
      return false;
    }
    if (probability >= 1) {
      return true;
    }
    return this.next() < probability;
  }

  /** Derives a new generator seeded from this stream, advancing it once. */
  fork(): Rng {
    return new Mulberry32Rng(this.nextInt(0, TWO_POW_32 - 1));
  }

  /** Captures the current state for serialization. */
  getState(): RngState {
    return { algorithm: ALGORITHM, state: this.state };
  }
}
