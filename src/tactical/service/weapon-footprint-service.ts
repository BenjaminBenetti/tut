import { LAYER_TILES } from "../../core/model/elevation";
import { attackDistance } from "./weapon-reach-service";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { WeaponProfile } from "../model/weapon-profile";
import { blastFootprint } from "./blast-service";
import type { BlastTile } from "./blast-service";
import { hasLineOfSight } from "./sight-service";

/** Shared impact geometry: an ordinary blast or a narrow beam continuing through the aim point to its range limit. */
export function weaponFootprint(
  map: TacticalMap,
  profile: WeaponProfile,
  impact: TileCoord,
  index: TileIndex,
  origin?: TileCoord,
  reach = profile.range,
): BlastTile[] {
  if (!profile.beam || !origin)
    return blastFootprint(map, impact, profile.aoe?.radius ?? 0, index);
  const dx = impact.x - origin.x;
  const dy = impact.y - origin.y;
  const dz = impact.z - origin.z;
  const length = Math.hypot(Math.abs(dx) + Math.abs(dz), dy * LAYER_TILES);
  if (length === 0) return [];
  const span = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const footprint: BlastTile[] = [];
  const seen = new Set<number>([index.keyOf(origin)]);
  // Sub-cell sampling visits every crossed voxel even for shallow or rising rays.
  // Use the same rounded distance and elevation bonus as attack validation.
  for (
    let step = 1;
    step <= Math.ceil(((reach + 1) / length) * span * 4);
    step++
  ) {
    const fraction = step / (span * 4);
    const coord = {
      x: Math.round(origin.x + dx * fraction),
      y: Math.round(origin.y + dy * fraction),
      z: Math.round(origin.z + dz * fraction),
    };
    if (
      coord.x < 0 ||
      coord.x >= map.width ||
      coord.z < 0 ||
      coord.z >= map.depth ||
      coord.y < 0 ||
      coord.y >= map.levels ||
      attackDistance(origin, coord) > reach
    )
      break;
    const key = index.keyOf(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hasLineOfSight(map, origin, coord, index)) break;
    const tile = index.getAt(coord);
    if (tile) footprint.push({ tile, distance: 0 });
  }
  return footprint;
}
