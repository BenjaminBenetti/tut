// ===========================================
// Stat sheet
// ===========================================

/**
 * The aggregate a mech bay shows for a loadout (GDD §5.8): every part's
 * stats summed, plus what the loadout costs and one scalar the M1
 * auto-resolver scores it by.
 *
 * ```
 *   chassis ─┐
 *   legs    ─┤  effectivePartStats  ┌─ armor, mobility, heat, accuracy,
 *   arms    ─┼──── per part ───── Σ ┼─ firepower, weight
 *   weapons ─┤                      ├─ powerBalance  (supply − draw)
 *   utility ─┘                      ├─ totalCost     (Σ cost)
 *                                   └─ combatRating  (weighted by tuning)
 * ```
 */
export interface MechStatSheet {
  /** Total protective bulk. */
  readonly armor: number;
  /** Tiles per action after every part's contribution. */
  readonly mobility: number;
  /** Net heat per turn; positive builds up, negative dissipates. */
  readonly heat: number;
  /** Net hit-chance modifier in percentage points. */
  readonly accuracy: number;
  /** Total damage output across fitted weapons. */
  readonly firepower: number;
  /** Total mass in tonnes, chassis included. */
  readonly weight: number;
  /** Chassis power output plus every fitted part's draw or supply; negative means over budget. */
  readonly powerBalance: number;
  /** Purchase price of every part plus the upgrade levels the loadout records, in credits. */
  readonly totalCost: number;
  /** Scalar strength for the auto-resolver, from `MechRatingTuning`; never negative. */
  readonly combatRating: number;
}
