import type { CampaignDebugOptions } from "../../overworld/model/campaign-debug";

// ===========================================
// Constants
// ===========================================

/** Query parameter that multiplies threat escalation: `/?threatEscalation=100`. */
export const THREAT_ESCALATION_PARAM = "threatEscalation";

// ===========================================
// Parsing
// ===========================================

/**
 * Reads campaign debug switches from a page's query string, for
 * end-to-end tests and tuning sessions in dev builds. Unknown or
 * malformed values are ignored; returns undefined when nothing is set,
 * so a normal visit creates a normal campaign.
 *
 * ```
 *   "?threatEscalation=100" ──► { threatEscalationMultiplier: 100 }
 *   "?threatEscalation=abc" ──► undefined
 * ```
 */
export function parseDebugOptions(
  search: string,
): CampaignDebugOptions | undefined {
  const params = new URLSearchParams(search);
  const raw = params.get(THREAT_ESCALATION_PARAM);
  if (raw === null) {
    return undefined;
  }
  const factor = Number(raw);
  if (!Number.isFinite(factor) || factor <= 0) {
    return undefined;
  }
  return { threatEscalationMultiplier: factor };
}
