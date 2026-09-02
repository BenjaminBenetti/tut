// ===========================================
// Building kind ids
// ===========================================

/**
 * Ids of the building templates M1.5 ships. The templates themselves land
 * with the building pass (#24); this file exists so biome data can weight
 * kinds without importing the templates.
 */
export const BuildingKindIds = {
  HOUSE: "house",
  SHOP: "shop",
  WAREHOUSE: "warehouse",
  TOWER: "tower",
} as const;

/** One of the shipped building kind ids. */
export type KnownBuildingKindId =
  (typeof BuildingKindIds)[keyof typeof BuildingKindIds];

/** Every shipped building kind id, in a fixed order. */
export const KNOWN_BUILDING_KIND_IDS: readonly KnownBuildingKindId[] = [
  BuildingKindIds.HOUSE,
  BuildingKindIds.SHOP,
  BuildingKindIds.WAREHOUSE,
  BuildingKindIds.TOWER,
];
