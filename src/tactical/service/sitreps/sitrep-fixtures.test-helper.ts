import type { SitrepId } from "../../../content/model/sitrep-id";
import { STOREY_LAYERS } from "../../../core/model/elevation";
import { Mulberry32Rng } from "../../../core/service/mulberry32-rng";
import { SequentialIdGenerator } from "../../../core/service/sequential-id-generator";
import { HookKinds } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { FixtureMapBuilder } from "../../../mapgen/service/fixture-map-builder";
import type { SitrepSetupContext } from "../../model/sitrep-rule";
import type { TacticalState } from "../../model/tactical-state";
import type { Unit } from "../../model/unit";
import { missionWith, unitAt } from "../tactical-fixtures.test-helper";
import { groundDistance } from "./sitrep-placement";
import { sitrepRngLabel } from "./sitrep-service";

// ===========================================
// Field
// ===========================================

/** Side of the square sitrep field. */
export const FIELD = 24;

/** The deploy zone: the 3×3 corner at the origin. */
export const DEPLOY: readonly TileCoord[] = [0, 1, 2].flatMap((x) =>
  [0, 1, 2].map((z) => ({ x, y: 0, z })),
);

/** The one egg-spawner hook, on the far east edge. */
export const NEST: TileCoord = { x: 21, y: 0, z: 4 };

/** The extraction hook: the 2×2 at the far north-west. */
export const EXTRACTION: readonly TileCoord[] = [
  { x: 0, y: 0, z: 22 },
  { x: 1, y: 0, z: 22 },
  { x: 0, y: 0, z: 23 },
  { x: 1, y: 0, z: 23 },
];

/**
 * A 24×24 grass field with something of everything a sitrep must keep
 * clear of or keep off:
 *
 * ```
 *   z=23  E E . . . . . . . . . . . . . . . . . . . . . .
 *   z=22  E E . . . . . . . . . . . . . . . . . . . . . .
 *   …                 ~ ~          (x 10–11, z 20–21: a pond, pass NONE)
 *   z=16–19                         B B B B (x 16–19: a building's ground floor)
 *   z=4   . . . . . . . . . . . . . . . . . . . . . N . .   N = nest hook
 *   z=0–2 D D D . . .                                       D = deploy zone
 * ```
 */
export function sitrepField(): TacticalMap {
  const builder = new FixtureMapBuilder(
    FIELD,
    FIELD,
    3 * STOREY_LAYERS,
  ).fillGround();
  for (let x = 16; x <= 19; x++) {
    for (let z = 16; z <= 19; z++) {
      builder.patchTile({ x, y: 0, z }, { buildingId: "building-1" });
    }
  }
  for (let x = 10; x <= 11; x++) {
    for (let z = 20; z <= 21; z++) {
      builder.patchTile({ x, y: 0, z }, { pass: PassMask.NONE });
    }
  }
  return builder
    .deploy(DEPLOY)
    .objective(HookKinds.EGG_SPAWNER, [NEST])
    .extraction(EXTRACTION)
    .build();
}

/** The squad on the deploy zone: one mech and one squad. */
export function squad(): Unit[] {
  return [
    unitAt("mech-1", "mech", { x: 0, y: 0, z: 0 }),
    unitAt("squad-1", "infantry", { x: 1, y: 0, z: 1 }),
  ];
}

/** A player-turn-1 mission on the sitrep field with the squad and the sitreps. */
export function fieldMission(
  sitreps: readonly SitrepId[] = [],
  extra: Partial<TacticalState> = {},
): TacticalState {
  const mission = missionWith(sitrepField(), squad());
  return {
    ...mission,
    ...(sitreps.length === 0 ? {} : { sitreps }),
    ...extra,
  };
}

/** The context the mission start hands the sitrep's setup for `seed`. */
export function setupCtx(id: SitrepId, seed = 1): SitrepSetupContext {
  return {
    rng: new Mulberry32Rng(seed).fork(sitrepRngLabel(id)),
    ids: new SequentialIdGenerator(),
  };
}

/** The ground distance from `tile` to the nearest deploy tile. */
export function fromDeploy(tile: TileCoord): number {
  return Math.min(...DEPLOY.map((zone) => groundDistance(tile, zone)));
}

/** `x,y,z` for a coordinate, for comparing tile sets. */
export function keyOf(tile: TileCoord): string {
  return `${String(tile.x)},${String(tile.y)},${String(tile.z)}`;
}
