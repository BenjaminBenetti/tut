// ===========================================
// Brute tuning
// ===========================================

/**
 * Weights the brute's tile scoring composes; a substitute reshapes the
 * advance. The brute is the mirror of the swarmer: where the swarmer's
 * `approachWeight` dominates so that closing is an invariant, the
 * brute's `adjacentWeight` dominates so that *contact with a crowd* is.
 * A brute will walk past a lone soldier it could already reach to put
 * itself against three, which is what "punishes clumping" means
 * mechanically (GDD §6.4).
 *
 * `adjacentWeight` and `clumpWeight` agree in most geometries — a tile
 * touching more bodies almost always has more of them within
 * `clumpRadius` too — so on ordinary ground either term alone picks the
 * same tile. They earn their keep at different ranges and only part
 * company in odd shapes: `clumpWeight` is the one steering while nothing
 * is in contact and every adjacency is zero, and `adjacentWeight` is the
 * one that decides when a tile touching more sits in a thinner crowd.
 *
 * There is deliberately no cover or concealment term. The brute is
 * armored and slow; it does not take cover and does not care who sees
 * it. `overwatchWeight` is a *reward*, not a penalty, for the same
 * reason — see `BRUTE_TUNING`.
 */
export interface BruteTuning {
  /**
   * Reward per living enemy orthogonally adjacent to the tile on its own
   * level. Dominates: one more body in contact is worth several tiles of
   * walking, so among reachable tiles the brute takes the one touching
   * the most units.
   */
  readonly adjacentWeight: number;
  /** Penalty per tile of Manhattan distance from the focus of the densest cluster. */
  readonly approachWeight: number;
  /** Reward per fraction of living enemies within `clumpRadius` of the tile. */
  readonly clumpWeight: number;
  /** Radius enemies are counted within when measuring a crowd. */
  readonly clumpRadius: number;
  /**
   * Reward per fraction of watching enemies whose line of sight covers
   * the tile. Positive on purpose: a reaction shot spends the watcher's
   * overwatch, so a brute that walks into the beaten zone clears it for
   * the swarmers behind it.
   */
  readonly overwatchWeight: number;
  /** Penalty per level of height difference from the focus; brutes do not climb. */
  readonly levelWeight: number;
}
