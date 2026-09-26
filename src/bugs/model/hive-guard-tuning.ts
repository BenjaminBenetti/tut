// ===========================================
// Hive Guard tuning
// ===========================================

/**
 * Weights the Hive Guard's target choice composes (#1179); a substitute
 * reshapes who it throws its spines at. It never chooses a tile — it is
 * rooted — so every term prices one enemy it could hit from where it
 * stands this turn, as `attackOptions` validates and values them:
 *
 * ```
 *   score = value·valueWeight + (a top-of-range hit kills ? killWeight : 0)
 * ```
 *
 * `value` is `targetValue`'s expected fraction of the target's remaining
 * hit points one volley removes, so a scratch on a mech prices below a
 * real wound on a squad before either weight is applied. See
 * `HIVE_GUARD_TUNING`.
 */
export interface HiveGuardTuning {
  /** Reward per expected fraction of the target's remaining hit points one volley removes. */
  readonly valueWeight: number;
  /** Reward for a target a top-of-range hit would finish off. */
  readonly killWeight: number;
}
