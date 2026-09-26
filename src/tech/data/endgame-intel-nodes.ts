import type { TechNode } from "../model/tech-node";

// ===========================================
// Costs
// ===========================================
//
// Story nodes are priced by the story, not by a tier (ADR 0013 §2.7),
// and are left out of the parts pacing. Campaign arc §4 sets both
// prices: Intel III after Intel I's 180, and Last Hope cheap, because
// the player buys it straight after losing the platform, on whatever the
// failed assault left in the bank.
//
//   Intel I    Pheromone Analysis   180   (tech-tree.ts)
//   Intel III  Platform Approach    280
//   story      Last Hope            100

/** Tech points Intel III, Platform Approach, costs (campaign arc §4). */
export const PLATFORM_APPROACH_COST = 280;

/** Tech points Last Hope costs (campaign arc §4, D7: "about 100 TP"). */
export const LAST_HOPE_COST = 100;

// ===========================================
// Nodes
// ===========================================

/**
 * The late story's research (campaign arc §3, §4, D7, #1179): two
 * hidden nodes that gate the finale, each setting the campaign flag the
 * story pins its next mission on.
 *
 * ```
 *   Uplink won ──► uplink-won ──► Platform Approach shows (Intel III, 280)
 *     researched ──► platform-approach ─┐
 *   last Great Hive falls ──────────────┴► great-hives-destroyed ──► Launch Window pins
 *
 *   Spore Platform lost ──► platform-failed ──► Last Hope shows (story, 100)
 *     researched ──► last-hope ──► the platform is pinned again (D7)
 * ```
 *
 * Both sit on the support spoke's inner ring beside Intel I, Pheromone
 * Analysis, and like it take no prerequisite node: the flag is the only
 * gate. Platform Approach is the intel family's style (`kind: "intel"`,
 * tier 2). Last Hope is a `story` node; no family fits a second assault
 * on the platform, so it files with the intel nodes, whose support spoke
 * already holds the story's research.
 */
export const ENDGAME_INTEL_NODES: readonly TechNode[] = [
  {
    // Intel III (campaign arc §4). Hidden until Uplink brings in the
    // beacons' tracking data. The flag is half of Launch Window's pin;
    // the other half is the last Great Hive falling.
    id: "tech.platform-approach",
    name: "Platform Approach",
    description:
      "Triangulate the Spore Platform's beacons from the Uplink data and plot the launch's approach: the Launch Window opens once the Great Hives fall.",
    family: "support",
    kind: "intel",
    tier: 2,
    cost: PLATFORM_APPROACH_COST,
    requires: [],
    requiresFlags: ["uplink-won"],
    effects: [{ kind: "flag", flag: "platform-approach" }],
  },
  {
    // Last Hope (campaign arc §4, D7). Hidden until the first assault on
    // the platform fails; the story holds the platform back until the
    // flag is set, and a second failure ends the campaign.
    id: "tech.last-hope",
    name: "Last Hope",
    description:
      "Rebuild the assault from what the failed launch taught us: one more attempt at the Spore Platform, and there will not be another.",
    family: "support",
    kind: "story",
    tier: 2,
    cost: LAST_HOPE_COST,
    requires: [],
    requiresFlags: ["platform-failed"],
    effects: [{ kind: "flag", flag: "last-hope" }],
  },
];
