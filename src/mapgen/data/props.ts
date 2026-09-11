import { CoverLevel } from "../model/cover";
import type { PropDefinition } from "../model/prop";

// ===========================================
// Prop kind ids
// ===========================================

/** Well-known prop kinds (ADR 0004 §4.4). Biomes may add more in data. */
export const PropKindIds = {
  CAR: "car",
  CRATE: "crate",
  BARRIER: "barrier",
  SANDBAGS: "sandbags",
  DUMPSTER: "dumpster",
  SHELVING: "shelving",
  TABLE: "table",
  BENCH: "bench",
  FENCE: "fence",
  BOULDER: "boulder",
  TREE_PINE: "tree-pine",
  TREE_OAK: "tree-oak",
  TREE_PALM: "tree-palm",
  TREE_TROPICAL_ALMOND: "tree-tropical-almond",
  TREE_OIL_PALM: "tree-oil-palm",
  TREE_TUART: "tree-tuart",
  BANKSIA: "banksia",
  GRASS_TREE: "grass-tree",
  LIMESTONE_OUTCROP: "limestone-outcrop",
  CACTUS: "cactus",
} as const;

/** One of the well-known prop kind ids. */
export type KnownPropKindId = (typeof PropKindIds)[keyof typeof PropKindIds];

// ===========================================
// Definitions
// ===========================================

/**
 * Prop definitions. Cover and line-of-sight blocking are what tactical
 * reads; placements and biomes are what the prop pass reads.
 */
export const PROP_DEFINITIONS: readonly PropDefinition[] = [
  {
    id: PropKindIds.CAR,
    cover: CoverLevel.HIGH,
    blocksLos: true,
    placements: ["road"],
  },
  {
    id: PropKindIds.CRATE,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["ground", "interior"],
  },
  {
    id: PropKindIds.BARRIER,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["road", "ground"],
  },
  {
    id: PropKindIds.SANDBAGS,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["ground", "road"],
  },
  {
    id: PropKindIds.DUMPSTER,
    cover: CoverLevel.HIGH,
    blocksLos: true,
    placements: ["ground", "road"],
  },
  {
    id: PropKindIds.SHELVING,
    cover: CoverLevel.HIGH,
    blocksLos: true,
    placements: ["interior"],
  },
  {
    id: PropKindIds.TABLE,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["interior"],
  },
  {
    id: PropKindIds.BENCH,
    cover: CoverLevel.LOW,
    blocksLos: false,
    // Contextual only: never part of the generic ground scatter.
    placements: ["yard"],
  },
  {
    id: PropKindIds.FENCE,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["ground"],
  },
  {
    id: PropKindIds.BOULDER,
    cover: CoverLevel.HIGH,
    blocksLos: true,
    placements: ["ground"],
  },
  {
    id: PropKindIds.TREE_PINE,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["temperate", "snowy"],
  },
  {
    id: PropKindIds.TREE_OAK,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["temperate", "coastal"],
  },
  {
    id: PropKindIds.TREE_PALM,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["coastal", "desert"],
  },
  {
    id: PropKindIds.TREE_TROPICAL_ALMOND,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["temperate", "coastal"],
  },
  {
    id: PropKindIds.TREE_OIL_PALM,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["temperate", "coastal"],
  },
  {
    id: PropKindIds.CACTUS,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["ground"],
    biomes: ["desert"],
  },
  {
    id: PropKindIds.TREE_TUART,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["vegetation"],
    biomes: ["coastal"],
  },
  {
    id: PropKindIds.BANKSIA,
    cover: CoverLevel.HIGH,
    blocksLos: false,
    placements: ["vegetation"],
    biomes: ["coastal"],
  },
  {
    id: PropKindIds.GRASS_TREE,
    cover: CoverLevel.LOW,
    blocksLos: false,
    placements: ["vegetation"],
    biomes: ["coastal"],
  },
  {
    id: PropKindIds.LIMESTONE_OUTCROP,
    cover: CoverLevel.HIGH,
    blocksLos: true,
    placements: ["vegetation"],
    biomes: ["coastal"],
  },
];
