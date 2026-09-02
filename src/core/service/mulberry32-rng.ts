import type { Rng, RngState } from "../model/rng";
import { hashSeed } from "./seed-hash";

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

  private readonly seed: number;
  private state: number;

  // ===========================================
  // Construction
  // ===========================================

  /**
   * Creates a generator from a numeric seed. Any finite number is
   * accepted and truncated to an unsigned 32-bit integer.
   */
  constructor(seed: number, state: number = seed) {
    this.seed = seed >>> 0;
    this.state = state >>> 0;
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
    return new Mulberry32Rng(snapshot.seed, snapshot.state);
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

  /** Returns a weighted pick; see `Rng.pickWeighted`. */
  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list");
    }
    const weights = items.map((item) => Math.max(0, weight(item)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    if (total <= 0) {
      throw new Error("pickWeighted requires at least one positive weight");
    }
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i]!;
      if (roll < 0) {
        return items[i] as T;
      }
    }
    // Floating point can leave roll at exactly 0 after the last item.
    return items[items.length - 1] as T;
  }

  /** Fisher–Yates shuffle of a copy. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = copy[i] as T;
      copy[i] = copy[j] as T;
      copy[j] = tmp;
    }
    return copy;
  }

  /**
   * Labelled forks hash (seed, label) and leave this generator untouched;
   * unlabelled forks seed the child from the next draw.
   */
  fork(label?: string): Rng {
    if (label !== undefined) {
      return new Mulberry32Rng(hashSeed(`${this.seed}:${label}`));
    }
    return new Mulberry32Rng(this.nextInt(0, TWO_POW_32 - 1));
  }

  /** Captures the seed and current state for serialization. */
  getState(): RngState {
    return { algorithm: ALGORITHM, seed: this.seed, state: this.state };
  }
}
