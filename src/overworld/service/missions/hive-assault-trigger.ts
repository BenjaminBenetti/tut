import type { City, CityId } from "../../model/city";
import type { Hive, HiveId } from "../../model/hive";
import { hiveLevel } from "../../model/hive";
import type { HiveAssaultSpec } from "../../model/hive-assault-spec";
import type { Mission } from "../../model/mission";
import type {
  MissionOfferContext,
  MissionTriggerRule,
} from "../../model/mission-offer-rule";
import type { OverworldState } from "../../model/overworld-state";
import { citiesInRegion, findCity } from "../earth-map-query-service";
import {
  buildOfferAtDifficulty,
  citiesWithOffers,
  clampToBand,
  difficultyFor,
  repriceOffer,
} from "./mission-offer-builder";

// ===========================================
// Constants
// ===========================================

/** The type this module offers. */
const HIVE_ASSAULT = "hive-assault";

// ===========================================
// Formulae
// ===========================================

/**
 * A Hive Assault's difficulty at `host` for a hive of `level` (arc §3,
 * §6.5): the host city priced the way every offer is (`difficultyFor`
 * over its infestation and the threat), plus one per hive level, then
 * clamped into the act's band like any non-story offer. Once the band's
 * top is reached the level keeps growing the tactical mission instead —
 * the core's hit points, the guards and the nests — so a hive left
 * alone never stops getting harder.
 *
 * ```
 *   difficulty = clampToBand(difficultyFor(host.infestation, threat) + level, act band)
 * ```
 */
export function hiveAssaultDifficulty(
  host: City,
  state: Pick<OverworldState, "threat">,
  level: number,
  ctx: Pick<MissionOfferContext, "tuning" | "missionTypes" | "act">,
): number {
  const priced = difficultyFor(
    host.infestation,
    state.threat,
    ctx.missionTypes[HIVE_ASSAULT],
    ctx.tuning.difficulty[HIVE_ASSAULT],
  );
  return clampToBand(priced + level, ctx.act.difficultyBand);
}

/**
 * The tech points a Hive Assault at `difficulty` pays on a win: the
 * type's ordinary award, times `MISSION_TUNING.hiveAssault`'s
 * multiplier, rounded down.
 */
export function hiveAssaultTechPoints(
  difficulty: number,
  ctx: Pick<MissionOfferContext, "tuning" | "missionTypes">,
): number {
  const type = ctx.missionTypes[HIVE_ASSAULT];
  const ordinary =
    type.techRewardBase + difficulty * type.techRewardPerDifficulty;
  return Math.floor(ordinary * ctx.tuning.hiveAssault.techRewardMultiplier);
}

// ===========================================
// Hive assault: trigger
// ===========================================

/**
 * How a Hive Assault is offered (campaign arc §5, §6.5: "Hive Assault is
 * pinned for every hive that exists"). A trigger rule, so it sits
 * outside the board cap and no act gives it a weight: every hive has its
 * pinned offer, so no hive is ever left over for the board to draw.
 *
 * ```
 *   trigger   for hive in state.hives (formation order), no offer names it:
 *               host = most infested city of its region without an offer, or skip
 *               level = hiveLevel(hive, day)
 *               d = hiveAssaultDifficulty(host, level)
 *               buildOfferAtDifficulty(host, d) + pinned + hive { hiveId, regionId, level }
 *               tech points × hiveAssault.techRewardMultiplier
 *
 *   refresh   (daily, before any trigger) the standing offer re-levelled:
 *               hive gone              ──► withdrawn
 *               level and d unchanged  ──► the offer itself
 *               otherwise              ──► re-priced at the new d, hive.level updated
 * ```
 *
 * The offer is re-levelled every day it stands rather than frozen when
 * made: the arc's intent is that the longer the player waits, the harder
 * the hive gets, so the offer the player launches carries today's level.
 * The re-pricing keeps the offer's id, map seed, created day, bug mix
 * and whether it rolled a carcass; only what follows from the level and
 * the host city's pressure moves.
 *
 * The host need not be detected: the hive is announced on the map when
 * it forms, so its assault is always offered. A region whose every city
 * already holds an offer gets none today, and the trigger tries again
 * tomorrow. The offer never expires (`pinned`); only a played mission
 * removes it, and a loss or an abandoned assault leaves the hive for
 * tomorrow's trigger to pin again.
 */
