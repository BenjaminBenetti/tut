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
import { GARRISON_TUNING } from "../data/garrison-tuning";
import { GENERATOR_TUNING } from "../data/generator-tuning";
import { CIVILIAN_TUNING } from "../data/civilian-tuning";
import { SPAWN_TUNING } from "../data/spawn-tuning";
import { UNIT_TUNING } from "../data/unit-tuning";
import { abandonMission } from "../model/abandon-mission-command";
import { CARCASS_HARVESTED } from "../model/carcass-harvested-event";
import { CIVILIANS_KILLED } from "../model/civilians-killed-event";
import { MISSION_ENDED } from "../model/mission-ended-event";
import { UNIT_ABANDONED } from "../model/unit-abandoned-event";
import type { Objective } from "../model/tactical-state";
import type { TacticalState } from "../model/tactical-state";
import type { Unit } from "../model/unit";
import { UNIT_DIED } from "../model/unit-died-event";
import type { MissionResultDeps } from "./tactical-mission-resolver";
import {
  TacticalMissionResolver,
  tacticalMissionResult,
} from "./tactical-mission-resolver";
import { createAbandonMissionHandler } from "./abandon-mission-handler";
import {
  ctxWith,
  FIXTURE_TEMPLATES,
  missionWith,
  openField,
  unitAt,
  withCivilian,
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
/** The starter mech's hit points in these fixtures (70 since #1130). */
const MECH_HP = 70;
/** The fixture bug template, to derive species templates that carry a worth. */
const TEMPLATE_BUG = missionWith(MAP, []).templates[FIXTURE_TEMPLATES.bug]!;

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
    rewards: { credits, techPoints: 0 },
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
      detected: true,
      scale: "town",
      population: 1_000_000,
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
      cityId: "city-1",
      outcome: "won",
      squadCasualties: [],
      squadsWiped: [],
      mechsDestroyed: [],
      mechDamage: [],
      creditsAwarded: 1000,
      techPointsAwarded: 0,
      infestationDelta: -(
        TUNING.clearanceBase +
        TUNING.clearancePerDifficulty * 3
      ),
      // ADR 0013 §2.3: one row per objective, filled from the final state.
      objectives: [{ kind: "destroy-spawner", complete: true, failed: false }],
    });
  });

  it("tallies harvested tech points off the log: kept on a win or an extraction, gone on a loss (#1171)", () => {
    const priced: Mission = {
      ...mission(3),
      rewards: { credits: 1000, techPoints: 20 },
    };
    const harvestLog = [
      {
        type: CARCASS_HARVESTED,
        payload: { unitId: "unit-1", carcassId: "carcass-1", techPoints: 12 },
      },
      {
        type: CARCASS_HARVESTED,
        payload: { unitId: "unit-1", carcassId: "carcass-2", techPoints: 5 },
      },
    ] as const;
    const resolve = (
      outcome: "won" | "extracted" | "lost",
      log: readonly TacticalState["log"][number][],
    ) =>
      tacticalMissionResult(
        {
          tactical: missionWith(
            MAP,
            outcome === "lost"
              ? [squadUnit("unit-1", "squad-1", 0), bugUnit("unit-2")]
              : [bugUnit("unit-2")],
            {
              objectives: outcome === "won" ? DONE : OPEN,
              extracted:
                outcome === "lost"
                  ? []
                  : [squadUnit("unit-1", "squad-1", SQUAD_HP)],
              outcome,
              log,
            },
          ),
          mission: priced,
          deployment: deployment(["squad-1"]),
          state: resolutionState([squad("squad-1")]),
        },
        DEPS,
      );

    const won = resolve("won", harvestLog);
    expect(won.techPointsAwarded).toBe(20 + 17);
    expect(won.techPointsHarvested).toBe(17);

    const extracted = resolve("extracted", harvestLog);
    expect(extracted.techPointsAwarded).toBe(
      Math.floor(20 * TUNING.extractedRewardFraction) + 17,
    );
    expect(extracted.techPointsHarvested).toBe(17);

    const lost = resolve("lost", harvestLog);
    expect(lost.techPointsAwarded).toBe(0);
    // Still reported: the debrief can say what was stripped and lost.
    expect(lost.techPointsHarvested).toBe(17);

    // Nothing harvested: the field is absent, as it was before #1171.
    const quiet = resolve("won", []);
    expect(quiet.techPointsAwarded).toBe(20);
    expect(quiet).not.toHaveProperty("techPointsHarvested");
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
    // Off the map with the objectives done: won by the terminal check
    // alone, without a recorded outcome.
    const tactical: TacticalState = missionWith(MAP, [], {
      objectives: DONE,
      extracted: [squadUnit("unit-1", "squad-1", SQUAD_HP)],
    });
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

  it("names the roster entries left behind off the log, and only those (#1132)", () => {
    // Alpha and the mech were stranded when the player left; Bravo had
    // already boarded. The stranded two read as wiped and destroyed as
    // any fallen unit would, and the result says why.
    const tactical: TacticalState = {
      ...missionWith(
        MAP,
        [
          squadUnit("unit-1", "squad-1", 0),
          mechUnit("unit-3", "mech-1", 0),
          bugUnit("unit-4"),
        ],
        {
          objectives: OPEN,
          outcome: "lost",
          extracted: [squadUnit("unit-2", "squad-2", SQUAD_HP)],
        },
      ),
      log: [
        { type: UNIT_ABANDONED, payload: { unitId: "unit-1" } },
        { type: UNIT_ABANDONED, payload: { unitId: "unit-3" } },
        { type: MISSION_ENDED, payload: { outcome: "lost", turn: 4 } },
      ],
    };
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1", "squad-2"], ["mech-1"]),
        state: resolutionState(
          [squad("squad-1"), squad("squad-2")],
          [mech("mech-1")],
        ),
      },
      DEPS,
    );
    expect(result.leftBehind).toEqual(["squad-1", "mech-1"]);
    expect(result.squadsWiped).toEqual(["squad-1"]);
    expect(result.mechsDestroyed).toEqual(["mech-1"]);
    expect(result.outcome).toBe("lost");
  });

  it("carries no left-behind field on a mission nobody left (#1132)", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", 0), bugUnit("unit-3")],
      { objectives: OPEN, outcome: "lost" },
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
    expect(result.leftBehind).toBeUndefined();
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

  it("credits each kill with its template's worth, extracted killers included (#1130)", () => {
    const worth = {
      "bug:swarmer": { ...TEMPLATE_BUG, id: "bug:swarmer", xpValue: 10 },
      "bug:brute": { ...TEMPLATE_BUG, id: "bug:brute", xpValue: 60 },
      // A template saved before species carried a worth (#1130).
      "bug:old": { ...TEMPLATE_BUG, id: "bug:old" },
    };
    const swarmer = (id: string): Unit => ({
      ...bugUnit(id),
      templateId: "bug:swarmer",
    });
    const brute = (id: string): Unit => ({
      ...bugUnit(id),
      templateId: "bug:brute",
    });
    const base = missionWith(
      MAP,
      [
        mechUnit("unit-2", "mech-1", MECH_HP),
        swarmer("unit-3"),
        swarmer("unit-4"),
        brute("unit-6"),
        // A bug whose template predates worth: the kill counts, for nothing.
        { ...bugUnit("unit-7"), templateId: "bug:old" },
      ],
      { objectives: DONE, outcome: "won" },
    );
    const tactical: TacticalState = {
      ...base,
      templates: { ...base.templates, ...worth },
      // The squad boarded the drop ship: its kills still come home.
      extracted: [squadUnit("unit-1", "squad-1", SQUAD_HP)],
      log: [
        { type: UNIT_DIED, payload: { unitId: "unit-3", killerId: "unit-1" } },
        { type: UNIT_DIED, payload: { unitId: "unit-4", killerId: "unit-1" } },
        { type: UNIT_DIED, payload: { unitId: "unit-6", killerId: "unit-2" } },
        { type: UNIT_DIED, payload: { unitId: "unit-7", killerId: "unit-2" } },
      ],
    };
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1"], ["mech-1"]),
        state: resolutionState([squad("squad-1")], [mech("mech-1")]),
      },
      DEPS,
    );
    expect(result.squadCasualties).toEqual([
      { squadId: "squad-1", losses: 0, kills: 2, xp: 20 },
    ]);
    expect(result.mechDamage).toEqual([
      { mechId: "mech-1", damage: 0, kills: 2, xp: 60 },
    ]);
  });

  it("names each bug species that died, once, in first-death order (ADR 0013 §2.1)", () => {
    const of = (id: string, sourceId: string, hp = 0): Unit => ({
      ...bugUnit(id),
      sourceId,
      hp,
    });
    const tactical: TacticalState = {
      ...missionWith(
        MAP,
        [
          squadUnit("unit-1", "squad-1", 0),
          of("unit-2", "brute"),
          of("unit-3", "swarmer"),
          of("unit-4", "brute"),
          // Alive at the end: never died, so never counted.
          of("unit-5", "lurker", 10),
          // Not a species id: a fixture or a future placed unit.
          of("unit-6", "hive-core"),
          // Ours, however its source id reads, is never a species.
          { ...squadUnit("unit-7", "lurker", 0) },
        ],
        { objectives: OPEN, outcome: "lost" },
      ),
      log: [
        { type: UNIT_DIED, payload: { unitId: "unit-2", killerId: "unit-1" } },
        // One of ours dying names no species.
        { type: UNIT_DIED, payload: { unitId: "unit-1", killerId: "unit-3" } },
        // A death with no killer still counts.
        { type: UNIT_DIED, payload: { unitId: "unit-3" } },
        { type: UNIT_DIED, payload: { unitId: "unit-4", killerId: "unit-1" } },
        { type: UNIT_DIED, payload: { unitId: "unit-6", killerId: "unit-1" } },
        { type: UNIT_DIED, payload: { unitId: "unit-7", killerId: "unit-4" } },
      ],
    };
    const result = tacticalMissionResult(
      {
        tactical,
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result.speciesKilled).toEqual(["brute", "swarmer"]);
  });

  it("carries no species field when no bug died", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [squadUnit("unit-1", "squad-1", SQUAD_HP)], {
          objectives: DONE,
          outcome: "won",
        }),
        mission: mission(),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result).not.toHaveProperty("speciesKilled");
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
        garrison: GARRISON_TUNING,
        generator: GENERATOR_TUNING,
        civilian: CIVILIAN_TUNING,
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

