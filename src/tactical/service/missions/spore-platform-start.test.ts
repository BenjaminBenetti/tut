import { describe, expect, it } from "vitest";

import { BUG_SPECIES } from "../../../bugs/data/species";
import { MISSION_TYPES } from "../../../content/data/mission-types";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { ECONOMY_TUNING } from "../../../economy/data/economy-tuning";
import { HookKinds } from "../../../mapgen/model/hook";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../../mapgen/service/default-registries";
import { EARTH_MAP } from "../../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../../overworld/data/threat-tuning";
import type { Mission } from "../../../overworld/model/mission";
import { MECH_RATING_TUNING } from "../../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../../roster/data/parts";
import { SQUAD_TYPES } from "../../../roster/data/squad-types";
import { STARTER_ROSTER } from "../../../roster/data/starter-roster";
import { UPGRADE_TUNING } from "../../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../../roster/service/loadout-validation-service";
import type { GameState } from "../../../save/model/game-state";
import { createNewGame } from "../../../save/service/new-game-service";
import { CIVILIAN_TUNING } from "../../data/civilian-tuning";
import { GARRISON_TUNING } from "../../data/garrison-tuning";
import { GENERATOR_TUNING } from "../../data/generator-tuning";
import { HIVE_ASSAULT_SETUP_TUNING } from "../../data/hive-assault-setup-tuning";
import { OBJECTIVE_TUNING } from "../../data/objective-tuning";
import { PLATFORM_ASSAULT_TUNING } from "../../data/platform-assault-tuning";
import { SPAWN_TUNING } from "../../data/spawn-tuning";
import { UNIT_TUNING } from "../../data/unit-tuning";
import type { CoreBoss, CoreBossPlacement } from "../../model/core-boss";
import { extract } from "../../model/extract-command";
import type { TacticalState } from "../../model/tactical-state";
import { spawnerFootprintTiles } from "../footprint-service";
import type { MissionStartDeps } from "../mission-start-service";
import { startTacticalMission } from "../mission-start-service";
import { advanceMissionStage, stagePending } from "../mission-stage-service";
import { createExtractHandler } from "../objective-service";
import { spawnerMiddleTile } from "../objectives/wreck-objectives";
import { ctxWith, riggedRng, unitAt } from "../tactical-fixtures.test-helper";

// ===========================================
// Fixtures
// ===========================================

const PARTS = new StaticPartCatalogue(STARTER_PARTS);

/** A stand-in boss: stands one bug where it is told and records the call. */
function standInBoss(calls: CoreBossPlacement[]): CoreBoss {
  return {
    species: BUG_SPECIES.brute,
    escort: ["swarmer-armoured", "lurker-armoured"],
    place: (state, position, deps) => {
      calls.push(deps);
      return {
        ...state,
        units: [
          ...state.units,
          unitAt(deps.ids.nextId("unit"), "infantry", position, {
            team: "bugs",
          }),
        ],
      };
    },
  };
}

/** The mission start's shipped deps, with the species and an optional boss. */
function startDeps(boss?: CoreBoss): MissionStartDeps {
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
    hiveGuard: BUG_SPECIES["hive-guard"],
    hiveAssault: HIVE_ASSAULT_SETUP_TUNING,
    ids: new SequentialIdGenerator(),
    registries: createDefaultRegistries(),
    species: Object.values(BUG_SPECIES),
    ...(boss === undefined ? {} : { coreBoss: boss }),
  };
}

