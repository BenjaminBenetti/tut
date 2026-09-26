import type { IntRange } from "./settlement-definition";

// ===========================================
// Spore platform tuning
// ===========================================

/** A continuous range, both ends inclusive. */
export interface ShareRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The knobs that shape the hull, the finale's first stage (#1179).
 * Lengths are tiles, heights are half-storey layers (ADR 0008).
 */
export interface HullTuning {
  /** Half the width of the flat dock plate the drop ship lands on, at the prow. */
  readonly prowHalfWidth: number;
  /** Rows of the dock plate from the prow edge inward. */
  readonly prowLength: number;
  /** Rows over which the deck flares from the dock plate to its full width. */
  readonly flareLength: number;
  /** Half the deck's full width about the board's centre column. */
  readonly maxHalfWidth: number;
  /** Void columns always kept between the deck and the side edges. */
  readonly sideMargin: number;
  /** Most the spine's centre line strays sideways from the board's centre. */
  readonly spineBow: number;
  /** Rows between two of the spine's waypoints. */
  readonly spineWaypointEvery: number;
  /** Brush radius of the spine and the ring branch: five tiles wide. */
  readonly routeRadius: number;
  /** Where the docking ring sits along the board, as a share of its depth. */
  readonly ringDepthShare: ShareRange;
  /** How far the ring stands to one side of the spine. */
  readonly ringOffset: number;
  /** Radius of the level plaza the ring stands on. */
  readonly ringPlazaRadius: number;
  /** Side of the docking-ring pad. */
  readonly ringPadSize: number;
  /** Side of the hatch pad, where stage 1 hands over to stage 2. */
  readonly exitPadSize: number;
  /** Rows between the hatch pad and the far edge. */
  readonly exitBack: number;
  /** Pod beds (spawner clusters) per hull. */
  readonly podBeds: IntRange;
  /** Radius of a pod bed. */
  readonly podBedRadius: number;
  /** Manhattan distance band from the dock for the first pod bed. */
  readonly firstPodBedDistance: IntRange;
  /** Least manhattan gap between two pod beds' centres. */
  readonly podBedSpacing: number;
  /** Breaches (holes into space) punched through the deck. */
  readonly breaches: IntRange;
  /** Radius of one breach. */
  readonly breachRadius: IntRange;
  /** Spine buttresses stand beside the spine every this many rows. */
  readonly buttressEvery: number;
}

/** One ring of the core chamber's floor: how wide, and how many layers above the deck. */
export interface TerraceRing {
  readonly width: number;
  readonly rise: number;
}

/**
 * The knobs that shape the core chamber, the finale's second stage
 * (#1179). Lengths are tiles, heights are layers.
 */
export interface CoreTuning {
  /** Half the width of the start pad the squad deploys on. */
  readonly startPadHalfWidth: number;
  /** Rows of the start pad from the edge inward. */
  readonly startPadDepth: number;
  /** Rows of causeway between the start pad and the chamber's rim. */
  readonly causewayLength: IntRange;
  /** Width of the causeway: narrow, but a mech and a brute still pass. */
  readonly causewayWidth: number;
  /** Radius of the round chamber. */
  readonly chamberRadius: number;
  /**
   * The chamber's floor in rings from the rim inward: the rim walkway,
   * then the terraces of the berm. The arena inside the last ring lies
   * at deck level, on the one level every main route shares.
   */
  readonly terraces: readonly TerraceRing[];
  /** Width of the lane cut through the berm from the gate to the dais. */
  readonly laneWidth: number;
  /** Side of the Sovereign's dais: its kit footprint is 4×4. */
  readonly daisSize: number;
  /** Side of the core seed's pad. */
  readonly corePadSize: number;
  /** Side of one guard post. */
  readonly guardPostSize: number;
  /** Width of a bug duct from the chamber out to a side edge. */
  readonly ductWidth: number;
  /** Rows behind the chamber's centre the ducts run along. */
  readonly ductBehind: IntRange;
  /** Wall niches round the rim, one pod each at most. */
  readonly niches: number;
  /** Radians round the gate and the ducts that no niche takes. */
  readonly nicheClearance: number;
  /** Spokes of flesh artery running out from the core across the floor. */
  readonly arteries: IntRange;
}

/**
 * The knobs that shape both stages of the spore platform (#1179). One
 * object, in `mapgen/data/spore-platform-tuning`, so the shape is tuned
 * in one place.
 */
export interface SporePlatformTuning {
  /** Level of every main route; void sits at level 0 below it. */
  readonly deckLevel: number;
  /** Spacing of the plate grid the hull plates are grown from. */
  readonly plateSpacing: number;
  /** Share of plates raised one layer above the deck. */
  readonly raisedPlateShare: number;
  /** Share of plates that are walnut rather than chestnut. */
  readonly darkPlateShare: number;
  /** Most the deck's outline strays from its planned edge. */
  readonly rimNoise: number;
  /** Noise frequency of the deck's outline. */
  readonly rimFrequency: number;
  /** Props scattered per hundred deck columns. */
  readonly clutterPerHundred: number;
  /** Low rib walls per thousand deck columns. */
  readonly ribWallsPerThousand: number;
  /** Length of one low rib wall run. */
  readonly ribWallLength: IntRange;
  readonly hull: HullTuning;
  readonly core: CoreTuning;
}
