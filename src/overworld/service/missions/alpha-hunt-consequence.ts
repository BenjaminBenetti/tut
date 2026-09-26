import type {
  MissionConsequenceContext,
  MissionConsequenceRule,
} from "../../model/mission-consequence-rule";
import type { Mission } from "../../model/mission";
import type { MissionResult } from "../../model/mission-result";
import type { NemesisLore } from "../../model/nemesis-lore";
import type { OverworldApplied } from "../../model/overworld-domain-event";
import type { OverworldState } from "../../model/overworld-state";
import { addCityInfestation } from "../city-infestation-service";
import { findCity } from "../earth-map-query-service";
import { pauseRegionGrowth } from "../growth-pause-service";
import {
  BROODMOTHER_NEMESIS_SPECIES,
  nemesisIdFor,
  recordNemesisEscape,
  recordNemesisKill,
} from "../nemesis-service";
import { setCampaignFlag } from "../story-service";
import { BROODMOTHER_SIGHTED_FLAG } from "./alpha-hunt-quarry";

// ===========================================
// Constants
// ===========================================

/** The objective kind an Alpha Hunt is decided by, as the result names it. */
export const KILL_BROODMOTHER_OBJECTIVE_KIND = "kill-broodmother";

// ===========================================
// Alpha hunt: consequences
// ===========================================

/**
 * What an Alpha Hunt does to the overworld (campaign arc §6.8).
 *
 * **Played:** the resolver's infestation delta on the city, as a defence
 * applies it, and the sighting flag, so the ordinary hunts may follow
 * the scripted first one. Then she decides:
 *
 * - **dead** (whatever became of the squad afterwards): a nemesis leaves
 *   the record, her kill written into the campaign chronicle first so
 *   the end screen can name her, and her region's growth holds for
 *   `MissionTuning.alphaHunt.growthPauseDays` through the hive model's
 *   pause (`pauseRegionGrowth`). The Broodmother autopsy's seam is the
 *   result's `speciesKilled`, which the launch handler already records.
 * - **alive** (escaped, or the squad lost or pulled out while she lived):
 *   she joins the record at level 1, or a nemesis gains a level, an
 *   escape and a new scar, marked by what last hurt her
 *   (`result.broodmotherWound`), in the city's region.
 *
 * **Lapsed:** the offer's frozen ignore penalty (+15) on its city and
 * nothing more. Nobody met her, so she gains no scar and no level.
 *
 * ```
 *   played  city + infestationDelta; flag broodmother-sighted
 *           dead   ──► recordNemesisKill(spec.nemesisId, day): chronicled, then struck;
 *                      growthPausedUntil[region] ≥ day + 5 + 1
 *           alive  ──► recordNemesisEscape(level + 1, escapes + 1, scar)
 *   lapsed  city + ignorePenalty
 * ```
 *
 * Whether she died is read generically: the resolver's
 * `broodmotherKilled`, else the reported kill objective, else (auto-
 * resolved) a won outcome. An offer without an `alphaHunt` spec names
 * nobody, so it records no nemesis.
 *
 * @param lore - The scars a surviving Broodmother may carry.
 * @returns The rule for `MISSION_CONSEQUENCE_RULES["alpha-hunt"]`.
 */
export function createAlphaHuntConsequence(
  lore: Pick<NemesisLore, "scars">,
): MissionConsequenceRule {
  return {
    typeId: "alpha-hunt",

    /** The delta, the sighting flag, and her death or her escape. */
    onResolved(
      state: OverworldState,
      mission: Mission,
      result: MissionResult,
      ctx: MissionConsequenceContext,
    ): OverworldApplied<OverworldState> {
      const delta = addCityInfestation(
        state,
        mission.cityId,
        result.infestationDelta,
      );
      const sighted = setCampaignFlag(delta.state, BROODMOTHER_SIGHTED_FLAG);
      const settled = broodmotherKilled(result)
        ? afterKill(sighted.state, mission, ctx)
        : afterEscape(sighted.state, mission, result, lore);
      return {
        state: settled,
        events: [...delta.events, ...sighted.events],
      };
    },

    /** The offer's frozen ignore penalty on its city; she gains nothing. */
    onExpired(
      state: OverworldState,
      mission: Mission,
    ): OverworldApplied<OverworldState> {
      return addCityInfestation(state, mission.cityId, mission.ignorePenalty);
    },
  };
}

// ===========================================
// Queries
// ===========================================

/**
 * Whether the Broodmother died: the resolver's `broodmotherKilled`, or
 * failing that the reported kill objective's completion, or failing that
 * (auto-resolved, no objectives) a won outcome.
 */
export function broodmotherKilled(result: MissionResult): boolean {
  if (result.broodmotherKilled !== undefined) {
    return result.broodmotherKilled;
  }
  const objective = result.objectives?.find(
    (candidate) => candidate.kind === KILL_BROODMOTHER_OBJECTIVE_KIND,
  );
  if (objective !== undefined) {
    return objective.complete;
  }
  return result.outcome === "won";
}

// ===========================================
// Helpers
// ===========================================

/** Her kill chronicled and her record struck, and her region's growth held. */
function afterKill(
  state: OverworldState,
  mission: Mission,
  ctx: MissionConsequenceContext,
): OverworldState {
  const nemesisId = mission.alphaHunt?.nemesisId;
  const progress =
    nemesisId === undefined
      ? state.progress
      : recordNemesisKill(state.progress, nemesisId, state.day);
  const struck = progress === state.progress ? state : { ...state, progress };
  const city = findCity(state.map, mission.cityId);
  if (city === undefined) {
    return struck;
  }
  return pauseRegionGrowth(
    struck,
    city.regionId,
    state.day,
    ctx.tuning.alphaHunt.growthPauseDays,
  );
}

/** Her record made or raised, in the city's region, scarred by her last wound. */
function afterEscape(
  state: OverworldState,
  mission: Mission,
  result: MissionResult,
  lore: Pick<NemesisLore, "scars">,
): OverworldState {
  const spec = mission.alphaHunt;
  const city = findCity(state.map, mission.cityId);
  if (spec === undefined || city === undefined) {
    return state;
  }
  return {
    ...state,
    progress: recordNemesisEscape(
      state.progress,
      {
        ...(spec.nemesisId === undefined ? {} : { nemesisId: spec.nemesisId }),
        newId: nemesisIdFor(mission.id, "broodmother"),
        speciesId: BROODMOTHER_NEMESIS_SPECIES,
        name: spec.name,
        regionId: city.regionId,
        mark: result.broodmotherWound ?? "unmarked",
      },
      lore,
    ),
  };
}
