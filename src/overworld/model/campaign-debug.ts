// ===========================================
// Campaign debug options
// ===========================================

/**
 * Per-campaign switches for testing and tuning, chosen when the campaign
 * is created and saved with it so a reload behaves the same. Absent in a
 * normal game; every field is optional and defaults to "no effect".
 *
 * ```
 *   NewGameOptions.debug ──► GameMeta.debug ──► tick steps read it
 * ```
 */
export interface CampaignDebugOptions {
  /**
   * Multiplies the threat added by elapsed time (both the daily rate
   * and its cap), so a test can reach the defeat condition in days
   * rather than months. Positive; `1` is the shipped pace.
   */
  readonly threatEscalationMultiplier?: number;
  /**
   * Resolves missions with the M1 auto-resolver (#62) instead of playing
   * them on a tactical map (#330), so QA can exercise the overworld loop
   * without fighting every mission. Absent or `false` is the shipped
   * game: Launch opens the tactical screen.
   */
  readonly autoResolve?: boolean;
}
