import type { StoryMissionId } from "../../../content/model/story-mission-id";
import type { City } from "../../model/city";
import type { GreatHive } from "../../model/great-hive";
import type { Mission } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type {
  MissionPinContext,
  MissionPinTrigger,
} from "../../model/mission-pin-trigger";
import type { OverworldState } from "../../model/overworld-state";
import { citiesInRegion, findRegion } from "../earth-map-query-service";
import { isGreatHiveDue } from "../great-hive-service";
import { hiveAssaultTechPoints } from "../missions/hive-assault-trigger";
import { pickStoryCity } from "./story-city";
import { buildStoryOffer } from "./story-offer-builder";

// ===========================================
// Constants
// ===========================================

/** The Great Hive pin trigger's id; its RNG fork is `pin:great-hives`. */
export const GREAT_HIVE_PIN_TRIGGER_ID = "great-hives";

/** The story id every Great Hive offer carries. */
export const GREAT_HIVE_STORY_ID: StoryMissionId = "great-hive";

/** The mission type a Great Hive is assaulted through: an oversized Hive Assault. */
const HIVE_ASSAULT = "hive-assault";

// ===========================================
// Formulae
// ===========================================

/**
 * The tech points a Great Hive assault at `difficulty` pays on a win:
 * an ordinary Hive Assault's award at that difficulty times
 * `greatHive.techRewardMultiplier`, rounded down (170 at d8).
 */
export function greatHiveTechPoints(
  difficulty: number,
  ctx: Pick<MissionOfferContext, "tuning" | "missionTypes">,
): number {
  return Math.floor(
    hiveAssaultTechPoints(difficulty, ctx) *
      ctx.tuning.greatHive.techRewardMultiplier,
  );
}

// ===========================================
// Trigger
// ===========================================

/**
 * Pins the Great Hive assaults (campaign arc §6.9: "Oversized Hive
 * Assaults on the platform's beacons … Pinned"): one offer for every
 * Great Hive that is due and has none on the board. A pin trigger
 * rather than a story rule because three run at once, and a story
 * rule has one offer per story id.
 *
 * ```
 *   for hive in greatHives (reveal order):
 *     isGreatHiveDue(hive)? (standing, act III, retry delay passed)
 *     no offer names it?
 *       city = pickStoryCity(seat region, most infested)
 *              ?? pickStoryCity(the continent's other regions, most infested)
 *       buildStoryOffer(city, great-hive, hive-assault, d = greatHive.difficulty)
 *         + hive { hiveId, regionId: seat, level, great: true }
 *         + tech points × greatHive.techRewardMultiplier
 * ```
 *
 * Pinned offers ignore the board cap and never lapse; a Great Hive with
 * no city free or displaceable today is tried again tomorrow. Each
 * offer is built on a fork of the trigger's stream labelled with the
 * Great Hive's id, and sees the offers pinned before it.
 */
export const GREAT_HIVE_PIN_TRIGGER: MissionPinTrigger = {
  id: GREAT_HIVE_PIN_TRIGGER_ID,

  /** One pinned assault for every due Great Hive without one. */
  pin(state: OverworldState, ctx: MissionPinContext): readonly Mission[] {
    const tuning = ctx.tuning.greatHive;
    let current = state;
    const pinned: Mission[] = [];
    for (const hive of state.greatHives ?? []) {
      if (
        !isGreatHiveDue(hive, current, tuning) ||
        isAssaulted(current, hive)
      ) {
        continue;
      }
      const city = greatHiveCity(current, hive, ctx);
      if (city === undefined) {
        continue;
      }
      const mission = greatHiveOffer(current, hive, city, {
        ...ctx,
        rng: ctx.rng.fork(hive.id),
      });
      pinned.push(mission);
      current = {
        ...current,
        missions: [
          ...current.missions.filter((m) => m.cityId !== city.id),
          mission,
        ],
      };
    }
    return pinned;
  },
};

// ===========================================
// Helpers
// ===========================================

/** The pinned assault on `hive` at `city`. Draws one id and the map seed. */
function greatHiveOffer(
  state: OverworldState,
  hive: GreatHive,
  city: City,
  ctx: MissionOfferContext,
): Mission {
  const tuning = ctx.tuning.greatHive;
  const offer = buildStoryOffer(
    state,
    city,
    {
      storyId: GREAT_HIVE_STORY_ID,
      typeId: HIVE_ASSAULT,
      difficulty: tuning.difficulty,
      act: tuning.act,
    },
    ctx,
  );
  return {
    ...offer,
    hive: {
      hiveId: hive.id,
      regionId: hive.regionId,
      level: hive.level,
      great: true,
    },
    rewards: {
      ...offer.rewards,
      techPoints: greatHiveTechPoints(offer.difficulty, ctx),
    },
  };
}

/**
 * The city a Great Hive's assault attaches to: the most infested city of
 * its seat region, or failing that of the continent's other regions,
 * free or holding a displaceable offer (`pickStoryCity`).
 */
function greatHiveCity(
  state: OverworldState,
  hive: GreatHive,
  ctx: Pick<MissionPinContext, "displaceable">,
): City | undefined {
  const seat = pickStoryCity(
    state,
    ctx,
    citiesInRegion(state.map, hive.regionId),
    mostInfested,
  );
  if (seat !== undefined) {
    return seat;
  }
  const others = hive.regionIds
    .filter(
      (regionId) =>
        regionId !== hive.regionId &&
        findRegion(state.map, regionId) !== undefined,
    )
    .flatMap((regionId) => citiesInRegion(state.map, regionId));
  return pickStoryCity(state, ctx, others, mostInfested);
}

/** The most infested of `cities`, ties going to the first; undefined for none. */
function mostInfested(cities: readonly City[]): City | undefined {
  let best: City | undefined;
  for (const city of cities) {
    if (best === undefined || city.infestation > best.infestation) {
      best = city;
    }
  }
  return best;
}

/** Whether an offer on the board already assaults `hive`. */
function isAssaulted(state: OverworldState, hive: GreatHive): boolean {
  return state.missions.some((mission) => mission.hive?.hiveId === hive.id);
}
