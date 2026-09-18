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
  if (dx === 0 && dy === 0 && dz === 0) return [];
  const footprint: BlastTile[] = [];
  const coord = { ...origin };
  const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  const deltaZ = dz === 0 ? Infinity : 1 / Math.abs(dz);
  let nextX = deltaX / 2;
  let nextY = deltaY / 2;
  let nextZ = deltaZ / 2;
  // Visit exact voxel crossings, including short slivers at shallow angles.
  // Every iteration advances; rounded attack distance and map bounds end the ray.
  for (;;) {
    const next = Math.min(nextX, nextY, nextZ);
    if (nextX <= next + 1e-9) {
      coord.x += Math.sign(dx);
      nextX += deltaX;
    }
    if (nextY <= next + 1e-9) {
      coord.y += Math.sign(dy);
      nextY += deltaY;
    }
    if (nextZ <= next + 1e-9) {
      coord.z += Math.sign(dz);
      nextZ += deltaZ;
    }
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
    if (!hasLineOfSight(map, origin, coord, index)) break;
    const tile = index.getAt(coord);
    if (tile) footprint.push({ tile, distance: 0 });
  }
  return footprint;
}
