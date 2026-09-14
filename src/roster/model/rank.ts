// ===========================================
// Ids
// ===========================================

/** Key of a rank in the ladder, e.g. `"corporal"`. Plain string (ADR 0003 §2.4). */
export type RankId = string;

// ===========================================
// Rank
// ===========================================

/**
 * One rung of the military ladder a squad or a mech's pilot climbs with
 * experience (GDD §5.7, #1130). The ladder is content: one record per
 * rank lives in `roster/data/ranks.ts`, ordered from the lowest, and a
 * unit's rank is the last rung its `xp` reaches.
 *
 * ```
 *   xp 0 ──► Private        xp 30 ──► Corporal       xp 100 ──► Staff Sergeant
 *            ▲ index 0                ▲ index 2                  ▲ index 4
 *            └── rankOf(xp, ladder) walks the rungs; the index scales the bonuses
 * ```
 */
export interface Rank {
  /** Unique key within the ladder. */
  readonly id: RankId;
  /** Display name, e.g. `"Corporal"`. */
  readonly name: string;
  /** Experience at which the rank is reached. The first rung is `0`; strictly rising after. */
  readonly xp: number;
}

/** The ranks from lowest to highest; the index of a rung is what the bonuses scale with. */
export type RankLadder = readonly Rank[];

// ===========================================
// Tuning
// ===========================================

/**
 * How much each rank above the first is worth in the field (#1130).
 * Every bonus is `perRank × rankIndex`, floored to a whole number when
 * applied, so a half a tile per rank pays out on the even ranks and a
 * quarter of an action point on every fourth.
 */
export interface RankBonusTuning {
  /** Tiles of move per rank index. Non-negative. */
  readonly movePerRank: number;
  /** Percentage points of accuracy per rank index, on every weapon. Non-negative. */
  readonly accuracyPerRank: number;
  /** Action points per rank index. Non-negative. */
  readonly apPerRank: number;
}

/**
 * The ladder and what climbing it earns, injected together: a service
 * that turns experience into a rank needs the rungs, and one that turns
 * a rank into stats needs the rates. Defaults live in
 * `roster/data/rank-tuning.ts`.
 */
export interface RankTuning {
  readonly ladder: RankLadder;
  readonly bonuses: RankBonusTuning;
}
