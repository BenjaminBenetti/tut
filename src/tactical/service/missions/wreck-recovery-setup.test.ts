import { describe, expect, it } from "vitest";

import { MISSION_TYPES } from "../../../content/data/mission-types";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../../economy/data/economy-tuning";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../../overworld/data/earth-map";
import { MISSION_TUNING } from "../../../overworld/data/mission-tuning";
import { NEW_GAME_TUNING } from "../../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../../overworld/data/threat-tuning";
import type { Mission } from "../../../overworld/model/mission";
import { wreckOf } from "../../../overworld/service/wreck-service";
import { MECH_RATING_TUNING } from "../../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../../roster/data/parts";
import { SQUAD_TYPES } from "../../../roster/data/squad-types";
import {
  STARTER_LOADOUT,
  STARTER_ROSTER,
} from "../../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../../roster/repository/static-part-catalogue";
import { createMech } from "../../../roster/service/mech-factory";
import { validateLoadout } from "../../../roster/service/loadout-validation-service";
import type { GameState } from "../../../save/model/game-state";
import { createNewGame } from "../../../save/service/new-game-service";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GARRISON_TUNING } from "../../data/garrison-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { UNIT_TUNING } from "../../data/unit-tuning";
import type { MissionSetupDeps } from "../../model/mission-setup-rule";
import type { MissionStartDeps } from "../mission-start-service";
import { startTacticalMission } from "../mission-start-service";
import {
  missionWith,
  openField,
  unitAt,
} from "../tactical-fixtures.test-helper";
import { MISSION_SETUP_RULES } from "./mission-setup-rules";
import { WRECK_RECOVERY_SETUP } from "./wreck-recovery-setup";

// ===========================================
// Fixtures
// ===========================================

/** Ground tile (x, z). */
function at(x: number, z: number): TileCoord {
  return { x, y: 0, z };
}

const HAMMERHEAD = createMech(STARTER_LOADOUT, "mech-9", "Hammerhead");

/** A wreck recovery offer for Hammerhead, or a bare one without its record. */
function recovery(withWreck = true, seed = "wreck-setup"): Mission {
  const base: Mission = {
    id: "mission-1",
    typeId: "wreck-recovery",
    cityId: "city-1",
    difficulty: 3,
    mapParams: {
      biome: "temperate",
      settlement: "town",
      size: "small",
      seed,
    },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 5,
    expiresDay: 8,
    ignorePenalty: 0,
  };
  if (!withWreck) {
    return base;
  }
  const wreck = wreckOf(
    HAMMERHEAD,
    { ...base, id: "mission-0" },
    4,
    MISSION_TUNING.wreck.stripTurns,
  );
  return { ...base, wreck, rewards: { ...base.rewards, parts: wreck.parts } };
}

/** The 3 × 3 wreck square with its corner at (4, 4). */
const SQUARE = [4, 5, 6].flatMap((z) => [4, 5, 6].map((x) => at(x, z)));

/** An 8 × 8 field with a nest at (1, 7) and a wreck hook over `SQUARE`. */
function fixtureMap() {
  return openField()
    .deploy([at(0, 0)])
    .objective(HookKinds.EGG_SPAWNER, [at(1, 7)])
    .objective(HookKinds.WRECK, SQUARE, undefined, { footprint: 3 })
    .build();
}

/** Setup deps with a fresh id counter. */
function setupDeps(): MissionSetupDeps {
  return {
    ids: new SequentialIdGenerator(),
    spawnTuning: SPAWN_TUNING,
    generator: GENERATOR_TUNING,
    civilian: CIVILIAN_TUNING,
  };
}

// ===========================================
// The rule on a fixture map
// ===========================================

