/**
 * Serializable snapshot of a random number generator. Saving a game
 * stores this alongside the rest of the state so a reload continues the
 * exact same random sequence (architecture §2, §5).
 */
export interface RngState {
  /** Identifies the algorithm so a loader can pick the right implementation. */
  readonly algorithm: string;
  /** The seed the generator was created with; labelled forks derive from it. */
  readonly seed: number;
  /** Algorithm-specific internal state as a 32-bit unsigned integer. */
  readonly state: number;
}

/**
 * Deterministic random number source. Every piece of simulation
 * randomness flows through an injected `Rng`; the same seed and the same
 * sequence of calls always yield the same values.
 *
 * ```
 *   seed ──► Rng ──► next() / nextInt() / pick() / chance()
 *              │
 *              └──► fork() ──► independent child stream
 * ```
 */
export interface Rng {
  /** Returns the next float in the half-open range [0, 1). */
  next(): number;

  /** Returns a uniformly distributed integer in the inclusive range [min, max]. */
  nextInt(min: number, max: number): number;

  /** Returns a uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;

  /** Returns true with the given probability in [0, 1]. */
  chance(probability: number): boolean;

  /**
   * Returns an element chosen with probability proportional to its
   * weight. Weights need not sum to 1; non-positive weights are never
   * chosen. Throws if the list is empty or no weight is positive.
   */
  pickWeighted<T>(items: readonly T[], weight: (item: T) => number): T;

  /** Returns a uniformly shuffled copy; the input is not mutated. */
  shuffle<T>(items: readonly T[]): T[];

  /**
   * Derives a new independent stream. With a label, the child is a pure
   * function of this generator's seed and the label and consumes no
   * state, so inserting or reordering other draws never perturbs it.
   * Without a label, the child is seeded from the next draw.
   */
  fork(label?: string): Rng;

  /** Captures the internal state for serialization. */
  getState(): RngState;
}
