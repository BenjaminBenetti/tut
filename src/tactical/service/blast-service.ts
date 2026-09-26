import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackTarget } from "../model/attack-target";
import type { TacticalState } from "../model/tactical-state";
import { isBurrowed } from "../model/unit";
import { spawnerAttackTarget, unitAttackTarget } from "./attack-target-service";
import {
  footprintContains,
  footprintSizeOf,
  spawnerCovers,
} from "./footprint-service";
import { hasLineOfSight } from "./sight-service";
import { attackDistance } from "./weapon-reach-service";

// ===========================================
// Types
// ===========================================

/** One tile a blast reaches, and how far it is from the impact. */
export interface BlastTile {
  readonly tile: Tile;
  /**
   * Whole tiles from the impact in three dimensions, as `attackDistance`
   * measures a shot (#1130); `0` is the impact itself. Falloff and the
   * effect chance fade with it, so a ledge above the impact is further
   * than the tile beside it.
   */
  readonly distance: number;
}

/** One unit or spawner standing in a blast. */
export interface BlastVictim {
  readonly target: AttackTarget;
  readonly distance: number;
}

// ===========================================
// Footprint
// ===========================================

/**
 * The tiles a blast centred on `impact` reaches (#1121): every tile
 * within `radius` of it in three dimensions that the impact can see.
 *
 * ```
 *   radius 1 at ●, a solid wall on the east edge
 *
 *        ·                 ·   reached
 *     ·  ●  │  ✕           ✕   not reached: the wall stops the blast
 *        ·                     (and, if the force allows, falls to it —
 *                               the wall is on the impact tile's edge)
 *
 *   radius 2 at ● on the ground beside a building, seen from the side
 *
 *   y = 2        ═══·═══        the roof edge next door: √(1² + 1.5²)
 *                │     │        rounds to 2 tiles, and the impact sees
 *   y = 0   · · ● │  ✕  │       it over the parapet — reached; the
 *                │     │        room behind the solid wall is not
 * ```
 *
 * Three rules, each with a reason:
 *
 * - **Three dimensions (#1130).** The distance is `attackDistance`, the
 *   one the reach rules hold a shot against: the ground-plane distance
 *   combined with the vertical gap at `LAYER_TILES` a layer, rounded to
 *   whole tiles. A half-height step beside the impact rounds to one
 *   tile and stays in the blast; the tile a storey up next door is two
 *   away; nothing in the impact's own column is ever closer than the
 *   slab between them lets it be. Until this the footprint was a disc
 *   cut at the impact's storey, which on a multi-floor building meant a
 *   shell on the stairs reached the landing above and not the ground
 *   beside it (Executive Director, 2026-09-13).
 * - **Line of sight from the impact.** A blast does not go through a
 *   solid wall, round a hill or through a floor slab; `hasLineOfSight`
 *   is the one rule for what stops a line, and a blast is a line from
 *   the impact outward. The impact tile itself is always in, whatever
 *   stands on it.
 * - **Ordered.** Impact first, then by distance, then by position, so
 *   the damage rolls that follow draw in one order for one seed.
 *
 * @param map - The map the blast happens on.
 * @param impact - The tile the shot landed on.
 * @param radius - Tiles from the impact the blast reaches; `0` is the impact alone.
 * @param index - An index over `map`, built here when the caller has none.
 * @returns The reached tiles, impact first.
 */
export function blastFootprint(
  map: TacticalMap,
  impact: TileCoord,
  radius: number,
  index: TileIndex = new TileIndex(map),
): BlastTile[] {
  const reached: BlastTile[] = [];
  const reach = Math.max(0, Math.floor(radius));
  // The 3-D distance is never less than the ground-plane distance, so
  // the Manhattan diamond bounds the columns worth reading.
  for (let dx = -reach; dx <= reach; dx++) {
    const spread = reach - Math.abs(dx);
    for (let dz = -spread; dz <= spread; dz++) {
      for (const tile of index.column(impact.x + dx, impact.z + dz)) {
        const distance = attackDistance(impact, tile);
        if (distance > reach) {
          continue;
        }
        if (distance > 0 && !hasLineOfSight(map, impact, tile, index)) {
          continue;
        }
        reached.push({ tile, distance });
      }
    }
  }
  return reached.sort(byDistanceThenPosition);
}

// ===========================================
// Victims
// ===========================================

/**
 * Everything standing in a footprint that a blast can hurt (#1121):
 * living units of **either side** — a blast does not ask whose it is —
 * and undestroyed egg spawners, less whatever `exclude` names. The
 * attacker excludes itself; a shot aimed at a unit excludes that unit,
 * whose own damage is the shot's and not the blast's. A unit under the
 * ground (#1179) is not standing in anything: the earth over it takes
 * the blast, so a grenade cannot be used to find a burrower.
 *
 * In footprint order, units before spawners on the same tile, units in
 * `units` order: the order the damage rolls are drawn in. A unit that
 * stands on more than one tile (#1130), or the 3×3 hive core, is struck
 * once, at the distance of the nearest tile of it the blast reaches.
 *
 * @param mission - The mission the blast happens in.
 * @param footprint - The tiles the blast reaches, from `blastFootprint`.
 * @param exclude - Ids the blast does not touch.
 * @returns Each victim with its distance from the impact.
 */
export function blastVictims(
  mission: TacticalState,
  footprint: readonly BlastTile[],
  exclude: ReadonlySet<string>,
): BlastVictim[] {
  const victims: BlastVictim[] = [];
  const struck = new Set<string>();
  const struckSpawners = new Set<string>();
  for (const { tile, distance } of footprint) {
    for (const unit of mission.units) {
      if (
        unit.hp <= 0 ||
        isBurrowed(unit) ||
        exclude.has(unit.id) ||
        struck.has(unit.id)
      ) {
        continue;
      }
      const template = mission.templates[unit.templateId];
      const size = template === undefined ? 1 : footprintSizeOf(template);
      if (!footprintContains(unit.pos, size, tile)) {
        continue;
      }
      if (template === undefined) {
        throw new Error(
          `Unit "${unit.id}" references a template missing from the mission`,
        );
      }
      struck.add(unit.id);
      victims.push({ target: unitAttackTarget(unit, template), distance });
    }
    for (const spawner of mission.spawners) {
      if (
        spawner.destroyed ||
        spawner.hp <= 0 ||
        exclude.has(spawner.id) ||
        struckSpawners.has(spawner.id) ||
        !spawnerCovers(spawner, tile)
      ) {
        continue;
      }
      struckSpawners.add(spawner.id);
      victims.push({ target: spawnerAttackTarget(spawner), distance });
    }
  }
  return victims;
}

// ===========================================
// Helpers
// ===========================================

/** Impact first, then nearer tiles, then a fixed sweep so two runs agree. */
function byDistanceThenPosition(a: BlastTile, b: BlastTile): number {
  return (
    a.distance - b.distance ||
    a.tile.x - b.tile.x ||
    a.tile.z - b.tile.z ||
    a.tile.y - b.tile.y
  );
}
