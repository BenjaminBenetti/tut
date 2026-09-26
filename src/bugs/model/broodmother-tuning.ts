// ===========================================
// Broodmother tuning
// ===========================================

/**
 * The Broodmother's numbers (#1179, campaign arc §6.8 and §9): how
 * tough she is, how often she lays, when she runs, and the weights her
 * fallback behaviour scores tiles with. A substitute reshapes the boss
 * without touching the rules. See `BROODMOTHER_TUNING`.
 *
 * ```
 *   hit points   round( (hpBase + hpPerDifficulty·(difficulty − 1))
 *                       · (1 + scarHpBonus·scars) )
 *   clutch       one egg spawner beside her as the bug phase of every
 *                turn divisible by clutchInterval opens
 *   flight       hp ≤ maxHp·fleeAtHpFraction ──► fleeing, for good
 *
 *   keep-distance score of a tile she could end her move on
 *     − threats·threatWeight            visible enemies whose reach covers it
 *     + min(margin, marginCap)·marginWeight
 *                                        tiles beyond the nearest such reach
 *     − movement·stepWeight
 *   nothing in view
 *     − |distance to the hunt site − standOff|·approachWeight
 * ```
 */
export interface BroodmotherTuning {
  /** Hit points at difficulty 1 with no scars. Positive. */
  readonly hpBase: number;
  /** Hit points added per difficulty step above 1. Non-negative. */
  readonly hpPerDifficulty: number;
  /**
   * Fraction of her unscarred hit points each scar (an earlier escape,
   * arc §6.8) adds, additively: two scars at `0.25` are +50 %.
   */
  readonly scarHpBonus: number;
  /**
   * Turns between clutches: she lays as the bug phase of every turn
   * divisible by it opens. A whole number, 1 or more.
   */
  readonly clutchInterval: number;
  /**
   * The fraction of her max hit points at or below which she flees for
   * the map edge (arc §6.8: half). Once she flees she never turns back.
   */
  readonly fleeAtHpFraction: number;
  /** Penalty per visible enemy whose weapon reach covers a tile. Dominates the others. */
  readonly threatWeight: number;
  /** Reward per tile of clearance beyond the nearest visible enemy's reach, up to `marginCap`. */
  readonly marginWeight: number;
  /** Clearance in tiles beyond which more distance earns nothing, so she does not run for a corner. */
  readonly marginCap: number;
  /** Penalty per movement point spent, so she does not wander between equal tiles. */
  readonly stepWeight: number;
  /**
   * Tiles she keeps from where the swarm last saw the squad while she
   * sees no enemy: close enough that her clutches find it, far enough
   * that she does not walk into its guns.
   */
  readonly standOff: number;
  /** Penalty per tile off `standOff` while she sees no enemy. */
  readonly approachWeight: number;
}