describe("WRECK_RECOVERY_SETUP", () => {
  it("is the table's setup for the wreck type", () => {
    expect(MISSION_SETUP_RULES["wreck-recovery"]).toBe(WRECK_RECOVERY_SETUP);
  });

  it("lays the lost mech across the wreck hook with one strip-wreck objective, the nests with none", () => {
    const map = fixtureMap();
    const base = missionWith(map, [unitAt("u", "infantry", at(0, 0))]);
    const setUp = WRECK_RECOVERY_SETUP.setup(
      base,
      map,
      recovery(),
      setupDeps(),
    );
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    const state = setUp.value;
    expect(state.spawners.map((spawner) => [spawner.id, spawner.pos])).toEqual([
      ["spawner-1", at(1, 7)],
    ]);
    expect(state.wrecks).toEqual([
      {
        id: "wreck-1",
        pos: at(5, 5),
        tiles: SQUARE,
        mechName: "Hammerhead",
        loadout: HAMMERHEAD.loadout,
      },
    ]);
    expect(state.objectives).toEqual([
      {
        id: "objective-1",
        kind: "strip-wreck",
        targetId: "wreck-1",
        turnsNeeded: 2,
        turnsWorked: 0,
        workedBy: [],
        complete: false,
      },
    ]);
    // The start's own base is untouched.
    expect(base.wrecks).toBeUndefined();
  });

  it("takes the strip turns from the offer's record", () => {
    const map = fixtureMap();
    const offer = recovery();
    const longer: Mission = {
      ...offer,
      ...(offer.wreck === undefined
        ? {}
        : { wreck: { ...offer.wreck, stripTurns: 3 } }),
    };
    const setUp = WRECK_RECOVERY_SETUP.setup(
      missionWith(map, []),
      map,
      longer,
      setupDeps(),
    );
    expect(setUp.ok && setUp.value.objectives[0]).toMatchObject({
      kind: "strip-wreck",
      turnsNeeded: 3,
    });
  });

  it("stands the nests and lays nothing for an offer that lost its record", () => {
    const map = fixtureMap();
    const setUp = WRECK_RECOVERY_SETUP.setup(
      missionWith(map, []),
      map,
      recovery(false),
      setupDeps(),
    );
    expect(setUp.ok).toBe(true);
    if (!setUp.ok) return;
    expect(setUp.value.spawners).toHaveLength(1);
    expect(setUp.value.wrecks).toBeUndefined();
    expect(setUp.value.objectives).toEqual([]);
  });
});

// ===========================================
// Through the mission start, on a generated map
// ===========================================

describe("a wreck recovery started from the campaign", () => {
  const PARTS = new StaticPartCatalogue(STARTER_PARTS);

  /** The mission start's shipped deps. */
  function startDeps(): MissionStartDeps {
    return {
      missionTypes: MISSION_TYPES,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      sheetFor: (mech) => {
        const sheet = validateLoadout(
          mech.loadout,
          PARTS,
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
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    };
  }

  it("lays the wreck on the map's wreck hook, a strip away from the drop ship", () => {
    const base = createNewGame(
      { seed: 11, createdAt: "2026-09-26T00:00:00.000Z" },
      {
        map: EARTH_MAP,
        squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
        starterRoster: STARTER_ROSTER,
        newGameTuning: NEW_GAME_TUNING,
        threatTuning: THREAT_TUNING,
        economyTuning: ECONOMY_TUNING,
      },
    );
    const offer = recovery(true, "wreck-start");
    const state: GameState = {
      ...base,
      overworld: { ...base.overworld, missions: [offer] },
    };
    const started = startTacticalMission(
      state,
      offer.id,
      {
        missionId: offer.id,
        squadIds: base.roster.squads.map((squad) => squad.id),
        mechIds: base.roster.mechs.map((mech) => mech.id),
      },
      startDeps(),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const mission = started.value.activeMission;
    const hook = mission?.map.hooks.objectives.find(
      (candidate) => candidate.kind === HookKinds.WRECK,
    );
    expect(hook?.tiles).toHaveLength(9);
    expect(mission?.wrecks).toHaveLength(1);
    const wreck = mission?.wrecks?.[0];
    expect(wreck?.tiles).toEqual(hook?.tiles);
    expect(hook?.tiles).toContainEqual(wreck?.pos);
    expect(wreck?.mechName).toBe("Hammerhead");
    expect(mission?.objectives.map((objective) => objective.kind)).toEqual([
      "strip-wreck",
    ]);
    expect(mission?.spawners.length).toBeGreaterThanOrEqual(1);
  });
});
