import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import type { Rng } from "../../core/model/rng";
import type { Deployment } from "./deployment";
import type { Mission } from "./mission";
import type { MissionResolutionState } from "./mission-resolution-state";
import type { MissionResult } from "./mission-result";
import type { MissionResolver } from "./mission-resolver";

const MISSION: Mission = {
  id: "mission-4",
  typeId: "infestation-clearance",
  cityId: "new-york",
  difficulty: 5,
  mapParams: {
    biome: "temperate",
    settlement: "city",
    size: "medium",
    seed: "mission-4:map",
  },
  rewards: { credits: 1500 },
  createdDay: 3,
  expiresDay: 8,
  ignorePenalty: 10,
};

const DEPLOYMENT: Deployment = {
  missionId: MISSION.id,
  squadIds: ["squad-1"],
  mechIds: [],
};

const STATE: MissionResolutionState = {
  squads: [
    {
      id: "squad-1",
      name: "Alpha",
      typeId: "rifle",
      strength: 5,
      maxStrength: 5,
      kills: 0,
      missionsSurvived: 0,
      xp: 0,
    },
  ],
  mechs: [],
  city: {
    id: "new-york",
    name: "New York",
    regionId: "north-america-east",
    infestation: 40,
    scale: "city",
    neighbourIds: [],
    layout: { x: 0, y: 0 },
  },
};

/**
 * A resolver that wins whenever the seeded coin lands heads. Exists to
 * show the contract is implementable with plain data and an injected RNG.
 */
class CoinFlipResolver implements MissionResolver {
  resolve(
    mission: Mission,
    deployment: Deployment,
    state: MissionResolutionState,
    rng: Rng,
  ): MissionResult {
    const won = rng.chance(0.5);
    const losses = won ? 0 : (state.squads[0]?.strength ?? 0);
    return {
      missionId: mission.id,
      cityId: "city-1",
      outcome: won ? "won" : "lost",
      squadCasualties: deployment.squadIds.map((squadId) => ({
        squadId,
        losses,
      })),
      squadsWiped: won ? [] : [...deployment.squadIds],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: won ? mission.rewards.credits : 0,
      infestationDelta: won ? -mission.difficulty * 5 : 0,
    };
  }
}

describe("MissionResolver contract", () => {
  it("is deterministic for the same seed", () => {
    const resolver = new CoinFlipResolver();
    const a = resolver.resolve(
      MISSION,
      DEPLOYMENT,
      STATE,
      new Mulberry32Rng(7),
    );
    const b = resolver.resolve(
      MISSION,
      DEPLOYMENT,
      STATE,
      new Mulberry32Rng(7),
    );
    expect(a).toEqual(b);
  });

  it("returns plain data that round-trips through JSON", () => {
    const result = new CoinFlipResolver().resolve(
      MISSION,
      DEPLOYMENT,
      STATE,
      new Mulberry32Rng(11),
    );
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.missionId).toBe(MISSION.id);
  });

  it("leaves its inputs untouched", () => {
    const missionBefore = JSON.stringify(MISSION);
    const deploymentBefore = JSON.stringify(DEPLOYMENT);
    const stateBefore = JSON.stringify(STATE);
    new CoinFlipResolver().resolve(
      MISSION,
      DEPLOYMENT,
      STATE,
      new Mulberry32Rng(3),
    );
    expect(JSON.stringify(MISSION)).toBe(missionBefore);
    expect(JSON.stringify(DEPLOYMENT)).toBe(deploymentBefore);
    expect(JSON.stringify(STATE)).toBe(stateBefore);
  });
});
