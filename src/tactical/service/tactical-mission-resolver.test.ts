import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../content/data/mission-types";
import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { AUTO_RESOLVE_TUNING } from "../../overworld/data/auto-resolve-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { City } from "../../overworld/model/city";
import type { Deployment } from "../../overworld/model/deployment";
import type { Mission } from "../../overworld/model/mission";
import type { MissionResolutionState } from "../../overworld/model/mission-resolution-state";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import type { Mech } from "../../roster/model/mech";
import { MECH_MAX_DAMAGE } from "../../roster/model/mech";
import type { Squad } from "../../roster/model/squad";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import type { Objective } from "../model/tactical-state";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_DIED } from "../model/unit-died-event";
import type { MissionResultDeps } from "./tactical-mission-resolver";
import {
  TacticalMissionResolver,
  tacticalMissionResult,
} from "./tactical-mission-resolver";
import {
  missionWith,
  openField,
  unitAt,
} from "./tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const TUNING = AUTO_RESOLVE_TUNING;
const HP_PER_SOLDIER = UNIT_TUNING.infantry.hpPerSoldier;
const DEPS: MissionResultDeps = {
  hpPerSoldier: HP_PER_SOLDIER,
  tuning: TUNING,
};
const MAP = openField().build();
/** Squad hit points a squad unit is built with: five soldiers' worth. */
const SQUAD_HP = 5 * HP_PER_SOLDIER;
/** The starter mech's hit points in these fixtures. */
const MECH_HP = 80;

function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

