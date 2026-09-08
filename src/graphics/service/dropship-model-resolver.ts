import type { Direction } from "../../core/model/direction";
import type { Rotation } from "../../mapgen/model/prop";
import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { tileTop } from "../view/tactical-map-view";
import type { ModelPlacement } from "./map-model-resolver";

/** The registered aircraft points along +Z before the renderer's negative-Y quarter turns. */
const DROPSHIP_TURNS: Readonly<Record<Direction, Rotation>> = {
  s: 0,
  w: 1,
  n: 2,
  e: 3,
};

/** Resolves the generator's complete envelope; never guesses from the deploy centroid. */
export function resolveDropshipModels(map: TacticalMap): ModelPlacement[] {
  return (map.dropships ?? []).flatMap((site) => {
    const boarding = map.hooks.deployZones.find(
      (zone) => zone.id === site.deployZoneId,
    )?.tiles[0];
    if (!boarding) return [];
    return [
      {
        modelId: "tdf.dropship",
        level: site.level,
        position: {
          x: site.footprint.x + site.footprint.w / 2,
          y: tileTop(site.level),
          z: site.footprint.z + site.footprint.d / 2,
        },
        turns: DROPSHIP_TURNS[site.facing],
        // The known transport shares its boarding zone's visibility, not an occluded hull cell.
        tile: boarding,
      },
    ];
  });
}
