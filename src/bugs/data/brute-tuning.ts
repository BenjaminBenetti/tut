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
 * Note what that means in practice: the term discriminates near the
 * enemy line and nowhere else, because past a watcher's sight range no
 * gun bears on the tile at all. That is exactly where a brute could
 * shield anyone by choosing where to stand, so a small positive weight
 * breaks ties in the one region that matters. Sign matters more than
 * size here — a negative weight would make the brute hunt for dead
 * ground, which is the lurker's job, not its own.
 *
 * This note used to say the term cancelled on open ground, because
 * every watcher saw every tile. That was true and it was a bug, not a
 * property of open ground: `overwatchScore` asked only for a clear line
 * and never for sight range, so it read 1 on every tile of the map and
 * no weight could move it (#663).
 *
 * Measured against the corrected score (#676), on a 30-wide field with
 * watchers placed so the sight gradient is not collinear with the
 * approach:
 *
 * ```
 *   overwatchWeight   0   0.15   0.3   0.6   1.2
 *   destination      same same  same  same  same
 * ```
 *
 * Live but dominated: `brute-behaviour.test.ts` shows a heavy penalty
 * (-20) does move the brute out of the watchers' reach, so the term is
 * not inert — but between 0 and four times the shipped value it never
 * changes where the brute goes, because adjacency and approach settle
 * it first. Left at 0.3, which the measurement supports as well as any
 * value in that range, and where the design note above wants it: sign
 * over size, a tie-break near the enemy line and nothing more.
 *
 * Caveat on the method: single-turn destinations on flat open fields,
 * with the bug close enough to perceive an enemy at all. A bug that
 * sees nobody idles, and a probe placed beyond bug sight range measures
 * that rather than the weight.
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
