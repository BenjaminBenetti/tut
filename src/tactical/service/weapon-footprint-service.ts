import type { TacticalMap } from "../../mapgen/model/tactical-map";
import type { TileCoord } from "../../mapgen/model/tile-coord";
import type { TileIndex } from "../../mapgen/service/tile-index";
import type { WeaponProfile } from "../model/weapon-profile";
import { blastFootprint } from "./blast-service";
import type { BlastTile } from "./blast-service";
import { hasLineOfSight } from "./sight-service";

/** Shared impact geometry: an ordinary blast or a narrow beam ending at the aimed tile. */
export function weaponFootprint(
  map: TacticalMap,
  profile: WeaponProfile,
  impact: TileCoord,
  index: TileIndex,
  origin?: TileCoord,
): BlastTile[] {
  if (!profile.beam || !origin)
    return blastFootprint(map, impact, profile.aoe?.radius ?? 0, index);
  const steps = Math.max(
    Math.abs(impact.x - origin.x),
    Math.abs(impact.z - origin.z),
    Math.abs(impact.y - origin.y),
  );
  const footprint: BlastTile[] = [];
  const seen = new Set<number>();
  for (let step = 1; step <= steps; step++) {
    const fraction = step / steps;
    const coord = {
      x: Math.round(origin.x + (impact.x - origin.x) * fraction),
      y: Math.round(origin.y + (impact.y - origin.y) * fraction),
      z: Math.round(origin.z + (impact.z - origin.z) * fraction),
    };
    const tile = index.getAt(coord);
    if (!tile) continue;
    if (!hasLineOfSight(map, origin, tile, index)) break;
    const key = index.keyOf(tile);
    if (!seen.has(key)) {
      seen.add(key);
      footprint.push({ tile, distance: 0 });
    }
  }
  return footprint;
}
