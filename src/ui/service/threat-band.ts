import { MAX_THREAT } from "../../overworld/model/threat";

// ===========================================
// Threat colour band
// ===========================================

/** Which of the style guide's status colours a threat level shows in. */
export type ThreatTone = "ok" | "warn" | "danger";

/**
 * Upper bounds (inclusive) of the green and amber bands on the 0–100
 * threat scale; anything above the amber bound is red.
 *
 * ```
 *   0 ────── ok ────── 33 ───── warn ───── 66 ───── danger ───── 100
 * ```
 */
export const THREAT_BAND_UPPER = { ok: 33, warn: 66 } as const;

/** Maps a threat level onto its colour band. Values above the scale are red. */
export function threatTone(threat: number): ThreatTone {
  if (threat <= THREAT_BAND_UPPER.ok) {
    return "ok";
  }
  if (threat <= THREAT_BAND_UPPER.warn) {
    return "warn";
  }
  return threat <= MAX_THREAT ? "danger" : "danger";
}
