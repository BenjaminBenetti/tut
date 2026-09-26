import type { PlaceProfileId } from "../../content/model/place-profile-id";
import type { ModelAssetId } from "../../content/data/model-ids";
import { hashSeed } from "../../core/service/seed-hash";
import { PropKindIds } from "../../mapgen/data/props";
import type { KnownPropKindId } from "../../mapgen/data/props";
import { SurfaceIds } from "../../mapgen/data/surfaces";
import type { KnownSurfaceId } from "../../mapgen/data/surfaces";
import type { PropKindId } from "../../mapgen/model/prop";
import type { SurfaceId } from "../../mapgen/model/surface";
import type { WallKind } from "../../mapgen/model/wall";

// ===========================================
// Surfaces
// ===========================================

/**
 * Style guide §7, `surface id → model id`. Road and sidewalk name their
 * straight piece here; `map-model-resolver` swaps in the corner, T and
 * cross variants once it can see a tile's neighbours.
 *
 * Keyed by the closed `KnownSurfaceId` union so a surface added to
 * `mapgen/data/surfaces` without art fails typecheck rather than
 * rendering nothing. A biome that adds its own id in data resolves
 * through `surfaceModelFor`, which falls back rather than throwing.
 */
export const SURFACE_MODELS: Readonly<Record<KnownSurfaceId, ModelAssetId>> = {
  [SurfaceIds.PAVING]: "tile.city.sidewalk",
  [SurfaceIds.HARDSTAND]: "tile.city.road-lane",
  [SurfaceIds.INFESTED]: "tile.ground.infested",
  [SurfaceIds.GRASS]: "tile.ground.grass",
  [SurfaceIds.DIRT]: "tile.ground.dirt",
  [SurfaceIds.SAND]: "tile.ground.sand",
  [SurfaceIds.SNOW]: "tile.ground.snow",
  [SurfaceIds.ROCK]: "tile.ground.rock",
  [SurfaceIds.ROAD]: "tile.city.road-straight",
  [SurfaceIds.SIDEWALK]: "tile.city.sidewalk",
  [SurfaceIds.WATER]: "tile.ground.water",
  [SurfaceIds.FLOOR]: "building.floor",
  [SurfaceIds.ROOF]: "building.roof",
  [SurfaceIds.STAIRS]: "building.stairs",
  // The rock a hive cavern is cut into reads as rock; only its pass differs.
  [SurfaceIds.BEDROCK]: "tile.ground.rock",
};

/**
 * The road piece for each count of road-bearing neighbours. A straight
 * run and a dead end share the straight piece; the resolver decides the
 * yaw. Two neighbours are a straight only when they face each other,
 * which the resolver checks before reaching here.
 */
export const ROAD_VARIANTS = {
  straight: "tile.city.road-straight",
  corner: "tile.city.road-corner",
  t: "tile.city.road-t",
  cross: "tile.city.road-cross",
} as const satisfies Record<string, ModelAssetId>;

/** Modular carriageway art; the road factory combines one slab with its edge/paint parts. */
export const ROAD_MODELS = {
  lane: "tile.city.road-lane",
  kerb: "tile.city.road-kerb",
  corner: "tile.city.road-kerb-corner",
  centre: "tile.city.road-centre-line",
} as const satisfies Record<string, ModelAssetId>;

/** Sidewalk ships a straight and a corner only; anything else uses the straight. */
export const SIDEWALK_VARIANTS = {
  straight: "tile.city.sidewalk",
  corner: "tile.city.sidewalk-corner",
} as const satisfies Record<string, ModelAssetId>;

/** Three neutral terrain meshes; surface/side materials are applied by the slope factory. */
export const SLOPE_MODELS = {
  straight: "tile.slope.straight",
  inner: "tile.slope.inner",
  outer: "tile.slope.outer",
} as const satisfies Record<string, ModelAssetId>;

/** A planar diagonal rise; graphics selects it for aligned corner chains. */
export const DIAGONAL_SLOPE_MODEL =
  "tile.slope.diagonal" satisfies ModelAssetId;

