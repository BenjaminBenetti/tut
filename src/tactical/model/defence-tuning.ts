// ===========================================
// Defence tuning
// ===========================================

/**
 * The knobs of how a defence closes (#1175, #1179, GDD §5.4). Defaults
 * live in `tactical/data/defence-tuning.ts`; the defend-generators
 * objective and its phase step receive them rather than importing the
 * data.
 *
 * ```
 *   the bug phase of turn T lands the last counted wave
 *     ──► holdUntilTurn ← T + holdTurns
 *   held (complete) once a generator runs and either
 *     every bug on the map is dead, or turn ≥ holdUntilTurn
 *   so the last wave gets holdTurns bug phases: T … T + holdTurns − 1
 * ```
 */
export interface DefenceTuning {
  /**
   * Turns the force must hold after the last counted wave lands before
   * the installation reads held with bugs still on the map: the last
   * wave's bug phases to press the generators, and then the defence is
   * done whether or not every straggler has been found. Positive integer.
   */
  readonly holdTurns: number;
}
