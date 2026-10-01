import type { CrashSiteSetupTuning } from "../model/crash-site-setup-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * The shipped crash-site clock (campaign arc §6.3): from difficulty 5,
 * every Act II and Act III landing from the middle of Act II on, the
 * pod ripens at the end of turn 5 instead of turn 8.
 *
 * C2b-1-field's calibration (#1179, `docs/design/calibration/C2b-1-field.md`).
 * On the filled forces both players won every crash site: both walk to
 * the pod at full pace and kill it on turn 2–8, well inside turn 8.
 * The walk there is the whole race, so the clock is the lever:
 *
 * ```
 *   48 seeds, new / expert    act-1       act-2       act-3
 *   clock 8                   98 / 100    100 / 100   100 / 100
 *   clock 5 from d5           98 / 100     81 / 92     67 / 92
 * ```
 *
 * Difficulty 1–4 keep turn 8, so First Skyfall (d1) and the Act I crash
 * sites do not move.
 */
export const CRASH_SITE_SETUP_TUNING: CrashSiteSetupTuning = {
  earlyMaturityFromDifficulty: 5,
  earlyMaturityTurn: 5,
};