/** Concave end of a one-tile gully; its mouth reuses two outer-corner halves. */
export const THREE_SIDED_SLOPE_MODEL =
  "tile.slope.three-sided" satisfies ModelAssetId;

/** Full-width connector wedge, placed across the low tile and fitted to its rise. */
export const RAMP_CONNECTOR_MODEL =
  "tile.ramp.connector" satisfies ModelAssetId;

/** A repeatable, wall-mounted steel ladder section spanning one shared RISE. */
export const LADDER_CONNECTOR_MODEL = "building.ladder" satisfies ModelAssetId;

/** A solid concrete course under floor zero; terrain ids never receive wall cutaways. */
export const FOUNDATION_MODEL =
  "tile.foundation.concrete" satisfies ModelAssetId;

/** Visual shelter for pitched roof records, which deliberately have no walkable roof tile. */
export const PITCHED_ROOF_MODEL =
  "building.roof-pitched" satisfies ModelAssetId;

/** Four-sided metal roof cap; the consumer fits its nine upper profile points. */
export const HIPPED_ROOF_MODEL = "building.roof-hipped" satisfies ModelAssetId;

/** Neutral shapes that borrow ground/terrace materials in the shared factory. */
export const PARAMETERISED_TERRAIN_MODELS = {
  ...SLOPE_MODELS,
  diagonal: DIAGONAL_SLOPE_MODEL,
  "three-sided": THREE_SIDED_SLOPE_MODEL,
  ramp: RAMP_CONNECTOR_MODEL,
} as const;

/** Existing closed ground topology fitted to a diagonal chain's neighbouring corners. */
export const TERRAIN_TRANSITION_SOURCE =
  "tile.ground.grass" satisfies ModelAssetId;

// ===========================================
// Props
// ===========================================

/**
 * Style guide §7, `prop kind → model id`. `car` takes the 1×1 compact;
 * the 2×1 `prop.car-sedan` is for hand-placed wrecks and mapgen never
 * emits it.
 * Benches use the contextual yard definition, so they never enter the generic ground pool.
 */
