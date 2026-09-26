import type { IntRange } from "./settlement-definition";

// ===========================================
// Hive cavern tuning
// ===========================================

/**
 * The knobs that shape a hive cavern (#1179). Lengths are tiles, heights
 * are half-storey layers (ADR 0008), shares are 0–1. One object, in
 * `mapgen/data/hive-cavern-tuning`, so the shape is tuned in one place.
 */
export interface HiveCavernTuning {
  /** Chambers per map, the mouth and the core included. */
  readonly chamberCount: IntRange;
  /** Side chambers (loops or dead-end brood chambers) among them. */
  readonly sideChamberCount: IntRange;
  /** Fewest chambers on the main route, the mouth and the core included. */
  readonly minRouteChambers: number;
  readonly mouthRadius: IntRange;
  readonly routeRadius: IntRange;
  readonly coreRadius: IntRange;
  readonly sideRadius: IntRange;
  /** Smallest radius a chamber shrinks to when the route is crowded. */
  readonly minChamberRadius: number;
  /** Widest a chamber stretches across the map, as a multiple of its radius. */
  readonly maxAspect: number;
  /** Extra lobes merged into each chamber's main one. */
  readonly lobes: IntRange;
  /** How far the rim strays from the lobe outline, as a share of radius. */
  readonly rimNoise: number;
  /** Rock kept between two chambers that are not joined, in tiles. */
  readonly chamberSeparation: number;
  /** Chance a side chamber joins a second route chamber and closes a loop. */
  readonly loopChance: number;

  /** Rock columns kept between a chamber or tunnel and the map edge. */
  readonly rimMargin: number;
  /** Rock rows between the mouth and the edge the drop ship lands at. */
  readonly mouthLip: number;
  /** Half the width of the flat pad the drop ship lands on at the mouth. */
  readonly mouthPadHalfWidth: number;
  /** Rows of the flat pad, from the lip inward. */
  readonly mouthPadDepth: number;

  /** Shortest tunnel between two neighbouring route chambers' rims. */
  readonly minTunnelLength: number;
  /** Largest sideways bow of a tunnel's centre line. */
  readonly tunnelBow: number;
  /** Brush radius of a main-route tunnel or burrow: at least three tiles wide. */
  readonly mainTunnelRadius: number;
  /** Brush radius of a side tunnel: at least two tiles wide. */
  readonly sideTunnelRadius: number;
  /** Most a tunnel wall bulges past its brush, for an organic edge. */
  readonly tunnelWallJitter: number;
  /** Burrows from the back half of the cavern out to the map edge. */
  readonly burrowCount: IntRange;
  /** Brush radius where a burrow meets the edge, so a spawn zone fits. */
  readonly burrowMouthRadius: number;
  /** Shortest manhattan gap between two burrow openings on the edge. */
  readonly burrowSpacing: number;

  /** Level of the spine: the main route, burrows, mouth and core pad. */
  readonly spineLevel: number;
  /** Levels a side chamber's floor may sit from the spine, drawn uniformly. */
  readonly sideFloorOffsets: readonly number[];
  /** Raised terraces (one layer) per route, core or side chamber. */
  readonly terraces: IntRange;
  /** Terrace radius as a share of its chamber's radius. */
  readonly terraceShare: { readonly min: number; readonly max: number };
  /** Chance a chamber also carries a two-layer ledge the ramp pass bridges. */
  readonly ledgeChance: number;
  /** Chance a chamber also carries a one-layer pit. */
  readonly pitChance: number;
  /** Least rock height above the floor it walls in: nothing climbs it. */
  readonly wallLayers: number;
  /** The rock rises one more layer per this many columns from the rim... */
  readonly rockRiseEvery: number;
  /** ...up to this many layers. */
  readonly rockRiseMax: number;
  /** Side of the flat square the hive core stands on. */
  readonly corePadSize: number;

  /** Noise frequency of floor surface patches, per tile. */
  readonly surfaceFrequency: number;
  /** Share of the core chamber's floor that is infested. */
  readonly coreInfestedShare: number;
  /** Share of floor patches that are bare rock rather than dirt. */
  readonly rockShare: number;

  /** Hives ringed around the core pad. */
  readonly coreHives: IntRange;
  /** Distance from the core pad's centre the hive ring stands at. */
  readonly coreHiveRing: IntRange;
  /** Runs of carapace wall hugging each chamber's rim. */
  readonly carapaceRuns: IntRange;
  /** Tiles per carapace run. */
  readonly carapaceRunLength: IntRange;
  /** Brood mounds and egg clutches around each brood chamber's centre. */
  readonly broodClutches: IntRange;
  /** Scattered organisms and boulders per hundred chamber floor tiles. */
  readonly clutterPerHundred: number;
  /** Radius kept clear of props around a brood chamber's centre. */
  readonly broodClearRadius: number;
  /** Radius kept clear of props around a tunnel's mouth into a chamber. */
  readonly tunnelClearRadius: number;
}
