import { err, ok } from "../../../core/model/result";
import {
  chebyshevDistance,
  manhattanDistance,
} from "../../../core/service/grid-math";
import { allHooks, HookKinds } from "../../../mapgen/model/hook";
import type { Hook } from "../../../mapgen/model/hook";
import { PassMask } from "../../../mapgen/model/pass-mask";
import type { TacticalMap } from "../../../mapgen/model/tactical-map";
import type { TileCoord } from "../../../mapgen/model/tile-coord";
import { snapshotMap } from "../../../mapgen/service/hatch-space";
import type { Mission } from "../../../overworld/model/mission";
import { placeCavernBroods } from "../brood-placement-service";
import type { HiveAssaultSetupTuning } from "../../model/hive-assault-setup-tuning";
import type {
  MissionSetupDeps,
  MissionSetupRule,
} from "../../model/mission-setup-rule";
import type {
  DestroyHiveCoreObjective,
  Spawner,
  TacticalState,
} from "../../model/tactical-state";
import {
  OBJECTIVE_ID_PREFIX,
  SPAWNER_ID_PREFIX,
} from "../../model/tactical-state";
import { footprintFits } from "../movement-service";
import { placeHiveGuards } from "../placed-bug-service";
import { eggSpawnersFrom } from "./infestation-clearance-setup";
import { coordOf, firstTile, hatchRadiusOf } from "./map-placement";

// ===========================================
// Constants
// ===========================================

/** Fewest guard tiles `hiveGuardPositions` looks for before it gives up spacing them. */
const MIN_GUARD_POSITIONS = 2;

/** Most guard tiles `hiveGuardPositions` hands back unless asked for more. */
const MAX_GUARD_POSITIONS = 4;

/**
 * Rings round the core pad, in tiles, that a guard may stand on: the
 * second first, leaving the ring against the core free for the squad
 * planting charges, then the third when the second is short of room.
 */
const GUARD_RINGS: readonly number[] = [2, 3];

/** Least Chebyshev distance between two guards while there is room to spread them. */
const GUARD_SPACING = 2;

/** Tiles per side of the core when its hook's meta names no footprint. */
const DEFAULT_CORE_SIZE = 3;

// ===========================================
// Types
// ===========================================

/**
 * The seam the dormant broods plug into (campaign arc §6.5, #1179):
 * stands whatever sleeps in the cavern's `brood-chamber` hooks. The Hive
 * Assault's setup calls it last, after the core, the nests and the
 * guards have claimed their ground. The shipped rule passes
 * `placeCavernBroods` (arc §7.5: a cavern full of bugs, mostly asleep);
 * a test that wants a bare cavern passes `NO_BROODS`.
 */
export type HiveBroodPlacement = (
  state: TacticalState,
  map: TacticalMap,
  deps: MissionSetupDeps,
) => TacticalState;

/** The seam's default: no broods, the mission unchanged. */
export const NO_BROODS: HiveBroodPlacement = (state) => state;

// ===========================================
// Scaling by level
// ===========================================

/**
 * The hive core's hit points for a hive of `level`.
 *
 * ```
 *   coreHp + level × coreHpPerLevel      (level below zero reads as zero)
 * ```
 */
export function hiveCoreHp(
  level: number,
  tuning: HiveAssaultSetupTuning,
): number {
  return tuning.coreHp + Math.max(0, level) * tuning.coreHpPerLevel;
}

/**
 * How many Hive Guards stand by the core of a hive of `level`.
 *
 * ```
 *   clamp(⌊baseGuards + level × guardsPerLevel⌋, minGuards, maxGuards)
 * ```
 */
export function hiveGuardCount(
  level: number,
  tuning: HiveAssaultSetupTuning,
): number {
  const raw = Math.floor(
    tuning.baseGuards + Math.max(0, level) * tuning.guardsPerLevel,
  );
  return Math.min(tuning.maxGuards, Math.max(tuning.minGuards, raw));
}

// ===========================================
// Guard positions
// ===========================================

/**
 * Where the Hive Guards stand: two to four tiles in the core's chamber,
 * facing the way the squad comes in (campaign arc §6.5). Empty when the
 * map has no hive core, and fewer than two only when the chamber has no
 * more room.
 *
 * ```
 *   ring 2 round the 3×3 pad (then ring 3 when ring 2 is short)
 *     same level as the pad, infantry can stand there, no hook on it
 *   ranked nearest the drop ship first, then z, then x
 *   picked greedily at least GUARD_SPACING apart, up to `limit` (four)
 *   fewer than `fill` (two) picked ──► topped up from the rest, spacing dropped
 *
 *        g . g . .          the ring against the pad stays free for
 *        . . . . .          the squad planting charges
 *        . . C C C
 *        . . C C C
 *        . . C C C
 * ```
 *
 * Deterministic: a pure function of the map, so the same seed always
 * guards its core the same way.
 *
 * @param map - The generated hive cavern.
 * @param limit - Most tiles to hand back: four for a Hive Assault, the
 *   Great Hive's `maxGuards` for its bigger guard.
 * @param fill - Fewest tiles to hand back while any candidate is left,
 *   spacing dropped to reach it: two, or a packed guard's whole count.
 * @returns Anchor tiles for single-tile guards, best first.
 */
