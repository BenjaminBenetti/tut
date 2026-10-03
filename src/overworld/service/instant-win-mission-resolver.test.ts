import { describe, expect, it } from "vitest";

import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { Rng } from "../../core/model/rng";
import { AUTO_RESOLVE_TUNING } from "../data/auto-resolve-tuning";
import type {
  InstantWinReporter,
  InstantWinReports,
} from "../model/instant-win-report";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import type { MissionResolver } from "../model/mission-resolver";
import { InstantWinMissionResolver } from "./instant-win-mission-resolver";
import {
  creditsFor,
  infestationDeltaFor,
  techPointsFor,
} from "./mission-reward-service";

// ===========================================
// Fixtures
// ===========================================

/** A clearance at d4 paying 1000 credits and 30 TP, with a carcass reported. */
function mission(overrides: Partial<Mission> = {}): Mission {
  return {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: "city-1",
    difficulty: 4,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "medium",
      seed: "s",
      techCarcass: { techPoints: 40 },
    },
    rewards: { credits: 1000, techPoints: 30 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    ...overrides,
  };
}

/** Every type reports nothing beyond the outcome, unless `types` says otherwise. */
function reports(
  types: Partial<Record<MissionTypeId, InstantWinReporter>> = {},
  stories: InstantWinReports["stories"] = {},
): InstantWinReports {
  const none: InstantWinReporter = () => ({});
  const table = Object.fromEntries(
    MISSION_TYPE_IDS.map((typeId) => [typeId, types[typeId] ?? none]),
  ) as Record<MissionTypeId, InstantWinReporter>;
  return { types: table, stories };
}

/** A resolver over the shipped reward scale, typed as the interface the launch handler calls. */
function resolver(table: InstantWinReports = reports()): MissionResolver {
  return new InstantWinMissionResolver({
    rewards: AUTO_RESOLVE_TUNING,
    reports: table,
  });
}

/** An Rng that fails the test on any use: the instant win must draw nothing. */
const NO_DRAWS: Rng = new Proxy({} as Rng, {
  get: (_target, name) => () => {
    throw new Error(`the instant win drew from the rng (${String(name)})`);
  },
});

/** A launch-time state with nobody on the roster; the resolver never reads it. */
const STATE: MissionResolutionState = {
  squads: [],
  mechs: [],
  city: {
    id: "city-1",
    name: "City",
    regionId: "region-1",
    infestation: 40,
    detected: true,
    scale: "city",
    population: 1_000_000,
    neighbourIds: [],
    layout: { x: 0, y: 0 },
  },
};

/** Resolves `m` as the launch handler would, with the given deployment. */
function resolve(
  m: Mission,
  table?: InstantWinReports,
  squadIds: readonly string[] = ["squad-1"],
) {
  return resolver(table).resolve(
    m,
    { missionId: m.id, squadIds, mechIds: [] },
    STATE,
    NO_DRAWS,
  );
}

// ===========================================
// Tests
// ===========================================

describe("InstantWinMissionResolver (#1235)", () => {
  it("settles any mission as won, with no casualties, damage or objectives", () => {
    const result = resolve(mission());

    expect(result.outcome).toBe("won");
    expect(result.missionId).toBe("mission-1");
    expect(result.cityId).toBe("city-1");
    expect(result.squadCasualties).toEqual([]);
    expect(result.squadsWiped).toEqual([]);
    expect(result.mechsDestroyed).toEqual([]);
    expect(result.mechDamage).toEqual([]);
    expect(result.objectives).toBeUndefined();
  });

  it("pays the win on the reward scale, and nothing optional: no carcass, no bounty", () => {
    const m = mission();
    const result = resolve(m);

    expect(result.creditsAwarded).toBe(
      creditsFor("won", m, AUTO_RESOLVE_TUNING),
    );
    expect(result.techPointsAwarded).toBe(
      techPointsFor("won", m, AUTO_RESOLVE_TUNING),
    );
    expect(result.infestationDelta).toBe(
      infestationDeltaFor("won", m, AUTO_RESOLVE_TUNING),
    );
    expect(result.creditsAwarded).toBeGreaterThan(0);
    expect(result.infestationDelta).toBeLessThan(0);
    expect(result.techPointsHarvested).toBeUndefined();
    expect(result.techPointsBounty).toBeUndefined();
  });

  it("brings the offer's parts home, and reports none when it promised none", () => {
    const parts = ["arm.autocannon", "legs.strider"];
    const withParts = resolve(
      mission({ rewards: { credits: 500, techPoints: 0, parts } }),
    );

    expect(withParts.partsAwarded).toEqual(parts);
    expect("partsAwarded" in resolve(mission())).toBe(false);
  });

  it("lays the mission type's report over the result", () => {
    const table = reports({ "crash-site": () => ({ podDestroyed: true }) });

    expect(resolve(mission({ typeId: "crash-site" }), table).podDestroyed).toBe(
      true,
    );
    expect(resolve(mission(), table).podDestroyed).toBeUndefined();
  });

  it("uses a story mission's report in place of its type's, not on top of it", () => {
    const table = reports(
      { "crash-site": () => ({ podDestroyed: true }) },
      { "intact-pod": () => ({ podRecovered: true, podHpLeft: 9 }) },
    );
    const intactPod = resolve(
      mission({ typeId: "crash-site", storyId: "intact-pod" }),
      table,
    );
    const firstSkyfall = resolve(
      mission({ typeId: "crash-site", storyId: "first-skyfall" }),
      table,
    );

    expect(intactPod.podRecovered).toBe(true);
    expect(intactPod.podHpLeft).toBe(9);
    expect(intactPod.podDestroyed).toBeUndefined();
    expect(firstSkyfall.podDestroyed).toBe(true);
  });

  it("names every species the mix rolls and the report's placed ones, once each, in bestiary order", () => {
    const table = reports({
      "alpha-hunt": () => ({ speciesKilled: ["broodmother", "lurker"] }),
    });
    const result = resolve(
      mission({
        typeId: "alpha-hunt",
        bugMix: { lurker: 2, swarmer: 5, brute: 0 },
      }),
      table,
    );

    expect(result.speciesKilled).toEqual(["swarmer", "lurker", "broodmother"]);
    expect("speciesKilled" in resolve(mission())).toBe(false);
  });

  it("draws nothing and does not care who was deployed", () => {
    const m = mission({ bugMix: { swarmer: 3 } });

    expect(resolve(m, undefined, ["squad-1"])).toEqual(
      resolve(m, undefined, ["squad-1", "squad-2", "squad-3"]),
    );
  });
});
