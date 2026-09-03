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

/**
 * Maps a threat level onto its colour band. The band is judged on the
 * value rounded to a whole number, which is what every readout shows
 * (`formatWhole`), so a badge never disagrees with the number beside it
 * (#368): 33.4 reads `33 · ok`, 33.5 reads `34 · warn`.
 */
export function threatTone(threat: number): ThreatTone {
  const shown = Math.round(threat);
  if (shown <= THREAT_BAND_UPPER.ok) {
    return "ok";
  }
  if (shown <= THREAT_BAND_UPPER.warn) {
    return "warn";
  }
  return "danger";
}
