import { LAYER_TILES } from "../../core/model/elevation";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WeaponReachTuning } from "../model/weapon-reach-tuning";
import { isMeleeRange } from "../model/weapon-profile";
import { footprintTiles } from "./footprint-service";
import { elevationBonus } from "./sight-service";

// ===========================================
// Types
// ===========================================

/** The tile of each of two footprints that lies nearest the other. */
export interface ClosestTiles {
  readonly from: TileCoord;
  readonly to: TileCoord;
}

// ===========================================
// Distance
// ===========================================

/**
 * Tiles between two positions for the purpose of shooting (#1119): the
 * map-plane distance combined with the vertical gap, a layer counting
 * for `LAYER_TILES` of a tile, rounded to whole tiles.
 *
 * ```
 *   distance = round( hypot( |Δx| + |Δz|,  |Δy| × LAYER_TILES ) )
 * ```
 *
 * On level ground it is the Manhattan distance it always was, so every
 * flat rule and pin holds; height only ever adds. A half-layer ledge
 * next door still rounds to one tile, a full storey up next door to two,
 * which is why a claw cannot reach a squad on the roof above it.
 *
 * @param from - The attacker's tile.
 * @param to - The target's tile.
 * @returns Whole tiles, never negative.
 */
export function attackDistance(from: TileCoord, to: TileCoord): number {
  const across = manhattanDistance(from, to);
  const up = Math.abs(from.y - to.y) * LAYER_TILES;
  return Math.round(Math.hypot(across, up));
}

/**
 * The pair of tiles, one from each footprint, nearest each other by
 * `attackDistance` (#1130): a shot at a brute is held against the tile
 * of it facing the shooter, and a brute swings from the tile of its own
 * block nearest its mark. Single tiles pair as themselves, so nothing
 * one-tile changes. Ties keep the first pair in footprint order, so two
 * runs agree.
 *
 * ```
 *   shooter S, brute B (2×2)        distance is S→b₀, not S→B's anchor
 *     S . . b₀ b₁
 *           b₂ b₃
 * ```
 *
 * @param from - The first footprint's anchor.
 * @param fromSize - Its tiles per side.
 * @param to - The second footprint's anchor.
 * @param toSize - Its tiles per side.
 * @returns The nearest tile of each.
 */
export function closestTiles(
  from: TileCoord,
  fromSize: number,
  to: TileCoord,
  toSize: number,
): ClosestTiles {
  let best: ClosestTiles = { from, to };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const a of footprintTiles(from, fromSize)) {
    for (const b of footprintTiles(to, toSize)) {
      const distance = attackDistance(a, b);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { from: a, to: b };
      }
    }
  }
  return best;
}

// ===========================================
// Reach
// ===========================================

/**
 * Tiles of reach height buys the attacker: whole storeys above the
 * target, times the tuning's bonus, capped. Nothing for shooting up or
 * level, and nothing for a melee weapon, which has to be in contact
 * whatever it stands on (GDD §6.2: cover, flanking and now reach are
 * ranged concepts).
 *
 * @param range - The weapon's reach on level ground.
 * @param from - The attacker's tile.
 * @param to - The target's tile.
 * @param tuning - The reach knobs.
 * @returns Extra tiles of reach, never negative.
 */
export function heightReachBonus(
  range: number,
  from: TileCoord,
  to: TileCoord,
  tuning: WeaponReachTuning,
): number {
  if (isMeleeRange(range)) {
    return 0;
  }
  const storeysAbove = Math.max(0, elevationBonus(from, to));
  return Math.min(
    tuning.maxReachBonus,
    storeysAbove * tuning.reachBonusPerStorey,
  );
}

/**
 * How far a weapon of `range` reaches from `from` toward `to`: its
 * level-ground range plus whatever height buys.
 *
 * @param range - The weapon's reach on level ground.
 * @param from - The attacker's tile.
 * @param to - The target's tile.
 * @param tuning - The reach knobs.
 * @returns Tiles of reach for this shot.
 */
export function weaponReach(
  range: number,
  from: TileCoord,
  to: TileCoord,
  tuning: WeaponReachTuning,
): number {
  return range + heightReachBonus(range, from, to, tuning);
}

/**
 * Whether a weapon of `range` reaches from `from` to `to`. The one
 * predicate the rules, the preview, the painted outline, the map
 * assessment and the mission driver share, so nothing measures reach
 * its own way.
 *
 * @param range - The weapon's reach on level ground.
 * @param from - The attacker's tile.
 * @param to - The target's tile.
 * @param tuning - The reach knobs.
 * @returns True when the shot is inside reach.
 */
export function withinReach(
  range: number,
  from: TileCoord,
  to: TileCoord,
  tuning: WeaponReachTuning,
): boolean {
  return attackDistance(from, to) <= weaponReach(range, from, to, tuning);
}
