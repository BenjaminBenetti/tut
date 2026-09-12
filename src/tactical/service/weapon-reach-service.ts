import { LAYER_TILES } from "../../core/model/elevation";
import { manhattanDistance } from "../../core/service/grid-math";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { WeaponReachTuning } from "../model/weapon-reach-tuning";
import { isMeleeRange } from "../model/weapon-profile";
import { elevationBonus } from "./sight-service";

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
