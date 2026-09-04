import type { ThreatTuning } from "../model/threat-tuning";

// ===========================================
// Default tuning
// ===========================================

/**
 * The default tuning bundle, for injection into the threat service.
 *
 * The three values were also exported individually beside it until #141.
 * Nothing outside this file's own test read them, so they were
 * duplication rather than convenience (ADR 0003 §2.5).
 */
export const THREAT_TUNING: ThreatTuning = {
  /**
   * Mean city infestation counts one-for-one towards threat, so a fully
   * infested Earth is exactly 100 threat before escalation.
   */
  infestationWeight: 1,
  /**
   * One point of threat every ten days. Placeholder until the tick
   * pipeline (#68) is playable end to end.
   */
  escalationPerDay: 0.1,
  /**
   * Escalation saturates after 300 days at 30 threat, so time raises the
   * stakes but never loses the game on its own. Placeholder.
   */
  escalationCap: 30,
};
