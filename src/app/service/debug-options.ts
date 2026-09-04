import type { CampaignDebugOptions } from "../../overworld/model/campaign-debug";

// ===========================================
// Constants
// ===========================================

/** Query parameter that multiplies threat escalation: `/?threatEscalation=100`. */
export const THREAT_ESCALATION_PARAM = "threatEscalation";

/** Query parameter that puts missions back on the auto-resolver: `/?autoResolve=1`. */
export const AUTO_RESOLVE_PARAM = "autoResolve";

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
 *   "?autoResolve=1"        ──► { autoResolve: true }
 *   "?autoResolve=0"        ──► undefined
 * ```
 */
export function parseDebugOptions(
  search: string,
): CampaignDebugOptions | undefined {
  const params = new URLSearchParams(search);
  const options: {
    threatEscalationMultiplier?: number;
    autoResolve?: boolean;
  } = {};
  const factor = Number(params.get(THREAT_ESCALATION_PARAM));
  if (
    params.get(THREAT_ESCALATION_PARAM) !== null &&
    Number.isFinite(factor) &&
    factor > 0
  ) {
    options.threatEscalationMultiplier = factor;
  }
  if (isTruthy(params.get(AUTO_RESOLVE_PARAM))) {
    options.autoResolve = true;
  }
  return Object.keys(options).length === 0 ? undefined : options;
}

/** A flag parameter is on for `1`, `true` or an empty value (`?autoResolve`). */
function isTruthy(raw: string | null): boolean {
  return raw === "" || raw === "1" || raw?.toLowerCase() === "true";
}