function squad(id: string, strength = 5): Squad {
  return {
    id,
    name: id,
    typeId: "rifle",
    strength,
    maxStrength: 5,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mech(id: string, damage = 0): Mech {
  return {
    id,
    name: id,
    loadout: {
      name: "l",
      chassisId: "c",
      legsId: "l",
      armsId: "a",
      armWeaponId: "aw",
      backWeaponId: "bw",
      utilityIds: [],
    },
    damage,
    kills: 0,
    missionsSurvived: 0,
    xp: 0,
  };
}

function mission(difficulty = 3, credits = 1000): Mission {
  return {
    id: "mission-1",
    typeId: "infestation-clearance",
    cityId: "city-1",
    difficulty,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "medium",
      seed: "s",
    },
    rewards: { credits },
    createdDay: 1,
    expiresDay: 5,
    ignorePenalty: 3,
  };
}

/** A squad token for a roster squad, at `hp` of its five soldiers' worth. */
function squadUnit(id: string, sourceId: string, hp: number): Unit {
  return {
    ...unitAt(id, "infantry", at(1, 1)),
    sourceId,
    hp,
    maxHp: SQUAD_HP,
  };
}

/** A mech token for a roster mech, at `hp` of `MECH_HP`. */
function mechUnit(id: string, sourceId: string, hp: number): Unit {
  return {
    ...unitAt(id, "mech", at(2, 2)),
    kind: "mech",
    sourceId,
    hp,
    maxHp: MECH_HP,
  };
}

function bugUnit(id: string): Unit {
  return unitAt(id, "infantry", at(7, 7), { team: "bugs", hp: 0 });
}

const DONE: readonly Objective[] = [
  {
    id: "objective-1",
    kind: "destroy-spawner",
    targetId: "spawner-1",
    complete: true,
  },
];
const OPEN: readonly Objective[] = [
  {
    id: "objective-1",
    kind: "destroy-spawner",
    targetId: "spawner-1",
    complete: false,
  },
];

function resolutionState(
  squads: readonly Squad[],
  mechs: readonly Mech[] = [],
): MissionResolutionState {
  return {
    squads,
    mechs,
    city: {
      id: "city-1",
      name: "c",
      regionId: "region-1",
      infestation: 20,
      scale: "town",
      neighbourIds: [],
      layout: { x: 0, y: 0 },
    },
  };
}

function deployment(
  squadIds: readonly string[],
  mechIds: readonly string[] = [],
): Deployment {
  return { missionId: "mission-1", squadIds, mechIds };
}

/** A new campaign with one small clearance mission on an infested city. */
function newCampaign(): {
  readonly state: GameState;
  readonly mission: Mission;
  readonly city: City;
  readonly deployment: Deployment;
} {
  const base = createNewGame(
    { seed: 7, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city =
    base.overworld.map.cities.find((c) => c.infestation > 0) ??
    base.overworld.map.cities[0];
  if (!city) throw new Error("fixture needs a city");
  const region = base.overworld.map.regions.find((r) => r.id === city.regionId);
  if (!region) throw new Error("fixture needs a region");
  const launched: Mission = {
    ...mission(1, 300),
    cityId: city.id,
    mapParams: {
      biome: region.biome,
      settlement: city.scale,
      size: "small",
      seed: "resolve-1",
    },
  };
  return {
    state: {
      ...base,
      overworld: { ...base.overworld, missions: [launched] },
    },
    mission: launched,
    city,
    deployment: {
      missionId: launched.id,
      squadIds: base.roster.squads.map((s) => s.id),
      mechIds: base.roster.mechs.map((m) => m.id),
    },
  };
}

// ===========================================
// Outcomes
// ===========================================

describe("tacticalMissionResult", () => {
  it("wins by objectives: full credits, city cleared, survivors unhurt", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", SQUAD_HP), bugUnit("unit-2")],
      { objectives: DONE, outcome: "won" },
    );
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );

    expect(result).toEqual({
      missionId: "mission-1",
      outcome: "won",
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: 1000,
      infestationDelta: -(
        TUNING.clearanceBase +
        TUNING.clearancePerDifficulty * 3
      ),
    });
  });

  it("extracts with partial losses: a quarter of the credits, no infestation change", () => {
    const hurt = squadUnit("unit-1", "squad-1", SQUAD_HP - 2 * HP_PER_SOLDIER);
    const tactical: TacticalState = missionWith(MAP, [bugUnit("unit-2")], {
      objectives: OPEN,
      extracted: [hurt],
      outcome: "extracted",
    });
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );

    expect(result.outcome).toBe("extracted");
    expect(result.squadCasualties).toEqual([{ squadId: "squad-1", losses: 2 }]);
    expect(result.squadsWiped).toEqual([]);
    expect(result.creditsAwarded).toBe(
      Math.floor(1000 * TUNING.extractedRewardFraction),
    );
    expect(result.infestationDelta).toBe(0);
  });

  it("counts a wipe: every squad lost, no credits, the city worse off", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [
        squadUnit("unit-1", "squad-1", 0),
        mechUnit("unit-2", "mech-1", 0),
        bugUnit("unit-3"),
      ],
      { objectives: OPEN, outcome: "lost" },
    );
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"], ["mech-1"]),
        state: resolutionState([squad("squad-1")], [mech("mech-1")]),
      },
      DEPS,
    );

    expect(result.outcome).toBe("lost");
    expect(result.squadCasualties).toEqual([{ squadId: "squad-1", losses: 5 }]);
    expect(result.squadsWiped).toEqual(["squad-1"]);
    expect(result.mechDamage).toEqual([
      { mechId: "mech-1", damage: MECH_MAX_DAMAGE },
    ]);
    expect(result.mechsDestroyed).toEqual(["mech-1"]);
    expect(result.creditsAwarded).toBe(0);
    expect(result.infestationDelta).toBe(TUNING.lossInfestationPenalty);
  });

  it("falls back to the terminal check when the mission carries no outcome", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", SQUAD_HP)],
      { objectives: DONE },
    );
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result.outcome).toBe("won");
  });

  it("calls an abandoned mission lost", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", SQUAD_HP)],
      { objectives: OPEN },
    );
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result.outcome).toBe("lost");
  });
});

// ===========================================
// Casualties and damage
// ===========================================

