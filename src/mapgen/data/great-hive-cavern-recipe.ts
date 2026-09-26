import { HookKinds } from "../model/hook";
import type { HookRequirement, MapDimensions } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";

// ===========================================
// Great Hive cavern recipe defaults
// ===========================================

/**
 * A Great Hive's board (campaign arc §6.9, §7.5): the hive cavern made
 * longer and wider, so the planner has room for more chambers on the
 * route and beside it. 13,248 columns, 44% more than a hive cavern's
 * 9,216; `width + depth` = 256 keeps the whole board inside the tactical
 * camera's fit-to-map zoom floor (6 px a tile), as the 64 × 144 cavern
 * is. The size was measured for generation time and bug-phase cost
 * (`docs/design/great-hives.md`).
 */
export const GREAT_HIVE_CAVERN_SIZE: MapDimensions = { width: 72, depth: 184 };

/**
 * Least manhattan distance from the drop ship to the Great Hive's core.
 * The core sits at the far end of the 184-deep board, about 150 tiles
 * from the boarding ramp; 110 fails a core placed in the front half.
 */
export const GREAT_HIVE_CORE_MIN_DISTANCE = 110;

/**
 * What a Great Hive cavern asks the hook pass for: a hive cavern's hooks
 * with the core further in, four egg spawners (the mission rule sets the
 * count from the level) and three edge spawn zones for the extra burrow.
 * Brood-chamber hooks come from the cavern's own pass, one per chamber
 * other than the mouth.
 */
export const GREAT_HIVE_CAVERN_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.HIVE_CORE,
    count: 1,
    requiredPass: PassMask.ALL,
    minDistanceFromDeploy: GREAT_HIVE_CORE_MIN_DISTANCE,
  },
  {
    kind: HookKinds.EGG_SPAWNER,
    count: 4,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 12,
    maxNearestDistanceFromDeploy: 30,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 3, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];
