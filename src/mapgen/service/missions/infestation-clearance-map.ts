import type {
  MissionMapPlan,
  MissionMapRule,
} from "../../model/mission-map-rule";

// ===========================================
// Infestation Clearance map rule
// ===========================================

/**
 * An infestation clearance (GDD §5.4) is fought in the host city: the
 * settlement pipeline, with nothing beyond the type's own hooks (the egg
 * spawners, edge spawns, deploy and extraction come from
 * `requiredHooks`).
 */
export const INFESTATION_CLEARANCE_MAP_RULE: MissionMapRule = {
  typeId: "infestation-clearance",

  /** A settlement map with no extra hooks, site or landmark. */
  recipe(): MissionMapPlan {
    return { archetype: "settlement", extraHooks: [] };
  },
};
