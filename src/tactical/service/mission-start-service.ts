import type { Direction } from "../../core/model/direction";
import type { IdGenerator } from "../../core/model/id-generator";
import type { Result } from "../../core/model/result";
import { err, ok } from "../../core/model/result";
import { hashSeed } from "../../core/service/seed-hash";
import type { MissionTypeId } from "../../content/model/mission-type-id";
import type { MissionType } from "../../content/model/mission-type";
import type { Hook } from "../../mapgen/model/hook";
import { HookKinds } from "../../mapgen/model/hook";
import { allows, PassMask } from "../../mapgen/model/pass-mask";
import type { MapGenRegistries } from "../../mapgen/model/registries";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { createDefaultRegistries } from "../../mapgen/service/default-registries";
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../mapgen/service/mission-map-recipe-adapter";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Deployment } from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";
import type { Mech } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { GameState } from "../../save/model/game-state";
import type { TacticalError } from "../model/tactical-error";
import type {
  Objective,
  Spawner,
  TacticalState,
} from "../model/tactical-state";
import {
  DEFAULT_HATCH_RADIUS,
  FIRST_EDGE_SPAWN_TURN,
  FIRST_TURN,
  SPAWNER_HP,
} from "../model/tactical-state";
import type { PassClass, Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import type { UnitTuning } from "../model/unit-tuning";
import type { UnitBuild, UnitPlacement } from "./unit-factory";
import { mechUnit, squadUnit } from "./unit-factory";

// ===========================================
// Types
// ===========================================

/** Content, catalogues and services the mission start reads. */
export interface MissionStartDeps {
  readonly missionTypes: Readonly<Record<MissionTypeId, MissionType>>;
  readonly squadTypes: SquadTypeCatalogue;
  /** The mech's stat sheet from its loadout, or undefined when it no longer validates. */
  readonly sheetFor: (mech: Mech) => MechStatSheet | undefined;
  readonly unitTuning: UnitTuning;
  /** Issues unit, spawner and objective ids; the caller writes its state back to `meta`. */
  readonly ids: IdGenerator;
  /** Map generation content; the shipped registries unless a test substitutes. */
  readonly registries?: MapGenRegistries;
}

/** Id prefixes the mission start issues. */
export const SPAWNER_ID_PREFIX = "spawner";
export const OBJECTIVE_ID_PREFIX = "objective";

// ===========================================
// Mission start
// ===========================================

/**
 * Builds the `TacticalState` for a launched mission and stores it in
 * `activeMission` (GDD §6). No rules run here: units are placed, spawners
 * and objectives recorded, the clock set to the first player turn.
 *
 * ```
 *   mission ──► missionToMapRecipe ──► generateTacticalMap ──► map
 *                                                               │
 *   deployment ──► squadUnit / mechUnit ──► units on deploy-zone tiles
 *                                          (mechs on mech-passable ones first)
 *   map.hooks.objectives (egg-spawner) ──► spawners + destroy-spawner objectives
 *   map.hooks.extraction               ──► extraction tiles
 *                                                               │
 *                                                               ▼
 *                              ok { ...state, activeMission: TacticalState }
 * ```
 *
 * Deterministic: the same campaign state, deployment and id counters
 * always produce a deep-equal tactical state, because the map comes from
 * the mission's seed and placement walks hooks and tiles in order.
 */
export function startTacticalMission(
  state: GameState,
  missionId: MissionId,
  deployment: Deployment,
  deps: MissionStartDeps,
): Result<GameState, TacticalError> {
  if (state.activeMission !== undefined) {
    return err({
      kind: "mission-active",
      missionId: state.activeMission.missionId,
    });
  }
  const mission = state.overworld.missions.find((m) => m.id === missionId);
  if (mission === undefined) {
    return err({ kind: "mission-not-found", missionId });
  }
  if (deployment.squadIds.length + deployment.mechIds.length === 0) {
    return err({ kind: "empty-deployment" });
  }

  const registries = deps.registries ?? createDefaultRegistries();
  const recipe = missionToMapRecipe(
    mission,
    deps.missionTypes[mission.typeId],
    registries,
  );
  if (!recipe.ok) {
    return err({
      kind: "map-recipe",
      reason: describeRecipeError(recipe.error),
    });
  }
  const map = generateTacticalMap(recipe.value, { registries });

  const placed = placeDeployment(state, deployment, map, deps);
  if (!placed.ok) {
    return placed;
  }
  const spawners = spawnersFrom(map, deps.ids);
  const objectives = spawners.map((spawner): Objective => ({
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-spawner",
    targetId: spawner.id,
    complete: false,
  }));

  const tactical: TacticalState = {
    missionId: mission.id,
    seed: hashSeed(recipe.value.seed),
    map,
    units: placed.value.units,
    templates: placed.value.templates,
    turn: FIRST_TURN,
    phase: "player",
    objectives,
    spawners,
    edgeSpawn: { nextTurn: FIRST_EDGE_SPAWN_TURN, wave: 0 },
    extraction: map.hooks.extraction.tiles.map(coordOf),
    log: [],
  };
  return ok({ ...state, activeMission: tactical });
}

// ===========================================
// Placement
// ===========================================

/** Units and their templates once placed, or the first placement error. */
interface Placed {
  readonly units: readonly Unit[];
  readonly templates: Readonly<Record<UnitTemplateId, UnitTemplate>>;
}

/**
 * Builds every deployed unit and stands it on a free deploy-zone tile its
 * class can use. Mechs go first because the zone has fewer mech-passable
 * tiles (ADR 0004 I6 guarantees at least four per zone); squads follow.
 * Zones and their tiles are walked in map order; a tile is used once.
 */
function placeDeployment(
  state: GameState,
  deployment: Deployment,
  map: TacticalMap,
  deps: MissionStartDeps,
): Result<Placed, TacticalError> {
  const index = new TileIndex(map);
  const factoryDeps = { ids: deps.ids, tuning: deps.unitTuning };
  const zoneTiles = map.hooks.deployZones.flatMap((zone) => zone.tiles);
  const facing = facingToward(zoneTiles[0], map);
  const used = new Set<string>();
  const units: Unit[] = [];
  const templates: Record<UnitTemplateId, UnitTemplate> = {};

  const builds: Result<UnitBuild, TacticalError>[] = [];
  for (const mechId of deployment.mechIds) {
    const mech = state.roster.mechs.find((m) => m.id === mechId);
    if (mech === undefined) {
      return err({ kind: "unit-not-found", unitId: mechId });
    }
    const sheet = deps.sheetFor(mech);
    if (sheet === undefined) {
      return err({ kind: "invalid-loadout", mechId });
    }
    const placement = claimTile(zoneTiles, index, used, "mech", facing);
    if (placement === undefined) {
      return err({ kind: "no-deploy-room", unitId: mechId, passClass: "mech" });
    }
    builds.push(ok(mechUnit(mech, sheet, placement, factoryDeps)));
  }
  for (const squadId of deployment.squadIds) {
    const squad = state.roster.squads.find((s) => s.id === squadId);
    if (squad === undefined) {
      return err({ kind: "unit-not-found", unitId: squadId });
    }
    const type = deps.squadTypes.getSquadType(squad.typeId);
    if (type === undefined) {
      return err({ kind: "unit-not-found", unitId: squadId });
    }
    const placement = claimTile(zoneTiles, index, used, "infantry", facing);
    if (placement === undefined) {
      return err({
        kind: "no-deploy-room",
        unitId: squadId,
        passClass: "infantry",
      });
    }
    builds.push(ok(squadUnit(squad, type, placement, factoryDeps)));
  }

  for (const build of builds) {
    if (!build.ok) {
      return build;
    }
    units.push(build.value.unit);
    templates[build.value.template.id] = build.value.template;
  }
  return ok({ units, templates });
}

/** The first unused zone tile the class may stand on, marked used. */
function claimTile(
  zoneTiles: readonly TileCoord[],
  index: TileIndex,
  used: Set<string>,
  passClass: PassClass,
  facing: Direction,
): UnitPlacement | undefined {
  const required = passMaskFor(passClass);
  for (const coord of zoneTiles) {
    const key = `${String(coord.x)},${String(coord.y)},${String(coord.z)}`;
    if (used.has(key)) {
      continue;
    }
    const tile = index.getAt(coord);
    if (tile === undefined || !allows(tile.pass, required)) {
      continue;
    }
    used.add(key);
    return { pos: coordOf(coord), facing };
  }
  return undefined;
}

/**
 * The direction from the deploy zone toward the map's centre along the
 * dominant axis, so the line starts facing the field. East when the
 * zone has no tiles at all (a map that failed I6, which the generator
 * never emits).
 */
function facingToward(
  from: TileCoord | undefined,
  map: TacticalMap,
): Direction {
  if (from === undefined) {
    return "e";
  }
  const dx = map.width / 2 - from.x;
  const dz = map.depth / 2 - from.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? "e" : "w";
  }
  return dz >= 0 ? "s" : "n";
}

