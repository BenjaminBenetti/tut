// ===========================================
// Model asset ids
// ===========================================

/**
 * Every 3D model the game can ask graphics to draw, as stable dot-separated
 * `faction.subject.variant` ids (style guide §8, ADR 0002 §2.1). Declared here,
 * below `graphics/`, so simulation data such as a bug species or a mech part
 * can name its model without importing the renderer. The manifest in
 * `graphics/data/model-manifest` is keyed by this union, so declaring an id
 * without registering a GLB fails typecheck.
 *
 * Seeded from `tools/art/placeholders.manifest.json`; the Art Director adds an
 * id here and an entry there in the same PR.
 */
export const MODEL_IDS = [
  // Units (TDF)
  "tdf.infantry.engineer",
  "tdf.infantry.medic",
  "tdf.infantry.rifle",
  "tdf.infantry.rocket",
  "tdf.infantry.sniper",
  "tdf.mech.arm-l-a",
  "tdf.mech.arm-r-a",
  "tdf.mech.assembled-a",
  "tdf.mech.chassis-a",
  "tdf.mech.legs-a",
  "tdf.mech.weapon-arm.autocannon",
  "tdf.mech.weapon-back.missile-pod",
  // Bugs
  "bug.brute",
  "bug.lurker",
  "bug.swarmer",
  // Props
  "bug.egg-spawner",
  "prop.barrier-concrete",
  "prop.boulder",
  "prop.cactus",
  "prop.car-compact",
  "prop.car-sedan",
  "prop.crate",
  "prop.dumpster",
  "prop.fence",
  "prop.hydrant",
  "prop.lamp-post",
  "prop.sandbags",
  "prop.shelving",
  "prop.tree-oak",
  "prop.tree-palm",
  "prop.tree-pine",
  // Tiles
  "tile.city.road-corner",
  "tile.city.road-cross",
  "tile.city.road-straight",
  "tile.city.road-t",
  "tile.city.sidewalk",
  "tile.city.sidewalk-corner",
  "tile.ground.dirt",
  "tile.ground.grass",
  "tile.ground.rock",
  "tile.ground.sand",
  "tile.ground.snow",
  "tile.ground.water",
  // Buildings
  "building.floor",
  "building.roof",
  "building.roof-parapet",
  "building.stairs",
  "building.wall",
  "building.wall-door",
  "building.wall-half",
  "building.wall-window",
] as const;

/** A registered model id. */
export type ModelAssetId = (typeof MODEL_IDS)[number];
