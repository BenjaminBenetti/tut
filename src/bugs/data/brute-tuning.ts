import type { BruteTuning } from "../model/brute-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * Shipped weights, ordered so that contact with a crowd beats walking.
 * One enemy in contact is worth 3, one tile of distance costs 1, and
 * every remaining reward sums to `clumpWeight + overwatchWeight` = 1.1.
 * So against a cluster the brute prefers the tile touching more of it,
 * even at a detour:
 *
 * ```
 *   tile touching 2 ≥ 6 − d − 0
 *   tile touching 1 ≤ 3 − (d − 2) + 1.1 = 6.1 − d   … only within 2 tiles
 *   tile touching 1, 3 tiles nearer ≤ 3 − (d − 3) + 1.1 = 7.1 − d  … wins
 * ```
 *
 * so the brute will detour up to two tiles for one more body, and no
 * further — beyond that it is closing on the crowd anyway. With nothing
 * in contact every adjacency term is 0 and `approachWeight` alone
 * decides, which is the slow advance.
 *
 * `overwatchWeight` is positive: between two otherwise equal tiles the
 * brute steps into the one more guns are trained on, because each
 * reaction shot it draws spends that watcher's overwatch (see
 * `overwatchReaction` in `turn-service`) and the swarm behind it walks
 * in free. It is small enough to break ties, never to redirect the
 * advance.
 *
 * Note what that means in practice: on open ground every watcher sees
 * every tile, so `overwatchScore` is 1 everywhere and this term cancels
 * out of the comparison entirely. It only discriminates on maps with
 * something to break line of sight, which is the only place a brute
 * could shield anyone by choosing where to stand. Sign matters more
 * than size here — a negative weight would make the brute hunt for
 * dead ground, which is the lurker's job, not its own.
 *
 * Elevation is discouraged an eighth of a tile per level — the brute has
 * `move` 3 and no business on a rooftop, but a ramp on the way into the
 * crowd should not be refused.
 */
export const BRUTE_TUNING: BruteTuning = {
  adjacentWeight: 3,
  approachWeight: 1,
  clumpWeight: 0.8,
  clumpRadius: 2,
  overwatchWeight: 0.3,
  levelWeight: 0.125,
};
