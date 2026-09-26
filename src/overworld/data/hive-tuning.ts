import type { HiveTuning } from "../model/hive-tuning";

// ===========================================
// Defaults
// ===========================================

/**
 * Default hive tuning (campaign arc §3 Act II, §6.5):
 *
 * - `formationThreshold` 60, `formationDays` 7: a region whose mean
 *   infestation stays at 60 or more for a week grows a hive.
 * - `difficultyStepDays` 7: a standing hive gains a difficulty step
 *   every week, so ignoring a pinned Hive Assault costs something.
 * - `liberationCut` 20, `liberationGrowthPauseDays` 10: winning the
 *   assault drops the region's cities by 20 and holds its growth and
 *   spread for ten days.
 * - `formsFromAct` `"act-2"`: hives are Act II's arrival. Act I never
 *   forms one, so an Act I campaign ticks exactly as it did before hives.
 */
export const HIVE_TUNING: HiveTuning = {
  formationThreshold: 60,
  formationDays: 7,
  difficultyStepDays: 7,
  liberationCut: 20,
  liberationGrowthPauseDays: 10,
  formsFromAct: "act-2",
};
