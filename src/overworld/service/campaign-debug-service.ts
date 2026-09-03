import type { CampaignDebugOptions } from "../model/campaign-debug";
import type { ThreatTuning } from "../model/threat-tuning";

// ===========================================
// Threat
// ===========================================

/**
 * The threat tuning a campaign actually runs on: the shipped tuning with
 * the debug escalation multiplier applied to the daily rate and its cap.
 * Returns the input object unchanged when there is nothing to apply, so
 * a normal campaign shares the shipped tuning by identity.
 *
 * @throws {RangeError} if the multiplier is not a positive finite number.
 */
export function applyDebugThreat(
  tuning: ThreatTuning,
  debug: CampaignDebugOptions | undefined,
): ThreatTuning {
  const factor = debug?.threatEscalationMultiplier;
  if (factor === undefined || factor === 1) {
    return tuning;
  }
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new RangeError(
      `Invalid threatEscalationMultiplier ${String(factor)}: must be a positive finite number`,
    );
  }
  return {
    ...tuning,
    escalationPerDay: tuning.escalationPerDay * factor,
    escalationCap: tuning.escalationCap * factor,
  };
}