export const PROP_MODELS: Readonly<Record<KnownPropKindId, ModelAssetId>> = {
  "installation-radar": "installation.radar",
  "installation-cannon": "installation.cannon",
  "pump-unit": "installation.pump",
  "marble-pillar": "prop.bank-marble-pillar",
  "blast-barrier": "prop.battery-blast-barrier",
  "installation-sensor": "installation.sensor",
  "installation-pump-house": "installation.pump-house",
  "installation-battery": "installation.battery",
  "installation-tanks": "installation.tanks",
  "installation-spray-tower": "installation.spray-tower",
  "installation-bank": "installation.bank",

  [PropKindIds.INFESTED_CARAPACE_WALL_RIDGE]: "building.carapace-wall-ridge",
  [PropKindIds.INFESTED_CARAPACE_WALL_OVERLAP]:
    "building.carapace-wall-overlap",
  [PropKindIds.INFESTED_CARAPACE_WALL_RIBBED]: "building.carapace-wall-ribbed",
  [PropKindIds.INFESTED_CARAPACE_WALL_CURVE]: "building.carapace-wall-curve",
  [PropKindIds.INFESTED_CARAPACE_WALL_FORK]: "building.carapace-wall-fork",
  [PropKindIds.INFESTED_CARAPACE_WALL_END]: "building.carapace-wall-end",
  [PropKindIds.INFESTED_CARAPACE_WALL_BROKEN]: "building.carapace-wall-broken",
  [PropKindIds.INFESTED_CARAPACE_SPINE_BUTTRESS]:
    "building.carapace-spine-buttress",

  [PropKindIds.INFESTED_SHELTER]: "prop.bus-stop-infested",
  [PropKindIds.INFESTED_NEST]: "prop.infested-nest",
  [PropKindIds.INFESTED_HIVE]: "prop.infested-hive-spire",
  [PropKindIds.INFESTED_BROOD]: "prop.infested-nest-large",
  [PropKindIds.INFESTED_RIBS]: "prop.infested-burrow-ribs",
  [PropKindIds.INFESTED_VENT]: "prop.infested-vent-tall",
  [PropKindIds.INFESTED_SPINES]: "prop.infested-spine-tall",
  [PropKindIds.INFESTED_EGGS]: "prop.infested-egg-clutch",
  [PropKindIds.INFESTED_RUBBLE]: "prop.rubble-brick",
  [PropKindIds.INFESTED_RUIN]: "prop.ruin-corner",
  [PropKindIds.INFESTED_DEBRIS]: "prop.roof-fragment",
  [PropKindIds.INFESTED_ARCH]: "prop.infested-arch",

  [PropKindIds.ROOFTOP_HVAC]: "prop.rooftop-hvac",
  [PropKindIds.ROOFTOP_WATER_TANK]: "prop.rooftop-water-tank",
  [PropKindIds.SENSOR_MAST]: "prop.sensor-mast",
  [PropKindIds.DISPERSAL_STACK]: "prop.dispersal-stack",
  [PropKindIds.BATTERY_EMPLACEMENT]: "prop.battery-emplacement",
  [PropKindIds.STRONGROOM]: "prop.strongroom",
  [PropKindIds.CAR]: "prop.car-compact",
  [PropKindIds.CRATE]: "prop.crate",
  [PropKindIds.BARRIER]: "prop.barrier-concrete",
  [PropKindIds.SANDBAGS]: "prop.sandbags",
  [PropKindIds.DUMPSTER]: "prop.dumpster",
  [PropKindIds.SHELVING]: "prop.shelving",
  [PropKindIds.PRODUCE_BIN]: "prop.produce-bin",
  [PropKindIds.CHILLED_DISPLAY]: "prop.chilled-display",
  [PropKindIds.BAKERY_CASE]: "prop.bakery-case",
  [PropKindIds.CAFE_TABLE]: "prop.cafe-table",
  [PropKindIds.COFFEE_COUNTER]: "prop.coffee-counter",
  [PropKindIds.CLOTHING_RACK]: "prop.clothing-rack",
  [PropKindIds.ELECTRONICS_DISPLAY]: "prop.electronics-display",
  [PropKindIds.HARDWARE_SHELF]: "prop.hardware-shelf",
  [PropKindIds.PHARMACY_SHELF]: "prop.pharmacy-shelf",
  [PropKindIds.RETAIL_SHELF]: "prop.retail-shelf",
  [PropKindIds.CHECKOUT]: "prop.checkout",
  [PropKindIds.DESK_COMPUTER]: "prop.desk-computer",
  [PropKindIds.FILING_CABINET]: "prop.filing-cabinet",
  [PropKindIds.MEETING_TABLE]: "prop.meeting-table",
  [PropKindIds.WORKBENCH]: "prop.workbench",
  [PropKindIds.SOFA]: "prop.sofa",
  [PropKindIds.BED]: "prop.bed",
  [PropKindIds.KITCHEN_COUNTER]: "prop.kitchen-counter",
  [PropKindIds.DINING_TABLE]: "prop.dining-table",
  [PropKindIds.BATHROOM_VANITY]: "prop.bathroom-vanity",
  [PropKindIds.PLANTER]: "prop.planter",
  [PropKindIds.BOOKCASE]: "prop.bookcase",
  [PropKindIds.WARDROBE]: "prop.wardrobe",
  [PropKindIds.REFRIGERATOR]: "prop.refrigerator",
  [PropKindIds.TOILET]: "prop.toilet",
  [PropKindIds.TABLE]: "prop.table",
  [PropKindIds.BENCH]: "prop.bench",
  [PropKindIds.FENCE]: "prop.fence",
  [PropKindIds.BOULDER]: "prop.boulder",
  [PropKindIds.TREE_PINE]: "prop.tree-pine",
  [PropKindIds.TREE_OAK]: "prop.tree-oak",
  [PropKindIds.TREE_PALM]: "prop.tree-palm",
  "tree-tropical-almond": "prop.tree-tropical-almond",
  "tree-oil-palm": "prop.tree-oil-palm",
  [PropKindIds.TREE_TUART]: "prop.tree-tuart",
  [PropKindIds.BANKSIA]: "prop.banksia",
  [PropKindIds.GRASS_TREE]: "prop.grass-tree",
  [PropKindIds.LIMESTONE_OUTCROP]: "prop.limestone-outcrop",
  [PropKindIds.CACTUS]: "prop.cactus",
};