describe("tacticalMissionResult casualties", () => {
  it("loses a soldier per full share of hit points, sparing the wounded", () => {
    const cases: readonly [number, number][] = [
      [SQUAD_HP, 0],
      [SQUAD_HP - 1, 0],
      [SQUAD_HP - HP_PER_SOLDIER, 1],
      [HP_PER_SOLDIER + 1, 3],
      [1, 4],
      [0, 5],
    ];
    for (const [hp, losses] of cases) {
      const result = tacticalMissionResult(
        {
          tactical: missionWith(MAP, [squadUnit("unit-1", "squad-1", hp)], {
            objectives: DONE,
            outcome: "won",
          }),
          mission: mission(),
          deployment: deployment(["squad-1"]),
          state: resolutionState([squad("squad-1")]),
        },
        DEPS,
      );
      expect([hp, result.squadCasualties[0]?.losses ?? 0]).toEqual([
        hp,
        losses,
      ]);
    }
  });

  it("never reports more losses than a depleted squad brought", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [squadUnit("unit-1", "squad-1", 0)], {
          objectives: DONE,
          outcome: "won",
        }),
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1", 2)]),
      },
      DEPS,
    );
    expect(result.squadCasualties).toEqual([{ squadId: "squad-1", losses: 2 }]);
    expect(result.squadsWiped).toEqual(["squad-1"]);
  });

  it("reads a mech's damage back off its hit points and adds it to what it arrived with", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(
          MAP,
          [mechUnit("unit-1", "mech-1", MECH_HP / 2)],
          { objectives: DONE, outcome: "won" },
        ),
        mission: mission(),
        deployment: deployment([], ["mech-1"]),
        state: resolutionState([], [mech("mech-1", 20)]),
      },
      DEPS,
    );
    expect(result.mechDamage).toEqual([{ mechId: "mech-1", damage: 30 }]);
    expect(result.mechsDestroyed).toEqual([]);
  });

  it("reports no damage for a mech that came home as it left", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [], {
          objectives: DONE,
          outcome: "won",
          extracted: [mechUnit("unit-1", "mech-1", MECH_HP)],
        }),
        mission: mission(),
        deployment: deployment([], ["mech-1"]),
        state: resolutionState([], [mech("mech-1", 40)]),
      },
      DEPS,
    );
    expect(result.mechDamage).toEqual([]);
    expect(result.mechsDestroyed).toEqual([]);
  });

  it("caps a wreck's damage at what the mech had left", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [mechUnit("unit-1", "mech-1", 0)], {
          objectives: DONE,
          outcome: "won",
        }),
        mission: mission(),
        deployment: deployment([], ["mech-1"]),
        state: resolutionState([], [mech("mech-1", 70)]),
      },
      DEPS,
    );
    expect(result.mechDamage).toEqual([{ mechId: "mech-1", damage: 30 }]);
    expect(result.mechsDestroyed).toEqual(["mech-1"]);
  });

  it("credits kills to the squad and mech that scored them, never to the bugs", () => {
    const tactical: TacticalState = {
      ...missionWith(
        MAP,
        [
          squadUnit("unit-1", "squad-1", SQUAD_HP),
          mechUnit("unit-2", "mech-1", MECH_HP),
          bugUnit("unit-3"),
          bugUnit("unit-4"),
          squadUnit("unit-5", "squad-2", 0),
        ],
        { objectives: DONE, outcome: "won" },
      ),
      log: [
        { type: UNIT_DIED, payload: { unitId: "unit-3", killerId: "unit-1" } },
        { type: UNIT_DIED, payload: { unitId: "unit-4", killerId: "unit-2" } },
        // A bug killing one of ours credits nobody.
        { type: UNIT_DIED, payload: { unitId: "unit-5", killerId: "unit-3" } },
        // An unattributed death credits nobody.
        { type: UNIT_DIED, payload: { unitId: "unit-4" } },
      ],
    };
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1", "squad-2"], ["mech-1"]),
        state: resolutionState(
          [squad("squad-1"), squad("squad-2")],
          [mech("mech-1")],
        ),
      },
      DEPS,
    );

    expect(result.squadCasualties).toEqual([
      { squadId: "squad-1", losses: 0, kills: 1 },
      { squadId: "squad-2", losses: 5 },
    ]);
    expect(result.mechDamage).toEqual([
      { mechId: "mech-1", damage: 0, kills: 1 },
    ]);
    expect(result.mechsDestroyed).toEqual([]);
  });

  it("reports no losses for a deployed unit with no token on the map", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [], { objectives: DONE, outcome: "won" }),
        mission: mission(),
        deployment: deployment(["squad-1"], ["mech-1"]),
        state: resolutionState([squad("squad-1")], [mech("mech-1")]),
      },
      DEPS,
    );
    expect(result.squadCasualties).toEqual([]);
    expect(result.squadsWiped).toEqual([]);
    expect(result.mechDamage).toEqual([]);
  });

  it("keeps the wiped and destroyed lists summaries of the reports", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(
          MAP,
          [squadUnit("unit-1", "squad-1", 0), mechUnit("unit-2", "mech-1", 0)],
          { objectives: OPEN, outcome: "lost" },
        ),
        mission: mission(),
        deployment: deployment(["squad-1"], ["mech-1"]),
        state: resolutionState([squad("squad-1")], [mech("mech-1")]),
      },
      DEPS,
    );
    for (const id of result.squadsWiped) {
      expect(result.squadCasualties.some((r) => r.squadId === id)).toBe(true);
    }
    for (const id of result.mechsDestroyed) {
      expect(result.mechDamage.some((r) => r.mechId === id)).toBe(true);
    }
  });

  it("leaves the mission and roster it was given alone", () => {
    const tactical = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", HP_PER_SOLDIER)],
      { objectives: DONE, outcome: "won" },
    );
    const state = resolutionState([squad("squad-1")]);
    const before = structuredClone({ tactical, state });
    tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state,
      },
      DEPS,
    );
    expect({ tactical, state }).toEqual(before);
  });
});

