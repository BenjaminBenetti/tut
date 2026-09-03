import type { ThreatTone } from "./threat-band";

// ===========================================
// Win-chance colour band
// ===========================================

/** Lower bounds (inclusive) of the green and amber bands on a `[0, 1]` win chance. */
export const ODDS_BAND_LOWER = { ok: 0.66, warn: 0.4 } as const;

/** Maps a win chance onto the status colours: green from 66 %, amber from 40 %, red below. */
export function oddsTone(winProbability: number): ThreatTone {
  if (winProbability >= ODDS_BAND_LOWER.ok) {
    return "ok";
  }
  if (winProbability >= ODDS_BAND_LOWER.warn) {
    return "warn";
  }
  return "danger";
}

/** A win chance as a whole percentage: `0.734 → "73 %"`. */
export function formatOdds(winProbability: number): string {
  return `${String(Math.round(winProbability * 100))} %`;
}
