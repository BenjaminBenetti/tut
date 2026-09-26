import type { Mission } from "../../src/overworld/model/mission";

/** Pinned regression battlefields, independent of which cities a campaign seed infests. */
export type MissionMapFixture = Pick<Mission, "cityId" | "mapParams">;

/** The urban doorway and west-facing landing used by the original regression captures. */
export const CITY_MISSION_FIXTURE: MissionMapFixture = {
  cityId: "new-york",
  mapParams: {
    seed: "730982385",
    biome: "temperate",
    settlement: "city",
    size: "small",
  },
};

/** The south-facing coastal landing used by the original camera regression capture. */
export const COASTAL_MISSION_FIXTURE: MissionMapFixture = {
  cityId: "auckland",
  mapParams: {
    seed: "3677615265",
    biome: "coastal",
    settlement: "town",
    size: "small",
  },
};

/**
 * A city clearance with both spawners some 27 tiles from the landing,
 * a few turns' walk for the mech: seed `f2`'s first offer before the
 * mission director (#1179) moved that offer to another city.
 */
export const BERLIN_CLEARANCE_FIXTURE: MissionMapFixture = {
  cityId: "berlin",
  mapParams: {
    seed: "985280582",
    infestation: 2,
    biome: "temperate",
    settlement: "city",
    size: "small",
  },
};
