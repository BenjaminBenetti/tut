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
    [HookKinds.SPORE_POD]: {
      // Mechs as well as infantry: the pod is the whole mission, and a
      // crater only one class can walk into is half a squad watching.
      requiredPass: Pass.ALL,
      // A push, not a stroll: the pod matures on a clock (campaign arc
      // §6.3), so it sits a few turns' walk in. The crater keeps its
      // bowl six columns off every edge and the dropship lands in an
      // edge band, so the floor's centre clears this with room.
      minDistanceFromDeploy: 10,
    },
    [HookKinds.WRECK]: {
      // Infantry strip it (arc §6.6): the squad has to walk there, and a
      // mech need not.
      requiredPass: Pass.INFANTRY,
      // Where the fight was lost, not on the landing pad: a few turns in,
      // like a nest, and no farther than a squad can walk there, work
      // two turns and still make the drop ship.
      minDistanceFromDeploy: 12,
      maxNearestDistanceFromDeploy: 30,
      // A mech chassis; the map rule sizes it from the lost chassis.
      meta: { footprint: 3 },
    },
    [HookKinds.TUNNEL_MOUTH]: {
      // Infantry and mechs (arc §6.7): either may set the charge, so a
      // mouth only one class can reach halves the force that can work it.
      requiredPass: Pass.ALL,
      // Off the landing pad: a burrower surfacing at a mouth should come
      // up a move away from the drop ship, not inside it. Near enough
      // that the first mouth is a turn's walk in, so the squad works
      // three while the fuses burn and still makes the drop ship.
      minDistanceFromDeploy: 10,
      maxNearestDistanceFromDeploy: 30,
      meta: { footprint: 2 },
    },
    [HookKinds.HIVE_CORE]: {
      requiredPass: Pass.ALL,
      // The far end of the cavern: the adapter fits this to the board,
      // so a 64 × 144 hive asks for 50 and gets about 110 (#1179).
      minDistanceFromDeploy: 60,
    },
    [HookKinds.CIVILIAN]: {
      // Infantry only: a mech cannot enter a building, and the group
      // walks out the way its rescuer walked in (campaign arc §6.4).
      requiredPass: Pass.INFANTRY,
      // Out in the town rather than beside the drop ship, so a rescue
      // is a walk there and back.
      minDistanceFromDeploy: 6,
    },
    // The spore platform's hooks (#1179). The finale passes its own
    // board and hooks (`spore-platform-recipe`); these defaults only fill
    // what a mission type names without them.
    [HookKinds.DOCKING_RING]: {
      requiredPass: Pass.ALL,
      // Mid-deck, off a flank: a push, not the far end.
      minDistanceFromDeploy: 30,
    },
    [HookKinds.PLATFORM_EXIT]: {
      requiredPass: Pass.ALL,
      // The far end of the hull, past the ring.
      minDistanceFromDeploy: 50,
    },
    [HookKinds.PLATFORM_CORE]: {
      requiredPass: Pass.ALL,
      // Behind the dais, across the whole chamber.
      minDistanceFromDeploy: 24,
    },
    [HookKinds.SOVEREIGN_DAIS]: {
      requiredPass: Pass.ALL,
      minDistanceFromDeploy: 20,
    },
    // Guards are posted, not reached: infantry only, anywhere.
    [HookKinds.GUARD_POST]: { requiredPass: Pass.INFANTRY },
  };
