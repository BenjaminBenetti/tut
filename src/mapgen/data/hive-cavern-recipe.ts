import { HookKinds } from "../model/hook";
import type { HookRequirement, MapDimensions } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";

// ===========================================
// Hive cavern recipe defaults
// ===========================================

/**
 * The hive cavern's board (#1179): narrow across, long into the hive, so
 * the camera looks down a chain of chambers from the mouth to the core.
 * 9,216 columns — the same count as the largest settlement preset
 * (96 × 96) — measured to generate and render within the settlement's
 * budget (see `docs/design/mapgen-pipeline.md`).
 */
export const HIVE_CAVERN_SIZE: MapDimensions = { width: 64, depth: 144 };

/**
 * Least manhattan distance from the drop ship to the hive core. The core
 * sits at the far end of a 144-deep board, about 110 tiles from the
 * boarding ramp; 80 still fails a core placed anywhere near the front.
 */
export const HIVE_CORE_MIN_DISTANCE = 80;

/**
 * What a hive cavern asks the hook pass for (#1179): the drop ship at
 * the mouth (deploy, and extraction on the same tiles), exactly one hive
 * core at the far end, three egg spawners in the chambers and two edge
 * spawn zones where burrows meet the map edge. Brood-chamber hooks are
 * not requested: the cavern's own pass emits one per chamber other than
 * the mouth, however many the seed drew.
 */
export const HIVE_CAVERN_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.HIVE_CORE,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: HIVE_CORE_MIN_DISTANCE,
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