export function hiveGuardPositions(
  map: TacticalMap,
  limit: number = MAX_GUARD_POSITIONS,
  fill: number = MIN_GUARD_POSITIONS,
): readonly TileCoord[] {
  const core = hiveCoreHook(map);
  if (core === undefined) {
    return [];
  }
  const anchor = firstTile(core);
  const size = coreSizeOf(core);
  const approach = map.hooks.deployZones[0]?.tiles[0] ?? anchor;
  const candidates = guardCandidates(map, anchor, size, approach);
  const picked: TileCoord[] = [];
  for (const tile of candidates) {
    if (picked.length === limit) {
      break;
    }
    if (
      picked.every((other) => chebyshevDistance(other, tile) >= GUARD_SPACING)
    ) {
      picked.push(tile);
    }
  }
  for (const tile of candidates) {
    if (picked.length >= Math.min(fill, limit)) {
      break;
    }
    if (!picked.includes(tile)) {
      picked.push(tile);
    }
  }
  return picked.map(coordOf);
}

// ===========================================
// Placement
// ===========================================

/**
 * Stands the hive core on the `hive-core` hook's pad and gives it its
 * `destroy-hive-core` objective. The core's anchor is the pad's first
 * tile (its lowest `x` and `z`), so its 3×3 footprint is the pad.
 *
 * ```
 *   hive-core hook ──► Spawner { variant: "hive-core", hp = maxHp = hiveCoreHp(level) }
 *                  ──► DestroyHiveCoreObjective { targetId: core }
 * ```
 *
 * @param state - The mission so far.
 * @param core - The map's hive-core hook.
 * @param level - The hive's level.
 * @param deps - Ids and the Hive Assault tuning.
 * @returns The mission with the core, and the core's id.
 */
function placeHiveCore(
  state: TacticalState,
  core: Hook,
  level: number,
  deps: MissionSetupDeps,
): { readonly state: TacticalState; readonly coreId: string } {
  const hp = hiveCoreHp(level, deps.hiveAssault);
  const spawner: Spawner = {
    id: deps.ids.nextId(SPAWNER_ID_PREFIX),
    variant: "hive-core",
    pos: coordOf(firstTile(core)),
    hatchRadius: hatchRadiusOf(core),
    hp,
    maxHp: hp,
    timer: 0,
    destroyed: false,
  };
  return {
    state: { ...state, spawners: [...state.spawners, spawner] },
    coreId: spawner.id,
  };
}

/**
 * Stands an egg spawner on every nest hook of the cavern, hatching as a
 * clearance's nests do, but with no objective of its own: optional
 * pressure, each worth `nestBounty` tech points when wrecked.
 *
 * @param state - The mission so far.
 * @param map - The cavern whose egg-spawner hooks the nests stand on.
 * @param difficulty - The offer's difficulty, which sets the hatch interval.
 * @param deps - Ids, the spawn tuning and the Hive Assault tuning.
 * @returns The mission with the nests.
 */
function placeHiveNests(
  state: TacticalState,
  map: TacticalMap,
  difficulty: number,
  deps: MissionSetupDeps,
): TacticalState {
  const bounty = deps.hiveAssault.nestBounty;
  const nests = eggSpawnersFrom(
    map,
    deps.ids,
    deps.spawnTuning,
    difficulty,
  ).map((nest): Spawner => (bounty > 0 ? { ...nest, bounty } : nest));
  return { ...state, spawners: [...state.spawners, ...nests] };
}

/**
 * Everything a Hive Assault stands in the cavern (campaign arc §6.5), in
 * the order ids are drawn:
 *
 * ```
 *   hive-core hook   ──► the core                       ids: spawner-*
 *   egg-spawner hooks ──► the chamber nests, with bounty ids: spawner-*
 *   the core         ──► destroy-hive-core               ids: objective-*
 *   hiveGuardPositions(map)[0 .. hiveGuardCount(level)]
 *                    ──► Hive Guards (placeHiveGuards)   ids: unit-*
 *   placeBroods      ──► whatever sleeps in the brood chambers
 * ```
 *
 * The level is `mission.hive.level`; an offer without a hive (only a
 * hand-built one) is a level-0 hive. Refuses a map with no hive-core
 * hook, which a hive cavern always has (invariant I8).
 *
 * @param state - The mission so far.
 * @param map - The generated hive cavern.
 * @param mission - The offer: its difficulty and its hive's level.
 * @param deps - Ids, tunings and the Hive Guard species.
 * @param placeBroods - The dormant broods' seam.
 */
