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
/**
 * One weapon a mech carries, as the roster knows it (#532). Deliberately
 * roster-shaped rather than a tactical `WeaponProfile`: this domain does
 * not know hit-chance formulae or damage scaling, and the tactical unit
 * factory converts it.
 */
export interface MechWeapon {
  /** The slot it is fitted in, which is what names the attack: `"arm-weapon"`. */
  readonly id: string;
  /** The part's own name, e.g. `"Autocannon"` — what the player is offered. */
  readonly name: string;
  /** Tiles it reaches. */
  readonly range: number;
  /** This part's accuracy contribution, applied to the mech's base. */
  readonly accuracy: number;
  /** This part's damage contribution, before tactical scaling. */
  readonly firepower: number;
  /** Armor points each hit ignores. */
  readonly armorPen: number;
}

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
  /**
   * One entry per fitted weapon part (#532), in slot order: the arm
   * weapon then the back weapon. Each carries what that weapon alone
   * does, so the tactical unit can offer it as its own action instead
   * of flattening every gun into one generic attack.
   *
   * `accuracy` and `firepower` here are that part's own contributions,
   * not the sheet totals above — those stay as they were, because the
   * auto-resolver and the mech bay read them.
   */
  readonly weapons: readonly MechWeapon[];
}
