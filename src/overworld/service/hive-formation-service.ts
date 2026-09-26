import type { IdGenerator } from "../../core/model/id-generator";
import type { ActId } from "../../content/model/act-id";
import { ACT_IDS } from "../../content/model/act-id";
import type { CampaignEvent } from "../model/campaign-event";
import type { CampaignState } from "../model/campaign-state";
import type { HiveTuning } from "../model/hive-tuning";
import type { OverworldApplied } from "../model/overworld-domain-event";
import type { OverworldState } from "../model/overworld-state";
import type { RegionId } from "../model/region";
import type { TickStep } from "../model/tick-step";
import { pausedRegions } from "./growth-pause-service";
import { formHive, hiveInRegion } from "./hive-service";
import { regionInfestation } from "./threat-service";

// ===========================================
// Step name
// ===========================================

/** Name of the hive formation tick step; also its RNG fork label. */
export const HIVE_FORMATION_STEP_NAME = "hive-formation";

// ===========================================
// Types
// ===========================================

/** What the hive formation step needs injected. */
export interface HiveFormationStepDeps {
  readonly hiveTuning: HiveTuning;
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether hives form on their own in act `act`: from
 * `tuning.formsFromAct` on, by act order (`ACT_IDS`).
 */
export function hivesFormIn(
  act: ActId,
  tuning: Pick<HiveTuning, "formsFromAct">,
): boolean {
  return ACT_IDS.indexOf(act) >= ACT_IDS.indexOf(tuning.formsFromAct);
}

// ===========================================
// Formation
// ===========================================

/**
 * One day of hive formation (campaign arc §6.5: "a region whose mean
 * infestation stays at ≥ 60 for 7 days forms a hive"). Each region, in
 * map order, is judged on today's map:
 *
 * ```
 *   act before formsFromAct? ──yes──► unchanged (no streaks either)
 *        │no
 *   for each region, in map order:
 *     holds a hive, or growth paused? ──► no streak
 *     mean < formationThreshold       ──► no streak (a dip resets it)
 *     otherwise                       ──► streak + 1
 *                                           reaches formationDays? ──► formHive
 * ```
 *
 * A liberated region is not watched while its growth is paused, so a
 * hive cannot re-form under the pause that liberation bought. Streaks
 * live in `hiveWatch`; the field is dropped when no region has one.
 * Draws no randomness: new hive ids come from `ids`, in map order.
 * Returns the input by identity when nothing changed.
 */
export function watchHives(
  overworld: OverworldState,
  day: number,
  ids: IdGenerator,
  tuning: HiveTuning,
): OverworldApplied<OverworldState> {
  if (!hivesFormIn(overworld.progress.act, tuning)) {
    return { state: overworld, events: [] };
  }
  const before = overworld.hiveWatch ?? {};
  const paused = pausedRegions(overworld, day);
  const watch: Record<RegionId, number> = {};
  const forming: RegionId[] = [];
  for (const region of overworld.map.regions) {
    if (
      hiveInRegion(overworld, region.id) !== undefined ||
      paused.has(region.id) ||
      regionInfestation(overworld.map, region.id) < tuning.formationThreshold
    ) {
      continue;
    }
    const streak = (before[region.id] ?? 0) + 1;
    if (streak >= tuning.formationDays) {
      forming.push(region.id);
    } else {
      watch[region.id] = streak;
    }
  }
  if (forming.length === 0 && sameWatch(before, watch)) {
    return { state: overworld, events: [] };
  }

  const { hiveWatch: _replaced, ...rest } = overworld;
  let state: OverworldState =
    Object.keys(watch).length === 0 ? rest : { ...rest, hiveWatch: watch };
  const events: CampaignEvent[] = [];
  for (const regionId of forming) {
    const formed = formHive(state, regionId, day, ids);
    state = formed.state;
    events.push(...formed.events);
  }
  return { state, events };
}

// ===========================================
// Tick step
// ===========================================

/**
 * The `hive-formation` tick step: `watchHives` on the day being ticked.
 * Runs right after `spread`, so a region is judged on the day's grown
 * and spread map.
 */
export function createHiveFormationStep<TState extends CampaignState>(
  deps: HiveFormationStepDeps,
): TickStep<TState> {
  return {
    name: HIVE_FORMATION_STEP_NAME,
    run: (state, ctx) => {
      const watched = watchHives(
        state.overworld,
        ctx.day,
        ctx.ids,
        deps.hiveTuning,
      );
      if (watched.state === state.overworld) {
        return { state, events: [] };
      }
      return {
        state: { ...state, overworld: watched.state },
        events: watched.events,
      };
    },
  };
}

// ===========================================
// Helpers
// ===========================================

/** Whether two streak records hold the same regions at the same counts. */
function sameWatch(
  a: Readonly<Record<RegionId, number>>,
  b: Readonly<Record<RegionId, number>>,
): boolean {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}
