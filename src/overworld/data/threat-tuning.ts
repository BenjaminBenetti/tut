import type { ThreatTuning } from "../model/threat-tuning";

// ===========================================
// Default values
// ===========================================

/**
 * Mean city infestation counts one-for-one towards threat, so a fully
 * infested Earth is exactly 100 threat before escalation.
 */
export const infestationWeight = 1;

/**
 * One point of threat every ten days. Placeholder until the tick pipeline
 * (#68) is playable end to end.
 */
export const escalationPerDay = 0.1;

/**
 * Escalation saturates after 300 days at 30 threat, so time raises the
 * stakes but never loses the game on its own. Placeholder.
 */
export const escalationCap = 30;

// ===========================================
// Aggregate
// ===========================================

/**
 * The default tuning bundle, for injection into the threat service. The
 * individual values are also exported for callers that need just one.
 */
export const THREAT_TUNING: ThreatTuning = {
  infestationWeight,
  escalationPerDay,
  escalationCap,
};
