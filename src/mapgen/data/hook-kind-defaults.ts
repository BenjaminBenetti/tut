import type { HookKind, HookMeta } from "../model/hook";
import { HookKinds } from "../model/hook";
import type { PassMask } from "../model/pass-mask";
import { PassMask as Pass } from "../model/pass-mask";

// ===========================================
// Hook kind defaults
// ===========================================

/**
 * What a hook kind needs beyond its count: which classes must reach it,
 * how far from deploy it must sit, and default metadata. Mission types
 * only name kinds and counts (content vocabulary); the mission adapter
 * fills the rest from here.
 */
export interface HookKindDefaults {
  readonly requiredPass: PassMask;
  readonly minDistanceFromDeploy?: number;
  /** See `HookRequirement.maxNearestDistanceFromDeploy`. */
  readonly maxNearestDistanceFromDeploy?: number;
  readonly meta?: HookMeta;
}

/** Defaults for the shipped hook kinds. A new kind adds an entry here. */
export const HOOK_KIND_DEFAULTS: Readonly<Record<HookKind, HookKindDefaults>> =
  {
    [HookKinds.DEPLOY]: { requiredPass: Pass.ALL },
    [HookKinds.EGG_SPAWNER]: {
      requiredPass: Pass.INFANTRY,
      minDistanceFromDeploy: 12,
      // A mech at its slowest walks 40 tiles in the ten turns the #345
      // pin allows; 30 manhattan leaves room for the route to wind.
      maxNearestDistanceFromDeploy: 30,
      meta: { hatchRadius: 3 },
    },
    [HookKinds.EDGE_SPAWN]: { requiredPass: Pass.INFANTRY },
    [HookKinds.EXTRACTION]: { requiredPass: Pass.ALL },
    [HookKinds.TECH_CARCASS]: {
      requiredPass: Pass.INFANTRY,
      // A detour, not a march: far enough that stripping it costs a turn
      // or two of the route, near enough that a squad can get there and
      // still make the drop ship (#1171).
      minDistanceFromDeploy: 8,
      maxNearestDistanceFromDeploy: 30,
    },
    [HookKinds.GENERATOR]: {
      requiredPass: Pass.INFANTRY,
      // Far enough that the squad walks to its post before the first wave
      // lands, near enough that it gets there with turns to dig in (#1175).
      minDistanceFromDeploy: 6,
      maxNearestDistanceFromDeploy: 30,
    },
  };
