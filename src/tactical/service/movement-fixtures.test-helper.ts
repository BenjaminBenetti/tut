import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../mapgen/service/fixture-map-builder";
import type { TacticalState } from "../model/tactical-state";
import type { PassClass, Team, Unit } from "../model/unit";
import type { UnitTemplate } from "../model/unit-template";

// ===========================================
// Templates
// ===========================================

/** Template ids the movement fixtures use. */
export const FIXTURE_TEMPLATES = {
  infantry: "squad:fixture",
  mech: "mech:fixture",
  bug: "bug:swarmer",
} as const;

/** Stat blocks: every fixture unit has two actions of three tiles. */
const TEMPLATES: Readonly<Record<string, UnitTemplate>> = {
  [FIXTURE_TEMPLATES.infantry]: template(
    FIXTURE_TEMPLATES.infantry,
    "infantry",
  ),
  [FIXTURE_TEMPLATES.mech]: template(FIXTURE_TEMPLATES.mech, "mech"),
  [FIXTURE_TEMPLATES.bug]: template(FIXTURE_TEMPLATES.bug, "infantry"),
};

/** A template with `move` 3 and two action points. */
function template(id: string, passClass: PassClass): UnitTemplate {
  return {
    id,
    name: id,
    maxHp: 10,
    maxAp: 2,
    move: 3,
    weapon: { range: 5, accuracy: 60, damage: 3, armorPen: 0 },
    armor: 0,
    passClass,
    modelId:
      passClass === "mech" ? "tdf.mech.assembled-a" : "tdf.infantry.rifle",
  };
}

// ===========================================
// Units and missions
// ===========================================

/** Optional stat overrides for a fixture unit. */
export interface UnitOptions {
  readonly ap?: number;
  readonly hp?: number;
  readonly team?: Team;
}

/** A living TDF unit of the class at the position, full action points unless told otherwise. */
export function unitAt(
  id: string,
  passClass: PassClass,
  pos: TileCoord,
  options: UnitOptions = {},
): Unit {
  const team = options.team ?? "tdf";
  const templateId =
    team === "bugs"
      ? FIXTURE_TEMPLATES.bug
      : passClass === "mech"
        ? FIXTURE_TEMPLATES.mech
        : FIXTURE_TEMPLATES.infantry;
  return {
    id,
    kind: team === "bugs" ? "bug" : passClass === "mech" ? "mech" : "squad",
    team,
    sourceId: id,
    templateId,
    pos,
    facing: "n",
    hp: options.hp ?? 10,
    maxHp: 10,
    ap: options.ap ?? 2,
    maxAp: 2,
    status: [],
    passClass,
  };
}

/** A mission in the player phase on the map with the units. */
export function missionWith(
  map: TacticalMap,
  units: readonly Unit[],
): TacticalState {
  return {
    missionId: "mission-fixture",
    seed: 1,
    map,
    units,
    templates: TEMPLATES,
    turn: 1,
    phase: "player",
    objectives: [],
    spawners: [],
    edgeSpawn: { nextTurn: 3, wave: 0 },
    extraction: [],
    log: [],
  };
}

// ===========================================
// Maps
// ===========================================

/** An open 8×8 grass field with three levels of headroom. */
export function openField(): FixtureMapBuilder {
  return new FixtureMapBuilder(8, 8, 3).fillGround();
}

/**
 * The field split by a solid wall between `x = 3` and `x = 4` with one
 * door at `z = 2`: infantry crosses at the door, a mech cannot.
 *
 * ```
 *   x: 0 1 2 3 │ 4 5 6 7
 *              │
 *   z=2 . . . . D . . . .     D = door
 *              │
 * ```
 */
export function walledField(): TacticalMap {
  const builder = openField();
  for (let z = 0; z < 8; z++) {
    builder.wall({ x: 3, y: 0, z }, "e", z === 2 ? "door" : "solid");
  }
  return builder.build();
}

/**
 * The field with a two-floor building over `x ∈ {5, 6}, z ∈ {5, 6}`:
 * a west door into `(5, 5)`, stairs at `(5, 6)` rising to `(5, 1, 5)`,
 * and a stairwell hole where `(5, 1, 6)` would be.
 *
 * ```
 *   ground (y = 0)          upper (y = 1)
 *        x=5  x=6                x=5  x=6
 *   z=5  D F   F            z=5   F    F      F floor  S stairs  D door
 *   z=6    S   F            z=6   ·    F      · hole
 * ```
 */
export function twoFloorBuilding(): TacticalMap {
  const builder = openField()
    .tile({ x: 5, y: 0, z: 5 }, SurfaceIds.FLOOR)
    .tile({ x: 6, y: 0, z: 5 }, SurfaceIds.FLOOR)
    .tile({ x: 6, y: 0, z: 6 }, SurfaceIds.FLOOR)
    .tile({ x: 5, y: 0, z: 6 }, SurfaceIds.STAIRS)
    .tile({ x: 5, y: 1, z: 5 }, SurfaceIds.FLOOR)
    .tile({ x: 6, y: 1, z: 5 }, SurfaceIds.FLOOR)
    .tile({ x: 6, y: 1, z: 6 }, SurfaceIds.FLOOR)
    .wall({ x: 4, y: 0, z: 5 }, "e", "door")
    .wall({ x: 5, y: 0, z: 5 }, "n", "solid")
    .wall({ x: 6, y: 0, z: 5 }, "n", "solid")
    .wall({ x: 6, y: 0, z: 5 }, "e", "solid")
    .wall({ x: 6, y: 0, z: 6 }, "e", "solid")
    .wall({ x: 6, y: 0, z: 6 }, "s", "solid")
    .wall({ x: 5, y: 0, z: 6 }, "s", "solid")
    .wall({ x: 5, y: 0, z: 6 }, "w", "solid");
  builder.connector("stairs", { x: 5, y: 0, z: 6 }, { x: 5, y: 1, z: 5 });
  return builder.build();
}
