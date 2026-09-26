import { HookKinds } from "../model/hook";
import type { HookRequirement, MapDimensions } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";

// ===========================================
// Spore platform, stage 1: the hull
// ===========================================

/**
 * The hull's board (#1179): long from the prow, where the drop ship
 * docks, to the far edge the deck runs on past. 7,488 columns, about
 * two thirds of them deck; void columns draw nothing.
 */
export const SPORE_PLATFORM_HULL_SIZE: MapDimensions = {
  width: 72,
  depth: 104,
};

/**
 * Least manhattan distance from the drop ship to the docking ring. The
 * ring stands off a flank at 45–56% of the board's depth, 50 or more
 * tiles from the boarding ramp.
 */
export const DOCKING_RING_MIN_DISTANCE = 36;

/**
 * Least manhattan distance from the drop ship to the hatch down to the
 * core, which lies on the spine 16 rows from the far edge, about 75
 * tiles from the boarding ramp.
 */
export const PLATFORM_EXIT_MIN_DISTANCE = 60;

/**
 * What the hull asks the hook pass for (#1179): the drop ship at the
 * prow (deploy, and extraction on the same tiles), the docking ring and
 * the hatch, three spawner pods in the pod beds and two edge spawns
 * where the deck runs off the far edge.
 */
export const SPORE_PLATFORM_HULL_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.DOCKING_RING,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: DOCKING_RING_MIN_DISTANCE,
  },
  {
    kind: HookKinds.PLATFORM_EXIT,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: PLATFORM_EXIT_MIN_DISTANCE,
  },
  {
    kind: HookKinds.EGG_SPAWNER,
    count: 3,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 12,
    maxNearestDistanceFromDeploy: 30,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];

// ===========================================
// Spore platform, stage 2: the core chamber
// ===========================================

/**
 * The core chamber's board (#1179): the start pad and causeway at the
 * near edge, the round chamber (radius 26) behind them, ducts out to
 * both side edges. 5,120 columns, under half of them deck.
 */
export const SPORE_PLATFORM_CORE_SIZE: MapDimensions = {
  width: 64,
  depth: 80,
};

/** Least manhattan distance from the start pad to the core seed's pad. */
export const PLATFORM_CORE_MIN_DISTANCE = 30;

/** Least manhattan distance from the start pad to the Sovereign's dais. */
export const SOVEREIGN_DAIS_MIN_DISTANCE = 24;

/**
 * What the core chamber asks the hook pass for (#1179): deploy at the
 * causeway's start (extraction on the same tiles), the core seed, the
 * Sovereign's dais, four guard posts either side of it, four wall pods
 * in the rim's niches and two edge spawns at the ducts' ends.
 */
export const SPORE_PLATFORM_CORE_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.PLATFORM_CORE,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: PLATFORM_CORE_MIN_DISTANCE,
  },
  {
    kind: HookKinds.SOVEREIGN_DAIS,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: SOVEREIGN_DAIS_MIN_DISTANCE,
  },
  { kind: HookKinds.GUARD_POST, count: 4, requiredPass: PassMask.INFANTRY },
  {
    kind: HookKinds.EGG_SPAWNER,
    count: 4,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 12,
    maxNearestDistanceFromDeploy: 30,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];
