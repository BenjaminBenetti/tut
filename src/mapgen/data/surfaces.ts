import { PassMask } from "../model/pass-mask";
import type { SurfaceDefinition, SurfaceId } from "../model/surface";

// ===========================================
// Surface ids
// ===========================================

/** Well-known surface ids (ADR 0004 §4.2). Biomes may add more in data. */
export const SurfaceIds = {
  INFESTED: "infested",
  /** Authored site slabs: no street markings, kerbs or automatic street furniture. */
  PAVING: "paving",
  HARDSTAND: "hardstand",
  GRASS: "grass",
  DIRT: "dirt",
  SAND: "sand",
  SNOW: "snow",
  ROCK: "rock",
  ROAD: "road",
  SIDEWALK: "sidewalk",
  WATER: "water",
  FLOOR: "floor",
  ROOF: "roof",
  STAIRS: "stairs",
  /**
   * The solid rock a hive cavern is cut into (#1179): ground nothing
   * stands on, spawns on or lands on, drawn as rock.
   */
  BEDROCK: "bedrock",
  /**
   * Open space beyond a spore platform's hull (#1179): ground nothing
   * stands on, spawns on or lands on, and nothing is drawn for, so the
   * scene's backdrop shows through.
   */
  VOID: "void",
  /** A spore platform's chestnut hull plate (`bug-chitin-mid`, #1179). */
  HULL_PLATE: "hull-plate",
  /** A spore platform's walnut hull plate (`bug-chitin-dark`, #1179). */
  HULL_PLATE_DARK: "hull-plate-dark",
  /** The toasted-tan rim round a spore platform's deck (`bug-chitin-tan`, #1179). */
  HULL_RIM: "hull-rim",
} as const;

/** One of the well-known surface ids. */
export type KnownSurfaceId = (typeof SurfaceIds)[keyof typeof SurfaceIds];

// ===========================================
// Definitions
// ===========================================

/**
 * Surface definitions. Ground surfaces admit every class; interiors and
 * roofs are infantry-only; water, bedrock and void admit nobody.
 */
export const SURFACE_DEFINITIONS: readonly SurfaceDefinition[] = [
  { id: SurfaceIds.PAVING, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.HARDSTAND, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.INFESTED, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.GRASS, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.DIRT, defaultPass: PassMask.ALL, isInterior: false },
  {
    id: SurfaceIds.SAND,
    mechMoveCost: 2,
    defaultPass: PassMask.ALL,
    isInterior: false,
  },
  {
    id: SurfaceIds.SNOW,
    mechMoveCost: 2,
    defaultPass: PassMask.ALL,
    isInterior: false,
  },
  {
    id: SurfaceIds.ROCK,
    mechMoveCost: 2,
    defaultPass: PassMask.ALL,
    isInterior: false,
  },
  { id: SurfaceIds.ROAD, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.SIDEWALK, defaultPass: PassMask.ALL, isInterior: false },
  { id: SurfaceIds.WATER, defaultPass: PassMask.NONE, isInterior: false },
  { id: SurfaceIds.FLOOR, defaultPass: PassMask.INFANTRY, isInterior: true },
  { id: SurfaceIds.ROOF, defaultPass: PassMask.INFANTRY, isInterior: false },
  { id: SurfaceIds.STAIRS, defaultPass: PassMask.INFANTRY, isInterior: true },
  { id: SurfaceIds.BEDROCK, defaultPass: PassMask.NONE, isInterior: false },
  { id: SurfaceIds.VOID, defaultPass: PassMask.NONE, isInterior: false },
  { id: SurfaceIds.HULL_PLATE, defaultPass: PassMask.ALL, isInterior: false },
  {
    id: SurfaceIds.HULL_PLATE_DARK,
    defaultPass: PassMask.ALL,
    isInterior: false,
  },
  { id: SurfaceIds.HULL_RIM, defaultPass: PassMask.ALL, isInterior: false },
];

/**
 * Exterior surfaces that admit nobody: water, the bedrock a hive cavern
 * is cut into and the void round a spore platform. Derived from the definitions so a new impassable
 * ground surface is excluded from "passable ground" without a query edit.
 */
export const IMPASSABLE_GROUND_SURFACES: ReadonlySet<SurfaceId> = new Set(
  SURFACE_DEFINITIONS.filter(
    (definition) =>
      definition.defaultPass === PassMask.NONE && !definition.isInterior,
  ).map((definition) => definition.id),
);