// ===========================================
// Spawners
// ===========================================

/** One spawner per egg-spawner objective hook, on the hook's first tile. */
function spawnersFrom(map: TacticalMap, ids: IdGenerator): Spawner[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
    .map((hook): Spawner => ({
      id: ids.nextId(SPAWNER_ID_PREFIX),
      pos: coordOf(firstTile(hook)),
      hatchRadius: hatchRadiusOf(hook),
      hp: SPAWNER_HP,
      destroyed: false,
    }));
}

/** The hook's first tile; hooks always carry at least one. */
function firstTile(hook: Hook): TileCoord {
  const tile = hook.tiles[0];
  if (tile === undefined) {
    throw new Error(`Hook "${hook.id}" has no tiles`);
  }
  return tile;
}

/** The hook's hatch radius, or the default when the meta is missing or not a number. */
function hatchRadiusOf(hook: Hook): number {
  const radius = hook.meta?.hatchRadius;
  return typeof radius === "number" && radius > 0
    ? radius
    : DEFAULT_HATCH_RADIUS;
}

// ===========================================
// Helpers
// ===========================================

/** A plain `{ x, y, z }` copy, so a `Tile` never leaks its other fields into a unit. */
function coordOf(coord: TileCoord): TileCoord {
  return { x: coord.x, y: coord.y, z: coord.z };
}

/** Text for the adapter's typed error. */
function describeRecipeError(error: {
  readonly kind: string;
  readonly id?: string;
}): string {
  return error.id === undefined ? error.kind : `${error.kind} "${error.id}"`;
}

/** Whether a tile mask admits a class; exported for tests that check placement. */
export function tileAdmits(mask: number, passClass: PassClass): boolean {
  return allows(mask, passClass === "mech" ? PassMask.MECH : PassMask.INFANTRY);
}