// ===========================================
// TacticalMissionResolver
// ===========================================

describe("TacticalMissionResolver", () => {
  const played = missionWith(MAP, [squadUnit("unit-1", "squad-1", SQUAD_HP)], {
    objectives: DONE,
    outcome: "won",
  });

  function resolver(
    finished: (missionId: string) => TacticalState | undefined,
  ): TacticalMissionResolver {
    return new TacticalMissionResolver({
      missionStartDepsFor: () => {
        throw new Error("mission start is not exercised here");
      },
      unitTuning: UNIT_TUNING,
      tuning: TUNING,
      finishedMission: finished,
    });
  }

  /** A resolver over the shipped content, as the composition root builds it. */
  function shippedResolver(
    finished: (missionId: string) => TacticalState | undefined,
  ): TacticalMissionResolver {
    const parts = new StaticPartCatalogue(STARTER_PARTS);
    return new TacticalMissionResolver({
      missionStartDepsFor: (ids) => ({
        missionTypes: MISSION_TYPES,
        squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
        sheetFor: (mech) => {
          const sheet = validateLoadout(
            mech.loadout,
            parts,
            MECH_RATING_TUNING,
            UPGRADE_TUNING,
          );
          return sheet.ok ? sheet.value : undefined;
        },
        unitTuning: UNIT_TUNING,
        spawnTuning: SPAWN_TUNING,
        ids,
        registries: createDefaultRegistries(),
      }),
      unitTuning: UNIT_TUNING,
      tuning: TUNING,
      finishedMission: finished,
    });
  }

  it("resolves the mission the tactical layer played, drawing nothing", () => {
    const subject = resolver((id) => (id === "mission-1" ? played : undefined));
    const first = subject.resolve(
      mission(),
      deployment(["squad-1"]),
      resolutionState([squad("squad-1")]),
      new Mulberry32Rng(1),
    );
    const second = subject.resolve(
      mission(),
      deployment(["squad-1"]),
      resolutionState([squad("squad-1")]),
      new Mulberry32Rng(9999),
    );
    expect(first.outcome).toBe("won");
    expect(first).toEqual(second);
  });

  it("throws when the launch path resolves a mission that was never played", () => {
    const subject = resolver(() => undefined);
    expect(() =>
      subject.resolve(
        mission(),
        deployment(["squad-1"]),
        resolutionState([squad("squad-1")]),
        new Mulberry32Rng(1),
      ),
    ).toThrow(/never played/);
  });

  it("runs a seeded mission from deployment to a result", () => {
    const campaign = newCampaign();
    const subject = shippedResolver(() => started?.activeMission);
    const begun = subject.beginMission(
      campaign.state,
      campaign.mission.id,
      campaign.deployment,
      new SequentialIdGenerator(),
    );
    if (!begun.ok) throw new Error(`start refused: ${begun.error.kind}`);
    let started: GameState = begun.value;
    const tactical = started.activeMission;
    if (!tactical) throw new Error("no mission was started");
    expect(tactical.units.length).toBe(
      campaign.deployment.squadIds.length + campaign.deployment.mechIds.length,
    );

    // Play it to a win: every spawner destroyed, every objective done.
    started = {
      ...started,
      activeMission: {
        ...tactical,
        spawners: tactical.spawners.map((s) => ({
          ...s,
          hp: 0,
          destroyed: true,
        })),
        objectives: tactical.objectives.map((o) => ({ ...o, complete: true })),
        outcome: "won",
      },
    };

    const result = subject.resolve(
      campaign.mission,
      campaign.deployment,
      {
        squads: campaign.state.roster.squads,
        mechs: campaign.state.roster.mechs,
        city: campaign.city,
      },
      new Mulberry32Rng(1),
    );
    expect(result.missionId).toBe(campaign.mission.id);
    expect(result.outcome).toBe("won");
    expect(result.creditsAwarded).toBe(campaign.mission.rewards.credits);
    expect(result.infestationDelta).toBeLessThan(0);
    expect(result.squadCasualties).toEqual([]);
    expect(result.mechDamage).toEqual([]);
  });
});
