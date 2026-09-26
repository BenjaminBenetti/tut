import type { Texture } from "three";

import type { TacticalMap } from "../../mapgen/model/tactical-map";
import { MAP_BACKDROPS } from "../data/map-backdrops";
import { createSpaceBackdrop } from "./space-backdrop";

// ===========================================
// Map backdrop
// ===========================================

/**
 * The texture a map is drawn against, by its archetype (#1179): the
 * space backdrop for a map fought in orbit, and nothing, so the scene
 * keeps its `ui-bg` clear colour, for every other map.
 *
 * ```
 *   map.recipe.params.archetype ──► MAP_BACKDROPS ──► "space" ──► texture
 *                                                 └─► "clear" ──► undefined
 * ```
 *
 * @param map - The map about to be shown.
 * @returns A texture the caller owns and must dispose, or undefined.
 */
export function backdropFor(map: TacticalMap): Texture | undefined {
  return MAP_BACKDROPS[map.recipe.params.archetype] === "space"
    ? createSpaceBackdrop()
    : undefined;
}
