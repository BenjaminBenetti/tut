import { HookKinds } from "../model/hook";
import type { HookRequirement } from "../model/map-recipe";
import { PassMask } from "../model/pass-mask";

// ===========================================
// Great pod recipe
// ===========================================

/**
 * What a great pod's map asks the hook pass for (#1238): the drop ship
 * (deploy, and extraction on the same tiles), the pod's core, and two
 * edge spawn zones for the bugs the landing draws in. No egg spawners
 * and no spore pod: the pod is the nest.
 *
 * The core is sealed inside the hull until a weapon breaches it, so it
 * asks for no class (`NONE`): invariant I7 does not demand a walk to it
 * and the connectivity pass never digs one. Its hatch radius of three
 * is how far into the core chamber the core bursts when it ripens.
 * Brood-chamber hooks are not requested: the pod's chamber pass marks
 * one per chamber of its plan.
 */
export const GREAT_POD_MISSION_HOOKS: readonly HookRequirement[] = [
  { kind: HookKinds.DEPLOY, count: 1, requiredPass: PassMask.ALL },
  {
    kind: HookKinds.GREAT_POD_CORE,
    count: 1,
    requiredPass: PassMask.NONE,
    meta: { hatchRadius: 3 },
  },
  { kind: HookKinds.EDGE_SPAWN, count: 2, requiredPass: PassMask.INFANTRY },
  { kind: HookKinds.EXTRACTION, count: 1, requiredPass: PassMask.ALL },
];
