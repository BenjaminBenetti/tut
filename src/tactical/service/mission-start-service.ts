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
import { generateTacticalMap } from "../../mapgen/service/generate-tactical-map";
import { missionToMapRecipe } from "../../mapgen/service/mission-map-recipe-adapter";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { Deployment } from "../../overworld/model/deployment";
import {
  deploymentSize,
  MAX_DEPLOYED_UNITS,
} from "../../overworld/model/deployment";
import type { MissionId } from "../../overworld/model/mission";
import type { Mech } from "../../roster/model/mech";
import type { MechStatSheet } from "../../roster/model/mech-stat-sheet";
import type { SquadTypeCatalogue } from "../../roster/model/squad-type-catalogue";
import type { MissionCampaignState } from "../model/mission-campaign-state";
import type { TacticalError } from "../model/tactical-error";
import type {
  Objective,
  Spawner,
  TacticalState,
} from "../model/tactical-state";
import { DEFAULT_HATCH_RADIUS, FIRST_TURN } from "../model/tactical-state";
import { TURN_STARTED } from "../model/turn-started-event";
import { initialVision } from "./vision-service";
import type { PassClass, Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import type { SpawnTuning } from "../model/spawn-tuning";
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
  /** Spawner hit points and timers, and the first edge wave's turn (#329). */
  readonly spawnTuning: SpawnTuning;
  /** Issues unit, spawner and objective ids; the caller writes its state back to `meta`. */
  readonly ids: IdGenerator;
  /** Map generation content; the composition root passes the shipped registries. */
  readonly registries: MapGenRegistries;
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
 * Generic over the campaign state so the app passes its `GameState`
 * while this domain never imports `save/` (ADR 0002 §3).
 */
export function startTacticalMission<TState extends MissionCampaignState>(
  state: TState,
  missionId: MissionId,
  deployment: Deployment,
  deps: MissionStartDeps,
): Result<TState, TacticalError> {
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
  const size = deploymentSize(deployment);
  if (size === 0) {
    return err({ kind: "empty-deployment" });
  }
  // Checked here as well as in `validateLaunch` (#67), so the headless
  // path and #341's `StartMission` refuse it the same way and
  // `no-deploy-room` goes back to meaning a genuine map problem rather
  // than a roster the zone was never going to hold (#487).
  if (size > MAX_DEPLOYED_UNITS) {
    return err({ kind: "oversized-deployment", size, max: MAX_DEPLOYED_UNITS });
  }

  const recipe = missionToMapRecipe(
    mission,
    deps.missionTypes[mission.typeId],
    deps.registries,
  );
  if (!recipe.ok) {
    return err({
      kind: "map-recipe",
      reason: describeRecipeError(recipe.error),
    });
  }
  const map = generateTacticalMap(recipe.value, {
    registries: deps.registries,
  });

  const placed = placeDeployment(state, deployment, map, deps);
  if (!placed.ok) {
    return placed;
  }
  const spawners = spawnersFrom(map, deps.ids, deps.spawnTuning);
  const objectives = spawners.map((spawner): Objective => ({
    id: deps.ids.nextId(OBJECTIVE_ID_PREFIX),
    kind: "destroy-spawner",
    targetId: spawner.id,
    complete: false,
  }));

  const tactical: Omit<TacticalState, "vision"> = {
    missionId: mission.id,
    seed: hashSeed(recipe.value.seed),
    difficulty: mission.difficulty,
    threat: state.overworld.threat,
    map,
    units: placed.value.units,
    templates: placed.value.templates,
    turn: FIRST_TURN,
    phase: "player",
    objectives,
    spawners,
    edgeSpawn: { nextTurn: deps.spawnTuning.firstWaveTurn, wave: 0 },
    extraction: map.hooks.extraction.tiles.map(coordOf),
    extracted: [],
    // The mission does begin on turn 1 in the player phase, so it says so
    // (#573). Every later turn is announced by `turn-service`; without
    // this the first one was the only silent one, and a player who
    // launched and read the log was told nothing at all.
    log: [
      { type: TURN_STARTED, payload: { turn: FIRST_TURN, phase: "player" } },
    ],
  };
  return ok({
    ...state,
    // Both sides look once from where they deployed, so the first frame
    // is already fogged rather than blank (ADR 0006).
    activeMission: { ...tactical, vision: initialVision(tactical) },
  });
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
  state: MissionCampaignState,
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

  const builds: UnitBuild[] = [];
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
    builds.push(mechUnit(mech, sheet, placement, factoryDeps));
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
    builds.push(squadUnit(squad, type, placement, factoryDeps));
  }

  for (const build of builds) {
    units.push(build.unit);
    templates[build.template.id] = build.template;
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

/** One spawner per egg-spawner objective hook, on the hook's first tile, a full hatch interval from hatching. */
function spawnersFrom(
  map: TacticalMap,
  ids: IdGenerator,
  tuning: SpawnTuning,
): Spawner[] {
  return map.hooks.objectives
    .filter((hook) => hook.kind === HookKinds.EGG_SPAWNER)
    .map((hook): Spawner => ({
      id: ids.nextId(SPAWNER_ID_PREFIX),
      pos: coordOf(firstTile(hook)),
      hatchRadius: hatchRadiusOf(hook),
      hp: tuning.spawnerHp,
      timer: tuning.hatchInterval,
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
