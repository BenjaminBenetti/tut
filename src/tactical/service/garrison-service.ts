import type { IdGenerator } from "../../core/model/id-generator";
import type { Rng } from "../../core/model/rng";
import { HookKinds } from "../../mapgen/model/hook";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { GarrisonTuning } from "../model/garrison-tuning";
import type { TacticalApplied, TacticalEvent } from "../model/tactical-event";
import type { TacticalState } from "../model/tactical-state";
import { GARRISON_TURRET_SOURCE_ID } from "../model/turret";
import { TURRET_DEPLOYED } from "../model/turret-deployed-event";
import type { Unit } from "../model/unit";
import { passMaskFor } from "../model/unit";
import type { UnitTemplate, UnitTemplateId } from "../model/unit-template";
import { overwatchShotsOf } from "../model/weapon-profile";
import type { MoveGraph } from "./movement-service";
import { buildMoveGraph, occupiedKeys } from "./movement-service";
import { armTurret } from "./turret-service";
import { turretUnit } from "./unit-factory";

// ===========================================
// Placement
// ===========================================

/**
 * Stands `count` garrison turrets on the map as the mission opens
 * (#1155): the region's defensive batteries, spread uniformly over the
 * ground the squad can walk to, clear of the deploy zone, the spawners
 * and each other, each already on overwatch. Every one is an ordinary
 * turret — the tuning's, on the player's side, so it sees for the
 * squad and is shot at by the bugs — with no battery, so it watches
 * every turn until it is destroyed.
 *
 * ```
 *   candidates ── shuffle(rng) ──► take while count > 0
 *                                   └─ keep a tile only if ≥ spacing from every turret kept
 *   each kept  ──► turretUnit(garrison, "tdf") ──► armTurret ──► TurretDeployed { turretId, tile }
 * ```
 *
 * Deterministic for the rng handed in: the mission start forks it from
 * the mission's seed, so the same seed and count always stand the same
 * turrets on the same tiles. Fewer than `count` are placed when the map
 * has no more room at the spacing; none when `count` is zero. Pure:
 * draws from `rng` and `ids` and returns a new mission.
 *
 * @param mission - The mission as it stands before the garrison; units and spawners already placed.
 * @param count - How many turrets the region has; non-positive places none.
 * @param tuning - The turret each one is, and the spacing rules.
 * @param rng - The stream the sites are drawn from.
 * @param ids - Issues each turret's unit id.
 * @returns The mission with the turrets, and one `TurretDeployed` per turret in placement order.
 */
export function placeGarrisonTurrets(
  mission: TacticalState,
  count: number,
  tuning: GarrisonTuning,
  rng: Rng,
  ids: IdGenerator,
): TacticalApplied<TacticalState> {
  if (count <= 0) {
    return { state: mission, events: [] };
  }
  const graph = buildMoveGraph(mission.map);
  const sites = chooseSites(
    garrisonCandidates(mission, tuning, graph),
    count,
    tuning.spacing,
    rng,
  );
  const units: Unit[] = [...mission.units];
  const templates: Record<UnitTemplateId, UnitTemplate> = {
    ...mission.templates,
  };
  const events: TacticalEvent[] = [];
  for (const site of sites) {
    const built = turretUnit(
      tuning.turret,
      "tdf",
      { pos: coordOf(site), facing: facingToCentre(site, mission) },
      ids,
      GARRISON_TURRET_SOURCE_ID,
    );
    const turret = armTurret(built.unit, tuning.turret);
    units.push(turret);
    templates[built.template.id] = built.template;
    events.push({
      type: TURRET_DEPLOYED,
      payload: {
        turretId: turret.id,
        tile: turret.pos,
        overwatchShots: overwatchShotsOf(tuning.turret.weapon.profile),
      },
    });
  }
  return { state: { ...mission, units, templates }, events };
}

/**
 * Every tile a garrison turret may stand on (#1155), in map order: an
 * infantry-walkable tile the squad can reach from its deploy zone —
 * so no battery sits on an island nothing can get to — that is not in
 * the deploy zone or within `deployClearance` of it, not a live
 * spawner's or within `spawnerClearance` of one, not an edge-spawn or
 * extraction hook tile, and not held by a unit. Exported so a test can
 * check the rule apart from the draw.
 *
 * @param mission - The mission the turrets would join.
 * @param tuning - The clearances.
 * @param graph - Traversal structures for the map, built here when the caller has none.
 * @returns The candidate tiles, in map order.
 */
export function garrisonCandidates(
  mission: TacticalState,
  tuning: GarrisonTuning,
  graph: MoveGraph = buildMoveGraph(mission.map),
): readonly Tile[] {
  const infantry = passMaskFor("infantry");
  const deployTiles = mission.map.hooks.deployZones.flatMap(
    (zone) => zone.tiles,
  );
  const reachable = graph.reachability.reachableFrom(deployTiles, infantry);
  const held = occupiedKeys(mission, graph.index);
  const hookTiles = new Set<number>(
    [
      ...mission.map.hooks.edgeSpawns,
      mission.map.hooks.extraction,
      ...mission.map.hooks.objectives.filter(
        (hook) => hook.kind === HookKinds.EGG_SPAWNER,
      ),
    ]
      .flatMap((hook) => hook.tiles)
      .filter((tile) => graph.index.inBounds(tile))
      .map((tile) => graph.index.keyOf(tile)),
  );
  const spawnerSites = mission.spawners
    .filter((spawner) => !spawner.destroyed && spawner.hp > 0)
    .map((spawner) => spawner.pos);
  return mission.map.tiles.filter((tile) => {
    const key = graph.index.keyOf(tile);
    return (
      reachable.has(key) &&
      !held.has(key) &&
      !hookTiles.has(key) &&
      deployTiles.every(
        (zone) => groundDistance(tile, zone) >= tuning.deployClearance,
      ) &&
      spawnerSites.every(
        (spawner) => groundDistance(tile, spawner) >= tuning.spawnerClearance,
      )
    );
  });
}

// ===========================================
// Helpers
// ===========================================

/**
 * Draws up to `count` sites from `candidates` uniformly at random,
 * keeping each only when it is at least `spacing` from every site
 * already kept. A shuffle then a greedy pass, so the draw is one call
 * on the rng however many candidates there are.
 */
function chooseSites(
  candidates: readonly Tile[],
  count: number,
  spacing: number,
  rng: Rng,
): Tile[] {
  const kept: Tile[] = [];
  for (const tile of rng.shuffle(candidates)) {
    if (kept.length >= count) {
      break;
    }
    if (kept.every((site) => groundDistance(site, tile) >= spacing)) {
      kept.push(tile);
    }
  }
  return kept;
}

/** Manhattan distance across the ground plane; levels do not count toward clearance. */
function groundDistance(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** The turret faces the middle of the map along the dominant axis, the way the deployed line does. */
function facingToCentre(
  from: TileCoord,
  mission: TacticalState,
): Unit["facing"] {
  const dx = mission.map.width / 2 - from.x;
  const dz = mission.map.depth / 2 - from.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? "e" : "w";
  }
  return dz >= 0 ? "s" : "n";
}

/** A plain `{ x, y, z }` copy, so a `Tile` never leaks its other fields into a unit. */
function coordOf(coord: TileCoord): TileCoord {
  return { x: coord.x, y: coord.y, z: coord.z };
}
