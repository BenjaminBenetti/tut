import { HookKinds } from "../model/hook";
import type { HookRequirement } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";

// ===========================================
// Default hook requirements
// ===========================================

/**
 * The baseline infestation-clearance hook set (GDD §6.3): one deploy
 * zone, three egg spawners well away from it, two edge spawn zones and an
 * extraction. Mission types (#85) will declare their own; tests and the
 * preview use this one.
 */
export const DEFAULT_MISSION_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.EGG_SPAWNER,
    count: 3,
    requiredPass: PassMask.INFANTRY,
    minDistanceFromDeploy: 12,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];
