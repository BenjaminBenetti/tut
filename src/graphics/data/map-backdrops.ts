import type { MapArchetype } from "../../mapgen/model/map-recipe";

// ===========================================
// Map backdrops
// ===========================================

/**
 * What a map is drawn against: the plain `ui-bg` clear colour, or the
 * starfield and Earth's limb of a map fought in orbit (#1179).
 */
export type MapBackdrop = "clear" | "space";

/**
 * The backdrop each map archetype is drawn against. Keyed by the closed
 * `MapArchetype` union, so a new archetype has to choose one.
 */
export const MAP_BACKDROPS: Readonly<Record<MapArchetype, MapBackdrop>> = {
  settlement: "clear",
  "crash-site": "clear",
  "hive-cavern": "clear",
  "spore-platform-hull": "space",
  "spore-platform-core": "space",
  "great-hive-cavern": "clear",
};
