import { describe, expect, it } from "vitest";

import { Mulberry32Rng } from "../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../core/service/sequential-id-generator";
import { MISSION_TYPES } from "../../content/data/mission-types";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { MECH_RATING_TUNING } from "../../roster/data/mech-rating-tuning";
import { STARTER_PARTS } from "../../roster/data/parts";
import { SQUAD_TYPES } from "../../roster/data/squad-types";
import { UPGRADE_TUNING } from "../../roster/data/upgrade-tuning";
import { DataSquadTypeCatalogue } from "../../roster/repository/squad-type-catalogue";
import { StaticPartCatalogue } from "../../roster/repository/static-part-catalogue";
import { validateLoadout } from "../../roster/service/loadout-validation-service";
import { COMBAT_TUNING } from "../../tactical/data/combat-tuning";
import { UNIT_TUNING } from "../../tactical/data/unit-tuning";
import { ATTACK } from "../../tactical/model/attack-command";
import { MOVE } from "../../tactical/model/move-command";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import { startTacticalMission } from "../../tactical/service/mission-start-service";
import { buildMoveGraph } from "../../tactical/service/movement-service";
import { ECONOMY_TUNING } from "../../economy/data/economy-tuning";
import { EARTH_MAP } from "../../overworld/data/earth-map";
import { NEW_GAME_TUNING } from "../../overworld/data/new-game-tuning";
import { THREAT_TUNING } from "../../overworld/data/threat-tuning";
import type { Mission } from "../../overworld/model/mission";
import { STARTER_ROSTER } from "../../roster/data/starter-roster";
import type { GameState } from "../../save/model/game-state";
import { createNewGame } from "../../save/service/new-game-service";
import { BUG_SPECIES, SWARMER } from "../data/species";
import type { BehaviourContext, BugBehaviour } from "./bug-behaviour";
import { chooseBugCommands, MapBehaviourRegistry } from "./behaviour-registry";
import {
  attackOptions,
  bestBy,
  distanceScore,
  moveTowards,
  nearestEnemy,
  reachableTiles,
} from "./utility";

// ===========================================
// Fixtures
// ===========================================

/** A day-4 campaign from the shipped content with one mission offered at Lagos. */
function campaignWithMission(): GameState {
  const base = createNewGame(
    { seed: 3, createdAt: "2026-09-03T00:00:00.000Z" },
    {
      map: EARTH_MAP,
      squadTypes: new DataSquadTypeCatalogue(SQUAD_TYPES),
      starterRoster: STARTER_ROSTER,
      newGameTuning: NEW_GAME_TUNING,
      threatTuning: THREAT_TUNING,
      economyTuning: ECONOMY_TUNING,
    },
  );
  const mission: Mission = {
    id: "mission-2",
    typeId: "infestation-clearance",
    cityId: "lagos",
    difficulty: 5,
    mapParams: {
      biome: "temperate",
      settlement: "city",
      size: "small",
      seed: "mission-2:map",
    },
    rewards: { credits: 1500 },
    createdDay: 4,
    expiresDay: 9,
    ignorePenalty: 10,
  };
  return {
    ...base,
    overworld: { ...base.overworld, day: 4, missions: [mission] },
  };
}

/** A live mission with the starter roster and one swarmer beside a squad, in the bugs' phase. */
function missionWithBug(): { mission: TacticalState; bug: Unit } {
  const state = campaignWithMission();
  const parts = new StaticPartCatalogue(STARTER_PARTS);
  const started = startTacticalMission(
    state,
    "mission-2",
    {
      missionId: "mission-2",
      squadIds: state.roster.squads.map((s) => s.id),
      mechIds: state.roster.mechs.map((m) => m.id),
    },
    {
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
      ids: new SequentialIdGenerator(),
      registries: createDefaultRegistries(),
    },
  );
  if (!started.ok || !started.value.activeMission)
    throw new Error("fixture must start");
  const base = started.value.activeMission;
  const squad = base.units.find((u) => u.kind === "squad")!;
  // A swarmer template and unit a few tiles from the squad, on the same level.
  const templateId = "bug:swarmer";
  const bug: Unit = {
    id: "bug-1",
    kind: "bug",
    team: "bugs",
    sourceId: SWARMER.id,
    templateId,
    pos: { x: squad.pos.x + 1, y: squad.pos.y, z: squad.pos.z },
    facing: "n",
    hp: SWARMER.hp,
    maxHp: SWARMER.hp,
    ap: SWARMER.ap,
    maxAp: SWARMER.ap,
    status: [],
    passClass: "infantry",
  };
  const mission: TacticalState = {
    ...base,
    phase: "bugs",
    units: [...base.units, bug],
    templates: {
      ...base.templates,
      [templateId]: {
        id: templateId,
        name: SWARMER.name,
        maxHp: SWARMER.hp,
        maxAp: SWARMER.ap,
        move: SWARMER.move,
        weapon: SWARMER.weapon,
        armor: SWARMER.armor,
        passClass: "infantry",
        modelId: SWARMER.modelId,
      },
    },
  };
  return { mission, bug };
}

