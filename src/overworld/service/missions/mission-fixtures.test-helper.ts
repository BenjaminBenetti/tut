import { MISSION_TYPES } from "../../../content/data/mission-types";
import type { ActId } from "../../../content/model/act-id";
import type { DeployableTypeId } from "../../../content/model/deployable-type-id";
import type { MissionTypeId } from "../../../content/model/mission-type-id";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ACTS } from "../../data/acts";
import { MISSION_TUNING } from "../../data/mission-tuning";
import type { ActDefinition } from "../../model/act-definition";
import type { CampaignProgress } from "../../model/campaign-progress";
import type { Deployable } from "../../model/deployable";
import type { EarthMap } from "../../model/earth-map";
import type { Mission } from "../../model/mission";
import type { MissionOfferContext } from "../../model/mission-offer-rule";
import type { MissionOutcome, MissionResult } from "../../model/mission-result";
import type { OverworldState } from "../../model/overworld-state";
import { createInitialCampaignProgress } from "../campaign-progress-factory";
import { buildEarthMap } from "../earth-map-builder";

// ===========================================
// Maps
// ===========================================

/**
 * Two regions, four cities:
 *
 * ```
 *   west (temperate): clean=0 (city)   low=10 (town)
 *   east (desert):    mid=50 (city)    full=100 (town)
 * ```
 */
export function fixtureMap(): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "west",
        name: "West",
        biome: "temperate",
        cities: [
          { id: "clean", name: "Clean", layout: { x: 0.1, y: 0.1 } },
          {
            id: "low",
            name: "Low",
            layout: { x: 0.2, y: 0.1 },
            infestation: 10,
            scale: "town",
          },
        ],
      },
      {
        id: "east",
        name: "East",
        biome: "desert",
        cities: [
          {
            id: "mid",
            name: "Mid",
            layout: { x: 0.8, y: 0.1 },
            infestation: 50,
          },
          {
            id: "full",
            name: "Full",
            layout: { x: 0.9, y: 0.1 },
            infestation: 100,
            scale: "town",
          },
        ],
      },
    ],
    links: [
      ["clean", "low"],
      ["low", "mid"],
      ["mid", "full"],
    ],
  });
}

/**
 * One temperate region, "north", with a detected city per entry of
 * `infestations`, named `c0`, `c1`, … in order. A city at 0 is clean
 * and therefore undetected.
 */
export function boardMap(infestations: readonly number[]): EarthMap {
  return buildEarthMap({
    regions: [
      {
        id: "north",
        name: "North",
        biome: "temperate",
        cities: infestations.map((infestation, index) => ({
          id: `c${String(index)}`,
          name: `City ${String(index)}`,
          layout: { x: 0.05 + index * 0.05, y: 0.5 },
          infestation,
        })),
      },
    ],
    links: infestations
      .slice(1)
      .map((_, index): [string, string] => [
        `c${String(index)}`,
        `c${String(index + 1)}`,
      ]),
  });
}

// ===========================================
// State
// ===========================================

/** The fixture overworld on day 5 at threat 40, act-1, nothing offered. */
export function fixtureState(
  overrides: Partial<OverworldState> = {},
): OverworldState {
  return {
    day: 5,
    map: fixtureMap(),
    threat: 40,
    threatOffset: 0,
    spreadCooldowns: {},
    missions: [],
    pendingEvents: [],
    deployables: [],
    hives: [],
    progress: createInitialCampaignProgress(),
    ...overrides,
  };
}

/** Fresh campaign progress in `act`, with `played` missions played in it. */
export function progressIn(act: ActId, played = 0): CampaignProgress {
  return {
    ...createInitialCampaignProgress(),
    act,
    actStartedAt: 0,
    missionsPlayed: played,
  };
}

/** A built installation in `regionId`. */
export function installation(
  id: string,
  regionId: string,
  typeId: DeployableTypeId = "sensor-array",
): Deployable {
  return { id, typeId, regionId, level: 1, builtDay: 1, online: true };
}

// ===========================================
// Missions and results
// ===========================================

/** A difficulty-3 offer of `typeId` at `cityId`, expiring on `expiresDay`. */
export function missionAt(
  cityId: string,
  expiresDay: number,
  penalty = 10,
  typeId: MissionTypeId = "infestation-clearance",
): Mission {
  return {
    id: `mission-${cityId}`,
    typeId,
    cityId,
    difficulty: 3,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "small",
      seed: "1",
    },
    rewards: { credits: 900, techPoints: 0 },
    createdDay: expiresDay - 5,
    expiresDay,
    ignorePenalty: penalty,
  };
}

/** What a resolver reports for `mission` ending in `outcome` with `infestationDelta`. */
export function resultFor(
  mission: Mission,
  outcome: MissionOutcome,
  infestationDelta: number,
): MissionResult {
  return {
    missionId: mission.id,
    cityId: mission.cityId,
    outcome,
    squadCasualties: [],
    squadsWiped: [],
    mechsDestroyed: [],
    mechDamage: [],
    creditsAwarded: 0,
    techPointsAwarded: 0,
    infestationDelta,
  };
}

// ===========================================
// Context
// ===========================================

/** An act whose band is the whole difficulty range, so nothing is clamped. */
export const UNCLAMPED_ACT: ActDefinition = {
  ...ACTS["act-3"],
  difficultyBand: { min: 1, max: 10 },
};

/** A rule context on `seed` with the shipped content, in `act`. */
export function offerContext(
  seed: number,
  act: ActDefinition = UNCLAMPED_ACT,
  intelBonus: Record<string, number> = {},
): MissionOfferContext {
  return {
    rng: new Mulberry32Rng(seed),
    ids: new SequentialIdGenerator(),
    tuning: MISSION_TUNING,
    missionTypes: MISSION_TYPES,
    intelBonus,
    act,
  };
}
