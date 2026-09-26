import type { HiveCavernTuning } from "../model/hive-cavern-tuning";

// ===========================================
// Hive cavern tuning
// ===========================================

/**
 * The shipped hive cavern shape (#1179), measured on the 64 × 144 board
 * (`HIVE_CAVERN_SIZE`): five to eight chambers, a main route of three- to
 * four-tile tunnels, rock at least four layers over every floor it walls.
 *
 * ```
 *   lip ─ mouth (r 10–11, flat pad for the drop ship)
 *          │ main tunnel ≥ 3 wide, bowed ≤ 6
 *         route chambers (r 8–12), zig-zagging across the board
 *          │                 ╲ side tunnel ≥ 2 wide ─ side chamber (r 6–8)
 *         core (r 12–14, 3×3 pad, hives ringed 4–6 out)
 *          ╲ burrow ─ map edge (edge spawns)
 * ```
 */
export const HIVE_CAVERN_TUNING: HiveCavernTuning = {
  chamberCount: { min: 5, max: 8 },
  sideChamberCount: { min: 1, max: 3 },
  minRouteChambers: 4,
  mouthRadius: { min: 10, max: 11 },
  routeRadius: { min: 8, max: 12 },
  coreRadius: { min: 12, max: 14 },
  sideRadius: { min: 6, max: 8 },
  minChamberRadius: 6,
  maxAspect: 1.4,
  lobes: { min: 2, max: 4 },
  rimNoise: 0.2,
  chamberSeparation: 3,
  loopChance: 0.5,

  rimMargin: 4,
  mouthLip: 2,
  mouthPadHalfWidth: 5,
  mouthPadDepth: 16,

  minTunnelLength: 5,
  tunnelBow: 6,
  mainTunnelRadius: 1.75,
  sideTunnelRadius: 1.25,
  tunnelWallJitter: 0.6,
  burrowCount: { min: 2, max: 3 },
  burrowMouthRadius: 2.5,
  burrowSpacing: 20,

  spineLevel: 2,
  sideFloorOffsets: [-1, 0, 1, 1],
  terraces: { min: 1, max: 3 },
  terraceShare: { min: 0.3, max: 0.5 },
  ledgeChance: 0.35,
  pitChance: 0.4,
  wallLayers: 4,
  rockRiseEvery: 3,
  rockRiseMax: 3,
  corePadSize: 3,

  surfaceFrequency: 0.12,
  coreInfestedShare: 0.85,
  rockShare: 0.2,

  coreHives: { min: 3, max: 5 },
  coreHiveRing: { min: 4, max: 6 },
  carapaceRuns: { min: 1, max: 3 },
  carapaceRunLength: { min: 3, max: 6 },
  broodClutches: { min: 1, max: 3 },
  clutterPerHundred: 7,
  broodClearRadius: 2,
  tunnelClearRadius: 3,
};
