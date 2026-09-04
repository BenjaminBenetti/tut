import {
  DEFAULT_WEAPON_NAME,
  PRIMARY_WEAPON_ID,
} from "../../tactical/model/unit-weapon";
import { PropKindIds } from "../../mapgen/data/props";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalState } from "../../tactical/model/tactical-state";
import type { Unit } from "../../tactical/model/unit";
import type { UnitTemplate } from "../../tactical/model/unit-template";
import { emptyVision } from "../../tactical/service/vision-service";

/** A template for HUD tests. */
export function hudTemplate(
  id: string,
  name: string,
  damage = 10,
): UnitTemplate {
  return {
    id,
    name,
    maxHp: 20,
    maxAp: 2,
    move: 5,
    weapons: [
      {
        id: PRIMARY_WEAPON_ID,
        name: DEFAULT_WEAPON_NAME,
        profile: { range: 8, accuracy: 65, damage, armorPen: 0 },
      },
    ],
    sightRange: 12,
    armor: 0,
    passClass: "infantry",
    modelId: "tdf.infantry.rifle",
  };
}

/** A unit for HUD tests. */
export function hudUnit(
  id: string,
  team: "tdf" | "bugs",
  templateId: string,
  x: number,
  z: number,
  overrides: Partial<Unit> = {},
): Unit {
  return {
    id,
    kind: team === "tdf" ? "squad" : "bug",
    team,
    sourceId: id,
    templateId,
    pos: { x, y: 0, z },
    facing: "n",
    hp: 20,
    maxHp: 20,
    ap: 2,
    maxAp: 2,
    status: [],
    passClass: "infantry",
    ...overrides,
  };
}

/**
 * A small mission: two rifle squads and two swarmers on open ground with
 * a crate at (4,0,2), one spawner objective. Player phase, turn 2.
 */
export function hudMission(
  overrides: Partial<TacticalState> = {},
): TacticalState {
  const map = new FixtureMapBuilder(10, 6, 1)
    .fillGround()
    .prop(PropKindIds.CRATE, { x: 4, y: 0, z: 2 })
    .build();
  return {
    missionId: "mission-1",
    seed: 1,
    map,
    units: [
      hudUnit("s1", "tdf", "rifle", 1, 1),
      hudUnit("s2", "tdf", "rifle", 1, 3, { ap: 0, hp: 12 }),
      hudUnit("b1", "bugs", "swarmer", 4, 1, { hp: 6, maxHp: 6 }),
      hudUnit("b2", "bugs", "swarmer", 8, 5, { hp: 6, maxHp: 6 }),
    ],
    templates: {
      rifle: hudTemplate("rifle", "Rifle Squad"),
      swarmer: hudTemplate("swarmer", "Swarmer", 3),
    },
    difficulty: 1,
    threat: 0,
    turn: 2,
    phase: "player",
    objectives: [
      {
        id: "objective-1",
        kind: "destroy-spawner",
        targetId: "spawner-1",
        complete: false,
      },
      {
        id: "objective-2",
        kind: "destroy-spawner",
        targetId: "spawner-2",
        complete: true,
      },
    ],
    spawners: [
      {
        id: "spawner-1",
        pos: { x: 9, y: 0, z: 0 },
        hatchRadius: 3,
        timer: 3,
        hp: 20,
        destroyed: false,
      },
      {
        id: "spawner-2",
        pos: { x: 9, y: 0, z: 5 },
        hatchRadius: 3,
        timer: 3,
        hp: 0,
        destroyed: true,
      },
    ],
    edgeSpawn: { nextTurn: 3, wave: 0 },
    extraction: [{ x: 0, y: 0, z: 0 }],
    extracted: [],
    vision: emptyVision(),
    log: [],
    ...overrides,
  };
}
