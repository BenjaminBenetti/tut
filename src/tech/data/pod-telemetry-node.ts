import type { TechNode } from "../model/tech-node";

// ===========================================
// Cost
// ===========================================
//
// Intel is priced by the story, not by a tier (ADR 0013 §2.7), and left
// out of the parts pacing. Campaign arc §4 put the three Intel nodes at
// about 700 TP in all, each dearer than the one before; the campaign
// retune (arc §12) cut Intel I, so they come to 600, about 41% of what
// an Average campaign earns (about 1,460 TP; arc §10 says about 45%):
//
//   Intel I    Pheromone Analysis    80   (tech-tree.ts; the arc's 180)
//   Intel II   Pod Telemetry        240   (this file)
//   Intel III  Platform Approach    280   (endgame-intel-nodes.ts)
//                                   ───
//                                   600

/** Tech points Intel II, Pod Telemetry, costs (campaign arc §4). */
export const POD_TELEMETRY_COST = 240;

// ===========================================
// Node
// ===========================================

/**
 * Intel II, Pod Telemetry (campaign arc §4, #1179): Act II's research.
 * Hidden until the first Hive Assault brings home a hive core sample;
 * researching it sets `pod-telemetry`, the flag the story pins Intact
 * Pod, the Act II ending, on.
 *
 * ```
 *   first Hive Assault won ──► hive-core-sample ──► Pod Telemetry shows (240)
 *     researched ──► pod-telemetry ──► Intact Pod pins ──► won ──► Act II ends
 * ```
 *
 * It is Intel I's twin: the support spoke's inner ring, `kind: "intel"`,
 * tier 2, and no prerequisite node, so the flag is its only gate.
 */
export const POD_TELEMETRY_NODE: TechNode = {
  id: "tech.pod-telemetry",
  name: "Pod Telemetry",
  description:
    "Read the hive core's signalling to track a spore pod before it lands: the next pod can be taken intact and flown home.",
  family: "support",
  kind: "intel",
  tier: 2,
  cost: POD_TELEMETRY_COST,
  requires: [],
  requiresFlags: ["hive-core-sample"],
  effects: [{ kind: "flag", flag: "pod-telemetry" }],
};