/** A fresh campaign with the finale offered on its first city. */
function campaign(): { state: GameState; offer: Mission } {
  const base = createNewGame(
    { seed: 3, createdAt: "2026-09-26T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const city = base.overworld.map.cities[0];
  if (city === undefined) throw new Error("no city");
  const offer: Mission = {
    id: "mission-1",
    typeId: "spore-platform",
    cityId: city.id,
    difficulty: 10,
    mapParams: {
      biome: "temperate",
      settlement: city.scale,
      size: "large",
      seed: "platform-start",
    },
    rewards: { credits: 0, techPoints: 0 },
    createdDay: 1,
    expiresDay: 6,
    ignorePenalty: 0,
    storyId: "spore-platform",
    act: "finale",
    bugMix: { swarmer: 0.6, brute: 0.4 },
  };
  return {
    state: { ...base, overworld: { ...base.overworld, missions: [offer] } },
    offer,
  };
}

/** The finale's hull, started with the whole roster and two garrison turrets on offer. */
function hullStarted(boss?: CoreBoss): { state: GameState; offer: Mission } {
  const { state, offer } = campaign();
  const started = startTacticalMission(
    state,
    offer.id,
    {
      missionId: offer.id,
      squadIds: state.roster.squads.map((squad) => squad.id),
      mechIds: state.roster.mechs.map((mech) => mech.id),
    },
    startDeps(boss),
    { garrisonTurrets: 2 },
  );
  if (!started.ok) {
    throw new Error(`the hull did not start: ${JSON.stringify(started.error)}`);
  }
  return { state: started.value, offer };
}

/** The active mission; throws when there is none. */
function active(state: GameState): TacticalState {
  if (state.activeMission === undefined) throw new Error("no active mission");
  return state.activeMission;
}

/** The tiles of the map's first objective hook of `kind`. */
function hookTiles(map: TacticalMap, kind: string): readonly TileCoord[] {
  return map.hooks.objectives.find((hook) => hook.kind === kind)?.tiles ?? [];
}

const key = (tile: TileCoord): string => `${tile.x},${tile.y},${tile.z}`;

/**
 * Boards every unit of the force through the hatch: each stood on its
 * own hatch tile with full action points, then extracted in turn.
 */
function boardEveryone(state: GameState): GameState {
  const mission = active(state);
  const force = mission.units.filter((unit) => unit.team === "tdf");
  const hatch = mission.extraction;
  const placed: TacticalState = {
    ...mission,
    units: mission.units.map((unit) => {
      const slot = force.indexOf(unit);
      const tile = hatch[slot];
      return slot < 0 || tile === undefined
        ? unit
        : { ...unit, pos: tile, ap: unit.maxAp };
    }),
  };
  const handler = createExtractHandler(OBJECTIVE_TUNING);
  let current = placed;
  for (const unit of force) {
    const boarded = handler(
      current,
      extract(unit.id),
      ctxWith(riggedRng(true)),
    );
    if (!boarded.ok) {
      throw new Error(`${unit.id} could not board: ${boarded.error.kind}`);
    }
    current = boarded.value.state;
  }
  return { ...state, activeMission: current };
}

// ===========================================
// The hull
// ===========================================

describe("the Spore Platform's hull, started from the campaign (arc §6.9)", () => {
  it("builds the hull, the squad on the docking ring, the hatch as the way out, and no garrison", () => {
    const { state } = hullStarted();
    const mission = active(state);
    expect(mission.map.recipe.params.archetype).toBe("spore-platform-hull");
    expect(mission.stage).toEqual({ index: 0, count: 2, earlier: [] });
    const ring = new Set(
      hookTiles(mission.map, HookKinds.DOCKING_RING).map(key),
    );
    const force = mission.units.filter((unit) => unit.team === "tdf");
    expect(force.length).toBe(
      state.roster.squads.length + state.roster.mechs.length,
    );
    expect(force.every((unit) => ring.has(key(unit.pos)))).toBe(true);
    expect(mission.units.some((unit) => unit.kind === "turret")).toBe(false);
    expect(mission.objectives.map((objective) => objective.kind)).toEqual([
      "board-core",
    ]);
    expect(mission.extraction).toEqual(
      hookTiles(mission.map, HookKinds.PLATFORM_EXIT),
    );
    expect(mission.spawners.length).toBe(
      mission.map.hooks.objectives.filter(
        (hook) => hook.kind === HookKinds.EGG_SPAWNER,
      ).length,
    );
    expect(mission.bugMix).toEqual({ swarmer: 0.6, brute: 0.4 });
  });

  it("is won once the force is through the hatch, and waits for the core", () => {
    const { state } = hullStarted();
    const boarded = active(boardEveryone(state));
    expect(boarded.outcome).toBe("won");
    expect(stagePending(boarded)).toBe(true);
  });
});

// ===========================================
// The core
// ===========================================

describe("the Spore Platform's core, reached through the hatch (arc §6.9)", () => {
  it("builds the core chamber: the core, the guards, the boss on the dais, the escort in the waves", () => {
    const calls: CoreBossPlacement[] = [];
    const boss = standInBoss(calls);
    const { state } = hullStarted(boss);
    const hull = active(state);
    const advanced = advanceMissionStage(boardEveryone(state), startDeps(boss));
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    const core = active(advanced.value);
    expect(core.map.recipe.params.archetype).toBe("spore-platform-core");
    expect(core.stage?.index).toBe(1);

    const pad = hookTiles(core.map, HookKinds.PLATFORM_CORE).map(key);
    const [coreSpawner] = core.spawners;
    expect(coreSpawner).toMatchObject({
      variant: "platform-core",
      hp: PLATFORM_ASSAULT_TUNING.coreHp,
      destroyed: false,
    });
    if (coreSpawner === undefined) throw new Error("the core stands");
    // The 3×3 core stands inside its pad, centred on the tile the
    // Sovereign guards.
    const footprint = spawnerFootprintTiles(coreSpawner).map(key);
    expect(footprint).toHaveLength(9);
    for (const tile of footprint) {
      expect(pad).toContain(tile);
    }
    expect(core.objectives).toEqual([
      expect.objectContaining({
        kind: "destroy-platform-core",
        targetId: coreSpawner.id,
        coreHp: PLATFORM_ASSAULT_TUNING.coreHp,
      }),
    ]);
    expect(core.extraction).toEqual([]);
    expect(core.endsOnObjectives).toBe(true);
    expect(core.units.some((unit) => unit.kind === "turret")).toBe(false);

    const posts = core.map.hooks.objectives.filter(
      (hook) => hook.kind === HookKinds.GUARD_POST,
    );
    const guards = core.units.filter(
      (unit) => core.templates[unit.templateId]?.name === "Hive Guard",
    );
    expect(posts.length).toBeGreaterThan(0);
    expect(guards).toHaveLength(posts.length);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.core).toEqual(spawnerMiddleTile(coreSpawner));
    expect(calls[0]?.difficulty).toBe(10);
    expect(core.bugMix?.["swarmer-armoured"]).toBeCloseTo(
      PLATFORM_ASSAULT_TUNING.escortShare / 2,
    );

    // The survivors are the hull's force, as they boarded.
    const hullForce = hull.units.filter((unit) => unit.team === "tdf");
    const coreForce = core.units.filter((unit) => unit.team === "tdf");
    expect(coreForce.map((unit) => unit.id).sort()).toEqual(
      hullForce.map((unit) => unit.id).sort(),
    );
  });
});
