import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import { MISSION_TYPE_IDS } from "../../content/model/mission-type-id";
import type { StoryMissionId } from "../../content/model/story-mission-id";
import { TUNNEL_MOUTH_COUNT } from "../../mapgen/service/missions/tunnel-sabotage-map";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { HIVE_TUNING } from "../../overworld/data/hive-tuning";
import { MISSION_TUNING } from "../../overworld/data/mission-tuning";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResult } from "../../overworld/model/mission-result";
import { InstantWinMissionResolver } from "../../overworld/service/instant-win-mission-resolver";
import { broodmotherKilled } from "../../overworld/service/missions/alpha-hunt-consequence";
import { podWrecked } from "../../overworld/service/missions/crash-site-consequence";
import {
  EVACUATION_CONSEQUENCE,
  evacueesSaved,
} from "../../overworld/service/missions/evacuation-consequence";
import { tunnelsSealed } from "../../overworld/service/missions/tunnel-sabotage-consequence";
import { wreckOf } from "../../overworld/service/wreck-service";
import { STARTER_LOADOUT } from "../../roster/data/starter-roster";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { INSTANT_WIN_REPORTS } from "./instant-win-reports";
import { podHp } from "./spawn-service";
import { LIVE_SPECIMEN_SPECIES } from "./story/live-specimen-setup";

// ===========================================
// Fixtures
// ===========================================

/** A d5 offer of `typeId` with the spec its decoration would add. */
function offer(typeId: MissionTypeId, storyId?: StoryMissionId): Mission {
  const base: Mission = {
    id: `mission-${typeId}`,
    typeId,
    cityId: "city-1",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "medium",
      seed: "s",
    },
    rewards: { credits: 1000, techPoints: 20 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 10,
    bugMix: { swarmer: 4, spitter: 1 },
    ...(storyId === undefined ? {} : { storyId }),
  };
  switch (typeId) {
    case "defend-installation":
      return {
        ...base,
        defence: { installation: "sensor-array", generators: 2, waves: 3 },
      };
    case "evacuation":
      return { ...base, evacuation: { groups: 4, creditsPerGroup: 150 } };
    case "wreck-recovery":
      return {
        ...base,
        wreck: wreckOf(
          {
            id: "mech-lost",
            name: "Lost",
            loadout: STARTER_LOADOUT,
            damage: 0,
            kills: 0,
            missionsSurvived: 0,
            xp: 0,
          },
          { ...base, id: "mission-lost" },
          1,
          MISSION_TUNING.wreck.stripTurns,
        ),
      };
    case "hive-assault":
      return {
        ...base,
        hive: { hiveId: "hive-1", regionId: "region-1", level: 1 },
      };
    case "tunnel-sabotage":
      return {
        ...base,
        tunnelSabotage: { cityId: "city-1", spreadDueDay: 3 },
      };
    default:
      return base;
  }
}

const RESOLVER = new InstantWinMissionResolver({
  rewards: AUTO_RESOLVE_TUNING,
  reports: INSTANT_WIN_REPORTS,
});

/** The instant win of `mission`. */
function won(mission: Mission): MissionResult {
  return RESOLVER.resolve(mission);
}

// ===========================================
// Tests
// ===========================================

describe("INSTANT_WIN_REPORTS (#1235)", () => {
  it("leaves every type's result won, whatever its map reports", () => {
    for (const typeId of MISSION_TYPE_IDS) {
      expect(won(offer(typeId)).outcome, typeId).toBe("won");
    }
  });

  it("crash site: the pod destroyed, so the landing is erased", () => {
    const result = won(offer("crash-site"));

    expect(result.podDestroyed).toBe(true);
    expect(podWrecked(result)).toBe(true);
  });

  it("Intact Pod: the pod recovered whole, never destroyed", () => {
    const mission = offer("crash-site", "intact-pod");
    const result = won(mission);

    expect(result.podRecovered).toBe(true);
    expect(result.podHpLeft).toBe(podHp(mission.difficulty, SPAWN_TUNING));
    expect(result.podHpLeft).toBeGreaterThan(0);
    expect(result.podDestroyed).toBeUndefined();
  });

  it("First Skyfall keeps its type's report: a crash site whose pod is destroyed", () => {
    expect(won(offer("crash-site", "first-skyfall")).podDestroyed).toBe(true);
  });

  it("Live Specimen: the species its setup stands, captured", () => {
    expect(
      won(offer("infestation-clearance", "live-specimen")).specimenCaptured,
    ).toBe(LIVE_SPECIMEN_SPECIES);
  });

  it("defence: the offer's installation held", () => {
    expect(won(offer("defend-installation")).defence).toEqual({
      installation: "sensor-array",
      held: true,
    });
  });

  it("evacuation: every group aboard, so the city is saved and each group paid", () => {
    const mission = offer("evacuation");
    const result = won(mission);
    const ctx = { tuning: MISSION_TUNING, hive: HIVE_TUNING };

    expect(result.civiliansRescued).toBe(4);
    expect(result.civiliansTotal).toBe(4);
    expect(evacueesSaved(result)).toBe(true);
    expect(
      EVACUATION_CONSEQUENCE.settle?.(mission, result, ctx).creditsAwarded,
    ).toBe(result.creditsAwarded + 4 * 150);
  });

  it("tunnel sabotage: every mouth sealed, so the spread is held", () => {
    const result = won(offer("tunnel-sabotage"));

    expect(result.tunnelsSealed).toBe(TUNNEL_MOUTH_COUNT);
    expect(result.tunnelsTotal).toBe(TUNNEL_MOUTH_COUNT);
    expect(tunnelsSealed(result)).toBe(true);
  });

  it("Alpha Hunt: the Broodmother killed, not escaped, and counted among the kills", () => {
    const result = won(offer("alpha-hunt"));

    expect(result.broodmotherKilled).toBe(true);
    expect(result.broodmotherEscaped).toBe(false);
    expect(broodmotherKilled(result)).toBe(true);
    expect(result.speciesKilled).toEqual(["swarmer", "spitter", "broodmother"]);
  });

  it("hive assault: the core destroyed and its guards killed", () => {
    const result = won(offer("hive-assault"));

    expect(result.hiveCoreDestroyed).toBe(true);
    expect(result.speciesKilled).toContain("hive-guard");
  });

  it("wreck recovery: the wreck stripped, every turn worked", () => {
    const mission = offer("wreck-recovery");

    expect(won(mission).wreck).toEqual({
      stripped: true,
      turnsWorked: MISSION_TUNING.wreck.stripTurns,
      turnsNeeded: MISSION_TUNING.wreck.stripTurns,
    });
  });

  it("Spore Platform: every stage won, in play order", () => {
    const stages = MISSION_TYPES["spore-platform"].stages ?? [];
    const result = won(offer("spore-platform", "spore-platform"));

    expect(stages.length).toBeGreaterThan(1);
    expect(result.stages).toEqual(
      stages.map((_, index) => ({ index, outcome: "won", turns: 0 })),
    );
    expect(result.speciesKilled).toContain("hive-guard");
  });

  it("is a pure function of the offer, which it leaves untouched", () => {
    for (const typeId of MISSION_TYPE_IDS) {
      const mission = offer(typeId);
      const copy = structuredClone(mission);
      expect(won(mission), typeId).toEqual(won(mission));
      expect(mission, typeId).toEqual(copy);
    }
  });
});
