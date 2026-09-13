import { STOREY_LAYERS } from "../../core/model/elevation";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { Tile } from "../../mapgen/model/tile";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import { TileIndex } from "../../mapgen/service/tile-index";
import type { AttackTarget } from "../model/attack-target";
import type { TacticalState } from "../model/tactical-state";
import { spawnerAttackTarget, unitAttackTarget } from "./attack-target-service";
import { hasLineOfSight } from "./sight-service";

// ===========================================
// Types
// ===========================================

/** One tile a blast reaches, and how far it is from the impact. */
export interface BlastTile {
  readonly tile: Tile;
  /** Manhattan tiles from the impact on the ground plane; `0` is the impact itself. */
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
 * within `radius` on the ground plane, on the impact's own storey, that
 * the impact can see.
 *
 * ```
 *   radius 1 at ●, a solid wall on the east edge
 *
 *        ·                 ·   reached
 *     ·  ●  │  ✕           ✕   not reached: the wall stops the blast
 *        ·                     (and, if the force allows, falls to it —
 *                               the wall is on the impact tile's edge)
 * ```
 *
 * Three rules, each with a reason:
 *
 * - **Same storey.** `|tile.y − impact.y| < STOREY_LAYERS`, so a shell
 *   landing on a roof does nothing to the floor beneath the slab, while a
 *   half-height step (ADR 0008) stays in the blast.
 * - **Line of sight from the impact.** A blast does not go through a
 *   solid wall or round a hill; `hasLineOfSight` is the one rule for
 *   what stops a line, and a blast is a line from the impact outward.
 *   The impact tile itself is always in, whatever stands on it.
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
  for (let dx = -reach; dx <= reach; dx++) {
    const spread = reach - Math.abs(dx);
    for (let dz = -spread; dz <= spread; dz++) {
      const distance = Math.abs(dx) + Math.abs(dz);
      for (const tile of index.column(impact.x + dx, impact.z + dz)) {
        if (Math.abs(tile.y - impact.y) >= STOREY_LAYERS) {
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
 * whose own damage is the shot's and not the blast's.
 *
 * In footprint order, units before spawners on the same tile, units in
 * `units` order: the order the damage rolls are drawn in.
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
  for (const { tile, distance } of footprint) {
    for (const unit of mission.units) {
      if (unit.hp <= 0 || exclude.has(unit.id) || !sameTile(unit.pos, tile)) {
        continue;
      }
      const template = mission.templates[unit.templateId];
      if (template === undefined) {
        throw new Error(
          `Unit "${unit.id}" references a template missing from the mission`,
        );
      }
      victims.push({ target: unitAttackTarget(unit, template), distance });
    }
    for (const spawner of mission.spawners) {
      if (
        spawner.destroyed ||
        spawner.hp <= 0 ||
        exclude.has(spawner.id) ||
        !sameTile(spawner.pos, tile)
      ) {
        continue;
      }
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

/** True when both coordinates name the same tile, level included. */
function sameTile(a: TileCoord, b: TileCoord): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}
