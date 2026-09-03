import { describe, expect, it } from "vitest";

import { SQUAD_TYPES } from "../../roster/data/squad-types";
import type { MechRater } from "../../roster/model/mech-rater";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { AUTO_RESOLVE_TUNING } from "../data/auto-resolve-tuning";
import type { Mission } from "../model/mission";
import type { MissionResolutionState } from "../model/mission-resolution-state";
import { winProbability } from "./auto-resolve-mission-resolver";
import { createDeploymentAssessor } from "./deployment-assessment-service";
import { computeForceRating } from "./force-rating-service";

const RATER: MechRater = { rateMech: () => 40 };
const DEPS = {
  squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
  mechRater: RATER,
  tuning: AUTO_RESOLVE_TUNING,
};

const MISSION: Mission = {
  id: "mission-1",
  typeId: "infestation-clearance",
  cityId: "hub",
  difficulty: 4,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "small",
    seed: "1",
  },
  rewards: { credits: 1200 },
  createdDay: 1,
  expiresDay: 6,
  ignorePenalty: 10,
};

const STATE: MissionResolutionState = {
  squads: [
    {
      id: "s1",
      name: "A",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
    {
      id: "s2",
      name: "B",
      typeId: "rocket",
      strength: 3,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
  ],
  mechs: [
    {
      id: "m1",
      name: "M",
      loadout: {
        name: "l",
        chassisId: "c",
        legsId: "l",
        armsId: "a",
        armWeaponId: "aw",
        backWeaponId: "bw",
        utilityIds: [],
      },
      damage: 50,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
  ],
  city: {
    id: "hub",
    name: "Hub",
    regionId: "r",
    infestation: 40,
    scale: "city",
    neighbourIds: [],
    layout: { x: 0, y: 0 },
  },
};

describe("AutoResolveDeploymentAssessor", () => {
  it("reports the resolver's force, the even-fight target and its win curve", () => {
    const assessor = createDeploymentAssessor(DEPS);
    const deployment = {
      missionId: "mission-1",
      squadIds: ["s1", "s2"],
      mechIds: ["m1"],
    };
    const result = assessor.assess(MISSION, deployment, STATE);
    expect(result.force).toBe(computeForceRating(deployment, STATE, DEPS));
    expect(result.force).toBeGreaterThan(0);
    expect(result.target).toBe(4 * AUTO_RESOLVE_TUNING.difficultyScale);
    expect(result.winProbability).toBe(
      winProbability(result.force, 4, AUTO_RESOLVE_TUNING),
    );
  });

  it("rates an empty deployment at zero force with a slim chance", () => {
    const assessor = createDeploymentAssessor(DEPS);
    const result = assessor.assess(
      MISSION,
      { missionId: "mission-1", squadIds: [], mechIds: [] },
      STATE,
    );
    expect(result.force).toBe(0);
    expect(result.winProbability).toBeLessThan(0.5);
  });

  it("gains force with every unit added", () => {
    const assessor = createDeploymentAssessor(DEPS);
    const one = assessor.assess(
      MISSION,
      { missionId: "mission-1", squadIds: ["s1"], mechIds: [] },
      STATE,
    );
    const two = assessor.assess(
      MISSION,
      { missionId: "mission-1", squadIds: ["s1", "s2"], mechIds: [] },
      STATE,
    );
    const three = assessor.assess(
      MISSION,
      { missionId: "mission-1", squadIds: ["s1", "s2"], mechIds: ["m1"] },
      STATE,
    );
    expect(two.force).toBeGreaterThan(one.force);
    expect(three.force).toBeGreaterThan(two.force);
    expect(three.winProbability).toBeGreaterThan(one.winProbability);
  });
});