// ===========================================
// Walls
// ===========================================

/**
 * The material and relief kit of a wall face. All families share edge length,
 * storey height and opening clearance; `wallFamilyFor` selects the building kit.
 */
export type WallFamily =
  | "brick"
  | "concrete"
  | "panel"
  | "plaster"
  | "bank-stone"
  | "battery-steel"
  | "sensor-panel"
  | "dispersal-panel";

/** Building uses can select an authored kit without changing the ordinary seeded palette. */
export const BUILDING_WALL_FAMILIES: Readonly<Record<string, WallFamily>> = {
  bank: "bank-stone",
  "defensive-battery": "battery-steel",
  "sensor-array": "sensor-panel",
  "repellent-dispersal": "dispersal-panel",
};

/** Civic edges have their own geometry; buildings never draw this family. */
export type WallPlacementFamily = WallFamily | "road";

/**
 * Building families, in a fixed order. `wallFamilyFor` indexes into this, so
 * the order is part of what a building's family depends on: reordering
 * it redraws every map. Append rather than insert.
 */
// Plaster is selected explicitly by local appearance; extending this pool
// would change the modulo and repaint every existing building.
export const WALL_FAMILIES: readonly WallFamily[] = [
  "brick",
  "concrete",
  "panel",
];

/** The wall kinds #510 models in all three families. */
type FamilyWallKind = Exclude<WallKind, "half">;

/**
 * Style guide §7, wall kind → model id, one row per family.
 *
 * ```
 *            solid                 window                       door
 *   brick    building.wall         building.wall-window         building.wall-door
 *   concrete building.wall-…-conc  building.wall-window-conc    building.wall-door-conc
 *   panel    building.wall-…-panel building.wall-window-panel   building.wall-door-panel
 * ```
 */
export const WALL_MODELS: Readonly<
  Record<WallFamily, Readonly<Record<FamilyWallKind, ModelAssetId>>>
> = {
  brick: {
    solid: "building.wall",
    window: "building.wall-window",
    door: "building.wall-door",
  },
  concrete: {
    solid: "building.wall-concrete",
    window: "building.wall-window-concrete",
    door: "building.wall-door-concrete",
  },
  panel: {
    solid: "building.wall-panel",
    window: "building.wall-window-panel",
    door: "building.wall-door-panel",
  },
  "bank-stone": {
    solid: "building.installation-bank-wall-solid",
    window: "building.installation-bank-wall-window",
    door: "building.installation-bank-wall-door",
  },
  "battery-steel": {
    solid: "building.installation-battery-wall-solid",
    window: "building.installation-battery-wall-window",
    door: "building.installation-battery-wall-door",
  },
  "sensor-panel": {
    solid: "building.installation-sensor-wall-solid",
    window: "building.installation-sensor-wall-window",
    door: "building.installation-sensor-wall-door",
  },
  "dispersal-panel": {
    solid: "building.installation-dispersal-wall-solid",
    window: "building.installation-dispersal-wall-window",
    door: "building.installation-dispersal-wall-door",
  },
  plaster: {
    solid: "building.wall-plaster",
    window: "building.wall-window-plaster",
    door: "building.wall-door-plaster",
  },
};

/**
 * Building half walls keep their existing brick/concrete meshes (#766).
 * The road family uses an open steel rail on a concrete kerb (#782),
 * sharing the half wall's bounds and base pivot without its silhouette.
 */