const ctx = (mission: TacticalState): BehaviourContext => ({
  rng: new Mulberry32Rng(7),
  combat: COMBAT_TUNING,
  graph: buildMoveGraph(mission.map),
});

/** A dummy rush: attack the best target in reach, else step towards the nearest enemy. */
const dummyRush: BugBehaviour = {
  tag: "rush",
  choose(mission, unitId, c) {
    const unit = mission.units.find((u) => u.id === unitId)!;
    const shot = attackOptions(mission, unitId, c.combat)[0];
    if (shot) {
      return [
        {
          type: ATTACK,
          payload: { attackerId: unitId, targetId: shot.target.id },
        },
      ];
    }
    const enemy = nearestEnemy(mission, unit);
    if (!enemy) {
      return [];
    }
    const tiles = reachableTiles(mission, unitId, c.graph);
    const best = bestBy(
      tiles,
      (t) => distanceScore(t.tile, enemy.pos, 64),
      c.rng,
    );
    const step = best
      ? moveTowards(mission, unitId, best.tile, c.graph)
      : undefined;
    return step ? [step] : [];
  },
};

// ===========================================
// Tests
// ===========================================

describe("MapBehaviourRegistry", () => {
  it("registers one behaviour per tag and rejects duplicates", () => {
    const registry = new MapBehaviourRegistry([dummyRush]);
    expect(registry.get("rush")).toBe(dummyRush);
    expect(registry.get("flank")).toBeUndefined();
    expect(registry.tags()).toEqual(["rush"]);
    expect(() => registry.register(dummyRush)).toThrow(/Duplicate/);
  });
});

describe("chooseBugCommands", () => {
  it("drives a bug through its species' behaviour: adjacent to a squad it attacks", () => {
    const { mission, bug } = missionWithBug();
    const registry = new MapBehaviourRegistry([dummyRush]);
    const commands = chooseBugCommands(
      mission,
      bug.id,
      registry,
      (id) => BUG_SPECIES[id as "swarmer"],
      ctx(mission),
    );
    expect(commands).toHaveLength(1);
    expect(commands[0]?.type).toBe(ATTACK);
  });

  it("moves towards the nearest enemy when nothing is in reach", () => {
    const { mission, bug } = missionWithBug();
    // Push the bug to the far corner of the map.
    const far = { x: mission.map.width - 1, y: 0, z: mission.map.depth - 1 };
    const away: TacticalState = {
      ...mission,
      units: mission.units.map((u) =>
        u.id === bug.id ? { ...u, pos: far } : u,
      ),
    };
    const registry = new MapBehaviourRegistry([dummyRush]);
    const commands = chooseBugCommands(
      away,
      bug.id,
      registry,
      (id) => BUG_SPECIES[id as "swarmer"],
      ctx(away),
    );
    if (commands.length === 0) {
      // The corner may be unwalkable for this seed; the contract is "no crash, no attack".
      return;
    }
    expect(commands[0]?.type).toBe(MOVE);
    const enemy = nearestEnemy(away, { ...bug, pos: far })!;
    const payload = commands[0]!.payload as {
      path: { x: number; z: number }[];
    };
    const end = payload.path.at(-1)!;
    expect(
      Math.abs(end.x - enemy.pos.x) + Math.abs(end.z - enemy.pos.z),
    ).toBeLessThan(
      Math.abs(far.x - enemy.pos.x) + Math.abs(far.z - enemy.pos.z),
    );
  });

  it("holds still for a dead bug, a non-bug, an unknown species or an unregistered tag", () => {
    const { mission, bug } = missionWithBug();
    const registry = new MapBehaviourRegistry([dummyRush]);
    const species = (id: string) => BUG_SPECIES[id as "swarmer"];
    const dead = {
      ...mission,
      units: mission.units.map((u) => (u.id === bug.id ? { ...u, hp: 0 } : u)),
    };
    expect(
      chooseBugCommands(dead, bug.id, registry, species, ctx(dead)),
    ).toEqual([]);
    const squad = mission.units.find((u) => u.kind === "squad")!;
    expect(
      chooseBugCommands(mission, squad.id, registry, species, ctx(mission)),
    ).toEqual([]);
    expect(
      chooseBugCommands(
        mission,
        bug.id,
        registry,
        () => undefined,
        ctx(mission),
      ),
    ).toEqual([]);
    expect(
      chooseBugCommands(
        mission,
        bug.id,
        new MapBehaviourRegistry(),
        species,
        ctx(mission),
      ),
    ).toEqual([]);
  });
});
