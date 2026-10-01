/**
 * How much of a destroyed mech the TDF gets back when the force held the
 * field (GDD §5.7, #1179). One number for now; the value lives in
 * `roster/data/mech-salvage-tuning.ts`, and the salvage service is
 * handed it rather than importing it (ADR 0003 §2.5).
 *
 * ```
 *   won or extracted, mech destroyed ──► floor(fraction × the mech's price) credits
 *   lost                             ──► nothing here: the wreck waits for Wreck Recovery
 * ```
 */
export interface MechSalvageTuning {
  /**
   * The share of a destroyed mech's price paid back as credits, `0..1`.
   * The price is what building it new would cost with nothing in stock:
   * chassis, parts and upgrades.
   */
  readonly fraction: number;
}