export function setUpHiveAssault(
  state: TacticalState,
  map: TacticalMap,
  mission: Pick<Mission, "difficulty" | "hive">,
  deps: MissionSetupDeps,
  placeBroods: HiveBroodPlacement = NO_BROODS,
): ReturnType<MissionSetupRule["setup"]> {
  const hook = hiveCoreHook(map);
  if (hook === undefined) {
    return err({ kind: "map-recipe", reason: "no hive-core hook on the map" });
  }
  const level = mission.hive?.level ?? 0;
  const cored = placeHiveCore(state, hook, level, deps);
  const nested = placeHiveNests(cored.state, map, mission.difficulty, deps);
  const objective: DestroyHiveCoreObjective = {
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-hive-core",
    targetId: cored.coreId,
    complete: false,
  };
  const withObjective: TacticalState = {
    ...nested,
    objectives: [...nested.objectives, objective],
  };
  const wanted = hiveGuardCount(level, deps.hiveAssault);
  const guarded = placeHiveGuards(
    withObjective,
    hiveGuardPositions(
      map,
      Math.max(MAX_GUARD_POSITIONS, deps.hiveAssault.maxGuards),
      deps.hiveAssault.packGuards === true ? wanted : MIN_GUARD_POSITIONS,
    ).slice(0, wanted),
    { ids: deps.ids, guard: deps.hiveGuard },
  );
  return ok(placeBroods(guarded, map, deps));
}

// ===========================================
// Rule
// ===========================================

/**
 * Builds the Hive Assault's setup rule over the dormant broods' seam.
 * The shipped rule (`HIVE_ASSAULT_SETUP`) passes `placeCavernBroods`;
 * the default here places none.
 *
 * @param placeBroods - Stands the cavern's broods; `NO_BROODS` by default.
 */
export function createHiveAssaultSetup(
  placeBroods: HiveBroodPlacement = NO_BROODS,
): MissionSetupRule {
  return {
    typeId: "hive-assault",
    setup(state, map, mission, deps) {
      return setUpHiveAssault(state, map, mission, deps, placeBroods);
    },
  };
}

/**
 * `hive-assault` (campaign arc §6.5, §7.5): wreck the hive core and get
 * out, past its guards, its nests and the broods asleep in its chambers.
 * The broods need `MissionSetupDeps.broods`; without it none are placed.
 */
export const HIVE_ASSAULT_SETUP: MissionSetupRule =
  createHiveAssaultSetup(placeCavernBroods);

// ===========================================
// Helpers
// ===========================================

/** The map's first hive-core hook, if it has one. */
function hiveCoreHook(map: TacticalMap): Hook | undefined {
  return map.hooks.objectives.find((hook) => hook.kind === HookKinds.HIVE_CORE);
}

/** Tiles per side of the core's pad, from its hook's meta. */
function coreSizeOf(hook: Hook): number {
  const size = hook.meta?.footprint;
  return typeof size === "number" && size >= 1
    ? Math.floor(size)
    : DEFAULT_CORE_SIZE;
}

/**
 * Every tile a guard could stand on, ring by ring, each ring ranked
 * nearest `approach` first and then by `z` and `x`.
 */
function guardCandidates(
  map: TacticalMap,
  anchor: TileCoord,
  size: number,
  approach: TileCoord,
): TileCoord[] {
  const snapshot = snapshotMap(map);
  const graph = { index: snapshot.index, reachability: snapshot.reach };
  const hooked = new Set<number>();
  for (const hook of allHooks(map.hooks)) {
    for (const tile of hook.tiles) {
      if (snapshot.index.inBounds(tile)) {
        hooked.add(snapshot.index.keyOf(tile));
      }
    }
  }
  const candidates: TileCoord[] = [];
  for (const ring of GUARD_RINGS) {
    const onRing = map.tiles.filter(
      (tile) =>
        tile.y === anchor.y &&
        padRing(tile, anchor, size) === ring &&
        !hooked.has(snapshot.index.keyOf(tile)) &&
        footprintFits(graph, tile, 1, PassMask.INFANTRY),
    );
    onRing.sort(
      (a, b) =>
        manhattanDistance(a, approach) - manhattanDistance(b, approach) ||
        a.z - b.z ||
        a.x - b.x,
    );
    candidates.push(...onRing);
  }
  return candidates;
}

/** Chebyshev distance from `tile` to the nearest tile of the pad; 0 on it. */
function padRing(tile: TileCoord, anchor: TileCoord, size: number): number {
  const dx = Math.max(anchor.x - tile.x, 0, tile.x - (anchor.x + size - 1));
  const dz = Math.max(anchor.z - tile.z, 0, tile.z - (anchor.z + size - 1));
  return Math.max(dx, dz);
}
