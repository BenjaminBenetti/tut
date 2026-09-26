import { HookKinds } from "../../model/hook";
import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Constants
// ===========================================

/** Tunnel mouths on every Tunnel Sabotage map (arc §6.7: "three tunnel mouths"). */
export const TUNNEL_MOUTH_COUNT = 3;

// ===========================================
// Tunnel Sabotage map rule
// ===========================================

/**
 * A tunnel sabotage (arc §6.7, §7 item 3) is fought in the city about to
 * spread: the settlement pipeline, the type's own threat, and three
 * tunnel mouths. The adapter completes the hook from
 * `HOOK_KIND_DEFAULTS` (infantry and mechs must reach it, 10 to 30
 * tiles from deploy, 2×2), and `TunnelMouthPlacer` keeps the three
 * `TUNNEL_MOUTH_SPACING` apart.
 *
 * ```
 *   settlement + requiredHooks + { kind: "tunnel-mouth", count: 3 }
 * ```
 *
 * Difficulty does not add mouths: the arc names three, and the tracker,
 * the briefing and the setup all count them.
 */
export const TUNNEL_SABOTAGE_MAP_RULE: MissionMapRule = {
  typeId: "tunnel-sabotage",

  /** A settlement map with three tunnel mouths. */
  recipe(): MissionMapPlan {
    return {
      archetype: "settlement",
      extraHooks: [{ kind: HookKinds.TUNNEL_MOUTH, count: TUNNEL_MOUTH_COUNT }],
    };
  },
};