// ===========================================
// Defences (#1175)
// ===========================================

describe("tacticalMissionResult on a defence (#1175)", () => {
  const DEFENCE: Objective = {
    id: "objective-1",
    kind: "defend-generators",
    installation: "repellent-dispersal",
    targetIds: ["gen-1", "gen-2"],
    complete: false,
    failed: false,
  };
  const generator = (id: string, hp: number): Unit => ({
    ...unitAt(id, "infantry", at(4, 4), { hp }),
    kind: "generator",
    sourceId: "generator",
  });

  function resolve(units: readonly Unit[], wave: number) {
    const tactical: TacticalState = missionWith(MAP, units, {
      objectives: [DEFENCE],
      extracted: [squadUnit("unit-1", "squad-1", SQUAD_HP)],
      edgeSpawn: { nextTurn: 20, wave, totalWaves: 3 },
      outcome: "extracted",
    });
    return tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
  }

  it("reports the installation held while a generator still runs", () => {
    const result = resolve([generator("gen-1", 0), generator("gen-2", 5)], 1);
    expect(result.defence).toEqual({
      installation: "repellent-dispersal",
      held: true,
    });
  });

  it("reports the installation lost once every generator is wrecked", () => {
    const result = resolve([generator("gen-1", 0), generator("gen-2", 0)], 3);
    expect(result.defence).toEqual({
      installation: "repellent-dispersal",
      held: false,
    });
    // A generator is not roster: nothing is reported destroyed or lost.
    expect(result.mechsDestroyed).toEqual([]);
    expect(result.squadCasualties).toEqual([]);
  });

  it("reports the defence's objective row with the generators still running (ADR 0013 §2.3)", () => {
    const result = resolve([generator("gen-1", 0), generator("gen-2", 5)], 1);
    expect(result.objectives).toEqual([
      {
        kind: "defend-generators",
        complete: false,
        failed: false,
        done: 1,
        total: 2,
      },
    ]);
  });

  it("carries no defence field on a clearance", () => {
    const tactical: TacticalState = missionWith(
      MAP,
      [squadUnit("unit-1", "squad-1", SQUAD_HP)],
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
    expect("defence" in result).toBe(false);
  });
});

// ===========================================
// Captures (#1179)
// ===========================================

describe("tacticalMissionResult on a capture (#1179)", () => {
  const CAPTURE: Objective = {
    id: "objective-1",
    kind: "capture-specimen",
    species: "lurker",
    complete: false,
    failed: false,
  };

  /** The mission resolved with `extracted` home and nobody left on the map. */
  function resolve(extracted: readonly Unit[]) {
    const tactical: TacticalState = missionWith(MAP, [], {
      objectives: [CAPTURE],
      extracted,
      outcome: "won",
    });
    return tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
  }

  it("reports the species brought home once its carrier extracted", () => {
    const carrier: Unit = {
      ...squadUnit("unit-1", "squad-1", SQUAD_HP),
      carrying: {
        unitId: "bug-9",
        species: "lurker",
        templateId: FIXTURE_TEMPLATES.bug,
        movePenalty: 1,
      },
    };
    const result = resolve([carrier]);
    expect(result.specimenCaptured).toBe("lurker");
    expect(result.objectives).toEqual([
      {
        kind: "capture-specimen",
        complete: true,
        failed: false,
        done: 1,
        total: 1,
      },
    ]);
  });

  it("carries no specimen field when the squads came home empty-handed", () => {
    const result = resolve([squadUnit("unit-1", "squad-1", SQUAD_HP)]);
    expect("specimenCaptured" in result).toBe(false);
  });
});

// ===========================================
// Objective rows
// ===========================================

describe("tacticalMissionResult objective rows (ADR 0013 §2.3)", () => {
  /** An extraction's result on the fixture map with `objectives`. */
  function resolveWith(objectives: readonly Objective[]) {
    const tactical: TacticalState = missionWith(MAP, [], {
      objectives,
      extracted: [squadUnit("unit-1", "squad-1", SQUAD_HP)],
      outcome: "extracted",
    });
    return tacticalMissionResult(
      {
        tactical,
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
  }

  it("reports an objective missed on its deadline as failed", () => {
    const missed = OPEN.map((objective) => ({ ...objective, failed: true }));
    expect(resolveWith(missed).objectives).toEqual([
      { kind: "destroy-spawner", complete: false, failed: true },
    ]);
  });

  it("carries no objectives field on a mission without objectives", () => {
    expect("objectives" in resolveWith([])).toBe(false);
  });
});

describe("tacticalMissionResult on a rescue (campaign arc §6.4)", () => {
  const RESCUE: Objective = {
    id: "objective-1",
    kind: "rescue-civilians",
    groupIds: ["civ-1", "civ-2", "civ-3"],
    complete: false,
    failed: false,
  };

  /**
   * The squad bailing out of a town: one group aboard, one still trapped,
   * one the bugs killed. The abandon handler's events go on the log, as
   * the lifting adapter puts them there.
   */
  function bailedOut(): TacticalState {
    let town = missionWith(MAP, [squadUnit("unit-1", "squad-1", SQUAD_HP)], {
      objectives: [RESCUE],
    });
    town = withCivilian(town, "civ-1", at(0, 0), { trapped: false });
    town = withCivilian(town, "civ-2", at(5, 5));
    town = withCivilian(town, "civ-3", at(6, 6), { hp: 0 });
    const aboard = town.units.filter((unit) => unit.id === "civ-1");
    const played: TacticalState = {
      ...town,
      units: town.units.filter((unit) => !aboard.includes(unit)),
      extracted: aboard,
      log: [
        {
          type: CIVILIANS_KILLED,
          payload: { unitId: "civ-3", pos: at(6, 6), killerId: "unit-1" },
        },
      ],
    };
    const left = createAbandonMissionHandler()(
      played,
      abandonMission(),
      ctxWith(new Mulberry32Rng(1)),
    );
    if (!left.ok) throw new Error(`refused: ${left.error.kind}`);
    return {
      ...left.value.state,
      log: [...played.log, ...left.value.events],
    };
  }

  it("reports the groups got out and never a group as a casualty, a kill or a unit left behind", () => {
    const result = tacticalMissionResult(
      {
        tactical: bailedOut(),
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result.outcome).toBe("lost");
    expect(result.leftBehind).toEqual(["squad-1"]);
    expect(result.squadCasualties).toEqual([{ squadId: "squad-1", losses: 5 }]);
    expect(result.squadsWiped).toEqual(["squad-1"]);
    expect(result.mechsDestroyed).toEqual([]);
    expect(result.speciesKilled).toBeUndefined();
    expect(result.civiliansRescued).toBe(1);
    expect(result.civiliansTotal).toBe(3);
    expect(result.objectives).toEqual([
      {
        kind: "rescue-civilians",
        complete: false,
        failed: true,
        done: 1,
        total: 3,
      },
    ]);
  });

  it("carries no civilian fields on a mission without a rescue", () => {
    const result = tacticalMissionResult(
      {
        tactical: missionWith(MAP, [squadUnit("unit-1", "squad-1", SQUAD_HP)], {
          objectives: DONE,
          outcome: "won",
        }),
        mission: mission(3),
        deployment: deployment(["squad-1"]),
        state: resolutionState([squad("squad-1")]),
      },
      DEPS,
    );
    expect(result).not.toHaveProperty("civiliansRescued");
    expect(result).not.toHaveProperty("civiliansTotal");
  });
});
