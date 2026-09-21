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
  APARTMENT: "apartment",
  /**
   * The four installations a player can build on the overworld (#1175).
   * They never come from a biome's weights; a defend-installation recipe
   * names one as its `landmark` and the building pass guarantees it.
   */
  SENSOR_ARRAY: "sensor-array",
  REPELLENT_DISPERSAL: "repellent-dispersal",
  DEFENSIVE_BATTERY: "defensive-battery",
  BANK: "bank",
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
  BuildingKindIds.APARTMENT,
  BuildingKindIds.SENSOR_ARRAY,
  BuildingKindIds.REPELLENT_DISPERSAL,
  BuildingKindIds.DEFENSIVE_BATTERY,
  BuildingKindIds.BANK,
];

/** One of the four installation building kinds (#1175). */
export type InstallationBuildingKindId =
  | typeof BuildingKindIds.SENSOR_ARRAY
  | typeof BuildingKindIds.REPELLENT_DISPERSAL
  | typeof BuildingKindIds.DEFENSIVE_BATTERY
  | typeof BuildingKindIds.BANK;

/** The installation kinds, in the order the overworld lists them (#1175). */
export const INSTALLATION_BUILDING_KIND_IDS: readonly InstallationBuildingKindId[] =
  [
    BuildingKindIds.SENSOR_ARRAY,
    BuildingKindIds.REPELLENT_DISPERSAL,
    BuildingKindIds.DEFENSIVE_BATTERY,
    BuildingKindIds.BANK,
  ];
