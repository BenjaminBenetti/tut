import type { RankTuning } from "../model/rank";
import { RANKS } from "./ranks";

// ===========================================
// Defaults
// ===========================================

/**
 * Default rank tuning (#1130): the shipped ladder and what each rung is
 * worth in the field. The Executive Director's curve, checked against
 * the ladder in `ranks.ts`:
 *
 * ```
 *   rank   xp   swarmers   move   accuracy   ap
 *     0     0       0       +0      +0       +0
 *     1    10       1       +0      +2       +0     first kill: a rank, no tile yet
 *     2    30       3       +1      +4       +0     one extra tile of move
 *     3    60       6       +1      +6       +0
 *     4   100      10       +2      +8       +1     one extra action point
 *     5   150      15       +2     +10       +1
 *     6   210      21       +3     +12       +1
 *     7   280      28       +3     +14       +1
 *     8   360      36       +4     +16       +2     top of the ladder
 * ```
 *
 * Each value is `perRank × index` floored: half a tile per rank pays on
 * the even ranks, a quarter of an action point on every fourth, so a
 * bonus arrives as a whole step rather than a fraction the rules cannot
 * spend. A Sergeant Major squad moves 9 rather than 5 and has one
 * action more than a mech — meaningful, and the ladder ends there.
 */
export const RANK_TUNING: RankTuning = {
  ladder: RANKS,
  bonuses: {
    movePerRank: 0.5,
    accuracyPerRank: 2,
    apPerRank: 0.25,
  },
};
