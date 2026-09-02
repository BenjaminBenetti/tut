/**
 * Balance knobs for the global threat level (GDD §5.1). Services receive a
 * tuning object rather than importing the defaults, so tests and future
 * difficulty settings can substitute their own values. Defaults live in
 * `overworld/data/threat-tuning.ts`.
 *
 * ```
 *   threat = clamp( meanInfestation × infestationWeight
 *                 + min(escalationCap, escalationPerDay × day), 0, 100 )
 * ```
 */
export interface ThreatTuning {
  /**
   * Multiplier on the mean city infestation (0–100). At 1 a fully infested
   * Earth is 100 threat on its own; above 1 the game is lost before every
   * city is overrun.
   */
  readonly infestationWeight: number;
  /** Threat added per elapsed day before the cap. Non-negative. */
  readonly escalationPerDay: number;
  /**
   * Most threat that time alone can add. Keeps the clock a pressure, not a
   * loss: a clean Earth can never be overrun by waiting.
   */
  readonly escalationCap: number;
}