export const HALF_WALL_MODELS: Readonly<
  Record<WallPlacementFamily, ModelAssetId>
> = {
  brick: "building.wall-half",
  concrete: "building.wall-half-concrete",
  panel: "building.wall-half-concrete",
  plaster: "building.wall-half-concrete",
  road: "building.viaduct-parapet",
  "bank-stone": "building.wall-half-concrete",
  "battery-steel": "building.wall-half-concrete",
  "sensor-panel": "building.wall-half-concrete",
  "dispersal-panel": "building.wall-half-concrete",
};

/** The brick half wall, kept for the brick family's own parapets. */
export const HALF_WALL_MODEL: ModelAssetId = HALF_WALL_MODELS.brick;

// ===========================================
// Lookups
// ===========================================

/** The model for a surface id, or undefined for one with no art registered. */
export function surfaceModel(surface: SurfaceId): ModelAssetId | undefined {
  return Object.hasOwn(SURFACE_MODELS, surface)
    ? SURFACE_MODELS[surface as KnownSurfaceId]
    : undefined;
}

/** The model for a prop kind, or undefined for one with no art registered. */
export function propModel(kind: PropKindId): ModelAssetId | undefined {
  return Object.hasOwn(PROP_MODELS, kind)
    ? PROP_MODELS[kind as keyof typeof PROP_MODELS]
    : undefined;
}

/**
 * The model for a wall kind in one family. Every kind mapgen can emit
 * has one; `half` follows the family too, see `HALF_WALL_MODELS`. Road
 * edges use concrete for full-height kinds, though only half walls are
 * assigned the road family by `wallFamilyForWall`.
 */
export function wallModel(
  kind: WallKind,
  family: WallPlacementFamily,
): ModelAssetId {
  return kind === "half"
    ? HALF_WALL_MODELS[family]
    : WALL_MODELS[family === "road" ? "concrete" : family][kind];
}

/**
 * Authored building uses select their own kit; other buildings choose one
 * family per `buildingId`, so a building
 * is a single material rather than a patchwork. Lagos uses the warm
 * rendered kit through every storey, including untagged ground walls.
 * Unprofiled maps keep brick where a wall
 * belongs to no building — a building's own ground-floor walls stand on
 * untagged tiles, so this default is what keeps a brick tower brick to
 * the pavement. The one civic exception is the parapet: see
 * `wallFamilyForWall`.
 *
 * Hashed rather than drawn from the mission's `Rng`. Graphics observes
 * simulation state and never draws from its stream, and the same map
 * has to come back looking the same after a reload — which a generator
 * position cannot promise and a hash of the id gives for free.
 */
export function wallFamilyFor(
  buildingId: string | undefined,
  placeProfile?: PlaceProfileId,
  buildingKind?: string,
): WallFamily {
  const authored = buildingKind
    ? BUILDING_WALL_FAMILIES[buildingKind]
    : undefined;
  if (authored) return authored;
  if (placeProfile === "lagos") return "plaster";
  if (buildingId === undefined) {
    return "brick";
  }
  if (placeProfile === "johannesburg")
    return hashSeed(buildingId) % 2 === 1 ? "plaster" : "brick";
  const index = hashSeed(buildingId) % WALL_FAMILIES.length;
  return WALL_FAMILIES[index] ?? "brick";
}

/**
 * The family one wall draws in (#766, #782). A building's walls take the
 * building's family. A wall that belongs to no building is brick — except
 * a `half` wall, which with no building is civic: the parapet along a
 * viaduct or the lip of a raised park, and takes the road's kerb and rail.
 * Only the parapet changes, because a building's own
 * ground-floor walls also stand on untagged tiles.
 */
export function wallFamilyForWall(
  kind: WallKind,
  buildingId: string | undefined,
  placeProfile?: PlaceProfileId,
  buildingKind?: string,
): WallPlacementFamily {
  if (buildingId === undefined && kind === "half") {
    return "road";
  }
  return wallFamilyFor(buildingId, placeProfile, buildingKind);
}
