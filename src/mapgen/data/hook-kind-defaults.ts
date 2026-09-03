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
  readonly meta?: HookMeta;
}

/** Defaults for the shipped hook kinds. A new kind adds an entry here. */
export const HOOK_KIND_DEFAULTS: Readonly<Record<HookKind, HookKindDefaults>> =
  {
    [HookKinds.DEPLOY]: { requiredPass: Pass.ALL },
    [HookKinds.EGG_SPAWNER]: {
      requiredPass: Pass.INFANTRY,
      minDistanceFromDeploy: 12,
      meta: { hatchRadius: 3 },
    },
    [HookKinds.EDGE_SPAWN]: { requiredPass: Pass.INFANTRY },
    [HookKinds.EXTRACTION]: { requiredPass: Pass.ALL },
  };