export const HIVE_ASSAULT_TRIGGER: MissionTriggerRule = {
  kind: "trigger",
  typeId: HIVE_ASSAULT,

  /** One pinned offer for every hive that has none. */
  trigger(state, ctx): readonly Mission[] {
    const occupied = citiesWithOffers(state);
    const assaulted = hivesUnderAssault(state);
    const offered: Mission[] = [];
    for (const hive of state.hives) {
      if (assaulted.has(hive.id)) {
        continue;
      }
      const host = hostCityFor(state, hive, occupied);
      if (host === undefined) {
        continue;
      }
      offered.push(hiveAssaultOffer(state, hive, host, ctx));
      occupied.add(host.id);
      assaulted.add(hive.id);
    }
    return offered;
  },

  /** The standing offer re-levelled for today, or withdrawn when its hive is gone. */
  refresh(mission, state, ctx): Mission | undefined {
    const spec = mission.hive;
    if (spec === undefined) {
      return mission;
    }
    const hive = state.hives.find((candidate) => candidate.id === spec.hiveId);
    if (hive === undefined) {
      return undefined;
    }
    const host = findCity(state.map, mission.cityId);
    if (host === undefined) {
      return mission;
    }
    const level = hiveLevel(hive, state.day, ctx.hive);
    const difficulty = hiveAssaultDifficulty(host, state, level, ctx);
    if (level === spec.level && difficulty === mission.difficulty) {
      return mission;
    }
    return withHive(
      repriceOffer(mission, difficulty, ctx),
      { ...spec, level },
      ctx,
    );
  },
};

// ===========================================
// Helpers
// ===========================================

/**
 * The pinned offer against `hive` at `host` today. Draws one id and the
 * map seed through `buildOfferAtDifficulty`, and the carcass roll on its
 * labelled fork.
 */
function hiveAssaultOffer(
  state: OverworldState,
  hive: Hive,
  host: City,
  ctx: MissionOfferContext,
): Mission {
  const level = hiveLevel(hive, state.day, ctx.hive);
  const difficulty = hiveAssaultDifficulty(host, state, level, ctx);
  const offer = buildOfferAtDifficulty(
    state,
    host,
    HIVE_ASSAULT,
    difficulty,
    ctx,
  );
  return withHive(
    offer,
    { hiveId: hive.id, regionId: hive.regionId, level },
    ctx,
  );
}

/**
 * `offer` as a Hive Assault: pinned, carrying `spec`, and paying the
 * multiplied tech points for its difficulty. Idempotent, so a re-priced
 * offer never has its award multiplied twice.
 */
function withHive(
  offer: Mission,
  spec: HiveAssaultSpec,
  ctx: Pick<MissionOfferContext, "tuning" | "missionTypes">,
): Mission {
  return {
    ...offer,
    pinned: true,
    hive: spec,
    rewards: {
      ...offer.rewards,
      techPoints: hiveAssaultTechPoints(offer.difficulty, ctx),
    },
  };
}

/** The hives an offer on the board already assaults. */
function hivesUnderAssault(state: OverworldState): Set<HiveId> {
  const hives = new Set<HiveId>();
  for (const mission of state.missions) {
    if (mission.hive !== undefined) {
      hives.add(mission.hive.hiveId);
    }
  }
  return hives;
}

/**
 * The city a hive's assault attaches to: the most infested city of the
 * hive's region that has no offer, existing or made today; ties keep
 * region order. Undefined when every city of the region is taken.
 */
function hostCityFor(
  state: OverworldState,
  hive: Hive,
  occupied: ReadonlySet<CityId>,
): City | undefined {
  let host: City | undefined;
  for (const city of citiesInRegion(state.map, hive.regionId)) {
    if (occupied.has(city.id)) {
      continue;
    }
    if (host === undefined || city.infestation > host.infestation) {
      host = city;
    }
  }
  return host;
}
